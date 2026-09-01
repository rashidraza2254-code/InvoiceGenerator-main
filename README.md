# Cafe Bill Generator — Cloud-Native POS on Azure AKS

A full-stack Point-of-Sale (POS) application for cafes, deployed on Azure Kubernetes Service using a complete GitOps pipeline. Built as a DevOps portfolio project demonstrating Docker, Kubernetes, GitHub Actions CI/CD, Terraform IaC, ArgoCD GitOps, and Prometheus/Grafana observability on Azure.

---

## Application Overview

A multi-user cafe POS system with role-based access (admin / cashier), live billing, analytics, and PDF receipts.

### Features

| Module | Capabilities |
|---|---|
| **Authentication** | JWT-based login, bcrypt passwords, role-based access (admin / cashier) |
| **POS** | Tabbed menu by category, search, cart with qty +/−, live total calculation |
| **Billing** | Tax %, service charge %, per-item discount, split payments (Cash/Card/UPI) |
| **Receipts** | Printable on-screen receipt + PDF download via jsPDF |
| **Bill History** | Date-range filter, payment-mode filter, CSV export |
| **Analytics** | Daily revenue chart, top items, payment mode breakdown, KPI cards (recharts) |
| **Void & Audit** | Admin void with reason, audit trail, VOID stamp on receipt/PDF |
| **User Management** | Admin creates/deletes cashier and admin accounts |
| **Settings** | Cafe name, address, currency, default tax/service % |

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router, Tailwind CSS, shadcn/ui, jsPDF, Recharts |
| Backend | FastAPI, Uvicorn, Motor (async MongoDB), PyJWT, bcrypt |
| Database | MongoDB 7 |
| Container Runtime | Docker, Docker Compose |
| Orchestration | Kubernetes (Azure AKS) |
| Registry | Azure Container Registry (ACR) |
| IaC | Terraform (AKS + ACR + Log Analytics) |
| CI/CD | GitHub Actions (4-stage pipeline) |
| GitOps | ArgoCD (automated sync, selfHeal, prune) |
| Manifests | Kustomize (base + production overlay) |
| Monitoring | Prometheus + Grafana (kube-prometheus-stack) |
| Auth (CI) | Azure OIDC federated credentials — no stored passwords |

---

## DevOps Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Developer Workflow                        │
│                                                                 │
│   git push origin main                                          │
│         │                                                       │
│         ▼                                                       │
│   GitHub Actions CI/CD                                          │
│   ┌──────────────────────────────────────────────────────┐     │
│   │ Job 1: Test       pytest backend/tests/               │     │
│   │ Job 2: Build      docker build → push to ACR          │     │
│   │ Job 3: GitOps     kustomize edit set image            │     │
│   │                   git commit k8s/overlays/ [skip ci]  │     │
│   │ Job 4: Terraform  plan/apply (manual trigger)         │     │
│   └──────────────────────────────────────────────────────┘     │
│         │                                                       │
│         │  Git commit to k8s/overlays/production/              │
│         ▼                                                       │
│   ArgoCD (on AKS) detects commit → auto-syncs cluster          │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
         ┌────────────────────────────────┐
         │   Azure Kubernetes Service     │
         │   Namespace: invoice-generator │
         │                                │
         │   frontend  (Nginx)   ×2 pods  │
         │   backend   (FastAPI) ×2 pods  │
         │   mongodb             ×1 pod   │
         │                                │
         │   Namespace: monitoring        │
         │   Prometheus + Grafana         │
         └────────────────────────────────┘
                          ▲
         Provisioned by Terraform
         (AKS + ACR + Log Analytics)
```

**GitOps principle:** CI never runs `kubectl` against the cluster. Git is the single source of truth. ArgoCD enforces cluster state from `k8s/overlays/production/`. Any manual `kubectl` change is automatically reverted (`selfHeal: true`).

---

## Quick Start — Local Development

```bash
docker-compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API docs | http://localhost:8000/docs |
| MongoDB | localhost:27017 |

Default login: `admin@cafe.com` / `admin123`

---

## Full Cloud Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the complete step-by-step guide. Summary:

### Prerequisites
`az` CLI, `terraform` >= 1.6, `kubectl`, `helm` >= 3, `docker`

### Steps

