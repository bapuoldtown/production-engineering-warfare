# Mission 001 — The Gist: Downstream API Latency

## Production scenario
A FastAPI Business API handles `POST /orders` and calls a Payment API's `POST /charge`. End-user latency can originate in the downstream service or in the caller's HTTP connection pool.

## Architecture
`Client → Business API (:8000) → Payment API (:8001)`; both services export OpenTelemetry traces through an OTel Collector to Jaeger.

## Failure mechanisms
- Artificial payment delay increases downstream service time.
- Business API's HTTPX pool is limited to two connections, with a 50 ms pool-acquisition timeout.
- Under contention, callers may fail with a `PoolTimeout` (mapped to HTTP 503) even if the downstream service is otherwise responsive.
- Distinguish pool waiting, network/request timeouts, and downstream HTTP errors (mapped to 502/504 as appropriate).

## Diagnostic approach
1. Generate requests and inspect a trace in Jaeger.
2. Identify the slow span and distinguish downstream execution time from client-side waiting.
3. Vary downstream delay and concurrent requests; compare results.
4. Measure before tuning HTTP pool limits or adding capacity.

## Engineering tradeoffs
Increasing connections can increase load on the dependency. Smaller pools protect dependencies but create queueing and admission pressure. Set separate pool/connect/read/write timeouts and control concurrency deliberately.

## Evidence status
The README provides reproducible setup and experiments. This gist does **not** claim a measured run or particular p95/p99 values without captured results.

## Interview answer
"Trace the request end to end. Separate downstream latency from connection-pool contention; choose timeouts, concurrency limits, and dependency protection based on measured bottlenecks."

## Reproduce
See [README.md](README.md) and [VISUAL-TRIAGE.md](VISUAL-TRIAGE.md).
