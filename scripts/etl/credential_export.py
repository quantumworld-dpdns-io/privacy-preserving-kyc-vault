#!/usr/bin/env python3
"""
ETL Script: Export credentials from PostgreSQL to Iceberg Parquet.
Reads verified credentials from the operational DB, transforms to
the Iceberg schema, and writes partitioned Parquet files to S3-compatible
storage (MinIO). Optionally registers the data with the Polaris catalog.
"""

import argparse
import hashlib
import json
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional

import boto3
import pyarrow as pa
import pyarrow.parquet as pq
import pytz
import sqlalchemy as sa
from botocore.config import Config as BotoConfig
from pyarrow import fs as pa_fs
from sqlalchemy import text

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────

DEFAULT_BATCH_SIZE = 10000
DEFAULT_TARGET_BYTES = 268435456  # 256 MB

CREDENTIAL_SCHEMA = pa.schema([
    pa.field("credential_id", pa.string(), metadata={"description": "UUID v4"}),
    pa.field("credential_type", pa.string()),
    pa.field("did", pa.string(), metadata={"description": "DID of subject"}),
    pa.field("issuer_did", pa.string()),
    pa.field("jurisdiction", pa.string()),
    pa.field("audit_action", pa.string()),
    pa.field("previous_hash", pa.string()),
    pa.field("current_hash", pa.string()),
    pa.field("changes", pa.string(), metadata={"description": "JSON blob"}),
    pa.field("actor_did", pa.string()),
    pa.field("risk_score", pa.float64()),
    pa.field("verification_tier", pa.string()),
    pa.field("metadata", pa.string(), metadata={"description": "JSON blob"}),
    pa.field("tenant_id", pa.string()),
    pa.field("created_at", pa.timestamp("us", tz="UTC")),
    pa.field("ingested_at", pa.timestamp("us", tz="UTC")),
    pa.field("audit_date", pa.date32()),
])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export credentials to Iceberg Parquet"
    )
    parser.add_argument(
        "--db-url",
        default=os.getenv("DB_URL", "postgresql://user:pass@localhost:5432/kyc_vault"),
        help="Source database URL",
    )
    parser.add_argument(
        "--s3-endpoint",
        default=os.getenv("S3_ENDPOINT", "http://localhost:9000"),
        help="S3-compatible endpoint (MinIO)",
    )
    parser.add_argument(
        "--s3-bucket",
        default=os.getenv("S3_BUCKET", "kyc-vault-iceberg"),
        help="Target S3 bucket",
    )
    parser.add_argument(
        "--s3-prefix",
        default=os.getenv("S3_PREFIX", "credential_audit"),
        help="S3 key prefix",
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
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Rows per batch (default: {DEFAULT_BATCH_SIZE})",
    )
    parser.add_argument(
        "--partition-date",
        default=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        help="Partition date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--polaris-catalog-url",
        default=os.getenv("POLARIS_CATALOG_URL", ""),
        help="Polaris REST catalog URL for registration",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    return parser.parse_args()


def compute_hash(row: Dict[str, Any], previous: Optional[str]) -> str:
    """Compute SHA-256 hash for audit record chaining."""
    payload = json.dumps(row, sort_keys=True, default=str).encode()
    if previous:
        payload += previous.encode()
    return hashlib.sha256(payload).hexdigest()


def fetch_credentials(
    engine: sa.Engine, batch_size: int, partition_date: str
) -> Iterator[List[Dict[str, Any]]]:
    """Stream credential records from PostgreSQL in batches."""
    query = text("""
        SELECT
            c.id AS credential_id,
            c.credential_type,
            c.did,
            c.issuer_did,
            c.jurisdiction,
            'credential_exported' AS audit_action,
            c.metadata::text AS metadata,
            c.risk_score,
            c.verification_tier,
            c.tenant_id,
            c.created_at,
            c.updated_at
        FROM credentials c
        WHERE c.updated_at::date = :partition_date
           OR c.created_at::date = :partition_date
        ORDER BY c.created_at
    """)

    previous_hash: Optional[str] = None
    batch: List[Dict[str, Any]] = []

    with engine.connect() as conn:
        result = conn.execute(query, {"partition_date": partition_date})
        for row in result.mappings():
            record = dict(row)
            record["current_hash"] = compute_hash(record, previous_hash)
            record["previous_hash"] = previous_hash or ""
            record["audit_date"] = partition_date
            record["ingested_at"] = datetime.now(timezone.utc)

            previous_hash = record["current_hash"]
            batch.append(record)

            if len(batch) >= batch_size:
                yield batch
                batch = []

    if batch:
        yield batch


def write_parquet_batch(
    batch: List[Dict[str, Any]],
    s3_fs: pa_fs.FileSystem,
    s3_bucket: str,
    s3_prefix: str,
    partition_date: str,
    batch_id: int,
) -> str:
    """Write a batch of records as a partitioned Parquet file."""
    table = pa.Table.from_pylist(batch, schema=CREDENTIAL_SCHEMA)

    # Partition by audit_date
    key = f"{s3_prefix}/audit_date={partition_date}/batch_{batch_id:06d}.parquet"
    path = f"{s3_bucket}/{key}"

    pq.write_table(
        table,
        path,
        filesystem=s3_fs,
        compression="ZSTD",
        row_group_size=512 * 1024,  # 512K rows per row group
        data_page_size=1024 * 1024,  # 1 MB data pages
        version="2.6",
    )

    logger.info("Wrote %d rows to s3://%s", len(batch), path)
    return path


def create_s3_filesystem(
    endpoint: str, access_key: str, secret_key: str
) -> pa_fs.FileSystem:
    """Create a PyArrow S3 filesystem pointing to MinIO."""
    return pa_fs.S3FileSystem(
        endpoint_override=endpoint,
        access_key=access_key,
        secret_key=secret_key,
        scheme="http",
        region="us-east-1",
        request_timeout=30,
        connect_timeout=10,
    )


def register_with_polaris(
    catalog_url: str,
    parquet_paths: List[str],
) -> None:
    """Register exported Parquet files with the Polaris Iceberg catalog."""
    import requests

    payload = {
        "table_name": "credential_audit",
        "namespace": "kyc_lakehouse",
        "format": "parquet",
        "files": parquet_paths,
        "schema": {f.name: str(f.type) for f in CREDENTIAL_SCHEMA},
        "partition_by": ["audit_date"],
    }

    resp = requests.post(
        f"{catalog_url}/v1/namespaces/kyc_lakehouse/tables/credential_audit/register",
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    logger.info("Registered %d files with Polaris catalog", len(parquet_paths))


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    engine = sa.create_engine(
        args.db_url,
        pool_size=5,
        pool_recycle=3600,
        execution_options={"stream_results": True},
    )
    s3_fs = create_s3_filesystem(args.s3_endpoint, args.access_key, args.secret_key)

    # Ensure target bucket exists
    s3_client = boto3.client(
        "s3",
        endpoint_url=args.s3_endpoint,
        aws_access_key_id=args.access_key,
        aws_secret_access_key=args.secret_key,
        config=BotoConfig(signature_version="s3v4"),
        region_name="us-east-1",
    )
    try:
        s3_client.create_bucket(Bucket=args.s3_bucket)
    except s3_client.exceptions.BucketAlreadyOwnedByYou:
        pass

    batch_id = 0
    parquet_paths: List[str] = []

    logger.info(
        "Starting export for partition_date=%s batch_size=%d",
        args.partition_date,
        args.batch_size,
    )

    for batch in fetch_credentials(engine, args.batch_size, args.partition_date):
        path = write_parquet_batch(
            batch, s3_fs, args.s3_bucket, args.s3_prefix, args.partition_date, batch_id
        )
        parquet_paths.append(path)
        batch_id += 1

    logger.info("Export complete: %d batches, %d files", batch_id, len(parquet_paths))

    if args.polaris_catalog_url and parquet_paths:
        register_with_polaris(args.polaris_catalog_url, parquet_paths)
        logger.info("Catalog registration complete")

    engine.dispose()


if __name__ == "__main__":
    main()
