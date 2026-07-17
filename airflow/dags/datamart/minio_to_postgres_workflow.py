from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
import os
import subprocess

from catalog import DATALAKE_BUCKET, DETIK_PROCESSED_ARTICLES

MINIO_ENDPOINT = os.environ.get('MINIO_ENDPOINT', 'minio:9000')
MINIO_ACCESS_KEY = os.environ.get('MINIO_ACCESS_KEY', 'minioadmin')
MINIO_SECRET_KEY = os.environ.get('MINIO_SECRET_KEY', 'minioadmin')
POSTGRES_HOST = os.environ.get('DB_HOST', 'postgres')
POSTGRES_PORT = os.environ.get('DB_PORT', '5432')
POSTGRES_NAME = os.environ.get('DB_NAME', 'scraping_db')
POSTGRES_USER = os.environ.get('DB_USER', 'scraper')
POSTGRES_PASSWORD = os.environ.get('DB_PASSWORD', 'scraper_password')

default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

dag = DAG(
    'minio_to_postgres_workflow',
    default_args=default_args,
    description='Read processed MinIO JSON and insert into PostgreSQL',
    schedule_interval=DETIK_PROCESSED_ARTICLES.schedule or '@daily',
    start_date=datetime(2024, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=['minio', 'postgres'],
)

def load_to_postgres(**context):
    command = [
        '/usr/bin/python3',
        DETIK_PROCESSED_ARTICLES.script_path,
        '--bucket', DATALAKE_BUCKET,
        '--endpoint', MINIO_ENDPOINT,
        '--access-key', MINIO_ACCESS_KEY,
        '--secret-key', MINIO_SECRET_KEY,
        '--db-host', POSTGRES_HOST,
        '--db-port', POSTGRES_PORT,
        '--db-name', POSTGRES_NAME,
        '--db-user', POSTGRES_USER,
        '--db-password', POSTGRES_PASSWORD,
        '--prefix', f'{DETIK_PROCESSED_ARTICLES.source.prefix}/',
        '--target-table', DETIK_PROCESSED_ARTICLES.full_name
    ]

    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Postgres load failed: {result.stderr}")
    return result.stdout

load_task = PythonOperator(
    task_id='load_to_postgres',
    python_callable=load_to_postgres,
    dag=dag,
)
