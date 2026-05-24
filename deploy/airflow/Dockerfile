FROM apache/airflow:2.8.1-python3.11

USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

USER airflow

COPY config/airflow.cfg ${AIRFLOW_HOME}/airflow.cfg

RUN pip install --no-cache-dir \
    apache-airflow-providers-postgres==2.8.0 \
    apache-airflow-providers-celery==3.5.0 \
    apache-airflow-providers-amazon==8.18.0 \
    apache-airflow-providers-redis==3.5.0 \
    apache-airflow-providers-slack==8.4.0 \
    psycopg2-binary==2.9.9 \
    boto3==1.34.0 \
    redis==5.0.1 \
    croniter==2.0.1 \
    pandas==2.1.4 \
    pyarrow==15.0.0

COPY dags/ ${AIRFLOW_HOME}/dags/
COPY plugins/ ${AIRFLOW_HOME}/plugins/

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD airflow jobs check --job-type SchedulerJob --hostname $$(hostname)
