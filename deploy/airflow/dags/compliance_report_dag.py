from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.empty import EmptyOperator
from airflow.operators.python import PythonOperator
from airflow.utils.dates import days_ago

default_args = {
    "owner": "compliance-team",
    "depends_on_past": False,
    "email_on_failure": True,
    "email": ["compliance@example.com"],
    "retries": 3,
    "retry_delay": timedelta(minutes=10),
}

with DAG(
    dag_id="compliance_report_generation",
    description="Monthly compliance report generation",
    schedule_interval="0 6 1 * *",
    start_date=days_ago(30),
    catchup=False,
    tags=["compliance", "reporting"],
    default_args=default_args,
) as dag:

    start = EmptyOperator(task_id="start")

    collect_audit_logs = PythonOperator(
        task_id="collect_audit_logs",
        python_callable=lambda: None,
    )

    collect_access_records = PythonOperator(
        task_id="collect_access_records",
        python_callable=lambda: None,
    )

    collect_kyc_approvals = PythonOperator(
        task_id="collect_kyc_approvals",
        python_callable=lambda: None,
    )

    generate_report = PythonOperator(
        task_id="generate_report",
        python_callable=lambda: None,
    )

    sign_report = PythonOperator(
        task_id="sign_report",
        python_callable=lambda: None,
    )

    store_report = PythonOperator(
        task_id="store_report",
        python_callable=lambda: None,
    )

    notify_stakeholders = PythonOperator(
        task_id="notify_stakeholders",
        python_callable=lambda: None,
    )

    end = EmptyOperator(task_id="end")

    (
        start
        >> [collect_audit_logs, collect_access_records, collect_kyc_approvals]
        >> generate_report
        >> sign_report
        >> store_report
        >> notify_stakeholders
        >> end
    )
