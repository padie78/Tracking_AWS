locals {
  supported_identity_providers = concat(
    ["COGNITO"],
    var.enable_google_idp ? ["Google"] : [],
  )
}

resource "aws_cognito_user_pool" "this" {
  name = "${var.name_prefix}-user-pool"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  schema {
    name                = "tenant_id"
    attribute_data_type = "String"
    mutable             = true
    required            = false

    string_attribute_constraints {
      min_length = 1
      max_length = 64
    }
  }

  schema {
    name                = "user_role"
    attribute_data_type = "String"
    mutable             = true
    required            = false

    string_attribute_constraints {
      min_length = 1
      max_length = 32
    }
  }

  schema {
    name                = "default_account_id"
    attribute_data_type = "String"
    mutable             = true
    required            = false

    string_attribute_constraints {
      min_length = 1
      max_length = 32
    }
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  lambda_config {
    post_confirmation = aws_lambda_function.post_confirmation.arn
  }
}

resource "aws_cognito_user_pool_domain" "this" {
  domain       = var.domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name_prefix}-web-client"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  supported_identity_providers = local.supported_identity_providers

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  callback_urls = var.oauth_callback_urls
  logout_urls   = var.oauth_logout_urls

  prevent_user_existence_errors = "ENABLED"

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  read_attributes = [
    "email",
    "email_verified",
    "name",
    "picture",
    "custom:tenant_id",
    "custom:user_role",
    "custom:default_account_id",
  ]

  write_attributes = [
    "email",
    "name",
    "picture",
    "custom:tenant_id",
    "custom:user_role",
    "custom:default_account_id",
  ]
}

resource "aws_cognito_identity_provider" "google" {
  count = var.enable_google_idp ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.this.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    authorize_scopes = "openid email profile"
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
  }

  attribute_mapping = {
    email    = "email"
    username = "sub"
    name     = "name"
    picture  = "picture"
  }
}
