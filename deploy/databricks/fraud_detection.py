# Databricks notebook source
# Fraud Detection ML - Anomaly detection on KYC credential patterns

from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count, datediff, current_timestamp, to_date, hour, weekofyear
from pyspark.ml.feature import VectorAssembler, StandardScaler
from pyspark.ml.clustering import KMeans
from pyspark.ml.evaluation import ClusteringEvaluator

# COMMAND ----------

spark = SparkSession.builder.appName("Fraud_Detection_ML").getOrCreate()

events_df = spark.read \
    .format("kafka") \
    .option("kafka.bootstrap.servers", "redpanda:9092") \
    .option("subscribe", "credential.events") \
    .option("startingOffsets", "earliest") \
    .load() \
    .selectExpr("CAST(value AS STRING) as json") \
    .selectExpr("from_json(json, 'event_id STRING, user_id STRING, event_type STRING, ip_address STRING, user_agent STRING, timestamp TIMESTAMP') AS data") \
    .select("data.*")

# COMMAND ----------

feature_df = events_df \
    .withColumn("event_hour", hour(col("timestamp"))) \
    .withColumn("event_week", weekofyear(col("timestamp"))) \
    .groupBy("user_id") \
    .agg(
        count("*").alias("event_count"),
    ) \
    .filter(col("event_count") > 1)

feature_assembler = VectorAssembler(
    inputCols=["event_count"],
    outputCol="features_raw",
)
feature_vector = feature_assembler.transform(feature_df)

scaler = StandardScaler(
    inputCol="features_raw",
    outputCol="features",
    withStd=True,
    withMean=True,
)
scaler_model = scaler.fit(feature_vector)
scaled_data = scaler_model.transform(feature_vector)

# COMMAND ----------

kmeans = KMeans().setK(3).setSeed(42)
model = kmeans.fit(scaled_data)

predictions = model.transform(scaled_data)

evaluator = ClusteringEvaluator()
silhouette = evaluator.evaluate(predictions)
print(f"Silhouette score: {silhouette}")

# COMMAND ----------

anomalies = predictions.filter(col("prediction") == 0)
anomalies.write \
    .format("delta") \
    .mode("overwrite") \
    .saveAsTable("analytics.fraud_anomalies")

display(anomalies)
