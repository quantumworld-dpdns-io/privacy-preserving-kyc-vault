# Databricks notebook source
# Compliance Reporting - Generate aggregated compliance datasets for auditors

from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count, sum, when, date_trunc, to_date, max as spark_max

# COMMAND ----------

spark = SparkSession.builder.appName("Compliance_Reporting").getOrCreate()

verifications = spark.read \
    .format("jdbc") \
    .option("url", "jdbc:postgresql://dw-host:5432/warehouse") \
    .option("dbtable", "dw.fact_verifications") \
    .option("user", dbutils.secrets.get("compliance", "db_user")) \
    .option("password", dbutils.secrets.get("compliance", "db_pass")) \
    .load()

credentials = spark.read \
    .format("jdbc") \
    .option("url", "jdbc:postgresql://dw-host:5432/warehouse") \
    .option("dbtable", "dw.dim_platform") \
    .option("user", dbutils.secrets.get("compliance", "db_user")) \
    .option("password", dbutils.secrets.get("compliance", "db_pass")) \
    .load()

# COMMAND ----------

monthly_verifications = verifications \
    .withColumn("report_month", date_trunc("month", col("verified_at"))) \
    .groupBy("report_month", "platform_id", "verification_method") \
    .agg(
        count("*").alias("total_verifications"),
        sum(when(col("status") == "approved", 1).otherwise(0)).alias("approved"),
        sum(when(col("status") == "rejected", 1).otherwise(0)).alias("rejected"),
        sum(when(col("status") == "pending", 1).otherwise(0)).alias("pending"),
    ) \
    .orderBy("report_month", "platform_id")

display(monthly_verifications)

# COMMAND ----------

compliance_summary = monthly_verifications \
    .groupBy("report_month") \
    .agg(
        count("*").alias("total_records"),
        spark_max(col("total_verifications")).alias("max_verifications_monthly"),
    )

display(compliance_summary)

# COMMAND ----------

monthly_verifications.write \
    .format("parquet") \
    .mode("overwrite") \
    .partitionBy("report_month") \
    .save("/data/compliance/monthly_verifications")

# COMMAND ----------

dbutils.notebook.exit("Compliance reporting complete")
