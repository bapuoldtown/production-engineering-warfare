# Mission 008 — Kubernetes Network Warfare

**Status: COMPLETE — 24 November 2026**

## Production problem

A backend can be healthy and its Pods can be Ready while clients still cannot reach it. DNS, Service selection, EndpointSlices, port translation, packet routing, and NetworkPolicy enforcement are separate stages. This lab deliberately breaks and investigates those stages using a local four-node kind cluster with Cilium and Hubble.

## Learning objectives

By completing this lab, you will be able to:

- Trace a request from a client Pod through Service DNS, ClusterIP, EndpointSlice, and backend Pod port.
- Distinguish DNS resolution from endpoint discovery and packet forwarding.
- Diagnose a Service selector mismatch and a wrong `targetPort`.
- Understand numeric and named Service target ports.
- Explain why a NetworkPolicy selects Pods and evaluates traffic at the backend Pod port, not the client-facing Service port.
- Apply default-deny ingress and selectively allow a client workload.
- Understand additive NetworkPolicy composition.
- Use Cilium and Hubble to correlate an application timeout with an actual dataplane policy verdict.

## Lab environment

- Kubernetes context: `kind-prod-sim`
- Namespace: `warfare-008`
- CNI: Cilium 1.20.4
- Observability: Hubble, Hubble Relay, Hubble UI
- Backend Deployment: `network-api`, two replicas
- Service: `network-api`, ClusterIP `10.96.198.43`, port `8080`
- Backend listener: TCP `5678`
- Test clients: `network-client` (authorized) and `rogue-client` (unauthorized)

## Investigation sequence

### 1. Establish backend connectivity

Deploy the backend and verify the Pods are Ready on separate workers. Test the Pod IP directly on port 5678.

### 2. Introduce Service discovery

Create a ClusterIP Service on port 8080. Inspect the EndpointSlice and compare:
- Direct Pod IP access.
- ClusterIP access.
- DNS name access using `network-api`.

### 3. Break and diagnose Service routing

Two configuration mistakes were investigated:
- A Service selector mismatch, producing an EndpointSlice with no endpoints.
- A target-port mismatch, producing an EndpointSlice on port 9000 while the backend listened on 5678.

The named-port configuration aligned Service `targetPort: http` with the container's named port `http` on 5678.

### 4. Introduce NetworkPolicy

Apply ingress default-deny to the backend Pods. Add a specific ingress allow for Pods selected by `app=network-client` on TCP port 5678.

The client-facing Service port is 8080; the policy destination port is the backend Pod port 5678.

### 5. Compare authorized and unauthorized clients

Expected and observed behavior:
- `network-client` reaches the Service and receives HTTP 200.
- `rogue-client` resolves the Service name but its TCP connection times out.

### 6. Prove the dataplane verdict with Hubble

Hubble was run inside the Cilium agent container; no Windows CLI installation was needed.

The source-node agent showed:
- Authorized flow: `policy-verdict:L3-L4 INGRESS ALLOWED`, followed by `FORWARDED`.
- Unauthorized flow: `policy-verdict:none INGRESS DENIED`, followed by `Policy denied DROPPED` for TCP SYN packets.

See [EVIDENCE.md](EVIDENCE.md) for the observed output and interpretation.

## Architecture at a glance

```text
network-client (authorized) ─┐
                             ├─> Service DNS / ClusterIP :8080
rogue-client (unauthorized) ─┘             |
                                           v
                                   EndpointSlice
                                           |
                                           v
                              backend Pod :5678
                                           ^
                                           |
                            Cilium NetworkPolicy
                                           |
                              Hubble flow evidence
```

## Key production lessons

1. DNS success proves name resolution, not backend reachability.
2. A Service with no matching EndpointSlice endpoints cannot route to the intended Pods.
3. A wrong `targetPort` can make Service access fail while direct Pod-IP access still succeeds.
4. NetworkPolicy ingress rules apply to selected destination Pods and their destination ports.
5. Standard Kubernetes NetworkPolicies are additive: a specific allow rule permits matching traffic; it does not cancel the isolation of unrelated traffic.
6. A client timeout is a symptom. Hubble's `INGRESS DENIED` and `Policy denied DROPPED` records provide dataplane evidence.
7. Inspect the Cilium agents on the relevant nodes. A filtered query on one node returning no results does not prove no drop occurred elsewhere.
8. Cilium enforces policy; Hubble observes and reports flows.

## Completion checklist

