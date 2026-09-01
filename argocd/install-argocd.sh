#!/bin/bash
# Install ArgoCD on AKS and register the Invoice Generator application
# Run after: terraform apply && az aks get-credentials ...
#
# Usage: bash argocd/install-argocd.sh

set -euo pipefail

ARGOCD_VERSION="v2.11.0"
GITHUB_REPO="https://github.com/your-github-username/InvoiceGenerator-main"  # <-- change

echo "==> Installing ArgoCD ${ARGOCD_VERSION}..."
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -n argocd \
  -f "https://raw.githubusercontent.com/argoproj/argo-cd/${ARGOCD_VERSION}/manifests/install.yaml"

echo "==> Waiting for ArgoCD pods to be ready..."
kubectl rollout status deployment/argocd-server -n argocd --timeout=180s

# Patch argocd-server to use LoadBalancer so we can reach the UI
kubectl patch svc argocd-server -n argocd \
  -p '{"spec": {"type": "LoadBalancer"}}'

echo "==> Applying ArgoCD project and application..."
kubectl apply -f argocd/project.yaml
kubectl apply -f argocd/application.yaml

echo ""
echo "==> Waiting for external IP (may take 1-2 minutes)..."
for i in $(seq 1 30); do
  IP=$(kubectl get svc argocd-server -n argocd \
        -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
  if [[ -n "$IP" ]]; then
    break
  fi
  sleep 5
done

ARGOCD_PASS=$(kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d)

echo ""
echo "=========================================="
echo "  ArgoCD is ready"
echo "=========================================="
echo "  UI:       https://${IP}"
echo "  Username: admin"
echo "  Password: ${ARGOCD_PASS}"
echo ""
echo "  IMPORTANT: Change the password immediately after login:"
echo "  argocd login ${IP} --username admin --password '${ARGOCD_PASS}'"
echo "  argocd account update-password"
echo ""
echo "  App will auto-sync from: ${GITHUB_REPO}"
echo "  Watching path: k8s/overlays/production/"
echo "=========================================="
