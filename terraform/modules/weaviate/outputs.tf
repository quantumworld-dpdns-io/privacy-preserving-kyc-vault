output "namespace" {
  description = "Kubernetes namespace for Weaviate"
  value       = kubernetes_namespace.weaviate.metadata[0].name
}

output "helm_release_name" {
  description = "Helm release name"
  value       = helm_release.weaviate.name
}

output "service_name" {
  description = "Weaviate Kubernetes service name"
  value       = "${var.name_prefix}-weaviate"
}

output "service_port" {
  description = "Weaviate service port"
  value       = 8080
}

output "pvc_name" {
  description = "Persistent volume claim name"
  value       = kubernetes_persistent_volume_claim.weaviate.metadata[0].name
}
