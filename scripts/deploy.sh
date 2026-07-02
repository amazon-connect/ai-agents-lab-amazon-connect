#!/usr/bin/env bash
set -euo pipefail

# AI Agents Lab for Amazon Connect — Deploy Script
# Deploys infrastructure (OIDC client registration) and runs the webapp locally.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INFRA_DIR="$PROJECT_ROOT/infra"
STACK_NAME="${STACK_NAME:-AIAgentsLabStack}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}▸${NC} $1"; }
warn() { echo -e "${YELLOW}▸${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: $(basename "$0") [command] [options]

Commands:
  all           Full deploy: install + infra + env (default)
  infra         Deploy CDK infrastructure only (OIDC client registration)
  env           Update .env with stack outputs (after infra deploy)
  outputs       Print stack outputs
  start         Install deps + start local dev server (skip infra)

Options:
  --profile     AWS profile to use (default: uses AWS_PROFILE env var)
  --stack       CloudFormation stack name (default: AIAgentsLabStack)
  -c KEY=VAL    Pass CDK context parameter (e.g. -c identityCenterStartUrl=...)
  --help        Show this help message

Examples:
  # Full deploy (infra + env) then start locally
  ./scripts/deploy.sh all -c identityCenterStartUrl=https://d-XXXXXXXXXX.awsapps.com/start

  # Full deploy with specific region and profile
  ./scripts/deploy.sh all \\
    -c identityCenterStartUrl=https://d-XXXXXXXXXX.awsapps.com/start \\
    -c identityCenterRegion=eu-central-1 \\
    --profile my-profile

  # Just update .env from existing stack
  ./scripts/deploy.sh env

  # Local development (no infra changes)
  ./scripts/deploy.sh start
EOF
  exit 0
}

# Parse arguments
COMMAND="${1:-all}"
shift || true

AWS_PROFILE_FLAG=""
CDK_CONTEXT_ARGS=()
while [[ $# -gt 0 ]]; do
  case $1 in
    --profile) AWS_PROFILE_FLAG="--profile $2"; shift 2 ;;
    --stack) STACK_NAME="$2"; shift 2 ;;
    --help) usage ;;
    -c) CDK_CONTEXT_ARGS+=("-c" "$2"); shift 2 ;;
    *) error "Unknown option: $1" ;;
  esac
done

# Get stack outputs from CloudFormation
get_output() {
  local key="$1"
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue | [0]" \
    --output text $AWS_PROFILE_FLAG 2>/dev/null
}

# Commands
cmd_install() {
  log "Installing app dependencies..."
  cd "$PROJECT_ROOT"
  npm install

  log "Installing infra dependencies..."
  cd "$INFRA_DIR"
  npm install
}

cmd_bootstrap() {
  log "Bootstrapping CDK (if needed)..."
  cd "$INFRA_DIR"
  npx cdk bootstrap $AWS_PROFILE_FLAG 2>/dev/null || true
}

cmd_infra() {
  log "Deploying CDK infrastructure (OIDC client registration)..."
  cd "$INFRA_DIR"

  if [ ! -d "node_modules" ]; then
    log "Installing infra dependencies..."
    npm install
  fi

  npx cdk deploy --require-approval never $AWS_PROFILE_FLAG ${CDK_CONTEXT_ARGS[@]+"${CDK_CONTEXT_ARGS[@]}"} "$@"
  log "Infrastructure deployed successfully"
}

cmd_env() {
  log "Updating .env with stack outputs..."

  local env_file="$PROJECT_ROOT/.env"
  local client_id client_secret issuer_url redirect_uri aws_region

  client_id=$(get_output OidcClientId)
  client_secret=$(get_output OidcClientSecret)
  issuer_url=$(get_output OidcIssuerUrl)
  redirect_uri=$(get_output OidcRedirectUri)
  aws_region=$(get_output AwsRegion)

  if [ -z "$client_id" ] || [ "$client_id" = "None" ]; then
    error "Could not read stack outputs. Has the stack been deployed?"
  fi

  # Create .env from scratch
  cat > "$env_file" <<ENVEOF
# OIDC Configuration (auto-populated by deploy script)
VITE_OIDC_ISSUER_URL=$issuer_url
VITE_OIDC_CLIENT_ID=$client_id
VITE_OIDC_CLIENT_SECRET=$client_secret
VITE_OIDC_REDIRECT_URI=$redirect_uri
VITE_AWS_REGION=$aws_region

# Dev bypass mode — set to true to skip OIDC auth for local development
VITE_AUTH_BYPASS=false
ENVEOF

  log ".env updated with OIDC configuration"
  log "Run locally with: npm run dev"
}

cmd_outputs() {
  echo ""
  log "Stack outputs:"
  echo ""
  echo "VITE_OIDC_CLIENT_ID=$(get_output OidcClientId)"
  echo "VITE_OIDC_CLIENT_SECRET=$(get_output OidcClientSecret)"
  echo "VITE_OIDC_ISSUER_URL=$(get_output OidcIssuerUrl)"
  echo "VITE_OIDC_REDIRECT_URI=$(get_output OidcRedirectUri)"
  echo "VITE_AWS_REGION=$(get_output AwsRegion)"
  echo ""
}

cmd_start() {
  cd "$PROJECT_ROOT"
  if [ ! -d "node_modules" ]; then
    log "Installing app dependencies..."
    npm install
  fi
  log "Starting dev server at http://127.0.0.1:5173"
  npx vite
}

cmd_all() {
  cmd_install
  cmd_bootstrap
  cmd_infra
  cmd_env
  echo ""
  cmd_outputs
  log "Deployment complete! Run 'npm run dev' to start the app."
}

# Dispatch
case "$COMMAND" in
  all)        cmd_all ;;
  infra)      cmd_infra ;;
  env)        cmd_env ;;
  outputs)    cmd_outputs ;;
  start)      cmd_start ;;
  --help)     usage ;;
  *)          error "Unknown command: $COMMAND. Run with --help for usage." ;;
esac
