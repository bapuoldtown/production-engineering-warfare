# Mission 007 — Node Failure Recovery

**Goal:** Learn how node placement, Service endpoints, node failure detection, and eventual Pod replacement affect availability. Use a local `kind-prod-sim` cluster; do not stop any worker until the baseline and recovery plan are documented.

## Experiment A — Baseline, no placement constraints

```powershell
kubectl --context kind-prod-sim apply -f .\manifests\workload.yaml
kubectl --context kind-prod-sim -n warfare-007 rollout status deployment/resilient-api
kubectl --context kind-prod-sim -n warfare-007 get pods -o wide
kubectl --context kind-prod-sim -n warfare-007 get endpointslices -l kubernetes.io/service-name=resilient-api -o yaml
```

**What it teaches:** `replicas: 3` requests three Pods but does not guarantee one per worker. The scheduler may happen to distribute them. A Service selects matching Pods; EndpointSlices record endpoint addresses, node names, and readiness/serving/terminating conditions.

### Actual baseline evidence (22 Nov 2026)

| Pod suffix | Worker | Pod IP | Ready | Restarts |
|---|---|---|---|---|
| kzj8t | prod-sim-worker | 10.244.2.103 | 1/1 | 0 |
| m6mvj | prod-sim-worker2 | 10.244.3.146 | 1/1 | 0 |
| 77zjw | prod-sim-worker3 | 10.244.1.65 | 1/1 | 0 |

The observed EndpointSlice `resilient-api-c2vd4` listed all three addresses with `ready: true`, `serving: true`, `terminating: false`, and TCP port `5678`. This is a snapshot, not a guarantee of future placement or request success.

## Experiment B — Add topology spreading

Keep the baseline file unchanged and apply the *separate* variant:

```powershell
kubectl --context kind-prod-sim apply -f .\manifests\workload-topology-spread.yaml
kubectl --context kind-prod-sim -n warfare-007 rollout status deployment/resilient-api
kubectl --context kind-prod-sim -n warfare-007 get pods -o wide
kubectl --context kind-prod-sim -n warfare-007 describe deployment resilient-api
```

### What changed?

Only the Pod template's scheduling policy:

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: DoNotSchedule
    labelSelector:
      matchLabels:
        app: resilient-api
```

- `topologyKey`: eligible nodes are grouped by hostname (node).
- `maxSkew: 1`: the scheduler must respect the permitted difference in matching Pod counts across eligible topology domains.
- `whenUnsatisfiable: DoNotSchedule`: a Pod stays Pending if placing it would violate the spread constraint.
- `labelSelector`: only matching `app: resilient-api` Pods are counted.

**Tradeoff:** Better distribution, but placement may be blocked when topology domains or capacity are insufficient. This is **not** a hard one-Pod-per-node rule. In a two-worker cluster, a 2+1 distribution can satisfy `maxSkew: 1`. Strict required pod anti-affinity is a different policy and has different availability/capacity tradeoffs.

**Rolling update caveat:** The Deployment has a default rolling strategy. For three replicas, rounding means maxSurge=1 and maxUnavailable=0. During replacement, temporary extra Pods may affect placement and a new Pod may be Pending if scheduling constraints cannot be satisfied. The policy applies to *new scheduling*; it does not automatically move already-running Pods.

## Experiment C — PodDisruptionBudget (coming next)

A PDB constrains certain **voluntary evictions**, such as a drain using the eviction API. It does **not** prevent physical node failure or guarantee immediate replacement. We will introduce it only after comparing Experiment A and B.

## Staff-engineer questions

1. Does a healthy EndpointSlice guarantee that every request succeeds?
2. Can `replicas: 3` alone enforce one Pod per worker?
3. How does `DoNotSchedule` trade availability for placement safety?
4. Why can't a PDB save a Pod when its worker disappears?

## Evidence discipline

Do not invent output. Add post-change observations and timings to `EVIDENCE.md` only after running the experiment. Keep baseline and variants separate for reproducibility.
