#!/bin/bash
set -euo pipefail

# List files in the MinIO data lake, the equivalent of `hdfs dfs -ls` for this
# project (MinIO/S3A plays the role HDFS would play in a classic Hive setup).
# Usage:
#   ./scripts/minio-ls.sh                                  # list whole bucket
#   ./scripts/minio-ls.sh warehouse/base.db/scraping_detik  # list one table
#   ./scripts/minio-ls.sh raw/detik                         # list raw payloads

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  # Keep the mc credentials aligned with docker-compose.
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${MINIO_ROOT_USER:=minioadmin}"
: "${MINIO_ROOT_PASSWORD:=minioadmin}"
: "${MINIO_BUCKET:=datalake}"

PREFIX="${1:-}"

docker compose --project-directory "$PROJECT_DIR" exec -T mc sh -c "
  mc alias set local http://minio:9000 '${MINIO_ROOT_USER}' '${MINIO_ROOT_PASSWORD}' >/dev/null &&
  mc ls -r 'local/${MINIO_BUCKET}/${PREFIX}'
"
