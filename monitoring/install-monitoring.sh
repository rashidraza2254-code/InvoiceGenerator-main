#!/bin/bash
# Run once after AKS is provisioned to set up Prometheus + Grafana
# Prerequisite: helm installed, kubectl connected to AKS cluster

set -euo pipefail

helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

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
