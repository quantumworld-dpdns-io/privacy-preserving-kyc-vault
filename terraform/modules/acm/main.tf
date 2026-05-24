# ACM (AWS Certificate Manager) Module
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

variable "domain_name" {
  description = "Domain name for the certificate"
  type        = string
}

variable "subject_alternative_names" {
  description = "List of subject alternative names"
  type        = list(string)
  default     = []
}

variable "validation_method" {
  description = "Validation method (DNS or EMAIL)"
  type        = string
  default     = "DNS"
}

variable "tags" {
  description = "Tags to apply to the certificate"
  type        = map(string)
  default     = {}
}

# ACM Certificate
resource "aws_acm_certificate" "this" {
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = var.validation_method

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

# DNS validation record (if using DNS validation)
resource "aws_route53_record" "cert_validation" {
  count = var.validation_method == "DNS" ? length(aws_acm_certificate.this.domain_validation_options) : 0

  zone_id = data.aws_route53_zone.selected.zone_id
  name    = element(aws_acm_certificate.this.domain_validation_options, count.index).resource_record_name
  type    = element(aws_acm_certificate.this.domain_validation_options, count.index).resource_record_type
  ttl     = 60
  records = [element(aws_acm_certificate.this.domain_validation_options, count.index).resource_record_value]
}

# Data source for Route53 zone (assuming we're using the domain's hosted zone)
data "aws_route53_zone" "selected" {
  count = var.validation_method == "DNS" ? 1 : 0
  name         = "${var.domain_name}."
  private_zone = false
}

# Certificate validation resource
resource "aws_acm_certificate_validation" "this" {
  count                   = var.validation_method == "DNS" ? length(aws_acm_certificate.this.domain_validation_options) : 0
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [element(aws_route53_record.cert_validation[*].fqdn, count.index)]
}

output "certificate_arn" {
  description = "ARN of the certificate"
  value       = aws_acm_certificate.this.arn
}

output "certificate_domain_name" {
  description = "Domain name of the certificate"
  value       = aws_acm_certificate.this.domain_name
}

output "certificate_validation_emails" {
  description = "List of email addresses that received validation emails (if validation_method is EMAIL)"
  value       = var.validation_method == "EMAIL" ? aws_acm_certificate.this.validation_email_options : []
}
