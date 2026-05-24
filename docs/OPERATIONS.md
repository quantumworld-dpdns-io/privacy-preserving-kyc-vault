# Operations Runbook

## Incident Response

### PagerDuty Escalation

```
Primary: On-call Platform Engineer (15 min response)
Secondary: On-call Senior Engineer (30 min response)
Tertiary: Engineering Manager (60 min response)
```

### Incident Severity Levels

| Severity | Response | SLA | Example |
|----------|----------|-----|---------|
| SEV1 | 15 min | 4 hours | Service down, data loss |
| SEV2 | 30 min | 8 hours | Partial outage, degraded perf |
| SEV3 | 2 hours | 24 hours | Non-critical bug |
| SEV4 | 24 hours | Next sprint | Minor issue |

---

## Runbook: Service Down

### Symptoms
- `KYCServiceDown` alert firing
- `kubectl get pods` shows CrashLoopBackOff or ImagePullBackOff
- API returns 502/503

### Diagnosis

```bash
# Check all pods
kubectl get pods -n kyc-vault -o wide

# Check pod details
kubectl describe pod <pod-name> -n kyc-vault

# Check logs
kubectl logs <pod-name> -n kyc-vault --tail=200
kubectl logs <pod-name> -n kyc-vault --previous --tail=200

# Check events
kubectl get events -n kyc-vault --sort-by='.lastTimestamp'
```

### Resolution

1. **Rollback to previous version:**
   ```bash
   helm rollback kyc-vault <revision> -n kyc-vault
   ```

2. **Scale up replicas:**
   ```bash
   kubectl scale deployment <deployment> -n kyc-vault --replicas=5
   ```

3. **Restart pods:**
   ```bash
   kubectl rollout restart deployment <deployment> -n kyc-vault
   ```

4. **If database issue:**
   ```bash
   # Check RDS
   aws rds describe-db-instances --db-instance-identifier kyc-vault-db
   
   # Failover if primary is unhealthy
   aws rds reboot-db-instance --db-instance-identifier kyc-vault-db --force-failover
   ```

5. **If Redis issue:**
   ```bash
   # Check ElastiCache
   aws elasticache describe-replication-groups --replication-group-id kyc-vault-cache
   
   # Force failover
   aws elasticache test-failover --replication-group-id kyc-vault-cache --node-group-id 0001
   ```

---

## Runbook: Database Performance Degradation

### Symptoms
- `KYCDatabaseConnectionsHigh` alert
- Slow query logs in Loki
- API latency increases

### Diagnosis

```bash
# Check active connections
kubectl exec -n kyc-vault deploy/kyc-orchestrator -- \
  psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Find slow queries
kubectl exec -n kyc-vault deploy/kyc-orchestrator -- \
  psql $DATABASE_URL -c "SELECT query, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Check locks
kubectl exec -n kyc-vault deploy/kyc-orchestrator -- \
  psql $DATABASE_URL -c "SELECT * FROM pg_locks WHERE NOT granted;"
```

### Resolution

1. **Terminate idle connections:**
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE state = 'idle' AND state_change < NOW() - INTERVAL '30 minutes';
   ```

2. **Add indexes:**
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credentials_status
   ON credentials(status) WHERE status = 'pending';
   ```

3. **Scale up RDS:**
   ```bash
   aws rds modify-db-instance \
     --db-instance-identifier kyc-vault-db \
     --db-instance-class db.r7g.2xlarge \
     --apply-immediately
   ```

4. **Increase connection pool:**
   ```bash
   kubectl set env deployment/kyc-orchestrator -n kyc-vault \
     DB_POOL_SIZE=50
   ```

---

## Runbook: Kafka Consumer Lag

### Symptoms
- `KYCKafkaConsumerLag` alert
- Verification delays
- Webhook delivery failures

### Diagnosis