```bash
# 1. Bootstrap Azure — creates Terraform state storage + OIDC federation for GitHub Actions
bash scripts/bootstrap-azure.sh

# 2. Add the 3 output values as GitHub repository secrets:
#    AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID

# 3. Provision Azure infrastructure
cd terraform && terraform init && terraform apply

# 4. Connect to AKS
az aks get-credentials --resource-group invoicegen-rg --name invoicegen-aks

# 5. Install ArgoCD (Phase 2 GitOps)
bash argocd/install-argocd.sh

# 6. Install Prometheus + Grafana monitoring
bash monitoring/install-monitoring.sh

# 7. Deploy — just push to main
git push origin main
# GitHub Actions builds images → commits tag update → ArgoCD syncs AKS
```

---

## Repository Structure

```
├── backend/
│   ├── Dockerfile            Multi-stage Python 3.11 image
│   ├── server.py             FastAPI application entry point
│   ├── requirements.txt
│   └── tests/                pytest suite (83 tests)
│
├── frontend/
│   ├── Dockerfile            Multi-stage Node 20 / Nginx image
│   ├── nginx.conf            Nginx with /api/ reverse proxy
│   └── src/
│       ├── pages/            POS, Analytics, BillHistory, etc.
│       └── components/       CartPanel, PaymentSplitter, UI primitives
│
├── k8s/                      Kubernetes manifests
│   ├── kustomization.yaml    Base (referenced by overlays)
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml          ← gitignored, never committed
│   ├── mongodb-deployment.yaml
│   ├── backend-deployment.yaml
│   ├── frontend-deployment.yaml
│   ├── ingress.yaml
│   └── overlays/
│       └── production/
│           └── kustomization.yaml   ← ArgoCD watches this; CI updates image tags here
│
├── terraform/
│   ├── main.tf               AKS cluster, ACR, Log Analytics, role assignments
│   ├── variables.tf
│   └── outputs.tf
│
├── argocd/
│   ├── application.yaml      ArgoCD Application (automated sync, selfHeal, prune)
│   ├── project.yaml          ArgoCD AppProject (scoped permissions)
│   └── install-argocd.sh     One-command ArgoCD install on AKS
│
├── monitoring/
│   ├── prometheus-values.yaml    Helm values for kube-prometheus-stack
│   └── install-monitoring.sh    One-command Prometheus + Grafana install
│
├── scripts/
│   └── bootstrap-azure.sh   One-time: Terraform backend + OIDC federation setup
│
├── docker-compose.yml        Local dev (frontend + backend + mongodb)
├── DEPLOYMENT.md             End-to-end deployment guide
└── .github/
    └── workflows/
        └── ci-cd.yml         4-job GitHub Actions pipeline
```

---

## CI/CD Pipeline Detail

```
On push to main (excluding k8s/overlays/** to prevent loops):

  test              Run pytest — fails fast before any build
      │
  build-and-push    Build backend + frontend images
      │             Push to ACR tagged with short Git SHA
      │             Layer caching via ACR cache manifests
      │
  gitops-update     kustomize edit set image → new tag
      │             git commit [skip ci] → push to main
      │             ArgoCD detects commit → syncs AKS
      │
  terraform         Manual trigger (workflow_dispatch) only
                    terraform plan + apply for infra changes
```

---

## JD Coverage Map

This project was deliberately designed to demonstrate every requirement from a target DevOps Engineer role:

| JD Requirement | Where to find it |
|---|---|
| Docker, Docker Compose | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` |
| Kubernetes | `k8s/` — 7 manifests, Kustomize overlays, AKS |
| GitHub Actions CI/CD | `.github/workflows/ci-cd.yml` |
| Terraform / IaC | `terraform/` — AKS, ACR, Log Analytics, RBAC |
| Prometheus + Grafana | `monitoring/` — kube-prometheus-stack, pod annotation scraping |
| Azure cloud | AKS, ACR, Azure Blob (TF state), Log Analytics |
| OIDC / OAuth2 | `scripts/bootstrap-azure.sh` — federated credentials, no SP passwords |
| ArgoCD / GitOps | `argocd/` — automated sync, selfHeal, prune, Kustomize overlay pattern |
| Python scripting | FastAPI backend, shell scripts for bootstrap/install |
| Technical documentation | `DEPLOYMENT.md`, this README |
