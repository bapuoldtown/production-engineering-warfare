# Mission 003 — The Gist: Kubernetes OOMKilled Recovery

## Production scenario
A Python container in a Deployment repeatedly exceeds its 80 MiB memory limit because it allocates another 10 MiB every 0.5 seconds.

## Architecture
`Deployment (1 replica) → ReplicaSet → Pod → Python container`. The container requests 32 MiB, has an 80 MiB limit, and uses the Deployment-required `restartPolicy: Always`.

## Actual evidence — 22 Nov 2026
- The **same Pod name** transitioned from Running to OOMKilled and restarted (restart count rose from 0 to 1).
- The fix replaced unbounded allocation with a bounded ~30 MiB buffer allocation **without increasing the 80 MiB limit**.
- Replacement Pod `oom-warrior-5fdc65584b-lsjtr` was `Running 1/1`, with zero restarts over an observed **82-second window**.
- The 30 MiB figure describes allocated buffers, not total Python process RSS.

## Root cause and recovery
An application memory growth bug exceeded the cgroup memory limit. Kubelet restarted the failed container **inside the same Pod**. Applying a changed Pod template caused the Deployment to create a replacement via a new ReplicaSet.

## Engineering tradeoffs
- Increasing memory limits may mask leaks and increase node pressure.
- A `Running` or `Ready` Pod is not proof of sustained health.
- Watch restart rate, OOM termination reasons, memory working set, and real application readiness.
- An 82-second observation does not prove long-term stability.

## Interview answer
"OOMKilled is a container termination reason. Kubelet restarts the container within an existing Deployment Pod; ReplicaSet creates a replacement Pod when the Pod itself must be replaced. Fix unbounded memory use before raising limits."

## Reproduce
See [README.md](README.md), [broken-deployment.yaml](broken-deployment.yaml), and [fixed-deployment.yaml](fixed-deployment.yaml).
