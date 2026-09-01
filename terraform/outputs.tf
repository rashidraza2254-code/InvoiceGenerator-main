output "resource_group_name" {
  description = "Name of the Azure resource group"
  value       = azurerm_resource_group.main.name
}

output "acr_login_server" {
  description = "ACR login server URL — use this as DOCKER_REGISTRY in GitHub Actions"
  value       = azurerm_container_registry.acr.login_server
}

output "acr_name" {
  value = azurerm_container_registry.acr.name
}

output "aks_cluster_name" {
  description = "AKS cluster name — use in az aks get-credentials"
  value       = azurerm_kubernetes_cluster.aks.name
}

output "kube_config" {
  description = "Raw kubeconfig — store in GitHub secret KUBE_CONFIG if not using OIDC"
  value       = azurerm_kubernetes_cluster.aks.kube_config_raw
  sensitive   = true
}

output "log_analytics_workspace_id" {
  value = azurerm_log_analytics_workspace.aks.id
}
