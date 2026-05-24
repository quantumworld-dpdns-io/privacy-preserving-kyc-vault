from datetime import timedelta

from airflow import DAG
from airflow.operators.empty import EmptyOperator
from airflow.operators.postgres import PostgresOperator
from airflow.utils.dates import days_ago

RETENTION_DAYS = {
    "audit_logs": 365,
    "temporary_uploads": 7,
    "session_data": 30,
    "staging_credentials": 90,
    "raw_events": 180,
}

default_args = {
    "owner": "infra-team",
    "depends_on_past": False,
    "email_on_failure": True,
    "email": ["infra@example.com"],
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

with DAG(
    dag_id="data_retention_cleanup",
    description="Data retention and cleanup DAG",
    schedule_interval="0 5 * * 0",
    start_date=days_ago(1),
    catchup=False,
    tags=["cleanup", "retention"],
    default_args=default_args,
) as dag:

    start = EmptyOperator(task_id="start")

    cleanup_audit_logs = PostgresOperator(
        task_id="cleanup_audit_logs",
        postgres_conn_id="postgres_main",
        sql=f"DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '{RETENTION_DAYS['audit_logs']} days';",
    )

    cleanup_temp_uploads = PostgresOperator(
        task_id="cleanup_temp_uploads",
        postgres_conn_id="postgres_main",
        sql=f"DELETE FROM temporary_uploads WHERE created_at < NOW() - INTERVAL '{RETENTION_DAYS['temporary_uploads']} days';",
    )

    cleanup_sessions = PostgresOperator(
        task_id="cleanup_sessions",
        postgres_conn_id="postgres_main",
        sql=f"DELETE FROM session_data WHERE last_accessed < NOW() - INTERVAL '{RETENTION_DAYS['session_data']} days';",
    )

    cleanup_staging = PostgresOperator(
        task_id="cleanup_staging",
        postgres_conn_id="postgres_warehouse",
        sql=f"DELETE FROM staging.credentials_raw WHERE loaded_at < NOW() - INTERVAL '{RETENTION_DAYS['staging_credentials']} days';",
    )

    cleanup_raw_events = PostgresOperator(
        task_id="cleanup_raw_events",
        postgres_conn_id="postgres_warehouse",
        sql=f"DELETE FROM staging.raw_events WHERE ingested_at < NOW() - INTERVAL '{RETENTION_DAYS['raw_events']} days';",
    )

    vacuum_analyze = PostgresOperator(
        task_id="vacuum_analyze",
        postgres_conn_id="postgres_main",
        sql="VACUUM ANALYZE;",
    )

    end = EmptyOperator(task_id="end")

    (
        start
        >> [cleanup_audit_logs, cleanup_temp_uploads, cleanup_sessions, cleanup_staging, cleanup_raw_events]
        >> vacuum_analyze
        >> end
    )
