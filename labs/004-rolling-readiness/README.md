# Lab 004 — Rolling Updates, Readiness and Availability Budget

> Local kind cluster lab using PowerShell. **V1 readiness, broken V2 readiness, and successful corrected rollout are verified from actual kubectl output. A rollback was not performed; the rollback section is a reference procedure.**

## Objective

Understand how kubelet probes an application, how Service EndpointSlices reflect readiness, and how `maxSurge` / `maxUnavailable` control availability during a broken rollout.

## V1: verified observation (22 November 2026)

The learner deployed three `rollout-api` Pods in namespace `warfare-rollout-lab`:

```text
NAME                           READY   STATUS    RESTARTS   AGE
rollout-api-6c7c457f4b-2f4qq   1/1     Running   0          91s
rollout-api-6c7c457f4b-7qhzs   1/1     Running   0          91s
rollout-api-6c7c457f4b-vmxhw   1/1     Running   0          91s
```

Logs for `rollout-api-6c7c457f4b-2f4qq` showed repeated `GET /ready HTTP/1.1` **200** responses at two-second intervals, e.g.:

```text
10.244.3.235 - - [22/Nov/2026 08:12:19] "GET /ready HTTP/1.1" 200 -
10.244.3.235 - - [22/Nov/2026 08:12:21] "GET /ready HTTP/1.1" 200 -
10.244.3.235 - - [22/Nov/2026 08:12:23] "GET /ready HTTP/1.1" 200 -
```

**Interpretation:** Kubelet uses the configured HTTP readiness probe to request `/ready` on the Pod's IP and port 8080. The app returns 503 during its first five seconds, then 200. A successful readiness probe updates the Pod Ready condition, and the EndpointSlice controller reflects eligible Service endpoints. A readiness failure **does not** restart the container; a liveness failure can.

## Step 1 — Deploy V1

From this directory, with your intended kind context selected:

```powershell
kubectl config current-context
kubectl apply -f .\deployment-v1.yaml
kubectl rollout status deployment/rollout-api -n warfare-rollout-lab
kubectl get pods -n warfare-rollout-lab -o wide
kubectl get endpointslice -n warfare-rollout-lab -l kubernetes.io/service-name=rollout-api -o yaml
kubectl logs -n warfare-rollout-lab deployment/rollout-api --tail=15
```

The manifest creates its own namespace and a ClusterIP Service. A newly started Pod may be `Running 0/1` until `/ready` succeeds.

## Rollout strategy: three desired replicas

| Strategy | Maximum non-terminating Pods (desired + surge) | Minimum available Pods (desired - unavailable) |
| --- | ---: | ---: |
| maxSurge=1, maxUnavailable=0 | 4 | 3 |
| maxSurge=1, maxUnavailable=1 | 4 | 2 |

**Crucial nuance:** These are **bounds, not an exact sequence**. With `maxUnavailable: 1`, Kubernetes is allowed to reduce available V1 Pods to two while the new V2 Pod is still `Running 0/1`. It is not guaranteed to do so at a specific moment. Terminating Pods may temporarily make the observed total exceed the simple surge count.

Possible stalled state with `maxSurge: 1`, `maxUnavailable: 1`:

```text
V1 Pod A  Running  Ready      (serves traffic)
V1 Pod B  Running  Ready      (serves traffic)
V2 Pod C  Running  Not Ready  (excluded from normal Service endpoints)
```

With `maxUnavailable: 0`, the Deployment should retain three available old replicas while the new Pod is not ready, assuming those old replicas remain healthy.

### Capacity thought experiment

If each healthy Pod can sustainably serve 500 requests/sec, three Pods provide a nominal 1500 requests/sec. Dropping to two healthy Pods leaves 1000 requests/sec. At 1400 requests/sec demand, a rollout can overload the remaining Pods **even while Kubernetes respects the declared strategy**. These are illustrative capacities, not measured lab throughput.

## Step 2 — Break V2 readiness (executed and observed)

