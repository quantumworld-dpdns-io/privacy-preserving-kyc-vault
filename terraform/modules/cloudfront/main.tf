# CloudFront Module
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
    acm = {
      source  = "hashicorp/acm"
      version = "~> 2.0"
    }
    route53 = {
      source  = "hashicorp/route53"
      version = "~> 3.0"
    }
  }
}

variable "domain_name" {
  description = "Domain name for the CloudFront distribution"
  type        = string
}

variable "subdomain" {
  description = "Subdomain for the CloudFront distribution (e.g., www)"
  type        = string
  default     = ""
}

variable "origin_domain_name" {
  description = "Domain name of the origin (S3 bucket, ALB, etc.)"
  type        = string
}

variable "origin_path" {
  description = "Path in the origin to serve content from"
  type        = string
  default     = ""
}

variable "viewer_certificate_arn" {
  description = "ARN of the ACM certificate for viewer HTTPS"
  type        = string
}

variable "default_root_object" {
  description = "Default root object to serve"
  type        = string
  default     = "index.html"
}

variable "price_class" {
  description = "Price class for CloudFront distribution"
  type        = string
  default     = "PriceClass_100"
}

variable "enabled" {
  description = "Whether the distribution is enabled"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags to apply to the distribution"
  type        = map(string)
  default     = {}
}

variable "waf_web_acl_arn" {
  description = "ARN of the WAF Web ACL to associate with the distribution"
  type        = string
  default     = ""
}

# ACM Certificate (if we need to create one, otherwise use provided ARN)
resource "aws_acm_certificate" "default" {
  count = var.viewer_certificate_arn == "" ? 1 : 0
  domain_name       = var.subdomain != "" ? "${var.subdomain}.${var.domain_name}" : var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# DNS validation for ACM certificate
resource "aws_route53_record" "cert_validation" {
  count = var.viewer_certificate_arn == "" ? length(aws_acm_certificate.default[*].domain_validation_options) : 0

  zone_id = data.aws_route53_zone.selected.zone_id
  name    = element(aws_acm_certificate.default[*].domain_validation_options, count.index).resource_record_name
  type    = element(aws_acm_certificate.default[*].domain_validation_options, count.index).resource_record_type
  ttl     = 60
  records = [element(aws_acm_certificate.default[*].domain_validation_options, count.index).resource_record_value]
}

# Certificate validation
resource "aws_acm_certificate_validation" "default" {
  count = var.viewer_certificate_arn == "" ? length(aws_acm_certificate.default[*].domain_validation_options) : 0
  certificate_arn         = element(aws_acm_certificate.default[*].arn, count.index)
  validation_record_fqdns = [element(aws_route53_record.cert_validation[*].fqdn, count.index)]
}

# Data source for Route53 zone
data "aws_route53_zone" "selected" {
  count = var.viewer_certificate_arn == "" ? 1 : 0
  name         = "${var.domain_name}."
  private_zone = false
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "this" {
  origin {
    domain_name = var.origin_domain_name
    origin_id   = "origin-${var.origin_domain_name}"

    origin_path = var.origin_path

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1", "TLSv1.1", "TLSv1.2"]
    }
  }

  enabled             = var.enabled
  is_ipv6_enabled     = true
  default_root_object = var.default_root_object
  price_class         = var.price_class

  aliases = [
    var.subdomain != "" ? "${var.subdomain}.${var.domain_name}" : var.domain_name
  ]

  viewer_certificate {
    acm_certificate_arn = var.viewer_certificate_arn != "" ? var.viewer_certificate_arn : element(aws_acm_certificate_validation.default[*].certificate_arn, 0)
    ssl_support_method  = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
  }

  custom_error_response {
    error_code            = 403
    response_code         = 403
    response_page_path    = "/403.html"
  }

  default_cache_behavior {
    target_origin_id = "origin-${var.origin_domain_name}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    compress         = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl                = 0
    default_ttl            = 86400
    max_ttl                = 31536000
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # WAF association (if provided)
  dynamic "web_acl_id" {
    for_each = var.waf_web_acl_arn != "" ? [var.waf_web_acl_arn] : []
    content {
      web_acl_id = web_acl_id.value
    }
  }

  tags = var.tags

  depends_on = [
    var.viewer_certificate_arn == "" ? aws_acm_certificate_validation.default : null,
    var.viewer_certificate_arn == "" ? aws_route53_record.cert_validation : null
  ]
}

output "distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.this.id
}

output "distribution_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.this.domain_name
}

output "distribution_arn" {
  description = "ARN of the CloudFront distribution"
  value       = aws_cloudfront_distribution.this.arn
}
