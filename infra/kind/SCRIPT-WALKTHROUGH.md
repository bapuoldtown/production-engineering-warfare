# How the PowerShell kind lab scripts work — line-by-line concepts

This document explains the **actual scripts** under `infra/kind/`, rather than asking you to run an unexplained PowerShell file.

> **Safety first:** `rebuild.ps1` deletes the existing `prod-sim` cluster, including Kubernetes workloads and data stored in its kind node containers. `start.ps1` and `stop.ps1` operate on existing Docker node containers and do not intentionally delete the cluster.

## Architecture: what gets created?

```text
Windows PowerShell
       |
       +-- Docker Desktop (WSL2 Linux engine)
               |
               +-- Docker network + kind node containers
                     |
                     +-- prod-sim-control-plane  [Kubernetes API, etcd, scheduler, controller manager]
                     +-- prod-sim-worker         [kubelet + workloads]
                     +-- prod-sim-worker2        [kubelet + workloads]
                     +-- prod-sim-worker3        [kubelet + workloads]
                               |
                               +-- Cilium CNI for Pod networking and policy
                               +-- Hubble Relay / UI for network visibility
```

The node containers emulate machines; they are **not** separate cloud VMs or production availability zones. Docker Desktop is the container runtime host. `kind` creates Kubernetes clusters using Docker containers as nodes.

## 1. `kind-daily.yaml` — cluster topology

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: prod-sim
networking:
  disableDefaultCNI: true
nodes:
  - role: control-plane
  - role: worker
  - role: worker
  - role: worker
```

- `kind: Cluster`: kind-specific configuration, not a Kubernetes Deployment manifest.
- `name: prod-sim`: makes kubeconfig context `kind-prod-sim`.
- `disableDefaultCNI: true`: kind does **not** install its default Pod network; nodes may remain NotReady until Cilium is installed.
- One control-plane and three workers: enables scheduling, replica placement and worker failure experiments. **No control-plane HA** is simulated.

## 2. `rebuild.ps1` — delete and recreate from scratch

Read the source: [rebuild.ps1](rebuild.ps1).

| Script action | Why it exists | Failure/safety consideration |
| --- | --- | --- |
| `$ErrorActionPreference = 'Stop'` | Fail on PowerShell errors | External CLI exit codes are also checked explicitly |
| `$PSScriptRoot` + `kind-daily.yaml` | Resolve config relative to the script's folder | Works regardless of your current working directory |
| `Get-Command docker/kind/kubectl/helm` | Verify required CLIs are installed | Doesn't guarantee compatible versions |
| `docker info` | Check Docker engine availability | Docker Desktop must be running |
| `Read-Host` requiring `DELETE-prod-sim` | Make destructive action deliberate | **All cluster data may be lost** |
| `kind delete cluster --name prod-sim` | Remove old node containers and cluster | Not a rolling upgrade |
| `kind create cluster --config ...` | Create 4-node topology | CNI not yet installed |
| `helm repo add/update cilium` | Locate Cilium Helm chart | Internet and compatible chart required |
| `helm upgrade --install cilium ...` | Install Cilium networking | Enables Hubble Relay and UI; this is a local demo setup |
| `kubectl rollout status daemonset/cilium` | Verify Cilium agents roll out | DaemonSet runs networking agents on eligible nodes |
| `kubectl wait ... Ready nodes` | Ensure nodes can schedule workloads | Does not prove every application is healthy |

**Why Cilium?** Cilium provides Pod networking and policy enforcement. Hubble adds visibility into network flows. These are useful for Mission 009; Missions 006–008 mostly exercise kubelet, controllers and resource metrics.

## 3. `stop.ps1` — pause the lab without deleting it

Read [stop.ps1](stop.ps1). It checks the Docker CLI and engine, selects running Docker containers by the label `io.x-k8s.kind.cluster=prod-sim`, and executes `docker stop` on those containers. **It does not stop Docker Desktop or WSL globally**, so unrelated containers can continue running.

**Caveat:** a Docker stop is not a production-grade shutdown protocol. In-memory state, open connections and stateful workloads may be affected. Kubernetes does not guarantee clean application-level quiescing here.

## 4. `start.ps1` — resume existing nodes

Read [start.ps1](start.ps1). It checks Docker and kubectl; if Docker is unavailable, it attempts to start Docker Desktop from `Program Files` and waits for the engine. It then finds **all** containers labeled for `prod-sim`, starts them with `docker start`, waits up to five minutes for all Kubernetes nodes to report Ready, and prints the nodes.

**What it does not do:** create missing nodes, reinstall Cilium, guarantee application readiness or restore data already deleted by `rebuild.ps1`.

## 5. Safe decision tree

- **Cluster already exists and is stopped?** Use `start.ps1`.
- **Cluster exists and is running?** Use `kubectl --context kind-prod-sim get nodes`; don't rebuild.
- **Want to pause your lab?** Use `stop.ps1`.
- **Want to reset everything and accept losing cluster data?** Only then use `rebuild.ps1`.
- **Want to stop one worker for Mission 007?** Stop that exact worker container, **not** all nodes.

## 6. Verify, diagnose and explain

```powershell
kind get clusters
docker ps --filter "label=io.x-k8s.kind.cluster=prod-sim"
kubectl --context kind-prod-sim get nodes -o wide
kubectl --context kind-prod-sim -n kube-system get pods -o wide
kubectl --context kind-prod-sim -n kube-system get daemonset cilium
kubectl --context kind-prod-sim get events -A --sort-by=.lastTimestamp
```

Interpretation:
- `docker ps`: are the simulated node containers running?
- `get nodes`: can kubelet report node health to the API server?
- `get pods`: are system workloads scheduled and Ready?
- `get daemonset cilium`: is the Pod networking agent available on expected nodes?
- `get events`: what failures did Kubernetes report? Events may expire.

## 7. Staff-level interview questions

1. What happens when the CNI is not ready, and why can Kubernetes nodes show NotReady?
2. Why is stopping a Docker node container different from `kubectl drain`?
3. Why does `Ready` on a Node not imply `Ready` on all Pods?
4. Which components run on the control plane vs workers?
5. What would change for managed EKS/AKS/GKE versus a local kind simulation?

## Limitations

This is a reproducible **learning** cluster. It does not model real multi-AZ availability, production security hardening, managed control planes, cloud load balancers or cloud billing. The script does not pin a Cilium chart version; chart and kind compatibility should be tested before teaching this setup to others.
