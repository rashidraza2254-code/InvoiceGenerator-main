#!/bin/bash
# Run once after AKS is provisioned to set up Prometheus + Grafana
# Prerequisite: helm installed, kubectl connected to AKS cluster

set -euo pipefail

helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Grafana's dashboardsConfigMaps setting in prometheus-values.yaml expects this
# ConfigMap to already exist in the release namespace before Helm installs the
# chart, or the Grafana pod hangs forever on a missing volume mount.
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
kubectl create configmap grafana-dashboards \
  --from-file=monitoring/dashboards/ \
  --namespace monitoring \
  --dry-run=client -o yaml | kubectl apply -f -

helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --version 56.x \
  -f monitoring/prometheus-values.yaml \
  --wait

echo ""
echo "Grafana LoadBalancer IP (may take 1-2 mins):"
kubectl get svc prometheus-grafana -n monitoring -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
echo ""
echo "Grafana credentials  user: admin  pass: admin (change immediately)"
