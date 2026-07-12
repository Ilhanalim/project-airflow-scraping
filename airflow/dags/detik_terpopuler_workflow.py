from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.empty import EmptyOperator
import os
import requests
import time

POLL_INTERVAL_SECONDS = 10
MAX_POLL_ATTEMPTS = 18

default_args = {
    'owner': 'airflow',
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

dag = DAG(
    'detik_terpopuler_scraping_workflow',
    default_args=default_args,
    description='Scraping workflow for Detik terpopuler',
    schedule_interval='@daily',
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=['scraping'],
)

def trigger_scraping_job(**context):
    """Trigger Detik terpopuler scraping via the Node.js API"""
    api_url = 'http://api:3000/api/scrape/detik/terpopuler'
    headers = {'x-api-key': os.environ['API_KEY']}

    payload = {
        'url': 'https://www.detik.com/terpopuler'
    }

    try:
        response = requests.post(api_url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()

        job_data = response.json()
        job_id = job_data.get('jobId')

        context['ti'].xcom_push(key='job_id', value=job_id)
        print(f"Detik scraping job initiated: {job_id}")

        return job_data
    except requests.exceptions.RequestException as e:
        print(f"Error triggering Detik scraping job: {str(e)}")
        raise

def check_job_status(**context):
    """Wait until the scraping job reaches a final status"""
    job_id = context['ti'].xcom_pull(task_ids='trigger_scraping', key='job_id')
    api_url = f'http://api:3000/api/scrape/detik/status/{job_id}'
    headers = {'x-api-key': os.environ['API_KEY']}

    if not job_id:
        raise ValueError('Missing job_id from trigger_scraping task')

    try:
        for attempt in range(1, MAX_POLL_ATTEMPTS + 1):
            response = requests.get(api_url, headers=headers, timeout=30)
            response.raise_for_status()

            status_data = response.json()
            status = status_data.get('status')
            print(f"Job status attempt {attempt}/{MAX_POLL_ATTEMPTS}: {status_data}")

            if status == 'completed':
                return status_data

            if status == 'failed':
                error_message = status_data.get('error_message') or 'Unknown scraping error'
                raise RuntimeError(f"Detik scraping job failed: {error_message}")

            time.sleep(POLL_INTERVAL_SECONDS)

        raise TimeoutError(f"Detik scraping job {job_id} did not complete in time")
    except requests.exceptions.RequestException as e:
        print(f"Error checking job status: {str(e)}")
        raise

def process_results(**context):
    """Retrieve and process scraping results"""
    job_id = context['ti'].xcom_pull(task_ids='trigger_scraping', key='job_id')
    api_url = f'http://api:3000/api/scrape/detik/results/{job_id}'
    headers = {'x-api-key': os.environ['API_KEY']}

    if not job_id:
        raise ValueError('Missing job_id from trigger_scraping task')

    try:
        response = requests.get(api_url, headers=headers, timeout=30)
        response.raise_for_status()

        results = response.json()
        print(f"Results retrieved for job {job_id}")
        print(f"Status: {results.get('status')}")

        if results.get('status') != 'completed':
            raise RuntimeError(f"Cannot process unfinished scraping job: {results.get('status')}")

        return results
    except requests.exceptions.RequestException as e:
        print(f"Error retrieving results: {str(e)}")
        raise

start = EmptyOperator(task_id='start', dag=dag)

trigger_scraping = PythonOperator(
    task_id='trigger_scraping',
    python_callable=trigger_scraping_job,
    dag=dag,
)

check_status = PythonOperator(
    task_id='check_status',
    python_callable=check_job_status,
    dag=dag,
)

process = PythonOperator(
    task_id='process_results',
    python_callable=process_results,
    dag=dag,
)

end = EmptyOperator(task_id='end', dag=dag)

start >> trigger_scraping >> check_status >> process >> end
