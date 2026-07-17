from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
import os
import json
import requests
import boto3
from botocore.client import Config
import subprocess

from catalog import DATALAKE_BUCKET, DETIK_RAW_PREFIX, SCRAPING_DETIK, WAREHOUSE_DIR

MINIO_ENDPOINT = os.environ.get('MINIO_ENDPOINT', 'minio:9000')
MINIO_ACCESS_KEY = os.environ.get('MINIO_ACCESS_KEY', 'minioadmin')
MINIO_SECRET_KEY = os.environ.get('MINIO_SECRET_KEY', 'minioadmin')


def minio_client():
    return boto3.client(
        's3',
        endpoint_url=f'http://{MINIO_ENDPOINT}',
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=Config(signature_version='s3v4')
    )


def ensure_bucket(client, bucket):
    try:
        client.head_bucket(Bucket=bucket)
    except Exception:
        client.create_bucket(Bucket=bucket)


default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

dag = DAG(
    'detik_scraping_to_minio_workflow',
    default_args=default_args,
    description='Scrape Detik terpopuler, store raw JSON in MinIO, and process it with Spark',
    schedule_interval=SCRAPING_DETIK.schedule or '@daily',
    start_date=datetime(2024, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=['detik', 'minio', 'etl'],
)

def trigger_scraping(**context):
    api_url = 'http://api:3000/api/scrape/detik/terpopuler'
    headers = {'x-api-key': os.environ['API_KEY']}
    payload = {'url': 'https://www.detik.com/terpopuler'}

    response = requests.post(api_url, json=payload, headers=headers, timeout=60)
    response.raise_for_status()

    job_data = response.json()
    context['ti'].xcom_push(key='raw_data', value=job_data)
    return job_data


def save_raw_to_minio(**context):
    raw_data = context['ti'].xcom_pull(task_ids='trigger_scraping', key='raw_data')
    if not raw_data:
        raise ValueError('No raw_data to save to MinIO')

    client = minio_client()
    ensure_bucket(client, DATALAKE_BUCKET)

    event_date = raw_data.get('eventDate') or raw_data.get('createdAt', '')[:10]
    date_suffix = event_date.replace('-', '_') if event_date else 'unknown_date'
    key = f'{DETIK_RAW_PREFIX}/{raw_data["jobId"]}_{date_suffix}.json'
    client.put_object(
        Bucket=DATALAKE_BUCKET,
        Key=key,
        Body=json.dumps(raw_data).encode('utf-8'),
        ContentType='application/json'
    )

    context['ti'].xcom_push(key='raw_key', value=key)
    return key


def process_with_spark(**context):
    raw_key = context['ti'].xcom_pull(task_ids='save_raw_to_minio', key='raw_key')
    if not raw_key:
        raise ValueError('Missing raw_key for Spark processing')

    write_conf = SCRAPING_DETIK.write_conf
    command = [
        '/usr/bin/python3',
        SCRAPING_DETIK.script_path,
        '--endpoint', MINIO_ENDPOINT,
        '--access-key', MINIO_ACCESS_KEY,
        '--secret-key', MINIO_SECRET_KEY,
        '--input-path', f's3a://{DATALAKE_BUCKET}/{raw_key}',
        '--table', SCRAPING_DETIK.full_name,
        '--table-location', SCRAPING_DETIK.location,
        '--warehouse-dir', WAREHOUSE_DIR,
        '--mode', write_conf.get('mode', 'overwrite'),
        '--format', write_conf.get('format', 'json'),
        '--partition-by', ','.join(SCRAPING_DETIK.partition_columns),
    ]
    if write_conf.get('repartition_num'):
        command += ['--repartition', str(write_conf['repartition_num'])]

    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Spark process failed: {result.stderr}")

    context['ti'].xcom_push(key='processed_prefix', value=SCRAPING_DETIK.prefix)
    return SCRAPING_DETIK.prefix


def save_raw_success(**context):
    raw_key = context['ti'].xcom_pull(task_ids='save_raw_to_minio', key='raw_key')
    return raw_key


trigger_scraping = PythonOperator(
    task_id='trigger_scraping',
    python_callable=trigger_scraping,
    dag=dag,
)

save_raw_to_minio = PythonOperator(
    task_id='save_raw_to_minio',
    python_callable=save_raw_to_minio,
    dag=dag,
)

process_with_spark = PythonOperator(
    task_id='process_with_spark',
    python_callable=process_with_spark,
    dag=dag,
)

save_raw_success = PythonOperator(
    task_id='save_raw_success',
    python_callable=save_raw_success,
    dag=dag,
)

trigger_scraping >> save_raw_to_minio >> process_with_spark >> save_raw_success
