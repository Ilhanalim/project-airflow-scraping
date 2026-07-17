import argparse
import os

from pyspark.sql import SparkSession
from pyspark.sql.functions import col, explode


def build_spark_session(endpoint, access_key, secret_key, metastore_uri, warehouse_dir):
    """Create a Spark session backed by the shared Hive Metastore, reading/writing MinIO directly via s3a://."""
    return (
        SparkSession.builder
        .appName('DetikSparkProcessing')
        .config('spark.sql.session.timeZone', 'UTC')
        .config('spark.sql.catalogImplementation', 'hive')
        .config('spark.sql.sources.partitionOverwriteMode', 'dynamic')
        .config('spark.hadoop.hive.metastore.uris', metastore_uri)
        .config('spark.sql.warehouse.dir', warehouse_dir)
        .config('spark.hadoop.fs.s3a.endpoint', endpoint)
        .config('spark.hadoop.fs.s3a.access.key', access_key)
        .config('spark.hadoop.fs.s3a.secret.key', secret_key)
        .config('spark.hadoop.fs.s3a.path.style.access', 'true')
        .config('spark.hadoop.fs.s3a.connection.ssl.enabled', 'false')
        .config('spark.hadoop.fs.s3a.impl', 'org.apache.hadoop.fs.s3a.S3AFileSystem')
        .enableHiveSupport()
        .getOrCreate()
    )


def parse_args():
    parser = argparse.ArgumentParser(description='Transform Detik raw JSON with Spark')
    parser.add_argument('--endpoint', required=True)
    parser.add_argument('--access-key', required=True)
    parser.add_argument('--secret-key', required=True)
    parser.add_argument('--input-path', required=True,
                        help='s3a:// URI of the raw JSON payload')
    parser.add_argument('--table', required=True,
                        help='Fully qualified Hive table name, e.g. base.scraping_detik')
    parser.add_argument('--table-location', required=True,
                        help='s3a:// URI where the table data is stored')
    parser.add_argument('--warehouse-dir', required=True,
                        help='s3a:// URI of the Hive warehouse root')
    parser.add_argument('--mode', default='overwrite')
    parser.add_argument('--format', default='json')
    parser.add_argument('--partition-by', default='event_date',
                        help='Comma-separated partition columns')
    parser.add_argument('--repartition', type=int, default=0,
                        help='Repartition the DataFrame before writing (0 = skip)')
    return parser.parse_args()


def main():
    args = parse_args()
    metastore_uri = os.environ.get('HIVE_METASTORE_URI', 'thrift://hive-metastore:9083')
    schema = args.table.split('.')[0]

    spark = build_spark_session(
        f'http://{args.endpoint}', args.access_key, args.secret_key,
        metastore_uri, args.warehouse_dir,
    )
    try:
        exploded = (
            spark.read.json(args.input_path)
            .select(
                col('jobId'), col('sourceUrl'), col('pageType'),
                col('eventDate'), col('createdAt'),
                explode(col('categories')).alias('category_item'),
            )
            .select(
                col('jobId'), col('sourceUrl'), col('pageType'),
                col('eventDate'), col('createdAt'),
                col('category_item.category').alias('category'),
                col('category_item.subCategory').alias('subCategory'),
                col('category_item.url').alias('categoryUrl'),
                col('category_item.articleCount').alias('categoryArticleCount'),
                explode(col('category_item.articles')).alias('article'),
            )
            .select(
                col('jobId').alias('job_id'),
                col('sourceUrl').alias('source_url'),
                col('pageType').alias('page_type'),
                col('createdAt').alias('created_at'),
                col('category'),
                col('subCategory').alias('sub_category'),
                col('categoryUrl').alias('category_url'),
                col('categoryArticleCount').alias('category_article_count'),
                col('article.rank').alias('article_rank'),
                col('article.title').alias('title'),
                col('article.link').alias('link'),
                col('article.image').alias('image'),
                col('article.category').alias('article_category'),
                col('article.publishedText').alias('published_text'),
                col('eventDate').alias('event_date'),
            )
        )

        if args.repartition:
            exploded = exploded.repartition(args.repartition)

        spark.sql(f'CREATE DATABASE IF NOT EXISTS {schema}')
        (
            exploded.write
            .format(args.format)
            .mode(args.mode)
            .partitionBy(*args.partition_by.split(','))
            .option('path', args.table_location)
            .saveAsTable(args.table)
        )

    finally:
        spark.stop()


if __name__ == '__main__':
    main()
