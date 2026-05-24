# Disaster Recovery Runbook

## Overview

This runbook defines the disaster recovery (DR) procedures for KYC Vault. It covers RTO/RPO definitions, backup verification, and service-by-service restore procedures for complete and partial region/availability-zone failures.

## DR Definitions

### Recovery Time Objective (RTO)

| Service | RTO | Rationale |
|---------|-----|-----------|
| API Gateway | 5 min | Stateless, DNS failover + scale up |
| KYC Orchestrator | 5 min | Stateless, restored via Helm |
| Credential Service | 15 min | Stateless, depends on DB |
| AI Inference | 15 min | Model weights on S3, GPU nodes |
| ZKP Engine | 30 min | Proving params from S3 |
| DID Resolver | 5 min | Stateless, cached data |
| PostgreSQL | 1 hour | WAL replay from S3 |
| Redis Cache | 15 min | Rebuild from DB |
| Kafka | 30 min | Broker reassignment |
| S3 / Iceberg | 1 hour | Cross-region replication |
| Weaviate Vector DB | 2 hours | Index rebuild from S3 backup |

### Recovery Point Objective (RPO)

| Data Store | RPO | Mechanism |
|-----------|-----|-----------|
| PostgreSQL | 5 min | Continuous WAL archiving to S3 |
| Redis | 0 (in-memory) | Write-through + AOF persistent |
| Kafka | 0 (in-flight) | Replication factor 3, min.isr=2 |
| S3 Credentials | 0 | Cross-region replication |
| Iceberg Tables | 15 min | Snapshot-based incremental |
| Weaviate | 1 hour | Periodic S3 exports |
| Audit Logs | 0 | Dual-write to S3 immutably |

### Target Architecture

```
Primary Region (us-east-1)
┌─────────────────────────────────────┐
│  ┌─────────┐  ┌─────────┐          │
│  │  EKS    │  │  RDS    │  AWS     │
│  │  Cluster │  │  Primary│  Services │
│  └────┬────┘  └────┬────┘          │
│       │            │               │
│  ┌────▼────────────▼────┐          │
│  │  S3 (Cross-region    │          │
│  │  Replication →)      │          │
│  └──────────────────────┘          │
└────────────┬────────────────────────┘
             │
             ▼
DR Region (us-west-2)
┌─────────────────────────────────────┐
│  ┌─────────┐  ┌─────────┐          │
│  │  EKS    │  │  RDS    │  AWS     │
│  │  Cluster │  │  Standby│  Services│
│  └─────────┘  └─────────┘          │
└─────────────────────────────────────┘
```

## Backup Procedures

### PostgreSQL

```bash
# Daily full backup via pg_dump
0 3 * * * /opt/kyc-vault/scripts/backup/pg_full.sh

# Continuous WAL archiving (5 min RPO)
# Archive command in postgresql.conf:
archive_command = 'aws s3 cp %p s3://kyc-vault-backups/wal/%f --storage-class STANDARD_IA'

# Verify backup integrity weekly
bash scripts/backup/verify_backup.sh --db=kycvault --backup-dir=/mnt/backups
```

### S3 Backup Script

```bash
#!/bin/bash
# scripts/backup/pg_full.sh
set -euo pipefail

BACKUP_BUCKET="s3://kyc-vault-backups"
DB_NAME="kycvault"
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_BUCKET}/database/${DB_NAME}-${DATE}.sql.gz"
LATEST_LINK="${BACKUP_BUCKET}/database/latest.sql.gz"

pg_dump -h $DB_HOST -U kycadmin -d $DB_NAME \
  --no-privileges --no-owner \
  --compress=9 \
  | aws s3 cp - $BACKUP_FILE --sse aws:kms

# Symlink latest
aws s3api copy-object \
  --copy-source ${BACKUP_FILE#s3://} \
  --bucket ${BACKUP_BUCKET#s3://} \
  --key database/latest.sql.gz \
  --sse aws:kms

# Cleanup backups older than 30 days
aws s3 ls ${BACKUP_BUCKET}/database/ | awk '{print $4}' | \
  while read file; do
    date_part=$(echo $file | grep -oP '\d{8}' || true)
    [ -n "$date_part" ] && [ $date_part -lt $(date -d '-30 days' +%Y%m%d) ] && \
      aws s3 rm "${BACKUP_BUCKET}/database/$file"
  done
```

### Redis

```bash
# Redis snapshot (RDB) — saved every 5 min via save config
save 300 100  # Save if 100 keys changed in 300s

# AOF rewrite every 64MB
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# Backup RDB to S3 hourly
0 * * * * aws s3 cp /data/redis/dump.rdb s3://kyc-vault-backups/redis/ --sse aws:kms
```

### Kafka

