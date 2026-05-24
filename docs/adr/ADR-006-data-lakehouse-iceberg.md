# ADR-006: Data Lakehouse with Apache Iceberg

**Status:** Accepted  
**Date:** 2026-05-24

## Context
KYC operations generate immutable audit logs, verification events, and compliance data requiring long-term analytics. Need schema evolution, time-travel, and cross-engine querying.

## Decision
Apache Iceberg as table format for the data lakehouse:
- Storage on MinIO (S3-compatible), later cloud S3
- Apache Polaris for Iceberg REST catalog (unified metadata)
- Trino for federated SQL queries across Iceberg + other sources
- DuckDB for embedded local analytics and ad-hoc queries
- Apache Arrow/DataFusion for programmatic columnar access
- Parquet as the file format with Zstd compression

## Consequences
+ Time-travel queries enable compliance auditing "as of" any date
+ Schema evolution supports credential format upgrades
+ Partition evolution avoids costly data rewrites
- Iceberg metadata operations add latency on small tables
- Requires dedicated catalog and compaction management