```bash
# Check consumer lag
kubectl exec -n kyc-vault deploy/kyc-kafka -- \
  kafka-consumer-groups --bootstrap-server localhost:9092 \
  --group kyc-orchestrator --describe

# Check topic offsets
kubectl exec -n kyc-vault deploy/kyc-kafka -- \
  kafka-run-class kafka.tools.GetOffsetShell \
  --bootstrap-server localhost:9092 --topic credential.events
```

### Resolution

1. **Increase consumers:**
   ```bash
   kubectl scale deployment kyc-orchestrator -n kyc-vault --replicas=8
   ```

2. **Restart consumer:**
   ```bash
   kubectl rollout restart deployment kyc-orchestrator -n kyc-vault
   ```

3. **Skip lagging messages (if safe):**
   ```bash
   kafka-consumer-groups --bootstrap-server localhost:9092 \
     --group kyc-orchestrator --topic credential.events:0 \
     --reset-offsets --to-latest --execute
   ```

---

## Runbook: Security Incident

### Symptoms
- `KYCSecurityUnauthorizedAccess` alert
- `KYCSecuritySQLInjectionAttempt` alert
- Suspicious IP patterns in logs

### Immediate Actions

1. **Block IP at WAF:**
   ```bash
   aws wafv2 update-ip-set --name kyc-vault-blocklist \
     --scope REGIONAL --id <ip-set-id> \
     --addresses <suspicious-ip>/32
   ```

2. **Revoke API keys:**
   ```bash
   vault lease revoke -prefix auth/api-keys/creds/<compromised-key>
   ```

3. **Isolate compromised pods:**
   ```bash
   kubectl label pod <compromised-pod> -n kyc-vault security-incident=true
   kubectl patch deployment <deployment> -n kyc-vault -p '{"spec":{"replicas":0}}'
   ```

4. **Enable full audit logging:**
   ```bash
   kubectl patch deployment kyc-api-gateway -n kyc-vault -p '{
     "spec":{"template":{"spec":{"containers":[{"name":"api-gateway","env":[
       {"name":"AUDIT_LOG_LEVEL","value":"debug"}
     ]}]}}}}
   }'
   ```

### Investigation

```bash
# Query Loki for related events
logcli query '{namespace="kyc-vault"} |= "suspicious-ip"' --limit=1000

# Check audit logs
aws s3 ls s3://kyc-vault-audit/$(date +%Y/%m/%d)/

# Review Vault audit
vault audit list
```

---

## Runbook: Data Recovery

### Database Restore

```bash
# List available backups
aws s3 ls s3://kyc-vault-backups/database/

# Restore from backup
bash scripts/backup/restore.sh \
  --backup-file=s3://kyc-vault-backups/database/kycvault-2026-05-24.sql.gz \
  --target-db=kycvault_restore

# Verify restored data
psql -d kycdb_restore -c "SELECT count(*) FROM credentials;"

# Promote to primary (if needed)
aws rds promote-read-replica \
  --db-instance-identifier kycdb-restored-instance
```

### S3 Data Recovery

```bash
# List versions
aws s3api list-object-versions \
  --bucket kyc-vault-credentials \
  --prefix credentials/

# Restore deleted object
aws s3api get-object \
  --bucket kyc-vault-credentials \
  --key credentials/deleted.json \
  --version-id <version-id> \
  restored.json
```

---

## Maintenance Procedures

### Certificate Renewal

```bash
# Check certificate expiry
kubectl get certificate -n kyc-vault -o json | jq '.items[].spec'

# Force renewal
kubectl delete secret <tls-secret> -n kyc-vault
# cert-manager will automatically reissue
```

### Database Migration

```bash
# Run migration
kubectl create job --from=cronjob/kyc-db-migrate manual-migrate -n kyc-vault

# Monitor
kubectl logs job/manual-migrate -n kyc-vault -f

# Rollback if needed
kubectl create job --from=cronjob/kyc-db-rollback manual-rollback -n kyc-vault
```

### Node Rotation

```bash
# Cordon old node
kubectl cordon <old-node>

# Drain
kubectl drain <old-node> --ignore-daemonsets --delete-emptydir-data

# Terminate in AWS
aws ec2 terminate-instances --instance-ids <instance-id>
```
