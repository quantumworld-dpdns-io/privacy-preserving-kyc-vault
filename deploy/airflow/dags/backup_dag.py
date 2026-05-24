from datetime import timedelta

from airflow import DAG
from airflow.operators.empty import EmptyOperator
from airflow.operators.bash import BashOperator
from airflow.utils.dates import days_ago

BACKUP_DIR = "/backups/postgres"
RETENTION_DAYS = 30

default_args = {
    "owner": "infra-team",
    "depends_on_past": False,
    "email_on_failure": True,
    "email": ["infra@example.com"],
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}

with DAG(
    dag_id="database_backup",
    description="Database backup scheduling",
    schedule_interval="0 2 * * *",
    start_date=days_ago(1),
    catchup=False,
    tags=["backup", "infrastructure"],
    default_args=default_args,
) as dag:

    start = EmptyOperator(task_id="start")

    backup_main_db = BashOperator(
        task_id="backup_main_db",
        bash_command=(
            f"pg_dump -h {{{{ conn.postgres_main.host }}}} "
            f"-U {{{{ conn.postgres_main.login }}}} "
            f"-d {{{{ conn.postgres_main.schema }}}} "
            f"-F c -f {BACKUP_DIR}/main_db_$(date +\\%Y\\%m\\%d_\\%H\\%M\\%S).dump"
        ),
    )

    backup_warehouse = BashOperator(
        task_id="backup_warehouse",
        bash_command=(
            f"pg_dump -h {{{{ conn.postgres_warehouse.host }}}} "
            f"-U {{{{ conn.postgres_warehouse.login }}}} "
            f"-d {{{{ conn.postgres_warehouse.schema }}}} "
            f"-F c -f {BACKUP_DIR}/warehouse_$(date +\\%Y\\%m\\%d_\\%H\\%M\\%S).dump"
        ),
    )

    encrypt_backups = BashOperator(
        task_id="encrypt_backups",
        bash_command=f"gpg --encrypt --recipient backup-team {BACKUP_DIR}/*.dump",
    )

    upload_to_s3 = BashOperator(
        task_id="upload_to_s3",
        bash_command=f"aws s3 sync {BACKUP_DIR} s3://kyc-vault-backups/$(date +\\%Y/\\%m/\\%d)/",
    )

    cleanup_old_backups = BashOperator(
        task_id="cleanup_old_backups",
        bash_command=f"find {BACKUP_DIR} -name '*.dump' -mtime +{RETENTION_DAYS} -delete",
    )

    end = EmptyOperator(task_id="end")

    start >> [backup_main_db, backup_warehouse] >> encrypt_backups >> upload_to_s3 >> cleanup_old_backups >> end
