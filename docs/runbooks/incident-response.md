# Incident Response Runbook

## Overview

This runbook defines the incident response lifecycle for the KYC platform. It covers detection, containment, eradication, recovery, and post-mortem phases for security and operational incidents.

## Severity Classification

| Severity | Definition | Response Time | Examples |
|----------|-----------|---------------|----------|
| SEV-1 | Complete service outage or data breach | 15 min | Loss of primary DB, unauthorized data access |
| SEV-2 | Partial outage or degraded performance | 30 min | p99 > 5s, one AZ down |
| SEV-3 | Minor disruption, no user impact | 4 hr | Single pod crash-loop, non-critical bug |
| SEV-4 | Proactive maintenance or cosmetic issue | Next sprint | Dashboard label error, minor UI bug |

## Communication Channels

- **Slack**: #incidents (main), #incident-{ID} (dedicated channel)
- **PagerDuty**: On-call rotation, routes by team
- **Zoom**: Bridge created for SEV-1/2 incidents
- **Status Page**: Update via opsgenie when user-facing impact
- **Email**: Security incidents to security@company.com

## Roles

| Role | Responsibility |
|------|---------------|
| Incident Commander (IC) | Coordinates response, makes priority calls |
| Scribe | Documents timeline, actions, decisions |
| Technical Lead | Diagnoses root cause, drives fix |
| Communications Lead | Internal/external status updates |
| Security Lead | Forensic analysis, legal notification (if applicable) |

## Phase 1: Detection

### Sources
- Prometheus alerts firing (CPU, memory, error rates, latency)
- Loki log pattern alerts (panic, fatal, auth failure burst)
- Grafana dashboard anomalies
- PagerDuty escalation
- Customer reports via support ticket
- Security scan findings (Trivy, OPA Gatekeeper)

### Initial Triage
```bash
# Check overall cluster health
kubectl get nodes
kubectl get pods --all-namespaces | grep -v Running

# Check recent events
kubectl get events --all-namespaces --sort-by='.lastTimestamp' | tail -50

# Check alertmanager firing alerts
curl -s localhost:9093/api/v1/alerts | jq '.data[] | select(.status=="firing")'

# Check recent deployments (may correlate with incident start)
kubectl rollout history -n kyc deployment/api-server
```

## Phase 2: Containment

### Immediate Actions
1. Acknowledge incident in PagerDuty and post in #incidents
2. Create dedicated Slack channel #incident-{ID}
3. Assemble response team based on severity
4. If security incident, isolate affected systems immediately

### Containment Procedures

**API Server Degradation:**
```bash
# Scale down non-critical traffic
kubectl scale deployment -n kyc api-server --replicas=2

# Enable maintenance page if needed
kubectl patch svc -n kyc api-server -p '{"spec":{"selector":{"maintenance":"true"}}}'

# Throttle or block specific IP ranges if under attack
kubectl annotate ingress -n kyc api-ingress nginx.org/rate-limit="10r/s"
```

**Database Incident:**
```bash
# Failover to replica
kubectl exec -n kyc postgres-primary-0 -- patronictl failover
# Disable write connections to primary
kubectl annotate svc -n kyc postgres-primary postgres/read-only="true"
```

**Security Breach:**
```bash
# Isolate compromised pods
kubectl label pod -n kyc compromised-pod --overwrite network-policy=quarantine

# Revoke and rotate credentials
vault lease revoke -prefix database/creds/kyc-app
vault write -f /auth/token/renew-self

# Snapshot affected volumes for forensic analysis
kubectl delete pod -n kyc compromised-pod --grace-period=30
```

## Phase 3: Eradication

### Root Cause Analysis
1. **Logs**: Query Loki for error/warning patterns around incident time:
   ```
   {app="api-server"} |= "error" |= "timeout"
   {app="api-server"} |= "panic" |= "stacktrace"
   ```
2. **Metrics**: Check Grafana dashboards for anomaly window correlation
3. **Deployment History**: Check recent config/version changes
4. **Full Pod Logs**: `kubectl logs -n kyc --previous pod/restarted-pod`

### Fix Steps
| Incident Type | Fix Action | Rollback Command |
|--------------|-----------|------------------|
| Bad deployment | Rollback to previous version | `kubectl rollout undo -n kyc deployment/api-server` |
| Config error | Apply correct config | `kubectl apply -f corrected-config.yaml` |
| Resource starvation | Scale up or adjust limits | `kubectl scale deployment -n kyc api-server --replicas=10` |
| Security vulnerability | Patch and redeploy | `kubectl set image -n kyc deployment/api-server api-server=vuln-patched` |

### Verification
```bash
# Confirm pods are healthy
kubectl wait --for=condition=Ready -n kyc pod -l app=api-server --timeout=120s

# Verify error rate returning to baseline
curl -s localhost:9090/api/v1/query?query=job:http_errors:ratio5m | jq

# Run integration tests
make test-integration

# Check dependent services health
curl -s https://api.company.com/health | jq
```

## Phase 4: Recovery

### Restore Normal Operations
1. Remove any maintenance pages or rate limits
2. Restore full replica counts
3. Re-enable write connections
4. Verify monitoring metrics stabilize
5. Update status page to "Resolved"

```bash
# Restore replica count
kubectl scale deployment -n kyc api-server --replicas=10

# Re-enable writes (if disabled)
kubectl annotate svc -n kyc postgres-primary postgres/read-only-

# Remove network quarantines
kubectl label pod -n kyc all-pods network-policy-

# Confirm all end-user services functional
kubectl port-forward -n kyc svc/api-server 8080:80 &
curl -s http://localhost:8080/api/v1/health
```

## Phase 5: Post-Mortem

### Timeline Template
```
Incident ID: INC-{DATE}-{NUM}
Report Date: {YYYY-MM-DD}
Severity: SEV-{X}
Duration: {HH:MM} - {HH:MM} UTC
Detection Method: {Alert / Customer / Manual}
Root Cause: {Summary}
```

### Review Questions
- What went well?
- What went wrong?
- What were the detection and response times?
- Were runbooks followed? What was missing?
- Which monitoring gaps existed?
- What alerts should be added/modified?
- What process improvements are needed?

### Action Items
- [ ] Create/update runbooks
- [ ] Add missing alerts
- [ ] Improve monitoring dashboards
- [ ] Schedule load test
- [ ] Security audit findings follow-up
- [ ] Update incident response rotation

## Escalation Contacts

| Tier | Contact | Role |
|------|---------|------|
| T1 | @oncall-backend | Primary Backend On-Call |
| T1 | @oncall-platform | Primary Platform On-Call |
| T2 | @eng-director | Engineering Director |
| T2 | @security-lead | Security Lead |
| T3 | @vp-engineering | VP of Engineering |
| T3 | @cto | CTO (SEV-1 only) |

## Post-Incident Cleanup

```bash
# Archive incident Slack channel
# Add incident to post-mortem tracker
# Update runbook with lessons learned
# Schedule follow-up security review if needed
```
