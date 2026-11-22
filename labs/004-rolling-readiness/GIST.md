# Mission 004 — The Gist: Rolling Updates and Readiness

## Production scenario
Deploy V2 while keeping V1 available. A misconfigured readiness probe checks port **9999**, but the Python HTTP server listens on **8080**.

## Architecture
`Deployment (replicas=3) → ReplicaSets → Pods → Service/EndpointSlices`. Kubelet probes `GET /ready` on the configured Pod port. The app returns 503 during its first five seconds, then 200.

## Actual evidence — 22 Nov 2026
- Three V1 Pods reported `Running 1/1`, zero restarts.
- Application logs showed `GET /ready` HTTP 200 every two seconds.
- After the broken V2 template, **three V1 Pods remained Ready** while one V2 Pod was `Running 0/1`, with zero restarts.
- After correcting the probe to port 8080, `kubectl rollout status` reported `deployment "rollout-api" successfully rolled out`.
- Final ReplicaSet listing and continuous client traffic success were **not** captured; do not claim zero dropped requests was measured.

## Availability math (3 desired replicas)
| Setting | Maximum non-terminating Pods | Minimum available replicas |
| --- | ---: | ---: |
| `maxSurge: 1`, `maxUnavailable: 0` | 4 | 3 |
| `maxSurge: 1`, `maxUnavailable: 1` | 4 | 2 |

These are limits, not an exact step-by-step rollout order. Terminating Pods can temporarily raise the visible total.

## Root cause and recovery
Readiness probe connection failure on 9999 kept V2 out of normal Service traffic without restarting it. Correcting the Pod template to use 8080 allowed the Deployment to progress. The experiment changed probe configuration, not the application's response version.

## Engineering tradeoffs
- `maxUnavailable: 0` preserves the three-replica availability budget, assuming existing Pods remain healthy and there is enough capacity for surge.
- `maxUnavailable: 1` permits a temporary reduction to two available replicas and possible overload under high traffic.
- Readiness failure does not cause restarts; liveness failures may.
- `ProgressDeadlineExceeded` does not automatically roll back the Deployment.
- `minReadySeconds: 0` means a Ready Pod can count as Available immediately.

## Interview answer
"With maxSurge 1 and maxUnavailable 0, Kubernetes may create one extra Pod but must preserve three available replicas during a rolling update. A broken V2 readiness probe stalls replacement without requiring V1 to be taken offline."

## Reproduce
See [README.md](README.md), [deployment-v1.yaml](deployment-v1.yaml), and [v2-broken-patch.json](v2-broken-patch.json).
