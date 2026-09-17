#!/bin/bash
# Bedrock Business Monitor — Deployment Script
# Run this once in your terminal with CLOUDFLARE_API_TOKEN set.
# Usage: CLOUDFLARE_API_TOKEN=your_token bash deploy.sh

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

echo "=== Bedrock Business Monitor Deployment ==="
echo ""

# Verify token
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN not set."
  echo "Usage: CLOUDFLARE_API_TOKEN=your_token bash deploy.sh"
  exit 1
fi

echo "✓ Cloudflare API token present"
echo ""

# Step 1: Create D1 database
echo "Step 1: Creating D1 database..."
DB_OUTPUT=$(wrangler d1 create bedrock-monitor 2>&1)
echo "$DB_OUTPUT"

# Extract database_id from output
DB_ID=$(echo "$DB_OUTPUT" | grep -o '"database_id": "[^"]*"' | head -1 | sed 's/"database_id": "//;s/"//')
if [ -z "$DB_ID" ]; then
  # Try alternate format
  DB_ID=$(echo "$DB_OUTPUT" | grep -o 'database_id = "[^"]*"' | head -1 | sed 's/database_id = "//;s/"//')
fi

if [ -z "$DB_ID" ]; then
  echo ""
  echo "Could not auto-extract database_id. Please copy it from the output above"
  echo "and update wrangler.jsonc manually, then run:"
  echo "  wrangler d1 execute bedrock-monitor --file=src/db/schema.sql"
  echo "  wrangler deploy"
  exit 1
fi

echo ""
echo "✓ Database created: $DB_ID"
echo ""

# Step 2: Update wrangler.jsonc with database_id
echo "Step 2: Updating wrangler.jsonc with database_id..."
sed -i.bak "s/\"database_id\": \"TO_BE_CREATED\"/\"database_id\": \"$DB_ID\"/" wrangler.jsonc
echo "✓ wrangler.jsonc updated"
echo ""

# Step 3: Apply schema
echo "Step 3: Applying D1 schema..."
wrangler d1 execute bedrock-monitor --file=src/db/schema.sql
echo "✓ Schema applied"
echo ""

# Step 4: Deploy Worker
echo "Step 4: Deploying Worker..."
wrangler deploy
echo ""
echo "=== Deployment complete ==="
echo ""
echo "Next step: Set SLACK_WEBHOOK_URL"
echo "  wrangler secret put SLACK_WEBHOOK_URL"
echo "(Andrew will provide the webhook URL)"
