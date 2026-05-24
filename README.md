# Privacy Preserving KYC Vault - Infrastructure as Code

This repository contains Infrastructure as Code (IaC) definitions for a privacy-preserving KYC (Know Your Customer) vault system using multiple IaC tools and platforms.

## Contents

### Terraform Modules
Complete AWS infrastructure modules for:
- Networking (VPC, subnets, NAT, IGW, route tables)
- EKS (Elastic Kubernetes Service)
- RDS (PostgreSQL with encryption, backups)
- ElastiCache (Redis cluster)
- MSK (Managed Streaming for Kafka)
- S3 (encrypted buckets with versioning)
- ACM (SSL/TLS certificates)
- ECR (container repositories)
- IAM (roles and policies)
- WAF (web application firewall)
- CloudFront (CDN distribution)
- KMS (encryption key management)
- Secrets Manager (secret storage with rotation)
- SQS (message queuing)
- SNS (notification service)
- Weaviate (vector database on EKS)
- Neptune (graph database)

### Pulumi Equivalents
TypeScript-based Pulumi implementations of core infrastructure components.

### Kubernetes Enhancements
- Helm charts for application deployment
- Kubernetes operators for custom resources
- ArgoCD and Flux configurations for GitOps
- Crossplane compositions for infrastructure management

### Docker Swarm
Production-ready Docker Swarm stack definition.

## Usage

### Terraform
```bash
# Initialize and apply dev environment
cd terraform/envs/dev
terraform init
terraform apply
```

### Pulumi
```bash
# Initialize and deploy
cd pulumi
pulumi up --stack dev
```

### Kubernetes
```bash
# Install Helm chart
helm install privacy-preserving-kyc-vault ./kubernetes/helm-charts/privacy-preserving-kyc-vault
```

### Docker Swarm
```bash
# Deploy stack
docker stack deploy -c docker-swarm/docker-stack.yml kycvault
```

## Environment Configurations
- Development (`dev`): Minimal resources for testing
- Staging (`staging`): Near-production for validation
- Production (`prod`): Full-scale, highly available deployment

## Security Features
- Encryption at rest and in transit
- IAM least-privilege access controls
- Network segmentation with VPCs and security groups
- Secrets management with rotation
- WAF protection for web applications
- Regular backups and snapshot policies
