# Database Failover Runbook

## Overview

This runbook covers failover procedures for the PostgreSQL primary/standby cluster used by KYC Vault. The database runs as a Patroni-managed streaming replication cluster deployed on Kubernetes (RDS for managed deployments) with automatic and manual failover capabilities.

## Architecture

```
          ┌──────────────┐
          │  Application │
          │   Services   │
          └──────┬───────┘
                 │
          ┌──────▼───────┐
          │  pgBouncer   │
          │ Connection   │
          │   Pooler     │
          └──────┬───────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼───┐  ┌────▼────┐  ┌───▼───┐
│Primary│◄─┤Patroni  ├─►│Standby│
│ (RW)  │  │Quorum   │  │ (RO)  │
└───────┘  └─────────┘  └───────┘
                          │
                    ┌─────▼─────┐
                    │  Standby  │
                    │  (RO/DR)  │
                    └───────────┘
```

- **Primary**: Handles all read/write traffic (RDS writer or Patroni primary)
- **Standby(s)**: Streaming replication, read-only queries, failover targets
- **Patroni**: Distributed consensus (etcd/raft) for automated failover
- **pgBouncer**: Connection pooling between services and database

## Pre-Requisites

```bash
# Access to Kubernetes cluster
export KUBECONFIG=~/.kube/config-kyc-prod

# PostgreSQL client
psql --version  # >= 14

# Patroni CLI (if self-managed)
patronictl --version

# AWS CLI (if RDS)
aws --version

# Network access to DB security group
```

## Scenario A: Planned Failover (Maintenance)

### When to Use
- Database version upgrade
- Patching OS or PostgreSQL
- Scaling instance size
- Testing failover readiness

### Step 1: Verify Cluster State

```bash
# Check Patroni cluster status (self-managed)
kubectl exec -n kyc-vault svc/kyc-postgres -- patronictl list

# Expected output:
# + Cluster: kyc-vault (xxx) ----+--------+----+-----------+
# | Member       | Host          | Role   | TL | Lag in MB |
# +--------------+---------------+--------+----+-----------+
# | pg-primary-0 | 10.0.1.10:5432| Leader | 42 |           |
# | pg-standby-0 | 10.0.1.11:5432| Replica| 42 |         0 |
# | pg-standby-1 | 10.0.1.12:5432| Replica| 42 |         0 |

# Check replication lag
kubectl exec -n kyc-vault svc/kyc-postgres -- patronictl show-config
```

### Step 2: Check Replication Lag

```sql
SELECT
  application_name,
  pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS lag_bytes,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) AS lag_pretty,
  state,
  sync_state
FROM pg_stat_replication;
```

All replicas must have < 100 MB lag before proceeding.

### Step 3: Pause Writes (Optional)

```bash
# Set connection pool to drain
kubectl scale deployment -n kyc-vault kyc-orchestrator --replicas=0
kubectl scale deployment -n kyc-vault kyc-credential-service --replicas=0

# Wait for active queries to finish
kubectl exec -n kyc-vault svc/kyc-postgres -- psql -c "
  SELECT pid, state, query_start, query
  FROM pg_stat_activity
  WHERE state != 'idle' AND pid != pg_backend_pid();
"
```

### Step 4: Execute Failover

```bash
# Self-managed (Patroni): switch to specific candidate
kubectl exec -n kyc-vault svc/kyc-postgres -- \
  patronictl failover --master kyc-vault-pg-primary --candidate kyc-vault-pg-standby-0

# Or: Patroni automatic best candidate
kubectl exec -n kyc-vault svc/kyc-postgres -- \
  patronictl switchover --master kyc-vault-pg-primary
```

### Step 5: Verify Failover Success

```bash
# Check new leader
kubectl exec -n kyc-vault svc/kyc-postgres -- patronictl list

# New primary should show Role=Leader for the target standby
# Old primary should now show Role=Replica

# Test write capability on new primary
kubectl exec -n kyc-vault svc/kyc-postgres -- psql -c "
  CREATE TABLE IF NOT EXISTS failover_test (id serial primary key, ts timestamptz default now());
  INSERT INTO failover_test DEFAULT VALUES;
  SELECT * FROM failover_test;
  DROP TABLE failover_test;
"
```

### Step 6: Restore Services

```bash
# Scale services back up
kubectl scale deployment -n kyc-vault kyc-orchestrator --replicas=4
kubectl scale deployment -n kyc-vault kyc-credential-service --replicas=3

# Verify application connectivity
curl -s https://api.kyc-vault.com/v1/health | jq .status
```

## Scenario B: Unplanned Failover (Primary Down)

### Detection Indicators
- `KYCPostgresPrimaryDown` alert firing
- `pg_isready` returns failure on primary
- Patroni reports primary as `unavailable`
- Application error rate spikes with `connection refused` or `cannot connect to server`

### Step 1: Confirm Primary Failure

```bash
# Check Patroni status
kubectl exec -n kyc-vault svc/kyc-postgres -- patronictl list 2>/dev/null || echo "Cluster may be degraded"

# Check pod state
kubectl get pod -n kyc-vault -l app.kubernetes.io/component=postgresql

# Check AWS RDS (if managed)
aws rds describe-db-instances --db-instance-identifier kyc-vault-db \
  --query 'DBInstances[0].[DBInstanceStatus, DBInstanceClass, Endpoint.Address]'
```

### Step 2: Automatic Failover Check

Patroni (or RDS Multi-AZ) should auto-failover within 30 seconds. Wait up to 60 seconds:

