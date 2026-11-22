# Mission 007 — Kubernetes Node Placement, Stuck Rollouts & Failure Recovery

> **Evidence status (22 Nov 2026):** The topology-spread scheduling failure has been reproduced and its root cause verified with a controlled standalone Pod. **Actual worker-node shutdown, recovery timing, PDB behavior, and final Deployment rollout verification have not been captured in this record.** Do not label those experiments complete without evidence.

## The production story

You operate a three-replica API on a local kind cluster with **one tainted control-plane node and three untainted workers**. Initially all three API Pods are Ready, one per worker. You add a seemingly safe `topologySpreadConstraints` policy to prevent concentration on a single worker. The rolling update stalls: old Pods keep serving, but a new Pod cannot schedule.

**Engineering question:** Why does a policy allowing `maxSkew: 1` reject a fourth Pod that seems to yield 2–1–1 across three workers?

## Prerequisites and safety

- Windows PowerShell; Docker Desktop; `kubectl`; `kind-prod-sim` context; three workers.
- Run from the directory containing `manifests/`. Check context before applying: `kubectl config current-context`.
- These manifests all target the **same** Deployment, not separate Deployments. Do not use them in a production cluster.
- Diagnostic Pods with `app: resilient-api` **also match the Service selector**, so they may receive requests. Do not direct important traffic to the Service during diagnostics.
- Avoid `git add .` unless `git rev-parse --show-toplevel` confirms you are inside the intended repository.

## A. Establish the baseline

```powershell
kubectl --context kind-prod-sim apply -f .\manifests\workload.yaml
kubectl --context kind-prod-sim -n warfare-007 rollout status deployment/resilient-api
kubectl --context kind-prod-sim -n warfare-007 get pods -l app=resilient-api -o wide
kubectl --context kind-prod-sim -n warfare-007 get endpointslices -l kubernetes.io/service-name=resilient-api -o yaml
kubectl --context kind-prod-sim get nodes -L kubernetes.io/hostname
```

**Observed:** three Ready Pods on three different workers. EndpointSlice `resilient-api-c2vd4` listed three ready, serving, nonterminating addresses. See [EVIDENCE.md](EVIDENCE.md).

**Concept:** `replicas: 3` is a desired count, not a node-spread guarantee. A Service discovers endpoints by labels; EndpointSlice readiness is a routing signal, not a promise that every request succeeds.

## B. Reproduce the blocked rollout

```powershell
kubectl --context kind-prod-sim apply -f .\manifests\workload-topology-spread.yaml
kubectl --context kind-prod-sim -n warfare-007 get pods -l app=resilient-api -o wide
kubectl --context kind-prod-sim -n warfare-007 describe deployment resilient-api
kubectl --context kind-prod-sim -n warfare-007 describe pod <PENDING_NEW_POD_NAME>
```

The initial policy (preserved for failure reproduction):

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: DoNotSchedule
    labelSelector:
      matchLabels:
        app: resilient-api
```

**Observed:** three old Pods remained Ready, a fourth (new ReplicaSet) Pod remained Pending. Scheduler event:

```text
0/4 nodes are available: 1 node(s) had untolerated taint(s),
3 node(s) didn't match pod topology spread constraints.
```

For `replicas: 3`, default rolling update percentages produce **maxSurge=1** (25% rounded up) and **maxUnavailable=0** (25% rounded down). The extra Pod can be created without terminating an old healthy Pod; this does not guarantee the extra Pod can be scheduled. Availability and rollout progress are different health dimensions.

## C. Root cause: default taint treatment in topology-spread calculation

The control-plane node is tainted `node-role.kubernetes.io/control-plane:NoSchedule`, and the API Pod does not tolerate it.

**Crucial distinction:** omitting `nodeTaintsPolicy` defaults to **`Ignore` for topology-spread eligibility calculations**. It does *not* disable the ordinary taint-based scheduling restriction. Therefore the tainted control-plane hostname can contribute an **empty domain** to skew calculations, even though the incoming Pod cannot land there.

```text
                    Control plane  Worker 1  Worker 2  Worker 3
Matching Pods             0           1         1         1
Try a surge Pod           0           1         2         1
Skew = 2 - 0 = 2 > maxSkew: 1  -> rejected
```

Adding `nodeTaintsPolicy: Honor` means topology-spread calculations exclude nodes with taints not tolerated by the incoming Pod:

```text
                    Control plane  Worker 1  Worker 2  Worker 3
