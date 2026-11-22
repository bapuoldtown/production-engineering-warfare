# Mission 008 — CPU saturation, throttling and HPA decisions

**Status: prepared lab; actual scaling and metrics must be verified locally.**

## Incident statement
A Python HTTP API experiences high request latency under CPU-heavy work. One Pod requests **100m CPU** and is capped at **250m CPU**. An HPA targets **60% CPU utilization** (relative to the CPU request) and can scale from 1 to 4 replicas. You must decide whether scaling is justified, whether the CPU limit is causing throttling, and whether adding Pods will improve p99 latency.

## Important distinctions
- **CPU request (100m):** scheduler reservation/basis for CPU utilization; not a CPU speed limit.
- **CPU limit (250m):** cgroup CPU quota; a saturated container may be throttled.
- **HPA 60%:** targets roughly 60m observed CPU per Pod relative to its 100m request, not 60% of the 250m limit.
- **HPA requires metrics:** most kind clusters do not have metrics-server by default. Without a working resource metrics API, CPU HPA cannot calculate utilization.
- **HPA is reactive:** metrics sampling, control loops and stabilization create delay. Scaling is not an immediate latency fix.
- **This Python demo:** uses CPU-bound Python loops, so the GIL also limits parallel execution inside one process; adding Pods provides separate processes.

## Prerequisites and metrics-server check
From the repository root in PowerShell:
```powershell
kubectl --context kind-prod-sim get nodes
kubectl --context kind-prod-sim top nodes
kubectl --context kind-prod-sim get apiservice v1beta1.metrics.k8s.io
```
If metrics API is unavailable, install a compatible metrics-server release using its official manifests and configure kubelet TLS for your disposable kind cluster. Do **not** disable TLS verification in production. See [metrics-server documentation](https://github.com/kubernetes-sigs/metrics-server). Only proceed to HPA claims once `kubectl top nodes` works.

## Build and deploy
```powershell
docker build -t warfare-008:v1 .\labs\008-hpa-resource-saturation\app
kind load docker-image warfare-008:v1 --name prod-sim
kubectl --context kind-prod-sim apply -f .\labs\008-hpa-resource-saturation\manifests\workload.yaml
kubectl --context kind-prod-sim -n warfare-008 rollout status deployment/cpu-api --timeout=180s
kubectl --context kind-prod-sim -n warfare-008 get hpa
kubectl --context kind-prod-sim -n warfare-008 top pods
```

## Generate load
Launch a temporary BusyBox client inside the namespace. It sends continuous requests until interrupted:
```powershell
kubectl --context kind-prod-sim -n warfare-008 run loadgen --image=busybox:1.36 --restart=Never -- /bin/sh -c "while true; do wget -q -O /dev/null http://cpu-api/burn; done"
```
In a second terminal, observe:
```powershell
kubectl --context kind-prod-sim -n warfare-008 get hpa -w
kubectl --context kind-prod-sim -n warfare-008 top pods
kubectl --context kind-prod-sim -n warfare-008 get pods -o wide
kubectl --context kind-prod-sim -n warfare-008 describe hpa cpu-api
```
Expect CPU to rise; scaling may or may not occur depending on load, metrics availability, cluster resources and HPA timing. A single load generator may not sustain enough requests for four replicas.

## Analyze rather than guess
1. Explain the relationship between requests, limits, quota throttling and scheduling.
2. Compare CPU usage and latency before/after scaling. `kubectl top` alone **does not measure throttling**; use cgroup/Prometheus `container_cpu_cfs_throttled_periods_total` where available.
3. Inspect `kubectl describe hpa` for `FailedGetResourceMetric` or `ScalingLimited` conditions.
4. Consider whether the bottleneck is CPU, downstream latency, locks, DB pool exhaustion or insufficient node capacity.
5. Propose a production approach: resource tuning, realistic SLOs, HPA behavior policies, requests-based utilization, custom metrics when appropriate, load testing and capacity headroom.

## Staff/Principal review
- Why is CPU utilization relative to requests rather than limits?
- How do CPU throttling and OOMKilled differ?
- Why can HPA increase DB pressure while reducing per-Pod CPU?
- When would you scale on queue depth or request concurrency rather than CPU?
- What happens when the scheduler cannot place additional replicas?

## Cleanup
```powershell
kubectl --context kind-prod-sim delete namespace warfare-008
```