```bash
# Wait and re-check
sleep 30
kubectl exec -n kyc-vault svc/kyc-postgres -- patronictl list
```

If auto-failover succeeded, the cluster will have a new primary. Proceed to Step 5 (Verify).

### Step 3: Manual Failover (if auto-failover failed)

```bash
# Force failover to specific standby
kubectl exec -n kyc-vault svc/kyc-postgres -- \
  patronictl failover --master kyc-vault-pg-primary --candidate kyc-vault-pg-standby-0 --force

# If Patroni is unreachable, promote standby manually:
kubectl exec -n kyc-vault pod/kyc-postgres-standby-0 -- \
  pg_ctl promote -D /var/lib/postgresql/data
```

### Step 4: Handle Split-Brain

If both nodes claim primary:

```bash
# Check which node has the latest LSN
kubectl exec -n kyc-vault pod/kyc-postgres-0 -- psql -c "SELECT pg_last_wal_replay_lsn();"
kubectl exec -n kyc-vault pod/kyc-postgres-1 -- psql -c "SELECT pg_last_wal_replay_lsn();"

# Demote the node with older LSN
kubectl exec -n kyc-vault pod/kyc-postgres-old-primary -- \
  patronictl remove kyc-vault-pg-primary  # Force removal from cluster

# Then rejoin as replica:
kubectl exec -n kyc-vault pod/kyc-postgres-old-primary -- \
  patronictl reinit kyc-vault-pg-primary
```

### Step 5: Verify Data Integrity

```sql
SELECT schemaname, tablename, n_live_tup, n_dead_tup, last_vacuum, last_analyze
FROM pg_stat_user_tables
ORDER BY schemaname, tablename;

-- Check last successful WAL replay
SELECT pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn(), pg_last_xact_replay_timestamp();

-- Verify critical table row counts
SELECT COUNT(*) FROM credentials;
SELECT COUNT(*) FROM verifications;
SELECT COUNT(*) FROM audit_log;
```

### Step 6: Rejoin Old Primary

```bash
# Once old primary is back online, rejoin it as a replica:
kubectl exec -n kyc-vault pod/kyc-postgres-old-primary -- \
  patronictl reinit kyc-vault-pg-primary

# Verify replication catches up
kubectl exec -n kyc-vault svc/kyc-postgres -- patronictl list
```

## Scenario C: RDS Failover (AWS Managed)

### Step 1: Trigger Failover

```bash
# Forced failover (reboots primary and promotes replica)
aws rds reboot-db-instance \
  --db-instance-identifier kyc-vault-db \
  --force-failover

# Monitor failover progress
aws rds describe-db-instances \
  --db-instance-identifier kyc-vault-db \
  --query 'DBInstances[0].[DBInstanceStatus, SecondaryAvailabilityZone, MultiAZ]'
```

### Step 2: Update Connection Endpoint

RDS DNS automatically updates to point to the new primary within 30-120 seconds. Verify:

```bash
# Resolve RDS endpoint
nslookup kyc-vault-db.xxxxxx.us-east-1.rds.amazonaws.com

# Test connection
psql -h kyc-vault-db.xxxxxx.us-east-1.rds.amazonaws.com -U kycadmin -d kycdb -c "SELECT pg_is_in_recovery();"
# Should return: f  (false = not in recovery = primary)
```

### Step 3: Verify Application Recovery

```bash
# Check application health
curl -s https://api.kyc-vault.com/v1/health

# Verify write capability via API
curl -s -X POST https://api.kyc-vault.com/v1/health/db-check \
  -H "Authorization: Bearer $HEALTH_TOKEN"
```

## Post-Failover Tasks

### Update Monitoring and Alerting

```bash
# Reset alertmanager silence (if any)
curl -X DELETE http://alertmanager.internal:9093/api/v2/silence/{silence-id}

# Verify replication status on all monitoring dashboards
```

### Performance Check

```sql
-- Analyze tables on new primary
ANALYZE;

-- Check query performance
SELECT queryid, calls, total_exec_time / calls AS avg_ms,
       rows, shared_blks_hit, shared_blks_read
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

### Runbook Validation

- [ ] Verify backup job still runs on new primary
- [ ] Confirm WAL archiving to S3 is active
- [ ] Check pgBouncer connection pools are re-established
- [ ] Verify read replicas are replicating from new primary

## Failover Checklist

| Step | Action | Status |
|------|--------|--------|
| 1 | Identify incident severity and declare | [ ] |
| 2 | Check cluster state (Patroni list) | [ ] |
| 3 | Verify replica lag is acceptable | [ ] |
| 4 | Execute failover (auto/manual) | [ ] |
| 5 | Verify new primary accepts writes | [ ] |
| 6 | Rejoin old primary as replica | [ ] |
| 7 | Verify application connectivity | [ ] |
| 8 | Update DNS/connection strings if needed | [ ] |
| 9 | Monitor replication for catch-up | [ ] |
| 10 | Run data integrity checks | [ ] |
| 11 | Document failover in post-mortem | [ ] |

## Key Parameters

| Parameter | Value | Location |
|-----------|-------|----------|
| Connection pool | 100 connections | pgBouncer config |
| Statement timeout | 30s | PostgreSQL config |
| Replication timeout | 60s | Patroni config |
| WAL retention | 256 MB min | `wal_keep_size` |
| Backup retention | 30 days | S3 lifecycle |
| RDS backup window | 03:00-04:00 UTC | AWS RDS config |
