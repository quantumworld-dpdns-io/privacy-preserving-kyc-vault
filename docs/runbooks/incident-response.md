# Incident Response Runbook

## Overview

This runbook defines the end-to-end incident response lifecycle for the KYC Vault platform. Every incident follows the phases: Detection → Triage → Containment → Eradication → Recovery → Post-Mortem.

## Severity Classification

| Severity | Definition | Response SLA | Examples |
|----------|-----------|-------------|----------|
| SEV-1 | Complete service outage, data breach, or data loss | 15 min notify, 4 hr resolve | Primary DB offline, unauthorized credential access |
| SEV-2 | Partial outage or severe degradation | 30 min notify, 8 hr resolve | p99 latency >5s, single AZ down, ZKP proving failure |
| SEV-3 | Minor disruption, no user-visible impact | 2 hr notify, 24 hr resolve | Single pod crash-loop, non-critical API bug |
| SEV-4 | Proactive maintenance or cosmetic issue | Next business day | Dashboard label error, low-severity lint warning |

## Response Roles

| Role | Responsibility |
|------|---------------|
| Incident Commander (IC) | Leads response, delegates tasks, makes priority calls |
| Scribe | Records timeline, actions, decisions, communications |
| Technical Lead | Diagnoses root cause, develops and tests fix |
| Ops Lead | Executes containment and recovery runbook steps |
| Security Lead | Forensics, evidence preservation, legal notification |
| Communications Lead | Internal updates, customer status page, regulatory notices |

---

## Phase 1: Detection

### Alert Sources
- **Prometheus Alertmanager**: Firing alerts for service health, error budgets, latency SLOs
- **Loki Log Alerts**: Pattern-matched log surges (panic, fatal, auth failure, SQL injection)
- **Grafana Anomaly Detection**: Deviation from baseline metrics
- **PagerDuty**: Automated escalation from alertmanager
- **External Monitoring**: Synthetic checks (Checkly/Pingdom) for API endpoints
- **Customer Reports**: Support tickets indicating service issues
- **Security Scanners**: Trivy, Semgrep, Tetragon eBPF policy violations

### Triage Checklist

```bash
# Overall cluster health
kubectl get nodes -o wide
kubectl get pods --all-namespaces --field-selector status.phase!=Running

# Recent events
kubectl get events --all-namespaces --sort-by='.lastTimestamp' | tail -30

# Alertmanager state
curl -s http://localhost:9093/api/v1/alerts | jq '.data[] | select(.status=="firing")'

# Recent deployments (correlate with incident onset)
kubectl rollout history -n kyc-vault deployment/kyc-api-gateway

# Check if PQC/quantum/zkp component has recent change
kubectl get configmap -n kyc-vault -l app.kubernetes.io/component=crypto -o yaml
```

### Initial Assessment
1. Is the incident security-related (breach, unauthorized access) or operational (outage, degradation)?
2. What is the blast radius? Single service, AZ, or entire platform?
3. Is there active user data exposure or loss of confidentiality?
4. Note the detection timestamp for post-mortem timeline.

---

## Phase 2: Triage

### Gather Information

```bash
# Service-specific diagnostics
kubectl logs -n kyc-vault -l app.kubernetes.io/name=kyc-api-gateway --tail=200 --since=30m
kubectl logs -n kyc-vault -l app.kubernetes.io/name=kyc-orchestrator --tail=200 --since=30m

# Check database connectivity
kubectl exec -n kyc-vault deploy/kyc-orchestrator -- pg_isready -d $DATABASE_URL

# Check Redis
kubectl exec -n kyc-vault deploy/kyc-orchestrator -- redis-cli -u $REDIS_URL ping

# Check Kafka lag
kubectl exec -n kyc-vault deploy/kyc-orchestrator -- \
  kafka-consumer-groups --bootstrap-server $KAFKA_BROKERS \
  --group kyc-orchestrator --describe
```

### Classify Incident
- **Operational**: Infrastructure failure, resource exhaustion, deployment regression
- **Security**: Unauthorized access, data exfiltration, credential theft, crypto weaknesses
- **Data**: Data corruption, loss, inconsistency across replicas
- **PQC/ZKP**: Proof verification failures, circuit parameter mismatch, hybrid mode errors

