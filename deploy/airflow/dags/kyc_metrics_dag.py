from datetime import timedelta

from airflow import DAG
from airflow.operators.empty import EmptyOperator
from airflow.operators.python import PythonOperator
from airflow.utils.dates import days_ago

default_args = {
    "owner": "data-team",
    "depends_on_past": False,
    "email_on_failure": True,
    "email": ["data@example.com"],
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

with DAG(
    dag_id="kyc_metrics_aggregation",
    description="KYC metrics aggregation pipeline",
    schedule_interval="0 4 * * *",
    start_date=days_ago(1),
    catchup=False,
    tags=["kyc", "metrics"],
    default_args=default_args,
) as dag:

    start = EmptyOperator(task_id="start")

    aggregate_platform_metrics = PythonOperator(
        task_id="aggregate_platform_metrics",
        python_callable=lambda: None,
    )

    aggregate_verification_metrics = PythonOperator(
        task_id="aggregate_verification_metrics",
        python_callable=lambda: None,
    )

    aggregate_geo_metrics = PythonOperator(
        task_id="aggregate_geo_metrics",
        python_callable=lambda: None,
    )

    rollup_hourly = PythonOperator(
        task_id="rollup_hourly",
        python_callable=lambda: None,
    )

    rollup_daily = PythonOperator(
        task_id="rollup_daily",
        python_callable=lambda: None,
    )

    publish_metrics = PythonOperator(
        task_id="publish_metrics",
        python_callable=lambda: None,
    )

    end = EmptyOperator(task_id="end")

    (
        start
        >> [aggregate_platform_metrics, aggregate_verification_metrics, aggregate_geo_metrics]
        >> rollup_hourly
        >> rollup_daily
        >> publish_metrics
        >> end
    )
