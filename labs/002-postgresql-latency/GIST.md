# Mission 002 — The Gist: PostgreSQL Latency Warfare

## Production scenario
A FastAPI `GET /orders` endpoint reads from a PostgreSQL table seeded with 500,000 orders. API latency may be dominated by query planning, connection setup, pool waiting, or overload rather than SQL execution alone.

## Architecture
`Client → FastAPI (JWT validation via Keycloak) → Psycopg → PostgreSQL`. Docker Compose includes a seeded database, application, Keycloak, and load generator.

## Failure mechanisms
- Missing composite index leads to a more expensive query plan.
- Opening a fresh PostgreSQL connection for each request adds overhead.
- A small shared connection pool can be exhausted under concurrent load.
- Simulated connection holds create checkout delays and HTTP 503 responses with `Retry-After`.

## Diagnosis and remediation
1. Use `EXPLAIN (ANALYZE, BUFFERS)` before and after the index.
2. Compare unpooled and pooled timings for the same query.
3. Generate concurrent requests and inspect response codes, p50/p95/p99, and pool checkout behavior.
4. Apply bounded admission, sensible timeouts, and backpressure; avoid simply increasing pool size without considering DB capacity.

## Engineering tradeoffs
Indexes speed targeted reads but cost write throughput and storage. Pooling reduces connection setup but caps concurrent DB work. Rejecting excess work with 503 can protect the database; it does not increase throughput.

## Evidence status
The README distinguishes prior hands-on measurements from this newly packaged standalone implementation. Do not present the standalone code as independently benchmarked or claim its numbers match earlier measurements.

## Interview answer
"Decompose API latency into query execution, connection acquisition, and queueing. Prove the bottleneck with execution plans and load tests; protect PostgreSQL with bounded concurrency."

## Reproduce
See [README.md](README.md), [docker-compose.yml](docker-compose.yml), [client/](client/), and [sql/](sql/).
