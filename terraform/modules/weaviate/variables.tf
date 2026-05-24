variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "namespace" {
  description = "Kubernetes namespace for Weaviate"
  type        = string
  default     = "weaviate"
}

variable "helm_chart_version" {
  description = "Weaviate Helm chart version"
  type        = string
  default     = "17.1.0"
}

variable "weaviate_version" {
  description = "Weaviate container image tag"
  type        = string
  default     = "1.25.4"
}

variable "replica_count" {
  description = "Number of Weaviate replicas"
  type        = number
  default     = 1
}

variable "storage_size" {
  description = "Persistent volume storage size"
  type        = string
  default     = "50Gi"
}

variable "storage_class_name" {
  description = "Storage class name for the PVC"
  type        = string
  default     = "gp3"
}

variable "memory_request" {
  description = "Memory request per replica"
  type        = string
  default     = "2Gi"
}

variable "cpu_request" {
  description = "CPU request per replica"
  type        = string
  default     = "500m"
}

variable "memory_limit" {
  description = "Memory limit per replica"
  type        = string
  default     = "4Gi"
}

variable "cpu_limit" {
  description = "CPU limit per replica"
  type        = string
  default     = "2"
}

variable "anonymous_access" {
  description = "Whether to enable anonymous access"
  type        = string
  default     = "false"
}

variable "vectorizer_module" {
  description = "Default vectorizer module"
  type        = string
  default     = "text2vec-openai"
}

variable "enabled_modules" {
  description = "Comma-separated list of enabled modules"
  type        = string
  default     = "text2vec-openai,text2vec-transformers,generative-openai,qna-openai"
}

variable "azure_openai_api_key" {
  description = "Azure OpenAI API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "node_selector" {
  description = "Node selector for Weaviate pods"
  type        = map(string)
  default     = {}
}

variable "tolerations" {
  description = "Tolerations for Weaviate pods"
  type = list(object({
    key      = string
    operator = string
    value    = optional(string)
    effect   = optional(string)
  }))
  default = []
}
