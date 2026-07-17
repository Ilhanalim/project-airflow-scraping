#!/bin/bash
set -euo pipefail

mkdir -p /opt/hive-custom-conf
sed \
  -e "s#@@WAREHOUSE_LOCATION@@#${WAREHOUSE_LOCATION}#g" \
  -e "s#@@S3A_ENDPOINT@@#${S3A_ENDPOINT}#g" \
  -e "s#@@S3A_ACCESS_KEY@@#${S3A_ACCESS_KEY}#g" \
  -e "s#@@S3A_SECRET_KEY@@#${S3A_SECRET_KEY}#g" \
  /opt/hive-custom-conf-template/hive-site.xml > /opt/hive-custom-conf/hive-site.xml

export HIVE_CUSTOM_CONF_DIR=/opt/hive-custom-conf

# The base entrypoint's schematool -initSchema is not idempotent (it errors if
# tables already exist), so probe first and skip re-init across restarts.
export HADOOP_CLIENT_OPTS="${SERVICE_OPTS:-}"
if "${HIVE_HOME}/bin/schematool" -dbType "${DB_DRIVER:-derby}" -info; then
  export IS_RESUME=true
else
  export IS_RESUME=false
fi

exec /entrypoint.sh "$@"
