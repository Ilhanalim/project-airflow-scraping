"""Loader for the central data catalog defined in airflow/catalogs/*.yml.

The YAML files are the single source of truth for schemas, tables, schedules,
and write configuration. DAGs import the loaded definitions from this module
and pass the derived values (full name, s3a location, write conf) down to the
executable scripts, so no script or DAG hardcodes a schema, table name, or
bucket path on its own.

Bucket layout (single data lake bucket):
    s3a://{DATALAKE_BUCKET}/raw/...          raw payloads as scraped
    s3a://{DATALAKE_BUCKET}/warehouse/...    Hive-managed tables ({schema}.db/{table})
"""
import os
from dataclasses import dataclass, field

import yaml

# --- Storage layout ---------------------------------------------------------
DATALAKE_BUCKET = os.environ.get('MINIO_BUCKET', 'datalake')

RAW_PREFIX = 'raw'
WAREHOUSE_PREFIX = 'warehouse'
WAREHOUSE_DIR = f's3a://{DATALAKE_BUCKET}/{WAREHOUSE_PREFIX}'

# Where raw Detik scrape payloads land inside the lake.
DETIK_RAW_PREFIX = f'{RAW_PREFIX}/detik'

# Catalog YAML files live next to the dags folder: airflow/catalogs/.
CATALOG_DIR = os.environ.get(
    'CATALOG_DIR',
    os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'catalogs')),
)


def _load_yaml(name):
    """Read one catalog file, skipping private anchor entries (_*)."""
    with open(os.path.join(CATALOG_DIR, f'{name}.yml')) as file:
        entries = yaml.safe_load(file) or {}
    return {key: conf for key, conf in entries.items() if not key.startswith('_')}


# --- Table definition --------------------------------------------------------
@dataclass(frozen=True)
class HiveTable:
    """A Hive table registered in the shared metastore, declared in hive_catalog.yml.

    Storage follows the convention:
        s3a://{DATALAKE_BUCKET}/{WAREHOUSE_PREFIX}/{schema}.db/{name}
    """
    schema: str
    name: str
    layer: str = 'foundation'
    env: str = 'dev'
    script_type: str = 'pyspark'
    schedule: str = None
    script_location: str = None
    write_conf: dict = field(default_factory=dict)

    @property
    def full_name(self) -> str:
        return f'{self.schema}.{self.name}'

    @property
    def prefix(self) -> str:
        return f'{WAREHOUSE_PREFIX}/{self.schema}.db/{self.name}'

    @property
    def location(self) -> str:
        return f's3a://{DATALAKE_BUCKET}/{self.prefix}'

    @property
    def script_path(self) -> str:
        return f'/opt/airflow/{self.script_location}'

    @property
    def partition_columns(self) -> list:
        return list((self.write_conf.get('partition_columns') or {}).keys())


@dataclass(frozen=True)
class DatamartTable:
    """A PostgreSQL table loaded from the lake, declared in datamart_catalog.yml."""
    schema: str
    name: str
    layer: str = 'datamart'
    env: str = 'dev'
    script_type: str = 'python'
    schedule: str = None
    script_location: str = None
    source_hive_table: str = None

    @property
    def full_name(self) -> str:
        return f'{self.schema}.{self.name}'

    @property
    def script_path(self) -> str:
        return f'/opt/airflow/{self.script_location}'

    @property
    def source(self) -> HiveTable:
        return HIVE_CATALOG[self.source_hive_table]


def _hive_table(conf) -> HiveTable:
    return HiveTable(
        schema=conf['database'],
        name=conf['table'],
        layer=conf.get('layer', 'foundation'),
        env=conf.get('env', 'dev'),
        script_type=conf.get('script_type', 'pyspark'),
        schedule=conf.get('schedule'),
        script_location=conf.get('script_location'),
        write_conf=conf.get('write_conf') or {},
    )


def _datamart_table(conf) -> DatamartTable:
    return DatamartTable(
        schema=conf['database'],
        name=conf['table'],
        layer=conf.get('layer', 'datamart'),
        env=conf.get('env', 'dev'),
        script_type=conf.get('script_type', 'python'),
        schedule=conf.get('schedule'),
        script_location=conf.get('script_location'),
        source_hive_table=(conf.get('source') or {}).get('hive_table'),
    )


# --- Loaded catalogs -----------------------------------------------------------
HIVE_CATALOG = {key: _hive_table(conf) for key, conf in _load_yaml('hive_catalog').items()}

DATAMART_CATALOG = {
    key: _datamart_table(conf) for key, conf in _load_yaml('datamart_catalog').items()
}

# --- Convenience handles ---------------------------------------------------------
SCRAPING_DETIK = HIVE_CATALOG['scraping_detik']
DETIK_PROCESSED_ARTICLES = DATAMART_CATALOG['detik_scraping_processed_articles']
