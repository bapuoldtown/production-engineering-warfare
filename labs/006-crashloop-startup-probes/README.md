# Mission 006 — CrashLoopBackOff, startup and liveness probes

**Status: prepared lab; execute and record evidence locally.** This mission intentionally creates a restart loop, then fixes the probe configuration. No measured results are claimed yet.

## Incident statement
A Python HTTP service takes **45 seconds** to initialize. Two Kubernetes replicas are deployed with a liveness probe that starts after 5 seconds and checks every 5 seconds with three failures allowed. Containers restart before they can listen on port 8000. Users see reduced capacity and operators report `CrashLoopBackOff`.

**Your mission:** distinguish an application crash from a kubelet-triggered restart, identify the precise probe failure, and recover without disabling health checks.

## What actually happens
The application sleeps for 45 seconds before binding port 8000. The kubelet's liveness probe receives connection failures. After three consecutive failures it terminates and restarts the container. Kubernetes applies increasing restart backoff. The exact timing varies by kubelet and probe scheduling; `CrashLoopBackOff` is a waiting status, not the process's exit reason.

## Prerequisites
Windows PowerShell, Docker Desktop, kind cluster `prod-sim` with Ready nodes, `docker`, `kind`, and `kubectl`. See [shared cluster setup](../../infra/kind/README.md).

## Reproduce the failure
Run from the **repository root** in PowerShell:
```powershell
kubectl --context kind-prod-sim get nodes
docker build -t warfare-006:v1 .\labs\006-crashloop-startup-probes\app
kind load docker-image warfare-006:v1 --name prod-sim
kubectl --context kind-prod-sim apply -f .\labs\006-crashloop-startup-probes\manifests\broken.yaml
kubectl --context kind-prod-sim -n warfare-006 get pods -w
```
Stop the watch with Ctrl+C after observing restarts. Then:
```powershell
kubectl --context kind-prod-sim -n warfare-006 describe pods -l app=slow-start
kubectl --context kind-prod-sim -n warfare-006 logs -l app=slow-start --all-containers --prefix --tail=50
kubectl --context kind-prod-sim -n warfare-006 get events --sort-by=.lastTimestamp
```
For previous-container logs, choose one exact Pod name from `get pods` and run:
```powershell
kubectl --context kind-prod-sim -n warfare-006 logs POD_NAME -c api --previous
```
Expected indicators: `Unhealthy` events reporting liveness probe failure, `Killing` events, rising restart counts and logs that show initialization without reaching the listening phase. An application can also crash for unrelated reasons; events and last termination state decide.

## Recover safely
```powershell
kubectl --context kind-prod-sim apply -f .\labs\006-crashloop-startup-probes\manifests\fixed.yaml
kubectl --context kind-prod-sim -n warfare-006 rollout status deployment/slow-start --timeout=180s
kubectl --context kind-prod-sim -n warfare-006 get pods -o wide
kubectl --context kind-prod-sim -n warfare-006 describe deployment slow-start
```
The **startup probe** allows up to 15 checks spaced 5 seconds apart; until it succeeds, liveness and readiness probes are held back. After startup succeeds, readiness controls traffic eligibility and liveness detects persistent post-start failures. Startup success does not imply downstream dependencies are healthy.

## Evidence to capture
- Before: `get pods` with restart counts, `describe pod` liveness failure events, `logs --previous`.
- After: successful rollout, Ready replicas, stable restart counts, and probe configuration.
- Write your real timestamps and results in [EVIDENCE.md](EVIDENCE.md). Do not present expected output as observed evidence.

## Staff/Principal review
1. Why not just increase `initialDelaySeconds`? What is the tradeoff?
2. What is the difference between startup, readiness and liveness?
3. If a database becomes unavailable after startup, should liveness fail? Why might that cause a restart storm?
4. How do you distinguish OOMKilled, application exit, failed probe and image-pull errors?

## Cleanup
```powershell
kubectl --context kind-prod-sim delete namespace warfare-006
```
