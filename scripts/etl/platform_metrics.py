#!/usr/bin/env python3
"""
ETL Script: Aggregate platform metrics from credential events.
Reads verification events and credential audit data from the Iceberg
data lake, computes per-platform (customer_id) daily aggregations,
and writes results to the platform_analytics Iceberg table.
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.parquet as pq
from pyarrow import fs as pa_fs

logger = logging.getLogger(__name__)

# ── Schema ─────────────────────────────────────────────────────

PLATFORM_ANALYTICS_SCHEMA = pa.schema([
    pa.field("metric_id", pa.string()),
    pa.field("customer_id", pa.string()),
    pa.field("tier", pa.string()),
    pa.field("usage_date", pa.date32()),
    pa.field("api_calls", pa.int64()),
    pa.field("verifications", pa.int64()),
    pa.field("successful_verifications", pa.int64()),
    pa.field("failed_verifications", pa.int64()),
    pa.field("avg_response_time_ms", pa.float64()),
    pa.field("p99_response_time_ms", pa.float64()),
    pa.field("storage_bytes", pa.int64()),
    pa.field("compute_seconds", pa.int64()),
    pa.field("ai_inference_count", pa.int64()),
    pa.field("fraud_detections", pa.int64()),
    pa.field("active_credentials", pa.int64()),
    pa.field("revenue_usd", pa.decimal128(12, 2)),
    pa.field("region", pa.string()),
    pa.field("metadata", pa.string()),
    pa.field("created_at", pa.timestamp("us", tz="UTC")),
    pa.field("ingested_at", pa.timestamp("us", tz="UTC")),
    pa.field("metric_month", pa.string()),
])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Aggregate platform metrics from credential events"
    )
    parser.add_argument(
        "--s3-endpoint",
        default=os.getenv("S3_ENDPOINT", "http://localhost:9000"),
    )
    parser.add_argument(
        "--s3-bucket",
        default=os.getenv("S3_BUCKET", "kyc-vault-iceberg"),
    )
    parser.add_argument(
        "--access-key",
        default=os.getenv("AWS_ACCESS_KEY_ID", "minioadmin"),
    )
    parser.add_argument(
        "--secret-key",
        default=os.getenv("AWS_SECRET_ACCESS_KEY", "minioadmin"),
    )
    parser.add_argument(
        "--date",
        default=(datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d"),
        help="Aggregation date (YYYY-MM-DD), defaults to yesterday",
    )
    parser.add_argument(
        "--output-table",
        default="platform_analytics",
        help="Target Iceberg table name",
    )
    parser.add_argument(
        "--tier-map",
        default='{"free": 0, "starter": 100, "professional": 1000, "enterprise": 10000}',
        help="JSON mapping of tier → included free verifications",
    )
    parser.add_argument(
        "--revenue-per-verification",
        type=float,
        default=0.05,
        help="Revenue in USD per verification above free tier",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    return parser.parse_args()


def load_iceberg_dataset(
    s3_fs: pa_fs.FileSystem,
    bucket: str,
    table: str,
    partition_filter: Optional[str] = None,
) -> ds.Dataset:
    """Load an Iceberg table as a PyArrow dataset with optional partition filtering."""
    base = f"{bucket}/{table}"

    if partition_filter:
        partitioning = ds.partitioning(
            pa.schema([
                ds.field("event_date", pa.date32()),
            ])
        )
        # Glob for matching partition directories
        path = f"{base}/{partition_filter}"
    else:
        path = base

    return ds.dataset(
        path,
        filesystem=s3_fs,
        format="parquet",
        partitioning=ds.partitioning(
            pa.schema([
                pa.field("audit_date", pa.date32()),
            ])
        ) if table == "credential_audit" else None,
    )


def compute_tier_map(tier_map_json: str) -> Dict[str, int]:
    import json
    return json.loads(tier_map_json)


def compute_platform_metrics(
    verification_ds: ds.Dataset,
    audit_ds: ds.Dataset,
    target_date: str,
    tier_map: Dict[str, int],
    rev_per_verification: float,
) -> List[Dict[str, Any]]:
    """Compute per-platform daily metrics for the target date."""
    import pyarrow.dataset as ds
    import pyarrow.compute as pc

    target_date_str = target_date

    # Filter verifications to the target date
    verifications_table = verification_ds.to_table(
        filter=pc.equal(
            pc.cast(ds.field("event_date"), pa.string()),
            target_date_str,
        ),
        columns=[
            "tenant_id", "event_type", "verification_result",
            "processing_time_ms", "credential_type", "region",
        ],
    )

    # Filter audit records to the target date
    audit_table = audit_ds.to_table(
        filter=pc.equal(
            pc.cast(ds.field("audit_date"), pa.string()),
            target_date_str,
        ),
        columns=[
            "tenant_id", "audit_action", "risk_score",
        ],
    )

    if len(verifications_table) == 0 and len(audit_table) == 0:
        logger.info("No data for date %s, skipping", target_date_str)
        return []

    # Aggregate verification metrics per tenant
    verifications_by_tenant: Dict[str, Dict] = {}
    for batch in verifications_table.to_batches():
        for i in range(len(batch)):
            tenant = batch.column("tenant_id")[i].as_py() or "unknown"
            if tenant not in verifications_by_tenant:
                verifications_by_tenant[tenant] = {
                    "verifications": 0,
                    "successful": 0,
                    "failed": 0,
                    "processing_times": [],
                }
            v = verifications_by_tenant[tenant]
            v["verifications"] += 1
            if batch.column("verification_result")[i].as_py() == "approved":
                v["successful"] += 1
            elif batch.column("verification_result")[i].as_py() == "rejected":
                v["failed"] += 1
            pt = batch.column("processing_time_ms")[i].as_py()
            if pt is not None:
                v["processing_times"].append(pt)

    # Aggregate audit metrics per tenant
    fraud_by_tenant: Dict[str, int] = {}
    for batch in audit_table.to_batches():
        for i in range(len(batch)):
            tenant = batch.column("tenant_id")[i].as_py() or "unknown"
            action = batch.column("audit_action")[i].as_py()
            if action in ("fraud_detected", "suspicious_activity"):
                fraud_by_tenant[tenant] = fraud_by_tenant.get(tenant, 0) + 1

    results = []
    for tenant, metrics in verifications_by_tenant.items():
        proc_times = metrics["processing_times"]
        avg_ms = sum(proc_times) / len(proc_times) if proc_times else 0.0
        sorted_times = sorted(proc_times)
        p99_idx = int(len(sorted_times) * 0.99)
        p99_ms = sorted_times[p99_idx] if sorted_times else 0.0

        # Determine tier (simplified; in production this would come from a service)
        tier = "free"
        free_limit = tier_map.get("free", 0)
        billable = max(0, metrics["verifications"] - free_limit)
        revenue = billable * rev_per_verification

        metric_month = target_date_str[:7]

        results.append({
            "metric_id": f"{tenant}_{target_date_str}_{metric_month}",
            "customer_id": tenant,
            "tier": tier,
            "usage_date": target_date_str,
            "api_calls": metrics["verifications"] * 3,  # rough estimate
            "verifications": metrics["verifications"],
            "successful_verifications": metrics["successful"],
            "failed_verifications": metrics["failed"],
            "avg_response_time_ms": round(avg_ms, 2),
            "p99_response_time_ms": round(p99_ms, 2),
            "storage_bytes": metrics["verifications"] * 1024,  # estimate
            "compute_seconds": int(avg_ms * metrics["verifications"] / 1000),
            "ai_inference_count": metrics["verifications"],
            "fraud_detections": fraud_by_tenant.get(tenant, 0),
            "active_credentials": metrics["verifications"],
            "revenue_usd": round(revenue, 2),
            "region": "us-east-1",
            "metadata": "{}",
            "created_at": datetime.now(timezone.utc),
            "ingested_at": datetime.now(timezone.utc),
            "metric_month": metric_month,
        })

    return results


def write_platform_metrics(
    metrics: List[Dict[str, Any]],
    s3_fs: pa_fs.FileSystem,
    bucket: str,
    output_table: str,
) -> None:
    """Write aggregated metrics as a partitioned Parquet file."""
    if not metrics:
        logger.info("No metrics to write")
        return

    table = pa.Table.from_pylist(metrics, schema=PLATFORM_ANALYTICS_SCHEMA)

    # Partition by metric_month
    partition_col = table.column("metric_month")
    unique_months = pc.unique(partition_col).to_pylist()

    for month in unique_months:
        mask = pc.equal(partition_col, month)
        month_table = table.filter(mask)
        key = f"{output_table}/metric_month={month}/metrics_{month}.parquet"
        path = f"{bucket}/{key}"

        pq.write_table(
            month_table,
            path,
            filesystem=s3_fs,
            compression="ZSTD",
            row_group_size=256 * 1024,
            version="2.6",
        )
        logger.info("Wrote %d metric rows to s3://%s", len(month_table), path)


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    s3_fs = pa_fs.S3FileSystem(
        endpoint_override=args.s3_endpoint,
        access_key=args.access_key,
        secret_key=args.secret_key,
        scheme="http",
        region="us-east-1",
    )

    tier_map = compute_tier_map(args.tier_map)
    logger.info("Tier map: %s", tier_map)

    # Load source datasets
    verification_ds = load_iceberg_dataset(
        s3_fs, args.s3_bucket, "verification_events",
        partition_filter=f"event_date={args.date}",
    )
    audit_ds = load_iceberg_dataset(
        s3_fs, args.s3_bucket, "credential_audit",
        partition_filter=f"audit_date={args.date}",
    )

    logger.info("Computing platform metrics for date %s", args.date)
    metrics = compute_platform_metrics(
        verification_ds, audit_ds, args.date, tier_map, args.revenue_per_verification,
    )

    write_platform_metrics(metrics, s3_fs, args.s3_bucket, args.output_table)

    logger.info(
        "Platform metrics ETL complete: %d tenants processed",
        len(metrics),
    )


if __name__ == "__main__":
    main()