- [x] Backend Deployment healthy on two workers
- [x] Pod-IP connectivity verified
- [x] ClusterIP connectivity verified
- [x] Service DNS resolution verified
- [x] EndpointSlice behavior inspected
- [x] Service selector mismatch investigated
- [x] targetPort mismatch reproduced and diagnosed
- [x] Named targetPort used to align Service and container port
- [x] Default-deny ingress applied
- [x] Selective client allow rule applied
- [x] Additive policy behavior investigated
- [x] Port-specific policy behavior verified
- [x] Authorized and unauthorized client behavior compared
- [x] Cilium agent and Hubble health checked
- [x] Hubble allowed verdict captured
- [x] Hubble denied/dropped SYN evidence captured

**Mission status: COMPLETE.** This status applies to the learning objectives and experiments listed above; it does not claim to cover every Kubernetes networking feature.

## Interview checkpoint

A Pod can resolve a Service name, the Service can exist, and the backend can be healthy while the TCP connection still times out. Explain how you would use EndpointSlices, NetworkPolicy inspection, client-side tests, and Hubble verdicts to isolate the failing layer.


## Manifests — what each file teaches

All runnable YAML is under [`manifests/`](manifests/). Read the files before applying them; the names intentionally describe the experiment.

| File | Resource | Why it exists |
|---|---|---|
| [01-backend.yaml](manifests/01-backend.yaml) | Deployment | Two backend replicas, label `app=network-api`, listener named `http` on TCP 5678 |
| [02-service.yaml](manifests/02-service.yaml) | Service | Final working ClusterIP Service: port 8080 → named target port `http` (5678) |
| [03-network-client.yaml](manifests/03-network-client.yaml) | Pod | Authorized test client, label `app=network-client` |
| [04-rogue-client.yaml](manifests/04-rogue-client.yaml) | Pod | Unauthorized test client, label `app=rogue-client` |
| [05-deny-backend-ingress.yaml](manifests/05-deny-backend-ingress.yaml) | NetworkPolicy | Selects backend Pods and isolates their ingress |
| [06-allow-network-client.yaml](manifests/06-allow-network-client.yaml) | NetworkPolicy | Adds one narrow allow: trusted client label → backend TCP 5678 |
| [fault-injection/01-service-wrong-selector.yaml](manifests/fault-injection/01-service-wrong-selector.yaml) | Service | Deliberately selects a label no backend has |
| [fault-injection/02-service-wrong-targetport.yaml](manifests/fault-injection/02-service-wrong-targetport.yaml) | Service | Deliberately forwards to port 9000, where the backend is not listening |

### Read the labels as contracts

The backend Deployment template labels every Pod with:

```yaml
labels:
  app: network-api
```

The Service selector uses that same label to discover backends. Both NetworkPolicies also select the same destination label. If one character differs, Kubernetes does not guess your intent.

The authorized client has `app: network-client`; the rogue client has `app: rogue-client`. The allow policy matches only the first label. Labels are not cryptographic identity: in a real cluster, restrict who can create or mutate Pods and labels in the namespace (RBAC/admission controls), or a user could attempt to impersonate the allowed label.

### Understand the two port numbers

```text
Client
  |
  | http://network-api:8080
  v
Service port: 8080
  |
  | targetPort: http
  v
Backend container port named "http": 5678
  |
  v
http-echo process listens on :5678
```

- `port: 8080` is the port clients use on the Service.
- `targetPort: http` resolves to the container port named `http`.
- The container's `containerPort: 5678` documents the port and provides the name mapping; the process itself is configured to listen on `:5678`.
- The NetworkPolicy destination port is **5678**, because it governs traffic arriving at the selected backend Pod, not the Service's virtual port 8080.

### Guided execution — PowerShell

Run from the Mission 008 directory. These commands target only the local training namespace.

**Step 0 — confirm the target**

```powershell
kubectl --context kind-prod-sim config current-context
kubectl --context kind-prod-sim get namespace warfare-008
```

**Step 1 — deploy the backend**

```powershell
kubectl --context kind-prod-sim apply -f .\manifests\01-backend.yaml
kubectl --context kind-prod-sim -n warfare-008 rollout status deployment/network-api
kubectl --context kind-prod-sim -n warfare-008 get pods -l app=network-api -o wide
```

Expected: two Ready backend Pods. Note their Pod IPs and worker nodes.

**Step 2 — create the Service and inspect endpoint discovery**

```powershell
kubectl --context kind-prod-sim apply -f .\manifests\02-service.yaml
kubectl --context kind-prod-sim -n warfare-008 get svc network-api
kubectl --context kind-prod-sim -n warfare-008 get endpointslices -l kubernetes.io/service-name=network-api -o wide
```

Expected: Service port 8080 and EndpointSlice backend port 5678 with two Pod IPs.

**Step 3 — deliberately break the Service selector**

```powershell
kubectl --context kind-prod-sim apply -f .\manifests\fault-injection\01-service-wrong-selector.yaml
kubectl --context kind-prod-sim -n warfare-008 get endpointslices -l kubernetes.io/service-name=network-api -o wide
```

