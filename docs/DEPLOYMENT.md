# Deployment Guide

## Prerequisites

- Kubernetes cluster (EKS recommended) v1.28+
- Helm v3.12+
- kubectl v1.28+
- AWS CLI v2+
- Terraform v1.7+ (for infrastructure)

## Infrastructure Deployment

### 1. Terraform (AWS Infrastructure)

```bash
cd deploy/terraform

# Initialize
terraform init -backend-config=backend.hcl

# Select workspace
terraform workspace new production || terraform workspace select production

# Plan
terraform plan -var-file=environments/production.tfvars -out=plan.tfplan

# Apply
terraform apply plan.tfplan
```

This provisions:
- VPC with public/private/intra subnets across 3 AZs
- EKS cluster with service and GPU node groups
- RDS PostgreSQL 16 with encryption and backups
- ElastiCache Redis 7 with encryption and replication
- MSK Kafka 3.7 with IAM authentication
- S3 buckets for credentials, Iceberg data lake, audit logs
- IAM roles for service accounts (IRSA)
- WAF with OWASP rules

### 2. Helm (KYC Vault Services)

```bash
# Add Helm repo
helm repo add kyc-vault https://charts.kyc-vault.com
helm repo update

# Install KYC Vault
helm upgrade --install kyc-vault charts/kyc-vault \
  --namespace kyc-vault --create-namespace \
  -f charts/kyc-vault/values.yaml \
  --set global.environment=production \
  --set global.domain=api.kyc-vault.com \
  --wait --timeout 15m
```

### 3. Verification

```bash
# Check pod status
kubectl get pods -n kyc-vault

# Check services
kubectl get svc -n kyc-vault

# Test API health
curl https://api.kyc-vault.com/v1/health

# Check logs
kubectl logs -n kyc-vault -l app.kubernetes.io/name=kyc-orchestrator --tail=50
```

## AI Services Deployment

### Ollama Models

```bash
# Deploy Ollama
bash deploy/ai/ollama_setup.sh

# Verify models
curl http://localhost:11434/api/tags
```

### Federated Learning

```bash
# Flower server
python deploy/flower/fl_project.py

# FLARE
python deploy/flare/flare_app.py
```

## Data Layer Setup

### Weaviate (Vector Database)

```bash
# Deploy Weaviate
kubectl apply -f deploy/weaviate/schema.json

# Initialize schema
curl -X POST http://weaviate:8080/v1/schema \
  -H "Content-Type: application/json" \
  -d @deploy/weaviate/schema.json
```

### Iceberg Tables

```sql
-- Run via Spark or Athena
USE kyc_lakehouse;
SOURCE deploy/iceberg/table_definitions.sql;
```

### Kafka Topics

```bash
# Create topics
kafka-topics.sh --bootstrap-server kafka:9092 --command-config admin.properties \
  --create --topic credential.events --partitions 6 --replication-factor 3
```

## Security Configuration

### HashiCorp Vault

```bash
# Apply policy
vault policy write kyc-vault deploy/vault/policy.hcl

# Enable transit engine
vault secrets enable transit
vault write -f transit/keys/credentials/rotate
```

### TLS Certificates

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.0/cert-manager.yaml

# Apply certificate resources
kubectl apply -f deploy/cert-manager/certificate.yaml
```

### Network Policies

```bash
# Install Cilium
helm repo add cilium https://helm.cilium.io
helm install cilium cilium/cilium --namespace kube-system

# Apply network policies
kubectl apply -f deploy/tetragon/network_policy.yaml
```

### Tetragon Process Monitoring

```bash
# Install Tetragon
helm repo add cilium https://helm.cilium.io
helm install tetragon cilium/tetragon -n kube-system

# Apply tracing policy
kubectl apply -f deploy/tetragon/tracing_policy.yaml
```

## Monitoring Setup

```bash
# Prometheus Stack
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace

# Apply alert rules
kubectl apply -f deploy/prometheus/alerts.yml

# Loki
helm install loki grafana/loki-stack --namespace monitoring

# Apply log alerts
kubectl apply -f deploy/loki/rules.yml
```

## Database Backup

```bash
# Configure backup
bash scripts/backup/backup.sh --db=kycvault --s3-bucket=s3://kyc-vault-backups

# Schedule via cron
0 3 * * * /opt/kyc-vault/scripts/backup/backup.sh --db=kycvault --s3-bucket=s3://kyc-vault-backups
```

## Rollback Procedure

```bash
# Helm rollback
helm rollback kyc-vault 1 -n kyc-vault

# Terraform rollback
terraform plan -destroy -out=destroy.tfplan
# Review then:
terraform apply destroy.tfplan

# Database restore
bash scripts/backup/restore.sh --backup-file=s3://kyc-vault-backups/kycvault-2026-05-24.sql.gz
```
