# Reproducible local Kubernetes lab (Windows / PowerShell)

This shared lab environment is used by the Kubernetes production missions. It is a **kind simulation, not a real production cluster**. Designed for Windows with Docker Desktop (WSL2 engine), kubectl, kind and Helm.

## Prerequisites
- Docker Desktop running with Linux containers + WSL2 backend
- `kind`, `kubectl`, `helm`, `git` available on PATH
- Enough CPU/RAM to run four kind nodes and Cilium (budget roughly 4 CPUs / 8 GB available RAM; workload-dependent)
- Internet access for node image and Cilium Helm chart/container images
- Optional: `wsl --status` for WSL troubleshooting

## Create (destructive if prod-sim already exists)
```powershell
git clone https://github.com/bapuoldtown/production-engineering-warfare.git
cd production-engineering-warfare
.\infra\kind\rebuild.ps1
```
The script asks for an explicit confirmation before deleting a pre-existing `prod-sim`. The configuration is located next to the script, rather than at `C:\k8s-lab\kind-daily.yaml`. It creates 1 control-plane and 3 worker nodes, disables kind's default CNI, then installs Cilium with Hubble relay/UI using Helm.

**Important:** kind nodes can initially be NotReady because the default CNI is disabled. Cilium must initialize before the nodes become Ready. Cilium and kind versions may need compatible configuration in newer releases.

## Verify
```powershell
kubectl --context kind-prod-sim get nodes -o wide
kubectl --context kind-prod-sim -n kube-system get pods -l k8s-app=cilium
kubectl --context kind-prod-sim -n kube-system get pods
kubectl --context kind-prod-sim get namespaces
```
Expected: four Ready nodes and running Cilium Pods. If not, inspect `kubectl --context kind-prod-sim -n kube-system describe pod <name>`, `kubectl ... get events`, and Docker resources.

## Resume / pause
```powershell
.\infra\kind\stop.ps1
.\infra\kind\start.ps1
```
`stop.ps1` stops only the selected cluster's node containers, leaving Docker Desktop and other WSL workloads alone. `start.ps1` tries to start Docker Desktop if needed, resumes the kind containers, and waits for Ready nodes. These operations are **not equivalent to safely shutting down a production cluster**, and stateful workloads should not rely on clean shutdown during Docker stop/start.

## Run a mission
For example, from the repository root:
```powershell
cd .\labs\005-graceful-shutdown
docker build -t gist-graceful:v1 .\app
kind load docker-image gist-graceful:v1 --name prod-sim
kubectl --context kind-prod-sim apply -f .\manifests\deployment.yaml
kubectl --context kind-prod-sim rollout status deployment/gist-api -n warfare-shutdown-lab
```
Other Kubernetes lab manifests can use the same context. The PostgreSQL and API latency missions have their own setup and may not require kind.

## Troubleshooting and safety
- `kind get clusters` lists existing kind clusters. Never use rebuild if preserving current lab data matters.
- `docker info` checks Docker connectivity.
- `kubectl config get-contexts` confirms the current context; use `--context kind-prod-sim` when applying resources.
- If Cilium initialization fails, check Cilium version compatibility, Docker resources, and whether the kind network supports the selected Cilium settings.
- Do **not** run arbitrary internet scripts with elevated privilege; install tools from their official distributors.

## Attribution
Based on the original local `rebuild.ps1`, `start.ps1` and `stop.ps1` scripts supplied by the project author, adapted for community reproducibility. The original stop script shut down Docker Desktop and WSL globally; this version intentionally does not, to avoid disrupting unrelated work.
