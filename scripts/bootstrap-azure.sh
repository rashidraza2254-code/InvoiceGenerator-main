#!/bin/bash
# Run ONCE to set up:
#   1. Terraform remote state storage in Azure
#   2. Service Principal with OIDC federation for GitHub Actions (no passwords)
#
# Prerequisites: az CLI logged in, jq installed
# Usage: bash scripts/bootstrap-azure.sh

set -euo pipefail

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
GITHUB_ORG="your-github-username"          # <-- change this
GITHUB_REPO="InvoiceGenerator-main"        # <-- change this
APP_NAME="invoicegen-github-actions"
RESOURCE_GROUP="invoicegen-rg"
LOCATION="eastus"
TFSTATE_RG="tfstate-rg"
TFSTATE_SA="invoicegentfstate"             # must be globally unique
TFSTATE_CONTAINER="tfstate"

echo "==> Creating Terraform state storage..."
az group create -n "$TFSTATE_RG" -l "$LOCATION" -o none
az storage account create \
  --name "$TFSTATE_SA" \
  --resource-group "$TFSTATE_RG" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --encryption-services blob \
  -o none
az storage container create \
  --name "$TFSTATE_CONTAINER" \
  --account-name "$TFSTATE_SA" \
  -o none
echo "  Terraform backend: $TFSTATE_SA/$TFSTATE_CONTAINER"

echo ""
echo "==> Creating App Registration for GitHub Actions OIDC..."
APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
SP_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)
echo "  App ID (AZURE_CLIENT_ID): $APP_ID"
echo "  SP Object ID: $SP_ID"

# Assign Contributor on subscription
az role assignment create \
  --assignee "$APP_ID" \
  --role Contributor \
  --scope "/subscriptions/$SUBSCRIPTION_ID" \
  -o none
echo "  Assigned Contributor on subscription"

# Add federated credentials (OIDC — no passwords needed)
TENANT_ID=$(az account show --query tenantId -o tsv)

az ad app federated-credential create \
  --id "$APP_ID" \
  --parameters "{
    \"name\": \"github-main\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"repo:${GITHUB_ORG}/${GITHUB_REPO}:ref:refs/heads/main\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }" -o none

az ad app federated-credential create \
  --id "$APP_ID" \
  --parameters "{
    \"name\": \"github-pr\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"repo:${GITHUB_ORG}/${GITHUB_REPO}:pull_request\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }" -o none

echo ""
echo "=========================================="
echo "Add these 3 secrets to your GitHub repo:"
echo "  Settings → Secrets → Actions"
echo "=========================================="
echo "  AZURE_CLIENT_ID       = $APP_ID"
echo "  AZURE_TENANT_ID       = $TENANT_ID"
echo "  AZURE_SUBSCRIPTION_ID = $SUBSCRIPTION_ID"
echo "=========================================="
echo ""
echo "Then run:  terraform init && terraform apply  (in ./terraform/)"
