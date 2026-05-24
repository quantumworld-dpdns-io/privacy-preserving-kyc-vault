# Weaviate Module (Deployed on EKS via Helm)
terraform {
  required_version = ">= 1.0"
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
  }
}

variable "release_name" {
  description = "Helm release name"
  type        = string
  default     = "weaviate"
}

variable "namespace" {
  description = "Kubernetes namespace"
  type        = string
  default     = "weaviate"
}

variable "replicas" {
  description = "Number of Weaviate replicas"
  type        = number
  default     = 1
}

variable "persistence_enabled" {
  description = "Enable persistence"
  type        = bool
  default     = true
}

variable "persistence_size" {
  description = "Persistence volume size"
  type        = string
  default     = "20Gi"
}

variable "storage_class" {
  description = "Storage class for persistence"
  type        = string
  default     = "gp2"
}

variable "resources" {
  description = "Resource requests and limits"
  type        = any
  default     = {
    limits = {
      cpu    = "2"
      memory = "4Gi"
    }
    requests = {
      cpu    = "500m"
      memory = "2Gi"
    }
  }
}

variable "service_type" {
  description = "Kubernetes service type"
  type        = string
  default     = "ClusterIP"
}

variable "image" {
  description = "Weaviate image"
  type        = string
  default     = "semitechnologies/weaviate:1.20.0"
}

variable "modules" {
  description = "Enabled Weaviate modules"
  type        = list(string)
  default     = []
}

variable "backup_enabled" {
  description = "Enable backup functionality"
  type        = bool
  default     = false
}

variable "authentication_enabled" {
  description = "Enable authentication"
  type        = bool
  default     = false
}

variable "anonymous_access_enabled" {
  description = "Enable anonymous access"
  type        = bool
  default     = true
}

# Kubernetes namespace
resource "kubernetes_namespace" "this" {
  metadata {
    name = var.namespace
  }
}

# Helm release for Weaviate
resource "helm_release" "this" {
  name       = var.release_name
  namespace  = kubernetes_namespace.this.metadata[0].name
  repository = "https://helm.weaviate.io"
  chart      = "weaviate"
  version    = "0.3.0"

  set {
    name  = "replicaCount"
    value = var.replicas
  }

  set {
    name  = "persistence.enabled"
    value = var.persistence_enabled
  }

  set {
    name  = "persistence.size"
    value = var.persistence_size
  }

  set {
    name  = "persistence.storageClass"
    value = var.storage_class
  }

  set {
    name  = "service.type"
    value = var.service_type
  }

  set {
    name  = "image.tag"
    value = var.image
  }

  # Set resources
  set {
    name  = "resources.limits.cpu"
    value = var.resources.limits.cpu
  }

  set {
    name  = "resources.limits.memory"
    value = var.resources.limits.memory
  }

  set {
    name  = "resources.requests.cpu"
    value = var.resources.requests.cpu
  }

  set {
    name  = "resources.requests.memory"
    value = var.resources.requests.memory
  }

  # Set modules
  dynamic "set" {
    for_each = var.modules
    content {
      name  = "modules"
      value = set.value
    }
  }

  # Set authentication
  set {
    name  = "authentication.enabled"
    value = var.authentication_enabled
  }

  set {
    name  = "anonymousAccess.enabled"
    value = var.anonymous_access_enabled
  }

  # Backup configuration
  dynamic "set" {
    for_each = var.backup_enabled ? [1] : []
    content {
      name  = "backup.enabled"
      value = "true"
    }
  }

  depends_on = [
    kubernetes_namespace.this
  ]
}

output "namespace" {
  description = "Kubernetes namespace"
  value       = kubernetes_namespace.this.metadata[0].name
}

output "service_name" {
  description = "Weaviate service name"
  value       = "${var.release_name}-weaviate"
}

output "grpc_service_name" {
  description = "Weaviate GRPC service name"
  value       = "${var.release_name}-weaviate-grpc"
}