```bash
# Kafka backup mirrors data via cross-region MirrorMaker
# Kafka topic configuration:
kafka-topics.sh --bootstrap-server localhost:9092 \
  --topic credential.events \
  --alter \
  --config min.insync.replicas=2 \
  --config retention.ms=604800000  # 7 days

# Backup consumer offsets to S3
0 * * * * kafka-consumer-groups --bootstrap-server localhost:9092 \
  --all-groups --describe \
  > /tmp/consumer-offsets.txt \
  && aws s3 cp /tmp/consumer-offsets.txt s3://kyc-vault-backups/kafka/offsets/
```

### Weaviate Vector DB

```bash
# Export all objects
curl -X GET http://weaviate:8080/v1/objects \
  -H "Content-Type: application/json" \
  > /tmp/weaviate-export.json

# Upload to S3
aws s3 cp /tmp/weaviate-export.json s3://kyc-vault-backups/weaviate/$(date +%Y%m%d-%H%M%S).json
```

## Restore Procedures

### Service A: API Gateway (Stateless)

```bash
# Step 1: Deploy to DR region
helm upgrade --install kyc-vault charts/kyc-vault \
  --namespace kyc-vault --create-namespace \
  -f charts/kyc-vault/values.dr.yaml \
  --set global.environment=dr \
  --set global.dnsZone=dr.kyc-vault.com \
  --wait --timeout 15m

# Step 2: Update DNS failover
# Route53: Update failover record to point to DR region ALB
aws route53 change-resource-record-sets \
  --hosted-zone-id ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "api.kyc-vault.com",
        "Type": "A",
        "SetIdentifier": "dr",
        "Failover": "PRIMARY",
        "AliasTarget": {
          "HostedZoneId": "DR_ALB_ZONE_ID",
          "DNSName": "dr-alb-xxxx.elb.amazonaws.com",
          "EvaluateTargetHealth": true
        }
      }
    }]
  }'

# Step 3: Verify health
curl -s https://api.kyc-vault.com/v1/health
```

### Service B: PostgreSQL

```bash
# Step 1: Restore full backup
aws s3 cp s3://kyc-vault-backups/database/latest.sql.gz /tmp/restore.sql.gz
gunzip -c /tmp/restore.sql.gz | psql -h $DR_DB_HOST -U kycadmin -d kycdb

# Step 2: Apply WAL up to failure point
ls -t $(aws s3 ls s3://kyc-vault-backups/wal/ | head -100 | awk '{print $4}') | \
  while read wal; do
    aws s3 cp s3://kyc-vault-backups/wal/$wal /tmp/wal/
  done

# Point PostgreSQL to restored WAL directory and replay
pg_ctl -D /var/lib/postgresql/data \
  --recovery-target-timeline latest \
  --recovery-target-action promote

# Step 3: Verify data integrity
psql -h $DR_DB_HOST -U kycadmin -d kycdb -c "
  SELECT 'credentials' AS tbl, COUNT(*) FROM credentials
  UNION ALL
  SELECT 'verifications', COUNT(*) FROM verifications
  UNION ALL
  SELECT 'audit_log', COUNT(*) FROM audit_log;
"
```

### Service C: Kafka

```bash
# Step 1: Deploy Kafka in DR region
helm upgrade --install kafka charts/kafka \
  --namespace kyc-vault \
  --set replicaCount=3 \
  --set persistence.size=500Gi

# Step 2: Restore topics and data
# If using MirrorMaker: it will replay from replicated topic
# If not: recreate topics from backup
for topic in credential.events verification.results compliance.alerts; do
  kafka-topics.sh --bootstrap-server localhost:9092 \
    --create --topic $topic --partitions 6 --replication-factor 3
done

# Step 3: Restore consumer offsets from backup
aws s3 cp s3://kyc-vault-backups/kafka/offsets/$(date +%Y%m%d).txt /tmp/offsets.txt
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --group kyc-orchestrator --reset-offsets --to-datetime 2026-05-24T12:00:00Z --execute
```

### Service D: Redis Cache

```bash
# Step 1: Deploy Redis in DR
helm upgrade --install redis charts/redis \
  --namespace kyc-vault \
  --set replicaCount=3

# Step 2: Restore from latest RDB
aws s3 cp s3://kyc-vault-backups/redis/dump.rdb /tmp/redis-dump.rdb
kubectl cp /tmp/redis-dump.rdb kyc-vault/redis-master-0:/data/dump.rdb

# Step 3: Restart Redis to load the snapshot
kubectl delete pod -n kyc-vault redis-master-0

# Step 4: Cache will warm up via application usage
# (Optional: pre-warm critical keys)
```

### Service E: Weaviate Vector DB

