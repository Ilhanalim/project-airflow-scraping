#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  # Keep the Spark metastore credentials aligned with docker-compose.
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${MINIO_ROOT_USER:=minioadmin}"
: "${MINIO_ROOT_PASSWORD:=minioadmin}"

: "${MINIO_BUCKET:=datalake}"
: "${HIVE_METASTORE_URI:=thrift://hive-metastore:9083}"

docker compose --project-directory "$PROJECT_DIR" exec -it --user airflow airflow-webserver \
  /home/airflow/.local/bin/spark-shell \
  --conf spark.sql.catalogImplementation=hive \
  --conf "spark.hadoop.hive.metastore.uris=${HIVE_METASTORE_URI}" \
  --conf "spark.sql.warehouse.dir=s3a://${MINIO_BUCKET}/warehouse" \
  --conf spark.hadoop.fs.s3a.endpoint=http://minio:9000 \
  --conf "spark.hadoop.fs.s3a.access.key=${MINIO_ROOT_USER}" \
  --conf "spark.hadoop.fs.s3a.secret.key=${MINIO_ROOT_PASSWORD}" \
  --conf spark.hadoop.fs.s3a.path.style.access=true \
  --conf spark.hadoop.fs.s3a.connection.ssl.enabled=false \
  --conf spark.hadoop.fs.s3a.impl=org.apache.hadoop.fs.s3a.S3AFileSystem
