from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.empty import EmptyOperator
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.operators.postgres import PostgresOperator
from airflow.utils.dates import days_ago

default_args = {
    "owner": "data-team",
    "depends_on_past": False,
    "email_on_failure": True,
    "email": ["data@example.com"],
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}

with DAG(
    dag_id="credential_pipeline",
    description="Daily credential ETL pipeline",
    schedule_interval="0 3 * * *",
    start_date=days_ago(1),
    catchup=False,
    tags=["credentials", "etl"],
    default_args=default_args,
) as dag:

    start = EmptyOperator(task_id="start")

    extract_credentials = PostgresOperator(
        task_id="extract_credentials",
        postgres_conn_id="postgres_creds",
        sql="""
            INSERT INTO staging.credentials_raw
            SELECT id, platform_user_id, credential_type, status,
                   issued_at, expires_at, metadata
            FROM credentials
            WHERE updated_at >= NOW() - INTERVAL '24 hours';
        """,
    )

    transform_credentials = PythonOperator(
        task_id="transform_credentials",
        python_callable=lambda: None,
    )

    load_warehouse = PostgresOperator(
        task_id="load_warehouse",
        postgres_conn_id="postgres_warehouse",
        sql="""
            INSERT INTO dw.fact_credentials
            SELECT cr.*, CURRENT_TIMESTAMP AS loaded_at
            FROM staging.credentials_raw cr
            WHERE NOT EXISTS (
                SELECT 1 FROM dw.fact_credentials fc
                WHERE fc.id = cr.id
            );
        """,
    )

    end = EmptyOperator(task_id="end")

    start >> extract_credentials >> transform_credentials >> load_warehouse >> end
