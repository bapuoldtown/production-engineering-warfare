# DESTRUCTIVE: deletes the existing prod-sim cluster and its workloads.
# Run from Windows PowerShell with Docker Desktop, kind, kubectl, and helm installed.
$ErrorActionPreference = 'Stop'
$cluster = 'prod-sim'
$config = Join-Path $PSScriptRoot 'kind-daily.yaml'

foreach ($tool in @('docker','kind','kubectl','helm')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "Missing required tool: $tool"
    }
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker engine is not running. Start Docker Desktop first.' }
Write-Host "WARNING: This DELETES cluster '$cluster' and all its workloads/data." -ForegroundColor Yellow
$answer = Read-Host "Type DELETE-$cluster to continue"
if ($answer -cne "DELETE-$cluster") { throw 'Rebuild cancelled.' }

kind delete cluster --name $cluster
if ($LASTEXITCODE -ne 0) { throw 'kind delete failed' }
kind create cluster --name $cluster --config $config --wait 120s
if ($LASTEXITCODE -ne 0) { throw 'kind create failed' }

# The cluster has no default CNI, so nodes may be NotReady until Cilium starts.
helm repo add cilium https://helm.cilium.io/
if ($LASTEXITCODE -ne 0) { throw 'Could not add Cilium Helm repository' }
helm repo update cilium
if ($LASTEXITCODE -ne 0) { throw 'Could not update Cilium Helm repository' }
helm upgrade --install cilium cilium/cilium --namespace kube-system --wait --timeout 10m `
    --set ipam.mode=kubernetes `
    --set hubble.relay.enabled=true `
    --set hubble.ui.enabled=true
if ($LASTEXITCODE -ne 0) { throw 'Cilium install failed' }
kubectl --context "kind-$cluster" -n kube-system rollout status daemonset/cilium --timeout=5m
if ($LASTEXITCODE -ne 0) { throw 'Cilium rollout failed' }
kubectl --context "kind-$cluster" wait --for=condition=Ready nodes --all --timeout=300s
if ($LASTEXITCODE -ne 0) { throw 'Cluster nodes are not all Ready' }
kubectl --context "kind-$cluster" get nodes -o wide
