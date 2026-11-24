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
