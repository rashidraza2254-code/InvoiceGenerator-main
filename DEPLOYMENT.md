# Invoice Generator — DevOps Deployment Guide

## Architecture (Phase 1 + Phase 2 GitOps)

```
GitHub Push
    │
    ▼
GitHub Actions CI/CD
    ├── 1. Test (pytest)
    ├── 2. Docker Build → Azure Container Registry (ACR)
    └── 3. GitOps Update — commits new image tag to Git
                               │
                               ▼
                    ArgoCD (running on AKS)
                    watches k8s/overlays/production/
                    detects Git commit → auto-syncs cluster
                               │
                               ▼
                    Azure Kubernetes Service (AKS)
                        ├── frontend (React/Nginx) ×2
                        ├── backend  (FastAPI)     ×2
                        ├── mongodb  (Persistent)  ×1
                        └── Prometheus + Grafana
                    Provisioned by Terraform
```

**GitOps principle:** CI never touches `kubectl` or the cluster directly.
Git is the single source of truth. ArgoCD enforces cluster state from Git.

## Tech Stack Mapping to JD Requirements

| JD Requirement | Implementation |
|---|---|
| Docker | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` |
| Kubernetes | `k8s/` manifests (Kustomize base + overlay) → Azure AKS |
| GitHub Actions CI/CD | `.github/workflows/ci-cd.yml` |
| Terraform IaC | `terraform/` → AKS + ACR + Log Analytics |
| Prometheus + Grafana | `monitoring/` via kube-prometheus-stack Helm chart |
| Azure cloud | AKS, ACR, Azure Blob (Terraform state) |
| OIDC (OAuth2) | Federated credentials in GitHub Actions — no stored passwords |
| ArgoCD / GitOps | `argocd/` — automated sync, selfHeal, prune |

---

## Step-by-Step Deployment

### Prerequisites
- Azure CLI (`az`) logged in: `az login`
- `terraform` >= 1.6
- `kubectl`
- `helm` >= 3
- `docker`

---

### Step 1 — Bootstrap Azure (run once)

```bash
# Edit your GitHub org/repo name first
nano scripts/bootstrap-azure.sh

bash scripts/bootstrap-azure.sh
```

This creates:
- Terraform remote state storage (Azure Blob)
- App Registration with OIDC federation — no secrets stored in GitHub

Add the 3 output values as GitHub repository secrets:
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

---

### Step 2 — Provision Infrastructure with Terraform

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

This provisions: Resource Group → ACR → AKS cluster → Log Analytics

---

### Step 3 — Local Development with Docker Compose

```bash
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/docs
- MongoDB: localhost:27017

---

### Step 4 — Deploy Monitoring Stack

```bash
# Connect to AKS first
az aks get-credentials --resource-group invoicegen-rg --name invoicegen-aks

bash monitoring/install-monitoring.sh
```

Access Grafana at the LoadBalancer IP shown in the output.

---

### Step 5 — Install ArgoCD (Phase 2 GitOps)

```bash
# Edit your GitHub repo URL inside the script first
nano argocd/install-argocd.sh

bash argocd/install-argocd.sh
```

This installs ArgoCD on AKS, registers the `invoice-generator` Application,
and prints the UI URL + initial admin password.

ArgoCD is configured with `syncPolicy.automated` — once registered it will:
- Pull `k8s/overlays/production/` from Git every 3 minutes
- Apply any changes automatically (`selfHeal: true`)
- Remove resources deleted from Git (`prune: true`)

---

### Step 6 — CI/CD + GitOps (automatic on push to main)

```bash
git push origin main
```

Pipeline stages:
1. **Test** — pytest runs against in-memory config
2. **Build & Push** — Docker images pushed to ACR tagged with short SHA
3. **GitOps Update** — `kustomize edit set image` updates tag in `k8s/overlays/production/kustomization.yaml`, commits back to Git with `[skip ci]`
4. **ArgoCD detects** the new commit and syncs the cluster — zero `kubectl` in CI

---

### ArgoCD Commands Reference

```bash
# Check sync status
argocd app get invoice-generator

# Manual sync (if automated sync is paused)
argocd app sync invoice-generator

# Show diff between Git and live cluster
argocd app diff invoice-generator

# Rollback to previous revision
argocd app rollback invoice-generator

# Watch sync in real time
argocd app wait invoice-generator --sync
```

---

### Kubernetes Commands Reference

```bash
# Namespace overview
kubectl get all -n invoice-generator

# Follow backend logs
kubectl logs -f deployment/backend -n invoice-generator

# Scale backend
kubectl scale deployment/backend --replicas=3 -n invoice-generator

# Rollback
kubectl rollout undo deployment/backend -n invoice-generator

# Get ingress IP
kubectl get ingress -n invoice-generator
```

---

### GitHub Actions Secrets / Variables Required

| Name | Type | Where to get it |
|---|---|---|
| `AZURE_CLIENT_ID` | Secret | Output of `bootstrap-azure.sh` |
| `AZURE_TENANT_ID` | Secret | Output of `bootstrap-azure.sh` |
| `AZURE_SUBSCRIPTION_ID` | Secret | Output of `bootstrap-azure.sh` |
| `ARGOCD_TOKEN` | Secret | `argocd account generate-token --account github-actions` |
| `ARGOCD_SERVER` | Variable | LoadBalancer IP from `argocd/install-argocd.sh` output |

`ARGOCD_TOKEN` and `ARGOCD_SERVER` are optional — only needed if you want the
pipeline to wait and confirm ArgoCD sync status as part of the CI run.
