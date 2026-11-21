# Visual triage — Where is my API latency?

> **Module 001 only:** Client → Business FastAPI → Payment HTTP API. Database diagnosis belongs to Module 002. Values in examples are illustrative, not measured in the local lab.

## Incident decision tree

```mermaid
flowchart TD
  A[API p99 increased] --> B{Is Business API receiving requests?}
  B -->|No| C[Check ingress, routing and connectivity]
  B -->|Yes| D[Open a slow trace in Jaeger]
  D --> E{Where is most time spent?}
  E -->|Business processing| F[Check event-loop lag, CPU, blocking code]
  E -->|Outbound client phase| G{Does Payment receive the request?}
  G -->|No| H[Inspect HTTPX PoolTimeout, connect, DNS, TLS]
  G -->|Yes| I[Compare HTTP client and Payment server timing]
  I -->|Payment span dominates| J[Investigate Payment processing and saturation]
  I -->|Client span much longer| K[Inspect transfer, connection setup, network and instrumentation]
  D --> L{Are failures present?}
  L -->|429 or 503 from Payment| M[Check downstream overload and retry amplification]
  L -->|ReadTimeout| N[Check timeout budget and response delay]
  L -->|PoolTimeout| H
```

## How to use Jaeger (learning exercise)

1. Run [Lab 001](../001-downstream-api-latency/README.md), send a POST to `/orders`, then open http://localhost:16686.
2. Select `business-api` and **Find Traces**. Open a slow trace.
3. Expand `POST /orders`, the outbound HTTPX span (if present), and `POST /charge`.
4. Compare **start/end timestamps and durations**. A synchronous parent generally encloses its child; never add overlapping spans to calculate total time.
5. If Payment has no span, check whether the request reached it; a `PoolTimeout` can happen entirely within Business API.
6. Inspect span status and error attributes. Check logs for exact exception class and HTTP status.
7. Form one hypothesis and rerun with a controlled change.

## Triage matrix

| Evidence | Likely area | Next check | Avoid |
|---|---|---|---|
| Business span long; Payment span short | Business API | Event-loop lag, CPU, synchronous blocking, serialization | Blaming Payment |
| Payment server span long | Payment API | Processing duration, CPU, request concurrency | Blindly raising caller timeouts |
| HTTPX PoolTimeout; no Payment request | Caller connection pool | Pool utilization, in-flight requests, pool timeout | Assuming Payment returned 503 |
| HTTPX ConnectTimeout | Connect/network path | DNS, TCP, TLS, network reachability | Treating it as slow SQL |
| HTTPX ReadTimeout | Waiting for response | Payment server duration, response transfer, timeout budget | Unbounded retries |
| HTTPX span long; Payment server short | Client/network/transfer | Connection setup, payload size, instrumentation coverage | Assuming the span isolates pool wait |
| Payment returns 429/503 | Downstream rejection | Retry rate, overload, capacity | Retry storm |
| p99 high, p50 stable | Tail issue | Compare slow vs fast traces, queueing, concurrency | Optimizing only averages |

## Three self-guided scenarios

### A — Slow Payment
Business request: 3200 ms; Payment server: 2400 ms. **Question:** which service to investigate first? Answer: Payment processing and saturation, while accounting for the remaining caller/network time.

### B — Caller pool exhaustion
10 concurrent orders; Business HTTPX pool has 2 connections, pool timeout 50 ms, Payment delay 1 second. Many orders fail with Business 503 and **no matching Payment span**. **Question:** is Payment returning 503? Answer: no; Business maps its local PoolTimeout to HTTP 503.

### C — Blocking Business code
Business span: 2800 ms; Payment span: 100 ms. **Question:** what next? Answer: profile Business event-loop lag, blocking synchronous calls, CPU, and local processing.

## Before / after evidence worksheet

| Check | Before | After |
|---|---|---|
| Business API p50/p95/p99 | | |
| Payment server p50/p95/p99 | | |
| Caller PoolTimeout count | | |
| Downstream 429/503 count | | |
| Request concurrency | | |
| HTTPX pool size and pool timeout | | |
| Hypothesis supported by trace/logs? | | |

**Staff-level lesson:** tracing narrows the search space; logs, metrics, controlled experiments, and code inspection establish the cause. A missing span is an observability gap, not proof that no work occurred.
