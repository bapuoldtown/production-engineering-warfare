# Mission 005 — Graceful Shutdown and In-flight Requests

**Status: Completed as an introductory termination/recovery lab; overlap/draining verification remains an optional follow-up.**

## Scenario
A FastAPI service simulates a slow GitHub Gist downstream call with `asyncio.sleep(10)`. It runs with three replicas and `terminationGracePeriodSeconds: 5`. We delete one Pod while investigating request continuity and ReplicaSet recovery.

## What the termination grace period means
- `terminationGracePeriodSeconds: 5`: approximately five seconds **total** from initiation of Pod termination for graceful shutdown, including any `preStop` hook. The runtime ordinarily sends SIGTERM to PID 1 and SIGKILL if still running when the grace expires.
- **If omitted:** Kubernetes defaults to **30 seconds** (not unlimited time).
- `terminationGracePeriodSeconds: 0`: requests immediate termination; active work may be interrupted.
- A server such as Uvicorn must cooperate with SIGTERM and drain in-flight requests; Kubernetes does not preserve them automatically.
- A request already processing may finish if it completes before the shutdown deadline. If still processing at forced termination, it can fail.
- Kubernetes also removes terminating endpoints from normal Service routing; propagation is not instantaneous. A `preStop` delay may help propagation but consumes grace time.
- `maxUnavailable: 0` preserves Deployment availability during a rollout; it does **not** guarantee per-request success on a terminating Pod.

## Actual evidence (2026-11-22)
- Image `gist-graceful:v1` loaded into all four kind nodes of cluster `prod-sim`.
- Deployment rollout succeeded; three Pods were Ready (1/1), zero restarts, spread across three workers.
- Deleted Pod: `gist-api-7786667475-7xpxv`; events recorded `Killing`.
- ReplicaSet created replacement `gist-api-7786667475-fjdfz` on `prod-sim-worker2`.
- Client received `HTTP/1.1 200 OK` with `request_id=59bdb790`, `pod=gist-api-7786667475-7xpxv`, `status=completed`.
- Startup readiness events showed initial connection refusal and HTTP 503 during the intentional warm-up.
- **Limit of evidence:** Timing of SIGTERM relative to the 10-second request was not captured. HTTP 200 does not prove the request survived termination; no forcibly interrupted request was demonstrated. Pod port-forwarding can itself disconnect on deletion.

## Reproduce (Windows PowerShell)
From this lab directory:
```powershell
docker build -t gist-graceful:v1 .\app
kind load docker-image gist-graceful:v1 --name prod-sim
kubectl apply -f .\manifests\deployment.yaml
kubectl rollout status deployment/gist-api -n warfare-shutdown-lab
kubectl get pods -n warfare-shutdown-lab -o wide
```
In one terminal, port-forward to a **specific current Pod**:
```powershell
kubectl port-forward -n warfare-shutdown-lab pod/<POD_NAME> 8080:8080
```
In another terminal:
```powershell
curl.exe --max-time 20 -v http://localhost:8080/gists/demo
```
Delete that same Pod while the request runs:
```powershell
kubectl delete pod <POD_NAME> -n warfare-shutdown-lab --wait=false
kubectl get pods -n warfare-shutdown-lab
kubectl get events -n warfare-shutdown-lab --sort-by=.lastTimestamp
```

## Next production-grade experiment (not yet completed)
Use an in-cluster HTTP client instead of Pod port-forwarding, capture request-start and SIGTERM timestamps, compare 5s vs 30s grace periods, and verify client success/failure and application logs. Consider explicit Uvicorn graceful shutdown timeout, preStop endpoint-draining behavior, and a rolling update with concurrent traffic.

## Staff-engineer interview summary
A Deployment can remain available while a request fails during Pod shutdown. Graceful termination is an application-and-platform contract: endpoint removal, SIGTERM handling, draining, and a grace deadline all matter. Choose the grace period from measured tail request duration plus shutdown overhead; do not confuse Pod recovery with zero request loss.
