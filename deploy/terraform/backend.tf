# Terraform Backend Configuration
# ============================================================
# Stores Terraform state in S3 with DynamoDB locking

terraform {
  backend "s3" {
    # S3 bucket for storing Terraform state
    bucket = "kyc-vault-terraform-state"

    # State file path
    key = "kyc-vault/terraform.tfstate"

    # AWS region
    region = "us-east-1"

    # S3 bucket-level settings
    encrypt        = true
    kms_key_id     = "alias/terraform-state-key"

    # Object locking
    dynamodb_table = "kyc-vault-terraform-locks"

    # Access logging (via separate Terraform run)
    # acl           = "private"

    # S3 versioning (enabled on bucket)
    # versioning    = true

    # Profile (if using named profiles)
    # profile       = "kyc-vault-platform"
  }
}

# ============================================================
# DynamoDB Table for State Locking
# (should be created separately or via a bootstrap script)
# ============================================================
resource "aws_dynamodb_table" "terraform_locks" {
  count = var.environment == "production" ? 0 : 1

  name         = "kyc-vault-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = {
    Name        = "kyc-vault-terraform-locks"
    Environment = var.environment
    Project     = "kyc-vault"
    ManagedBy   = "terraform"
  }
}

# ============================================================
# S3 Bucket for State Storage
# (should be created separately or via a bootstrap script)
# ============================================================
resource "aws_s3_bucket" "terraform_state" {
  bucket = "kyc-vault-terraform-state"

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name        = "kyc-vault-terraform-state"
    Environment = "global"
    Project     = "kyc-vault"
    ManagedBy   = "terraform"
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
      kms_master_key_id = aws_kms_key.terraform_state.arn
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Deny"
        Principal = "*"
        Action = "s3:*"
        Resource = [
          aws_s3_bucket.terraform_state.arn,
          "${aws_s3_bucket.terraform_state.arn}/*",
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

resource "aws_kms_key" "terraform_state" {
  description             = "KMS key for Terraform state encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name        = "kyc-vault-terraform-state-key"
    Environment = "global"
    Project     = "kyc-vault"
    ManagedBy   = "terraform"
  }
}

resource "aws_kms_alias" "terraform_state" {
  name          = "alias/terraform-state-key"
  target_key_id = aws_kms_key.terraform_state.key_id
}

# ============================================================
# Backend Config Template
# ============================================================
# For environment-specific backend config:
#
# ```
# # backend.hcl
# bucket         = "kyc-vault-terraform-state"
# key            = "kyc-vault/production/terraform.tfstate"
# region         = "us-east-1"
# encrypt        = true
# kms_key_id     = "alias/terraform-state-key"
# dynamodb_table = "kyc-vault-terraform-locks"
# ```