Spread eligible?          No         Yes       Yes       Yes
After surge Pod           —           1         2         1
Skew = 2 - 1 = 1 <= maxSkew: 1 -> permitted
```

This policy **does not remove node taints, add tolerations, override capacity checks, or guarantee Pod readiness**. It only changes which nodes count as eligible domains for this spread constraint.

## D. Controlled diagnosis (observed)

We performed two independent checks **without modifying the existing Deployment**:

1. A standalone Pod using `app: resilient-api` and the original spread policy also stayed Pending with the same scheduler event. This ruled out a rollout-only explanation.
2. A Pod with an isolated selector `app: topology-isolated` scheduled on `prod-sim-worker2`. It matched zero existing API Pods.
3. A standalone Pod using `app: resilient-api` with the **same spread constraint plus `nodeTaintsPolicy: Honor`** scheduled and became Ready on `prod-sim-worker2` (IP `10.244.3.234`). This isolated the policy change and strongly verified the diagnosis.

See [EVIDENCE.md](EVIDENCE.md). These standalone diagnostics were created locally; the experiment descriptions are recorded here so readers can reproduce them.

## E. Correct the Deployment without overwriting the reproduction

Keep `workload.yaml` and `workload-topology-spread.yaml` unchanged. Apply the separate corrected variant:

```powershell
# Remove diagnostic Pods first if present:
kubectl --context kind-prod-sim -n warfare-007 delete pod topology-diagnostic topology-isolated topology-taints-honor --ignore-not-found

kubectl --context kind-prod-sim apply -f .\manifests\workload-topology-spread-fixed.yaml
kubectl --context kind-prod-sim -n warfare-007 rollout status deployment/resilient-api --timeout=120s
kubectl --context kind-prod-sim -n warfare-007 get pods -l app=resilient-api -o wide
kubectl --context kind-prod-sim -n warfare-007 get rs
kubectl --context kind-prod-sim -n warfare-007 get endpointslices -l kubernetes.io/service-name=resilient-api -o yaml
```

**Expected, not yet independently evidenced in these notes:** new ReplicaSet Pods become schedulable, old Pods terminate in a controlled rolling update, and three updated Pods become Ready. Record actual output and timings before marking this verified.

## F. Production tradeoffs and failure-mode analysis

| Mechanism | What it helps | What it does NOT guarantee |
|---|---|---|
| Deployment replicas | Desired number of Pods | Even node placement or zero downtime |
| Topology spread + `DoNotSchedule` | Enforce skew during scheduling | Capacity exists to satisfy it; rebalance running Pods |
| `nodeTaintsPolicy: Honor` | Exclude untolerated tainted nodes from skew | All eligible nodes are Ready or have enough resources |
| Readiness probe / EndpointSlice | Signal endpoints eligible for traffic | Instant removal after abrupt node failure or successful requests |
| PDB | Limit voluntary evictions via Eviction API | Prevent involuntary node failure |
| RollingUpdate `maxSurge` / `maxUnavailable` | Bound replacement concurrency and availability during rollout | Scheduler can place surge Pods |
| Node monitoring and controllers | Detect failure and eventually replace affected Pods | Instant recovery or no interruption |

**Further questions:** What if one worker disappears and the remaining two have insufficient CPU? Does `DoNotSchedule` prevent replacement? How long before the Node becomes NotReady and EndpointSlices change? Does a PDB help with a hard node shutdown? These require separate failure-injection evidence.

## G. Follow-on lab — real worker failure (NOT YET VERIFIED)

Only after the fixed Deployment rollout is verified and node health is checked:

1. Capture baseline Pod-to-node mapping, EndpointSlices, and service responsiveness.
2. Stop **one worker only** using Docker; record the start time and affected Pods. Do not stop the control plane.
3. Watch Node conditions, EndpointSlices, Deployment/ReplicaSet events, and replacement Pods over time.
4. Restore the worker and check for healthy convergence. Document any manual intervention and whether requests failed.
5. Repeat with a PDB and a **voluntary drain** to contrast Eviction API behavior with involuntary failure.

Never promise immediate rescheduling: node failure detection, taint-based eviction, capacity, and topology constraints all matter.

## Staff/Principal checkpoint

- Why did a 2–1–1 worker distribution fail when `maxSkew=1`?
- Why did the isolated-label diagnostic Pod schedule?
- How is `nodeTaintsPolicy: Honor` different from adding a toleration?
- Why can a Deployment be Available but its rollout stuck?
- What evidence distinguishes scheduling, endpoint routing, and actual request availability?
- How would you alert on a rollout that has stopped progressing while old Pods remain healthy?

**Status:** topology scheduling incident **investigated and fix verified with diagnostic Pod**. Full node-failure recovery mission **pending actual fault injection**.