```bash
# Step 1: Deploy Weaviate in DR
helm upgrade --install weaviate charts/weaviate \
  --namespace kyc-vault \
  --set replicaCount=3

# Step 2: Restore data
aws s3 cp s3://kyc-vault-backups/weaviate/latest.json /tmp/weaviate-restore.json
curl -X POST http://weaviate:8080/v1/batch/objects \
  -H "Content-Type: application/json" \
  -d @/tmp/weaviate-restore.json

# Step 3: Verify vector search works
curl -s http://weaviate:8080/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ Get { Credential(limit: 1) { id subject } } }"}'
```

### Service F: ZKP Engine

```bash
# Step 1: Restore proving parameters
aws s3 sync s3://kyc-vault-zkp-params/ /tmp/zkp-params/
kubectl create configmap -n kyc-vault zkp-params \
  --from-file=/tmp/zkp-params/ \
  --dry-run=client -o yaml | kubectl apply -f -

# Step 2: Deploy ZKP engine
helm upgrade --install zkp-engine charts/zkp-engine \
  --namespace kyc-vault \
  --set params.mountPath=/params \
  --set params.fromConfigMap=zkp-params

# Step 3: Verify proof generation
curl -s -X POST https://api.kyc-vault.com/v1/zkp/test-proof | jq '.valid'
# Should return: true
```

## DR Activation Checklist

### Initial Response

- [ ] Declare DR event and severity
- [ ] Notify on-call engineers via PagerDuty
- [ ] Open incident channel #dr-activation-{ID}
- [ ] Assess scope: region failure, AZ failure, or service-specific
- [ ] Document decision: failover or wait for recovery

### Pre-Failover

- [ ] Verify primary region is truly unreachable
- [ ] Export latest backups (or confirm cross-region replication is up-to-date)
- [ ] Check DR region capacity (request EC2/EKS capacity increases if needed)
- [ ] Verify DR region Kubernetes cluster is healthy

### Failover Execution

| Order | Service | Action | Verified |
|-------|---------|--------|----------|
| 1 | DNS | Update Route53 failover to DR | [ ] |
| 2 | API Gateway | Deploy Helm chart to DR | [ ] |
| 3 | PostgreSQL | Restore from backup + WAL replay | [ ] |
| 4 | Redis | Restore from RDB snapshot | [ ] |
| 5 | Kafka | Deploy brokers, restore topics | [ ] |
| 6 | Credential Service | Deploy, connect to restored DB | [ ] |
| 7 | ZKP Engine | Restore proving params | [ ] |
| 8 | Weaviate | Restore vector index | [ ] |
| 9 | AI Inference | Download model weights | [ ] |
| 10 | Monitoring | Deploy Prometheus/Grafana stack | [ ] |

### Post-Failover

- [ ] Run health check on all services
- [ ] Verify end-to-end KYC workflow
- [ ] Run data integrity checks across all stores
- [ ] Monitor error rates and latency for stabilization window (30 min)
- [ ] Update status page
- [ ] Notify customers of DR event (if SLA-required)
- [ ] Begin planning for failback

## Failback Procedure

```bash
# Step 1: Verify primary region is operational
curl -s https://primary.kyc-vault.com/v1/health

# Step 2: Sync data from DR back to primary
# PostgreSQL: set up reverse replication
pg_dump -h $DR_DB_HOST -U kycadmin -d kycdb | psql -h $PRIMARY_DB_HOST -U kycadmin -d kycdb

# Step 3: Update DNS back to primary
aws route53 change-resource-record-sets \
  --hosted-zone-id ZONE_ID \
  --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"api.kyc-vault.com","Type":"A","SetIdentifier":"primary","Failover":"PRIMARY","AliasTarget":{"HostedZoneId":"PRIMARY_ALB_ZONE_ID","DNSName":"primary-alb-xxxx.elb.amazonaws.com","EvaluateTargetHealth":true}}}]}'

# Step 4: Verify traffic flowing to primary
curl -s https://api.kyc-vault.com/v1/health | jq '.region'
# Expected: us-east-1

# Step 5: Decommission DR resources (optional, keep warm for next event)
```

## DR Testing Schedule

| Test Type | Frequency | Description |
|-----------|-----------|-------------|
| Tabletop | Monthly | Walk through DR scenario, no actual failover |
| Component | Quarterly | Test restore of individual service |
| Full DR | Bi-annually | Complete failover to DR region |
| Backup Recovery | Weekly | Automated backup restoration test to isolated environment |
| Chaos Engineering | Monthly | Inject failures, verify auto-recovery |

## Contacts and Escalation

| Role | Primary | Secondary |
|------|---------|-----------|
| DR Coordinator | Platform Lead | Engineering Manager |
| Database Recovery | DBA Lead | Platform On-Call |
| Infrastructure | CloudOps Lead | DevOps Engineer |
| Security Lead | CISO | Security Engineer |
| Customer Comms | VP of Engineering | CTO |
| Exec Sponsor | CTO | CEO |
