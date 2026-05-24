resource "kubernetes_namespace" "weaviate" {
  metadata {
    name = var.namespace
    labels = {
      name = var.namespace
    }
  }
}

resource "kubernetes_persistent_volume_claim" "weaviate" {
  metadata {
    name      = "${var.name_prefix}-weaviate-data"
    namespace = kubernetes_namespace.weaviate.metadata[0].name
  }
  spec {
    access_modes = ["ReadWriteOnce"]
    resources {
      requests = {
        storage = var.storage_size
      }
    }
    storage_class_name = var.storage_class_name
  }
}

resource "helm_release" "weaviate" {
  name       = "${var.name_prefix}-weaviate"
  repository = "https://weaviate.github.io/weaviate-helm"
  chart      = "weaviate"
  version    = var.helm_chart_version
  namespace  = kubernetes_namespace.weaviate.metadata[0].name

  values = [
    <<-EOF
replicaCount: ${var.replica_count}

image:
  repository: semitechnologies/weaviate
  tag: ${var.weaviate_version}
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 8080
  grpcPort: 50051

persistence:
  enabled: true
  existingClaim: ${kubernetes_persistent_volume_claim.weaviate.metadata[0].name}

resources:
  requests:
    memory: "${var.memory_request}"
    cpu: "${var.cpu_request}"
  limits:
    memory: "${var.memory_limit}"
    cpu: "${var.cpu_limit}"

env:
  AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED: "${var.anonymous_access}"
  DEFAULT_VECTORIZER_MODULE: "${var.vectorizer_module}"
  ENABLE_MODULES: "${var.enabled_modules}"
  CLUSTER_HOSTNAME: "${var.name_prefix}-weaviate"
  PERSISTENCE_DATA_PATH: "/var/lib/weaviate"
  ${var.azure_openai_api_key != "" ? "AZURE_OPENAI_API_KEY: \"${var.azure_openai_api_key}\"" : ""}
  ${var.openai_api_key != "" ? "OPENAI_API_KEY: \"${var.openai_api_key}\"" : ""}

livenessProbe:
  initialDelaySeconds: 60
  periodSeconds: 10

readinessProbe:
  initialDelaySeconds: 30
  periodSeconds: 5

nodeSelector: ${jsonencode(var.node_selector)}
tolerations: ${jsonencode(var.tolerations)}
EOF
  ]

  depends_on = [
    kubernetes_persistent_volume_claim.weaviate,
  ]
}
