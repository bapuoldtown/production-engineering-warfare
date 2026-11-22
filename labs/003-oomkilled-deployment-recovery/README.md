# Lab 003 — Kubernetes OOMKilled Deployment Recovery

> Hands-on incident reproduction and verified recovery on a local kind Kubernetes cluster. Based on the observed PowerShell/kubectl session on **22 November 2026**.

## Learning objectives

- Reproduce a container OOM kill with an intentionally unbounded Python allocator.
- Distinguish **container restart inside the same Pod** (kubelet) from **Pod replacement during Deployment rollout** (ReplicaSet/Deployment controllers).
- Inspect Pod status, logs, restart counts and rollout behavior.
- Fix the application without simply increasing the memory limit.
- Understand why Running, Ready and actual application health are different.

## Architecture

```text
Deployment oom-warrior (replicas=1)
   └── ReplicaSet
        └── Pod
             └── Python container
                  ├── memory request: 32Mi
                  ├── memory limit:   80Mi
                  └── restartPolicy: Always
```

The lab is deliberately self-contained: no image build, registry push, or external application dependencies are required beyond Kubernetes access and pulling `python:3.12-slim`.

## Prerequisites

A functioning Kubernetes cluster with `kubectl` access; tested manually by the learner on a local kind cluster. The commands below use PowerShell. Run them **from this folder**.

Check your context first:

```powershell
kubectl config current-context
kubectl get nodes
```

**Caution:** The broken example intentionally crashes repeatedly. Use an isolated learning namespace, not a production cluster.

## Step 1 — Reproduce the failure

`broken-deployment.yaml` creates the `warfare-oom-lab` namespace and a single-replica Deployment. The Python process adds another 10 MiB of memory every 0.5 seconds. The container has an 80 MiB memory limit, so unbounded allocation will eventually trigger an OOM kill.

```powershell
kubectl apply -f .\broken-deployment.yaml
kubectl get pods -n warfare-oom-lab -w
```

Press **Ctrl+C** to exit the watch.

### Observed evidence — 22 Nov 2026

The learner captured the following transitions for the **same Pod name**:

```text
NAME                           READY   STATUS      RESTARTS  AGE
oom-warrior-5b9dd5b6d5-6q8st   1/1     Running     0         27s
oom-warrior-5b9dd5b6d5-6q8st   0/1     OOMKilled   0         29s
oom-warrior-5b9dd5b6d5-6q8st   1/1     Running     1         29s
oom-warrior-5b9dd5b6d5-6q8st   0/1     OOMKilled   1         34s
```

This confirms repeated memory-related termination and at least one restart. Since the Pod identity did not change, the restart happened **inside the same Pod**. A Deployment does not automatically create a new Pod for every container crash.

## Step 2 — Investigate

```powershell
kubectl describe pods -n warfare-oom-lab -l app=oom-warrior
kubectl logs -n warfare-oom-lab deployment/oom-warrior --previous --tail=20
kubectl get events -n warfare-oom-lab --sort-by=.lastTimestamp
```

Check the previous container's `Last State`, `Reason`, `Exit Code`, and `Restart Count`. Exit code `137` is common for an OOM kill, but **was not independently captured in the shared transcript**; don't treat it as measured evidence.

The Pod's readiness was `1/1` briefly, even while the buggy application was doomed to exhaust memory. The example has **no application-specific readiness probe**.

## Step 3 — Fix the root cause

`fixed-deployment.yaml` replaces infinite allocation with a bounded three × 10 MiB allocation and keeps the **same 80 MiB memory limit**.

```powershell
kubectl apply -f .\fixed-deployment.yaml
kubectl rollout status deployment/oom-warrior -n warfare-oom-lab --timeout=120s
kubectl get pods -n warfare-oom-lab -w
```

The Pod template changes, so the Deployment performs a rollout and creates a new ReplicaSet/Pod. Press **Ctrl+C** to exit the watch.

## Step 4 — Verify recovery

```powershell
kubectl logs -n warfare-oom-lab deployment/oom-warrior
kubectl get pods -n warfare-oom-lab
```

### Actual learner result

```text
Memory stabilized at approximately 30 MiB

NAME                           READY   STATUS    RESTARTS   AGE
oom-warrior-5fdc65584b-lsjtr   1/1     Running   0          82s
```

**Verified outcome:** The replacement Pod was Running and Ready with zero restarts over an **82-second observation window**. The application allocated approximately 30 MiB in buffers; its total process memory also includes interpreter/runtime overhead. This does not prove indefinite stability or 30 MiB total RSS.

## Staff/Principal engineering takeaways

| Topic | What this lab demonstrates | Production nuance |
| --- | --- | --- |
| OOMKilled | Container exceeded its memory limit | Alert on OOMs, working set/RSS and restart rate |
| Restart policy | Deployment Pods use `Always` | Standalone Pods can use `Never`; Jobs may still replace failed Pods |
| Kubelet vs controller | Same Pod name with increasing restarts | A Deployment rollout creates a new Pod and ReplicaSet |
| Resource limits | 80Mi memory limit stayed unchanged | Raising a limit alone does not fix unbounded growth |
| Readiness | `Running` and `1/1` observed | Without a meaningful readiness probe, Kubernetes can route traffic prematurely |
| Recovery | Bounded allocator stopped observed OOMs | Verify longer-term health under realistic traffic and memory profiles |

## Additional experiment: restartPolicy Never (optional)

A Deployment requires `restartPolicy: Always`; setting `Never` on a Deployment Pod template is rejected. A standalone Pod can instead use `Never` and will not restart a terminated container. A **Job** can still create replacement Pods even when the Pod restart policy is `Never`.

Use `kubectl apply --dry-run=server -f <file>` to validate invalid Deployment configurations without changing the live workload.

## Cleanup

```powershell
kubectl delete namespace warfare-oom-lab
```

## Next mission

**Lab 004 — Rolling Updates, Readiness Probes, EndpointSlices, Failed Rollouts and Rollback.**

This repository also contains `labs/003-postgresql-deadlocks` as a separate topic; the two `003-` directories are intentionally distinct.