Observe the empty endpoints. Ask yourself: did DNS stop working, or did the Service stop finding matching Pods? Restore the Service before the next experiment:

```powershell
kubectl --context kind-prod-sim apply -f .\manifests\02-service.yaml
```

**Step 4 — deliberately break targetPort**

```powershell
kubectl --context kind-prod-sim apply -f .\manifests\fault-injection\02-service-wrong-targetport.yaml
kubectl --context kind-prod-sim -n warfare-008 get endpointslices -l kubernetes.io/service-name=network-api -o wide
```

The endpoints still exist, but their port is 9000. Direct Pod-IP access to port 5678 can still work while Service access fails. Restore the named-port Service:

```powershell
kubectl --context kind-prod-sim apply -f .\manifests\02-service.yaml
```

**Step 5 — deploy both test clients**

```powershell
kubectl --context kind-prod-sim apply -f .\manifests\03-network-client.yaml
kubectl --context kind-prod-sim apply -f .\manifests\04-rogue-client.yaml
kubectl --context kind-prod-sim -n warfare-008 get pods -o wide
```

Both clients use netshoot so that `curl`, `nslookup`, and network troubleshooting tools are available. They are pinned to `prod-sim-worker` to make the source-node Hubble investigation easier to reproduce in this lab.

**Step 6 — prove DNS is only name resolution**

```powershell
kubectl --context kind-prod-sim -n warfare-008 exec network-client -- nslookup network-api
kubectl --context kind-prod-sim -n warfare-008 exec network-client -- curl -v --max-time 5 http://network-api:8080
```

The name should resolve to the Service ClusterIP. Before applying policies, both clients should be able to reach the backend.

**Step 7 — isolate backend ingress**

```powershell
kubectl --context kind-prod-sim apply -f .\manifests\05-deny-backend-ingress.yaml
kubectl --context kind-prod-sim -n warfare-008 describe networkpolicy deny-backend-ingress
```

Now ingress to the selected backend Pods is isolated. The policy does not block DNS egress from the clients.

**Step 8 — add the narrow allow rule**

```powershell
kubectl --context kind-prod-sim apply -f .\manifests\06-allow-network-client.yaml
kubectl --context kind-prod-sim -n warfare-008 describe networkpolicy allow-network-client
```

Kubernetes NetworkPolicies are additive. The effective allowed ingress is the union of the allow rules across all policies selecting a Pod. The empty default-deny policy contributes no allow rule; the second policy contributes the one trusted-client-to-port-5678 rule. Unmatched ingress remains denied.

**Step 9 — test both identities**

```powershell
kubectl --context kind-prod-sim -n warfare-008 exec network-client -- curl -v --max-time 5 http://network-api:8080
kubectl --context kind-prod-sim -n warfare-008 exec rogue-client -- curl -v --max-time 5 http://network-api:8080
```

Observed in this run: authorized client returned HTTP 200; rogue client timed out. The rogue client's DNS lookup still succeeded — the packet was denied after name resolution.

**Step 10 — inspect Cilium/Hubble evidence**

Find the Cilium agent on the source node (in this lab, `prod-sim-worker`):

```powershell
kubectl --context kind-prod-sim -n kube-system get pods -l k8s-app=cilium -o wide
kubectl --context kind-prod-sim -n kube-system exec cilium-9rjvm -- hubble status
kubectl --context kind-prod-sim -n kube-system exec cilium-9rjvm -- hubble observe --since 5m --namespace warfare-008
```

The agent name `cilium-9rjvm` is the observed Pod name from this lab session; if it changes after a cluster rebuild, identify the Cilium Pod whose NODE column is `prod-sim-worker` and substitute its name. Look for `INGRESS ALLOWED` and `FORWARDED` for the authorized request, and `INGRESS DENIED` / `Policy denied DROPPED` for the rogue client's TCP SYN.

### Clean up the lab namespace

When finished, remove only the dedicated Mission 008 namespace:

```powershell
kubectl --context kind-prod-sim delete namespace warfare-008
```

This deletes the Mission 008 workloads, Service, and policies. Do not run it if you still need the lab running.

### Troubleshooting questions — answer before reading the evidence

1. If `nslookup network-api` succeeds but `curl` fails, what does DNS prove — and what does it not prove?
2. If EndpointSlice has no addresses, which selector would you inspect first?
3. If EndpointSlice shows port 9000 but the process listens on 5678, which Service field is wrong?
4. Why does the allow NetworkPolicy use port 5678 rather than 8080?
5. Why can both clients resolve DNS while only one can establish a TCP connection?
6. If Hubble returns no DROPPED events on one agent, can you conclude that no packet was dropped? Why not?

Answers should be reasoned from the YAML and observed flows, not memorized.
