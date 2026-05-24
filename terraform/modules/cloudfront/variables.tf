variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "enabled" {
  description = "Whether the distribution is enabled"
  type        = bool
  default     = true
}

variable "ipv6_enabled" {
  description = "Whether IPv6 is enabled"
  type        = bool
  default     = true
}

variable "price_class" {
  description = "Price class for the CloudFront distribution"
  type        = string
  default     = "PriceClass_All"
}

variable "default_root_object" {
  description = "Default root object"
  type        = string
  default     = "index.html"
}

variable "aliases" {
  description = "List of CNAME aliases"
  type        = list(string)
  default     = []
}

variable "http_version" {
  description = "HTTP version"
  type        = string
  default     = "http2and3"
}

variable "s3_bucket_id" {
  description = "S3 bucket ID for the origin"
  type        = string
}

variable "s3_bucket_arn" {
  description = "S3 bucket ARN"
  type        = string
}

variable "s3_bucket_domain_name" {
  description = "S3 bucket domain name"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate"
  type        = string
  default     = null
}

variable "web_acl_arn" {
  description = "ARN of the WAF web ACL"
  type        = string
  default     = null
}

variable "minimum_protocol_version" {
  description = "Minimum SSL/TLS protocol version"
  type        = string
  default     = "TLSv1.2_2021"
}

variable "default_ttl" {
  description = "Default TTL in seconds"
  type        = number
  default     = 3600
}

variable "max_ttl" {
  description = "Maximum TTL in seconds"
  type        = number
  default     = 86400
}

variable "retain_on_delete" {
  description = "Retain the distribution on deletion"
  type        = bool
  default     = false
}

variable "attach_s3_bucket_policy" {
  description = "Whether to attach an S3 bucket policy allowing CloudFront OAI"
  type        = bool
  default     = true
}

variable "create_cache_policy" {
  description = "Whether to create a custom cache policy"
  type        = bool
  default     = false
}

variable "custom_origins" {
  description = "List of custom origins"
  type = list(object({
    domain_name        = string
    origin_id          = string
    origin_protocol_policy = optional(string, "https-only")
    origin_ssl_protocols   = optional(list(string), ["TLSv1.2"])
    http_port              = optional(number, 80)
    https_port             = optional(number, 443)
    custom_headers         = optional(list(object({
      name  = string
      value = string
    })), [])
  }))
  default = []
}

variable "ordered_cache_behaviors" {
  description = "List of ordered cache behaviors"
  type = list(object({
    path_pattern           = string
    target_origin_id       = string
    viewer_protocol_policy = optional(string, "redirect-to-https")
    allowed_methods        = optional(list(string), ["GET", "HEAD", "OPTIONS"])
    cached_methods         = optional(list(string), ["GET", "HEAD", "OPTIONS"])
    compress               = optional(bool, true)
    forward_query_string   = optional(bool, false)
    cookies_forward        = optional(string, "none")
    min_ttl                = optional(number, 0)
    default_ttl            = optional(number, 3600)
    max_ttl                = optional(number, 86400)
  }))
  default = []
}

variable "custom_error_responses" {
  description = "List of custom error responses"
  type = list(object({
    error_code            = number
    response_code         = optional(number)
    response_page_path    = optional(string)
    error_caching_min_ttl = optional(number)
  }))
  default = []
}

variable "logging_bucket_domain" {
  description = "S3 bucket domain for logging"
  type        = string
  default     = ""
}

variable "logging_prefix" {
  description = "Prefix for log files"
  type        = string
  default     = "cloudfront/"
}

variable "geo_restrictions" {
  description = "Geo-restriction configuration"
  type = object({
    type      = string
    locations = list(string)
  })
  default = {
    type      = "none"
    locations = []
  }
}