### Declare Severity
IC declares severity level and opens incident bridge. PagerDuty acknowledges. Dedicated Slack channel `#incident-{ID}` created.

---

## Phase 3: Containment

### General Containment Actions
1. Acknowledge in PagerDuty and post initial status in #incidents
2. Create #incident-{ID} Slack channel with automated Zoom bridge
3. Assemble response team per severity
4. For security incidents: isolate affected systems immediately (network quarantine)
5. Enable maintenance page if user-facing impact

### API/Gateway Containment

```bash
# Scale down to reduce blast radius
kubectl scale deployment -n kyc-vault kyc-api-gateway --replicas=2

# Enable maintenance page
kubectl patch svc -n kyc-vault kyc-api-gateway -p \
  '{"spec":{"selector":{"maintenance":"true"}}}'

# Rate-limit aggressive clients
kubectl annotate ingress -n kyc-vault kyc-api-ingress \
  nginx.org/rate-limit="5r/s"
```

### Database Containment

```bash
# Promote standby if primary is failing
patronictl -c /etc/patroni/patroni.yml failover --master kyc-vault-pg-primary --candidate kyc-vault-pg-standby

# Switch DB to read-only to prevent corruption
kubectl exec -n kyc-vault svc/kyc-postgres -- psql -c "ALTER SYSTEM SET default_transaction_read_only = on;"

# Take pg_dump of current state for forensic preservation
pg_dump -h $DB_HOST -U kycadmin -d kycdb --no-privileges --no-owner > /tmp/forensic_dump.sql
```

### Security Breach Containment

```bash
# Quarantine compromised pods
kubectl label pod -n kyc-vault -l app.kubernetes.io/instance=kyc-orchestrator \
  network-policy=quarantine --overwrite

# Revoke and rotate all service credentials
vault lease revoke -prefix database/creds/kyc-app
vault write -f /sys/leases/revoke-prefix auth/api-keys/creds/app

# Take forensic volume snapshots (EBS)
aws ec2 create-snapshot --volume-id vol-xxxx --description "forensic-$(date +%Y%m%d-%H%M%S)"

# Block egress from affected namespace
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: quarantine-egress
  namespace: kyc-vault
spec:
  podSelector: {matchLabels: {quarantine: "true"}}
  policyTypes: [Egress]
  egress: []
EOF
```

---

## Phase 4: Eradication

### Root Cause Analysis Tools

```bash
# Query Loki for error burst
logcli query '{namespace="kyc-vault"} |= "error" |~ "panic|fatal|OOM|killed"' --since=2h

# Trace specific request IDs
logcli query '{namespace="kyc-vault"} |= "550e8400-e29b-41d4-a716-446655440001"'

# Compare metrics before/after
# Open Grafana: http://grafana.kyc-vault.com/d/service-health
# Compare time range: [incident_start - 2h] vs [incident_end + 1h]
```

### Fix by Category

| Category | Root Cause | Fix Action |
|----------|-----------|------------|
| Deployment | Bad rollout or config | `kubectl rollout undo deployment -n kyc-vault kyc-api-gateway --to-revision=N` |
| Resource | OOM/CPU throttle | `kubectl set resources deployment -n kyc-vault kyc-orchestrator --limits=cpu=4,memory=8Gi` |
| Data | Corrupted record | Restore from backup: `bash scripts/backup/restore.sh --backup-file=s3://kyc-vault-backups/latest.sql.gz` |
| Crypto | Failed proof verification | Roll ZKP circuit params: `just zkp-rollback` |
| PQC | ML-KEM key mismatch | Switch to hybrid mode: `curl -X POST https://api-gateway.kyc-vault.internal/v1/config -d '{"pqc":"hybrid"}'` |

### Verify Fix

