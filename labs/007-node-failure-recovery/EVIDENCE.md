# Mission 007 — Observed evidence (22 Nov 2026)

This document separates observed results from expectations. All commands targeted context `kind-prod-sim`, namespace `warfare-007`, unless specified.

## Baseline

- `resilient-api-64d59b4b59-kzj8t`: Ready 1/1, `prod-sim-worker`, IP `10.244.2.103`.
- `resilient-api-64d59b4b59-m6mvj`: Ready 1/1, `prod-sim-worker2`, IP `10.244.3.146`.
- `resilient-api-64d59b4b59-77zjw`: Ready 1/1, `prod-sim-worker3`, IP `10.244.1.65`.
- EndpointSlice `resilient-api-c2vd4`: three endpoints, `ready=true`, `serving=true`, `terminating=false`; port 5678.

## Failed rolling update

Applied `manifests/workload-topology-spread.yaml`.

```text
Old ReplicaSet: resilient-api-64d59b4b59   3 Ready
New ReplicaSet: resilient-api-6556596f9   0 Ready
New Pod:        resilient-api-6556596f9-jttnc   Pending, unscheduled
Deployment:     3 desired, 1 updated, 4 total, 3 available
```

```text
Warning FailedScheduling:
0/4 nodes are available: 1 node(s) had untolerated taint(s),
3 node(s) didn't match pod topology spread constraints.
preemption: 0/4 nodes are available: 1 Preemption is not helpful for scheduling,
3 No preemption victims found for incoming pod.
```

- Node hostname labels were unique across the four nodes.
- Three workers were Ready, untainted, with low reported resource requests.
- Control plane had `node-role.kubernetes.io/control-plane:NoSchedule`.
- Scheduler manifest used `registry.k8s.io/kube-scheduler:v1.37.0`, with no explicit `--config` or feature-gate flags.
- `kube-scheduler` ConfigMap was NotFound; this is not proof of a scheduler outage.

## Standalone diagnostics

| Pod | Selector | Taints policy | Observed result |
|---|---|---|---|
| `topology-diagnostic` | `app=resilient-api` | omitted (Ignore) | Pending, same FailedScheduling event |
| `topology-isolated` | `app=topology-isolated` | omitted (Ignore) | Running, `prod-sim-worker2`, IP `10.244.3.40` |
| `topology-taints-honor` | `app=resilient-api` | Honor | Running, `prod-sim-worker2`, IP `10.244.3.234` |

The `Honor` test retained the original matching label and topology constraint, changing the taint participation policy. This supports the tainted-empty-domain diagnosis.

## Pending verification

- Fixed Deployment rollout command output and final updated/available replica counts.
- Diagnostic Pod cleanup confirmation.
- Actual worker failure and restoration.
- Node detection, eviction, EndpointSlice transition, request failure/recovery timing.
- PDB voluntary eviction contrast.

Do not invent those outputs. Append timestamps and commands when actually run.
