#!/bin/bash
set -e

# Helper script for working on this project in WSL
# Usage: ./scripts/wsl-setup.sh

PROJECT_DIR=$(pwd)

cat <<'EOF'
1. Pastikan WSL sudah terhubung ke Docker Desktop.
2. Jalankan project dengan docker compose:
   docker compose up -d --build

3. Akses layanan:
   - API: http://localhost:3000
   - MinIO: http://localhost:9000
   - MinIO Console: http://localhost:9001
   - Airflow: http://localhost:8080

4. Buka Spark shell di container:
   ./scripts/spark-minio.sh

5. Lihat data MinIO (S3 bucket):
   aws --endpoint-url http://localhost:9000 s3 ls s3://datalake
EOF

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not found. Pasang Docker Desktop dan pastikan WSL dapat mengaksesnya."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose tidak tersedia. Pastikan Docker Desktop mendukung compose v2+."
  exit 1
fi

echo "WSL helper ready. Gunakan ./scripts/spark-minio.sh untuk masuk ke spark-shell dari container."