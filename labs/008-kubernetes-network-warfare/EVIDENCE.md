# Mission 008 — Observed Evidence

**Date:** 24 November 2026  
**Cluster:** `kind-prod-sim`  
**Namespace:** `warfare-008`  
**CNI / observability:** Cilium 1.20.4 with Hubble  
**Status:** Complete — Service discovery, datapath connectivity, NetworkPolicy enforcement, and Hubble verdicts were exercised and observed.

This record captures the results shared during the hands-on session. It distinguishes observed behavior from interpretation; it does not claim that unshared command output was collected.

## 1. Cluster and workload baseline

The training cluster had four Ready nodes:

| Node | Role | Internal IP |
|---|---|---|
| `prod-sim-control-plane` | control-plane | `172.18.0.3` |
| `prod-sim-worker` | worker | `172.18.0.4` |
| `prod-sim-worker2` | worker | `172.18.0.5` |
| `prod-sim-worker3` | worker | `172.18.0.2` |

The `network-api` Deployment rolled out successfully with two Ready Pods:

| Pod | Node | Pod IP |
|---|---|---|
| `network-api-7c55f84dc9-7ngtj` | `prod-sim-worker2` | `10.244.3.232` |
| `network-api-7c55f84dc9-qx4ks` | `prod-sim-worker3` | `10.244.1.11` |

A Service named `network-api` was created with ClusterIP `10.96.198.43` and client-facing port `8080/TCP`.

The EndpointSlice eventually showed both backend Pod IPs and backend port `5678`.

## 2. Service, EndpointSlice, and DNS investigation

The following paths were tested from `network-client`:

- Direct Pod IP: `http://10.244.3.232:5678` — HTTP 200 and body `Mission 008 - Backend Healthy`.
- ClusterIP: `http://10.96.198.43:8080` — HTTP 200.
- Service DNS: `http://network-api:8080` — HTTP 200.

DNS lookup returned:

```text
Server: 10.96.0.10
Name:   network-api.warfare-008.svc.cluster.local
Address: 10.96.198.43
```

This established three distinct layers:

1. DNS resolved the Service name to its ClusterIP.
2. The Service selected backend endpoints through its selector and EndpointSlice.
3. The dataplane forwarded traffic from the Service port to the backend Pod port.

### Faults reproduced during the lab

- A Service selector mismatch resulted in an EndpointSlice with no endpoints and no port.
- A target-port mismatch produced an EndpointSlice with backend port `9000`; Service access on port `8080` failed with connection refused, while direct Pod-IP access to port `5678` continued to work.
- The named-port configuration was then used to align Service `targetPort: http` with the backend container's named port `http` on port `5678`.

**Lesson:** DNS resolving successfully does not prove that a Service has usable endpoints or that its backend port is correct.

## 3. NetworkPolicy experiments

Two ingress policies selected backend Pods with `app=network-api`:

### Default deny

`deny-backend-ingress` selected the backend Pods and isolated them for ingress. It contained no ingress allow rules.

### Selective allow

`allow-network-client` allowed ingress:

- From Pods selected by `app=network-client`.
- To TCP destination port `5678`.

The Service-facing port was `8080`, but policy enforcement was configured for the backend Pod's destination port `5678`.

The policies were additive: the specific allow rule provided the permitted traffic while the default-deny policy kept other ingress traffic isolated. Neither policy affected backend egress.

### Client behavior observed

| Client | Request | Observed result |
|---|---|---|
| `network-client` | `http://network-api:8080` | HTTP 200; `Mission 008 - Backend Healthy` |
| `rogue-client` | `http://network-api:8080` | Connection timed out after 5 seconds |

The DNS lookup succeeded for the rogue client as well. The failure was at network connectivity/policy enforcement, not Service-name resolution.

## 4. Cilium and Hubble health

Cilium agents were Running on all four nodes. Hubble Relay and Hubble UI were also Running.

Hubble local status checks on the two backend nodes returned:

```text
Healthcheck (via unix:///var/run/cilium/hubble.sock): Ok
Current/Max Flows: 4,095/4,095 (100.00%)
Flows/s: 28.73
```

and

```text
Healthcheck (via unix:///var/run/cilium/hubble.sock): Ok
Current/Max Flows: 4,095/4,095 (100.00%)
Flows/s: 23.60
```

The Windows host did not have the Hubble CLI installed. The CLI was successfully invoked inside the Cilium agent containers with `kubectl exec ... -- hubble`.

