# Databricks notebook source
# KYC Analytics - Verification trends, approval rates, and platform breakdowns

from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count, sum, avg, date_trunc, to_date
from pyspark.sql.types import StructType, StructField, StringType, TimestampType, BooleanType

# COMMAND ----------

spark = SparkSession.builder.appName("KYC_Analytics").getOrCreate()

credential_schema = StructType([
    StructField("id", StringType(), True),
    StructField("platform_user_id", StringType(), True),
    StructField("platform", StringType(), True),
    StructField("credential_type", StringType(), True),
    StructField("status", StringType(), True),
    StructField("issued_at", TimestampType(), True),
    StructField("expires_at", TimestampType(), True),
    StructField("verified_at", TimestampType(), True),
    StructField("is_revoked", BooleanType(), True),
])

df = spark.read \
    .format("jdbc") \
    .option("url", "jdbc:postgresql://dw-host:5432/warehouse") \
    .option("dbtable", "dw.fact_credentials") \
    .option("user", dbutils.secrets.get("data", "db_user")) \
    .option("password", dbutils.secrets.get("data", "db_pass")) \
    .load()

# COMMAND ----------

daily_metrics = df \
    .withColumn("verification_date", to_date(col("verified_at"))) \
    .groupBy("verification_date", "platform") \
    .agg(
        count("*").alias("total_verifications"),
        count("id").alias("total_credentials"),
        sum((col("status") == "approved").cast("int")).alias("approved_count"),
        sum((col("status") == "rejected").cast("int")).alias("rejected_count"),
        avg((col("status") == "approved").cast("double")).alias("approval_rate"),
    ) \
    .orderBy("verification_date", "platform")

display(daily_metrics)

# COMMAND ----------

monthly_summary = df \
    .withColumn("month", date_trunc("month", col("issued_at"))) \
    .groupBy("month", "credential_type") \
    .agg(
        count("*").alias("issued"),
        sum((col("is_revoked")).cast("int")).alias("revoked"),
    ) \
    .withColumn("revocation_rate", col("revoked") / col("issued")) \
    .orderBy("month", "credential_type")

display(monthly_summary)

# COMMAND ----------

monthly_summary.write \
    .format("delta") \
    .mode("overwrite") \
    .option("mergeSchema", "true") \
    .saveAsTable("analytics.kyc_monthly_summary")