**Important:** The Python server returns HTTP 200 for arbitrary paths other than `/ready`. Changing the probe to `/never-ready` would **not** break this particular app! Instead, the supplied patch targets port **9999** while the server listens on **8080**.

```powershell
kubectl patch deployment rollout-api -n warfare-rollout-lab --type=strategic --patch-file .\v2-broken-patch.json
kubectl get pods -n warfare-rollout-lab -w
```

Press Ctrl+C to stop watching. Expect the new Pod to run but fail readiness. Its readiness failure should not cause container restarts.

```powershell
kubectl get deployment rollout-api -n warfare-rollout-lab
kubectl describe deployment rollout-api -n warfare-rollout-lab
kubectl get pods -n warfare-rollout-lab -o wide
kubectl get events -n warfare-rollout-lab --sort-by=.lastTimestamp
kubectl get endpointslice -n warfare-rollout-lab -l kubernetes.io/service-name=rollout-api -o yaml
```

After the 60-second progress deadline, `kubectl rollout status` may report `ProgressDeadlineExceeded`; Kubernetes does **not** automatically roll back. Avoid running `kubectl rollout status` without a timeout if waiting interactively.

## Step 3 — Optional rollback procedure (not executed)

```powershell
kubectl rollout undo deployment/rollout-api -n warfare-rollout-lab
kubectl rollout status deployment/rollout-api -n warfare-rollout-lab --timeout=120s
kubectl get pods -n warfare-rollout-lab
```

Validate three healthy replicas, EndpointSlice readiness, zero unexpected restarts, and successful application requests. Restore `maxUnavailable: 0` if you want the original strategy after the experiment; `rollout undo` restores the Pod template revision, not necessarily separately patched Deployment strategy fields.

## Interview takeaways

- **Running != Ready**: readiness controls Service endpoint eligibility.
- **Readiness != liveness**: failed readiness alone does not restart a container.
- **maxSurge** is the additional Pod budget during rolling update.
- **maxUnavailable** is the allowed unavailable replica budget.
- **maxUnavailable=1** can sacrifice one healthy old Pod before V2 is ready.
- **ProgressDeadlineExceeded** signals stalled rollout; it is not an automatic rollback.
- An SLO-driven strategy needs sufficient spare node capacity, healthy backends, graceful termination, and realistic load testing.

## Cleanup

```powershell
kubectl delete namespace warfare-rollout-lab
```

## Verified V2 experiment and recovery (22 November 2026)

The learner observed **three V1 Pods Ready** with **zero restarts** and **one broken V2 Pod Running but 0/1 Ready**, also with zero restarts. The broken probe pointed to port 9999, while the Python application listened on port 8080:

```text
rollout-api-6c7c457f4b-2f4qq   1/1 Running 0
rollout-api-6c7c457f4b-7qhzs   1/1 Running 0
rollout-api-6c7c457f4b-vmxhw   1/1 Running 0
rollout-api-b5f4f656c-9gmtr    0/1 Running 0
```

After the learner corrected the readiness probe to port **8080** and applied a new Pod template, the actual command `kubectl rollout status deployment/rollout-api -n warfare-rollout-lab --timeout=120s` progressed through one and then two updated replicas, reported one old replica pending termination, and ended with:

```text
deployment "rollout-api" successfully rolled out
```

**What this verifies:** The original V1 Pods stayed Ready during the observed broken V2 state. After correcting readiness, Kubernetes reported successful rollout of the updated Deployment. A final `kubectl get pods` / ReplicaSet snapshot and end-to-end application HTTP traffic check were not yet supplied, so do not claim they were measured. The new template changes probe/annotation, not the HTTP application response body; this is a rollout-mechanics lab rather than proof of a new application version.

**Interview checkpoint:** `maxUnavailable: 0` means the controller must preserve three **available application replicas** during the rollout, not that all Kubernetes nodes or every Pod must be Ready. With `minReadySeconds: 0` (default), a Ready Pod counts as Available immediately. This availability budget does not guarantee uninterrupted end-user requests in every possible failure mode.