## 5. Hubble packet-level evidence

The most conclusive observations were captured from `cilium-9rjvm`, the Cilium agent on `prod-sim-worker`, where both client Pods were running.

### Authorized request

```text
warfare-008/network-client:44304
  -> warfare-008/network-api-7c55f84dc9-7ngtj:5678
policy-verdict:L3-L4 INGRESS ALLOWED (TCP Flags: SYN)

... to-endpoint FORWARDED
... response traffic FORWARDED
```

The observed flow shows the authorized client reaching the backend Pod on port `5678`, with an L3/L4 ingress allow verdict.

### Unauthorized request

```text
warfare-008/rogue-client:35050
  <> warfare-008/network-api-7c55f84dc9-7ngtj:5678
policy-verdict:none INGRESS DENIED (TCP Flags: SYN)

Policy denied DROPPED (TCP Flags: SYN)
```

The same denial was observed repeatedly for retransmitted SYN packets:

```text
01:04:58.674  INGRESS DENIED — Policy denied DROPPED
01:04:59.705  INGRESS DENIED — Policy denied DROPPED
01:05:00.727  INGRESS DENIED — Policy denied DROPPED
01:05:01.755  INGRESS DENIED — Policy denied DROPPED
01:05:02.779  INGRESS DENIED — Policy denied DROPPED
```

This is direct dataplane evidence that Cilium denied the rogue client's ingress traffic. It correlates with the client's five-second connection timeout.

### Why inspecting the source node mattered

The client-side observations were visible on `cilium-9rjvm` (worker). The backend agents also showed destination-side observations, including flows whose source was represented as `host`. Looking at only one backend agent or filtering only for DROPPED flows on the wrong node did not reveal the complete story.

**Operational lesson:** inspect the agents on the relevant source and destination nodes, and correlate Hubble flows with the exact test time and client identity. An empty filtered query is not proof that no packet was dropped.

## 6. Evidence-based conclusions

| Question | Conclusion |
|---|---|
| Did Service DNS resolve? | Yes; Service name resolved to `10.96.198.43`. |
| Did the backend respond directly? | Yes; Pod IP port `5678` returned HTTP 200. |
| Did the Service route when correctly configured? | Yes; ClusterIP and DNS-based requests returned HTTP 200. |
| Did the port mismatch matter? | Yes; Service access failed while direct Pod access to the listening port succeeded. |
| Did the authorized client pass policy? | Yes; Hubble reported `L3-L4 INGRESS ALLOWED`. |
| Was the rogue client's traffic denied? | Yes; Hubble reported `INGRESS DENIED` and `Policy denied DROPPED` for TCP SYN packets. |
| Was DNS the cause of the rogue-client timeout? | No; DNS resolution succeeded and Hubble showed the ingress denial. |

## 7. Reproduction commands

Run from PowerShell with the `kind-prod-sim` context:

```powershell
# Inspect the Service and EndpointSlices
kubectl --context kind-prod-sim -n warfare-008 get svc network-api
kubectl --context kind-prod-sim -n warfare-008 get endpointslices -l kubernetes.io/service-name=network-api -o wide

# Compare authorized and unauthorized traffic
kubectl --context kind-prod-sim -n warfare-008 exec network-client -- curl -v --max-time 5 http://network-api:8080
kubectl --context kind-prod-sim -n warfare-008 exec rogue-client -- curl -v --max-time 5 http://network-api:8080

# Check Cilium agents and Hubble health
kubectl --context kind-prod-sim -n kube-system get pods -l k8s-app=cilium -o wide
kubectl --context kind-prod-sim -n kube-system exec cilium-9rjvm -- hubble status

# Observe recent namespace flows on the source node
kubectl --context kind-prod-sim -n kube-system exec cilium-9rjvm -- hubble observe --since 5m --namespace warfare-008
```

## 8. Mission completion

**Mission 008 is complete for the scope practiced in this lab.** We reproduced Service selector/target-port failures, validated Service discovery and DNS, enforced default-deny ingress with a selective allow, and verified both allowed and denied traffic using Hubble packet-level evidence.

This mission did not attempt to cover every Kubernetes networking topic (for example, external Ingress/Gateway exposure, MTU/fragmentation, kube-proxy replacement comparisons, or cross-cluster networking). Those are separate investigations, not hidden prerequisites for declaring this lab complete.
