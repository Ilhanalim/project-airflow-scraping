import argparse
import json
import os
import tempfile
import uuid
import boto3
import psycopg2
from botocore.client import Config


def parse_args():
    parser = argparse.ArgumentParser(description='Load processed MinIO data into PostgreSQL')
    parser.add_argument('--bucket', required=True)
    parser.add_argument('--endpoint', required=True)
    parser.add_argument('--access-key', required=True)
    parser.add_argument('--secret-key', required=True)
    parser.add_argument('--db-host', required=True)
    parser.add_argument('--db-port', required=True)
    parser.add_argument('--db-name', required=True)
    parser.add_argument('--db-user', required=True)
    parser.add_argument('--db-password', required=True)
    parser.add_argument('--prefix', required=True,
                        help='Key prefix inside the bucket to read processed JSON from')
    parser.add_argument('--target-table', required=True,
                        help='Fully qualified PostgreSQL table, e.g. base.detik_scraping_processed_articles')
    return parser.parse_args()


def ensure_bucket(client, bucket):
    try:
        client.head_bucket(Bucket=bucket)
    except Exception:
        client.create_bucket(Bucket=bucket)


def insert_rows(connection, table, rows):
    with connection.cursor() as cursor:
        insert_sql = f'''
            INSERT INTO {table} (
                id, job_id, source_url, page_type, category, sub_category,
                category_url, article_rank, title, link, image, article_category,
                published_text, event_date, created_at, inserted_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (id) DO NOTHING
        '''
        cursor.executemany(insert_sql, rows)


def load_processed_data(args):
    client = boto3.client(
        's3',
        endpoint_url=f'http://{args.endpoint}',
        aws_access_key_id=args.access_key,
        aws_secret_access_key=args.secret_key,
        config=Config(signature_version='s3v4')
    )

    ensure_bucket(client, args.bucket)

    paginator = client.get_paginator('list_objects_v2')
    keys = []
    for page in paginator.paginate(Bucket=args.bucket, Prefix=args.prefix):
        for item in page.get('Contents', []):
            if item['Key'].endswith('.json') and '_SUCCESS' not in item['Key']:
                keys.append(item['Key'])

    if not keys:
        print('No processed files found in MinIO prefix', args.prefix)
        return

    connection = psycopg2.connect(
        host=args.db_host,
        port=args.db_port,
        dbname=args.db_name,
        user=args.db_user,
        password=args.db_password
    )
    connection.autocommit = False

    try:
        rows_to_insert = []
        with tempfile.TemporaryDirectory() as tmpdir:
            for key in keys:
                local_path = os.path.join(tmpdir, os.path.basename(key))
                response = client.get_object(Bucket=args.bucket, Key=key)
                with open(local_path, 'wb') as f:
                    f.write(response['Body'].read())
                with open(local_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        item = json.loads(line)
                        rows_to_insert.append([
                            str(uuid.uuid4()),
                            item.get('job_id'),
                            item.get('source_url'),
                            item.get('page_type'),
                            item.get('category'),
                            item.get('sub_category'),
                            item.get('category_url'),
                            item.get('article_rank'),
                            item.get('title'),
                            item.get('link'),
                            item.get('image'),
                            item.get('article_category'),
                            item.get('published_text'),
                            item.get('event_date'),
                            item.get('created_at')
                        ])

        if rows_to_insert:
            insert_rows(connection, args.target_table, rows_to_insert)
            connection.commit()
            print(f'Inserted {len(rows_to_insert)} rows into PostgreSQL')
        else:
            print('No rows to insert')
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def main():
    args = parse_args()
    load_processed_data(args)


if __name__ == '__main__':
    main()
