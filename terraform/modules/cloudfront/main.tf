locals {
  s3_origin_id = "${var.name_prefix}-s3-origin"
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = var.enabled
  is_ipv6_enabled     = var.ipv6_enabled
  price_class         = var.price_class
  comment             = "${var.name_prefix} CloudFront distribution"
  default_root_object = var.default_root_object
  aliases             = var.aliases
  http_version        = var.http_version

  origin {
    domain_name = var.s3_bucket_domain_name
    origin_id   = local.s3_origin_id

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.main.cloudfront_access_identity_path
    }
  }

  dynamic "origin" {
    for_each = var.custom_origins
    content {
      domain_name = origin.value.domain_name
      origin_id   = origin.value.origin_id

      custom_origin_config {
        origin_protocol_policy = lookup(origin.value, "origin_protocol_policy", "https-only")
        origin_ssl_protocols   = lookup(origin.value, "origin_ssl_protocols", ["TLSv1.2"])
        http_port              = lookup(origin.value, "http_port", 80)
        https_port             = lookup(origin.value, "https_port", 443)
      }

      dynamic "custom_header" {
        for_each = lookup(origin.value, "custom_headers", [])
        content {
          name  = custom_header.value.name
          value = custom_header.value.value
        }
      }
    }
  }

  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = var.default_ttl
    max_ttl     = var.max_ttl
  }

  dynamic "ordered_cache_behavior" {
    for_each = var.ordered_cache_behaviors
    content {
      path_pattern           = ordered_cache_behavior.value.path_pattern
      target_origin_id       = ordered_cache_behavior.value.target_origin_id
      viewer_protocol_policy = lookup(ordered_cache_behavior.value, "viewer_protocol_policy", "redirect-to-https")
      allowed_methods        = lookup(ordered_cache_behavior.value, "allowed_methods", ["GET", "HEAD", "OPTIONS"])
      cached_methods         = lookup(ordered_cache_behavior.value, "cached_methods", ["GET", "HEAD", "OPTIONS"])
      compress               = lookup(ordered_cache_behavior.value, "compress", true)

      forwarded_values {
        query_string = lookup(ordered_cache_behavior.value, "forward_query_string", false)
        cookies {
          forward = lookup(ordered_cache_behavior.value, "cookies_forward", "none")
        }
      }

      min_ttl     = lookup(ordered_cache_behavior.value, "min_ttl", 0)
      default_ttl = lookup(ordered_cache_behavior.value, "default_ttl", 3600)
      max_ttl     = lookup(ordered_cache_behavior.value, "max_ttl", 86400)
    }
  }

  dynamic "custom_error_response" {
    for_each = var.custom_error_responses
    content {
      error_code            = custom_error_response.value.error_code
      response_code         = lookup(custom_error_response.value, "response_code", null)
      response_page_path    = lookup(custom_error_response.value, "response_page_path", null)
      error_caching_min_ttl = lookup(custom_error_response.value, "error_caching_min_ttl", null)
    }
  }

  logging_config {
    bucket          = var.logging_bucket_domain
    prefix          = var.logging_prefix
    include_cookies = false
  }

  dynamic "geo_restriction" {
    for_each = length(var.geo_restrictions) > 0 ? [var.geo_restrictions] : []
    content {
      restriction_type = geo_restriction.value.type
      locations        = geo_restriction.value.locations
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = var.minimum_protocol_version
  }

  web_acl_id = var.web_acl_arn

  retain_on_delete = var.retain_on_delete

  tags = {
    Name = "${var.name_prefix}-cloudfront"
  }
}

resource "aws_cloudfront_origin_access_identity" "main" {
  comment = "${var.name_prefix} OAI"
}

resource "aws_s3_bucket_policy" "cloudfront" {
  count  = var.attach_s3_bucket_policy ? 1 : 0
  bucket = var.s3_bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipal"
        Effect = "Allow"
        Principal = {
          AWS = aws_cloudfront_origin_access_identity.main.iam_arn
        }
        Action   = "s3:GetObject"
        Resource = "${var.s3_bucket_arn}/*"
      }
    ]
  })
}

resource "aws_cloudfront_cache_policy" "main" {
  count = var.create_cache_policy ? 1 : 0

  name        = "${var.name_prefix}-custom-cache"
  comment     = "Custom cache policy for ${var.name_prefix}"
  default_ttl = var.default_ttl
  max_ttl     = var.max_ttl
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}
