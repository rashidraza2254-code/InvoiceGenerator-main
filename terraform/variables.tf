variable "prefix" {
  description = "Prefix applied to all Azure resource names"
  type        = string
  default     = "invoicegen"
}

variable "location" {
  description = "Azure region for all resources"
  type        = string
  default     = "uaenorth"
}

variable "node_count" {
  description = "Number of AKS worker nodes"
  type        = number
  default     = 2
}

variable "node_vm_size" {
  description = "VM size for AKS nodes"
  type        = string
  default     = "Standard_D2_v2"
}

variable "k8s_version" {
  description = "Kubernetes version for AKS"
  type        = string
  default     = "1.35"
}

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default = {
    project     = "invoice-generator"
    environment = "production"
    managed-by  = "terraform"
    owner       = "rashid-raza"
  }
}
