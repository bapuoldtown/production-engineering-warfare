# Mission 007 — Worker-node failure, rescheduling and PDB limits

**Status: prepared lab; no local failure evidence recorded yet.**

## Incident statement
A three-replica HTTP service spans a local Kubernetes cluster. A worker node unexpectedly disappears. The on-call engineer must determine which Pods were on that node, when replacement Pods become Ready, whether the service has enough capacity, and why a PodDisruptionBudget (PDB) does **not** prevent an involuntary node failure.

## Learning objectives
- Distinguish `cordon`, `drain`, `docker stop`, and actual host failure.
- Observe Node `NotReady` / `Unknown`, taints, Pod termination/eviction behavior, replacement scheduling and endpoint updates.
- Explain how Deployment reconciliation differs from kubelet restart behavior.
- Understand that a PDB controls voluntary disruptions through the eviction API, not sudden hardware/network failure.
- Know that a node may take minutes to be treated as unavailable; do not promise immediate rescheduling.

## Setup
Use a disposable `kind-prod-sim` cluster. **This exercise stops one kind worker container and is disruptive to Pods on that worker.** Do not run on a production cluster. From repository root:
```powershell
kubectl --context kind-prod-sim get nodes -o wide
kubectl --context kind-prod-sim apply -f .\labs\007-node-failure-recovery\manifests\workload.yaml
kubectl --context kind-prod-sim -n warfare-007 rollout status deployment/node-survivor --timeout=180s
kubectl --context kind-prod-sim -n warfare-007 get pods -o wide
kubectl --context kind-prod-sim -n warfare-007 get pdb
```

## Failure injection (stop only one worker)
Choose a worker from the `get nodes` output that currently hosts a workload Pod. Confirm its name and that it is **not** the control-plane node.
```powershell
docker ps --filter "label=io.x-k8s.kind.cluster=prod-sim" --format "table {{.Names}}\t{{.Status}}"
```
Replace `prod-sim-worker` with the **exact** kind worker container name selected above:
```powershell
docker stop prod-sim-worker
```
This is an abrupt worker outage simulation, not a graceful drain. Node-controller detection, taints, tolerations, and Pod replacement can take several minutes; watch rather than assuming a fixed recovery time:
```powershell
kubectl --context kind-prod-sim get nodes -w
kubectl --context kind-prod-sim -n warfare-007 get pods -o wide
kubectl --context kind-prod-sim -n warfare-007 get endpointslices
kubectl --context kind-prod-sim -n warfare-007 get events --sort-by=.lastTimestamp
```
Ctrl+C exits the node watch. If the chosen worker had no mission Pods, this experiment will not demonstrate mission workload recovery: select the correct node before injection.

## Restore and investigate
```powershell
docker start prod-sim-worker
kubectl --context kind-prod-sim wait --for=condition=Ready node/prod-sim-worker --timeout=300s
kubectl --context kind-prod-sim -n warfare-007 get pods -o wide
kubectl --context kind-prod-sim -n warfare-007 get pdb
```
**Do not manually delete unknown-state Pods until you understand their ownership and the risk of duplicate writers.** For stateless Nginx this is less dangerous than for a stateful database.

## Staff/Principal review
1. Does a PDB guarantee availability during an unplanned node outage?
2. What changes when the workload is a stateful primary with a persistent volume?
3. What is the role of node taints and Pod tolerations in recovery timing?
4. How do topology spread constraints and anti-affinity affect the blast radius?
5. Why can a Service still have healthy endpoints while one worker is down?

## Evidence and cleanup
Record node transition timestamps, Pod placement before/after, service endpoints, PDB state and any capacity gap in [EVIDENCE.md](EVIDENCE.md).
```powershell
kubectl --context kind-prod-sim delete namespace warfare-007
```