```bash
# Wait for readiness
kubectl wait --for=condition=Ready pods -n kyc-vault -l app.kubernetes.io/name=kyc-api-gateway --timeout=120s

# Run health check
curl -s https://api.kyc-vault.com/v1/health | jq
[ -z "$(curl -s https://api.kyc-vault.com/v1/health | jq -r '.status | select(. != "ok")')" ] && echo "Healthy"

# Run integration smoke tests
pnpm test:smoke

# Verify error rate returning to baseline
curl -s 'http://prometheus:9090/api/v1/query?query=rate(http_requests_total{status=~"5.."}[5m])'
```

---

## Phase 5: Recovery

### Normal Operations Restoration

```bash
# Restore full replica count
kubectl scale deployment -n kyc-vault kyc-api-gateway --replicas=6
kubectl scale deployment -n kyc-vault kyc-orchestrator --replicas=4
kubectl scale deployment -n kyc-vault kyc-zkp-engine --replicas=3

# Remove maintenance mode
kubectl patch svc -n kyc-vault kyc-api-gateway -p \
  '{"spec":{"selector":{"maintenance":null}}}'

# Re-enable DB writes
kubectl exec -n kyc-vault svc/kyc-postgres -- psql -c "ALTER SYSTEM SET default_transaction_read_only = off; SELECT pg_reload_conf();"

# Remove network quarantine
kubectl delete networkpolicy -n kyc-vault quarantine-egress --ignore-not-found

# Flush any degraded caches
kubectl exec -n kyc-vault deploy/kyc-orchestrator -- redis-cli -u $REDIS_URL FLUSHALL ASYNC
```

### Validation
1. Run full test suite: `pnpm test && cargo test && uv run pytest`
2. Confirm monitoring alerts return to normal
3. Update status page: "Resolved - all systems operational"
4. Post resolution notice in #incident-{ID} and #general
5. Close incident bridge and archive Slack channel

---

## Phase 6: Post-Mortem

### Incident Report Template

```yaml
incident_id: INC-20260524-001
report_date: 2026-05-25
severity: SEV-2
duration: 2026-05-24T14:30Z - 2026-05-24T16:45Z (2h15m)
detection_method: Prometheus Alert "HighErrorRate"
root_cause: Connection pool exhaustion due to unclosed transactions from ZKP batch proofs
resolution: Increased pool size and added transaction timeout
```

### 5 Whys Analysis
1. Why did error rate spike? — Connections exhausted.
2. Why were connections exhausted? — Transactions held open.
3. Why were transactions held open? — ZKP batch proof timeout.
4. Why did ZKP timeout not release connections? — Missing `try-finally` in proof submission handler.
5. Why was the bug not caught? — No integration test for batch proof under load.

### Action Items
- [ ] Add `try-finally` / `defer` to release database connections in ZKP proof handler
- [ ] Add integration test for batch ZKP proof under concurrent load
- [ ] Configure PostgreSQL `idle_in_transaction_session_timeout`
- [ ] Add Grafana alert for connection pool utilization >80%
- [ ] Update runbook with ZKP-specific failure modes

### Blameless Culture Statement
Incidents are opportunities to improve the system, not to assign fault. All post-mortem discussions focus on systemic weaknesses and process improvements.

---

## Escalation Contacts

| Tier | Channel | Response | Role |
|------|---------|----------|------|
| T1 | PagerDuty / Slack @oncall-backend | 15 min | Backend On-Call |
| T1 | PagerDuty / Slack @oncall-platform | 15 min | Platform On-Call |
| T2 | Slack @eng-director | 30 min | Engineering Director |
| T2 | Slack @security-lead | 30 min | Security Lead |
| T3 | Phone @vp-engineering | 60 min | VP Engineering |
| T3 | Phone @cto | 60 min | CTO (SEV-1 only) |

## Tools & Dashboards Quick Reference

- **Prometheus**: http://prometheus.internal:9090
- **Grafana**: http://grafana.kyc-vault.com
- **Loki**: http://loki.internal:3100
- **Alertmanager**: http://alertmanager.internal:9093
- **PagerDuty**: https://company.pagerduty.com
- **Kibana (audit logs)**: http://kibana.internal:5601
- **AWS Console**: https://console.aws.amazon.com
