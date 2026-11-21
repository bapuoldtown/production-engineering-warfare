# Lab 001 — See API latency in Jaeger (Windows PowerShell + Docker)

**Goal:** learn by doing. Run two small FastAPI services, trace one request, deliberately slow the payment service, and prove where latency came from. **No database in this lab.**

## What you will build

```text
POST /orders                   POST /charge
Client ──────► Business API ──────────► Payment API
                 :8000                    :8001
                    │                         │
                    └──── OpenTelemetry ──────┘
                              │ OTLP/HTTP :14318
                         OTel Collector
                              │ OTLP/gRPC
                            Jaeger UI :16686
```

## 0. Prerequisites

Windows PowerShell, Docker Desktop, Python 3.11+, and `uv`. Run commands from a fresh working directory. Ports 8000, 8001, 14318, and 16686 must be free.

```powershell
mkdir api-latency-lab
cd api-latency-lab
uv init --bare
uv add fastapi uvicorn httpx opentelemetry-api opentelemetry-sdk opentelemetry-instrumentation-fastapi opentelemetry-instrumentation-httpx opentelemetry-exporter-otlp-proto-http
```

## 1. Start tracing infrastructure

Create `otel-collector.yaml` in the lab folder:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
processors:
  batch: {}
exporters:
  otlp/jaeger:
    endpoint: mbr-jaeger:4317
    tls:
      insecure: true
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/jaeger]
```

In PowerShell:

```powershell
docker network create mbr-observability
docker run -d --name mbr-jaeger --network mbr-observability -p 16686:16686 -p 14317:4317 jaegertracing/all-in-one:1.65
docker run -d --name mbr-otel-collector --network mbr-observability -p 14318:4318 -v "${PWD}/otel-collector.yaml:/etc/otelcol-contrib/config.yaml:ro" otel/opentelemetry-collector-contrib:0.123.0 --config=/etc/otelcol-contrib/config.yaml
docker logs mbr-otel-collector --tail 15
Test-NetConnection 127.0.0.1 -Port 14318
```

**Expected:** collector reports it is ready; TCP test is true. Visit http://localhost:16686. Initially the service dropdown may show only Jaeger; this is normal until we generate traces.

**Existing lab containers?** Reuse them instead of running duplicate `docker run` commands: `docker ps -a --filter name=mbr-`. This lab's collector config assumes Jaeger exposes OTLP/gRPC on port 4317 inside the Docker network. If your Jaeger image/version differs, verify its OTLP receiver configuration.

## 2. Create the shared tracer

Create `tracing.py`:

```python
import os
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

def configure_tracing(service_name: str):
    provider = TracerProvider(resource=Resource.create({
        "service.name": service_name,
        "deployment.environment.name": "local-lab",
    }))
    exporter = OTLPSpanExporter(endpoint=os.getenv(
        "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
        "http://127.0.0.1:14318/v1/traces",
    ))
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    return provider
```

## 3. Create the Payment API

Create `payment_service.py`:

```python
import asyncio
import os
from fastapi import FastAPI
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from tracing import configure_tracing

configure_tracing("payment-api")
app = FastAPI()
FastAPIInstrumentor.instrument_app(app)

@app.post("/charge")
async def charge():
    await asyncio.sleep(float(os.getenv("PAYMENT_DELAY", "0.1")))
    return {"charged": True}
```

## 4. Create the Business API

Create `business_service.py`:

```python
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, HTTPException, Request
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from tracing import configure_tracing

configure_tracing("business-api")
HTTPXClientInstrumentor().instrument()

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.payment_client = httpx.AsyncClient(
        base_url="http://127.0.0.1:8001",
        limits=httpx.Limits(max_connections=2),
        timeout=httpx.Timeout(10.0, pool=0.05),
    )
    yield
    await app.state.payment_client.aclose()

app = FastAPI(lifespan=lifespan)
FastAPIInstrumentor.instrument_app(app)

@app.post("/orders")
async def orders(request: Request):
    try:
        response = await request.app.state.payment_client.post("/charge")
        response.raise_for_status()
        return {"order_status": "confirmed"}
    except httpx.PoolTimeout:
        raise HTTPException(503, "Payment connection pool exhausted")
    except httpx.TimeoutException:
        raise HTTPException(504, "Payment request timed out")
    except httpx.HTTPStatusError:
        raise HTTPException(502, "Payment returned an error")
```

## 5. Start both APIs

Open **two separate PowerShell windows** in the same lab directory.

**Terminal A — Payment:**

```powershell
$env:PAYMENT_DELAY="0.1"
uv run uvicorn payment_service:app --host 127.0.0.1 --port 8001
```

**Terminal B — Business:**

```powershell
uv run uvicorn business_service:app --host 127.0.0.1 --port 8000
```

**Terminal C — send one request:**

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/orders
```

**Expected:** `order_status = confirmed`.

## 6. Observe the trace in Jaeger

1. Open http://localhost:16686
2. Select **business-api** in the Service dropdown.
3. Click **Find Traces** and open the newest trace.
4. Expand the trace timeline. Look for **POST /orders** (Business API), an HTTPX outbound client span, and **POST /charge** (Payment API).
5. Verify the services share a **trace ID**. A parent span usually encloses the downstream work for a synchronous HTTP call.
6. Record the span duration and any error attributes. **Do not add overlapping span durations**: parent time includes child time.
7. If the HTTPX client span is missing, check instrumentation initialization and dependency versions. Missing client spans limit what the trace can prove.

**Expected:** Payment server span appears under the Business request, with durations roughly near 100 ms plus overhead. Exact durations vary.

**If services don't appear:** issue another request; wait a few seconds for batch export; check `docker logs mbr-otel-collector --tail 30`; restart the Python services after tracer configuration changes.

## 7. Break it: slow downstream payment

Stop only Terminal A with Ctrl+C. Restart Payment with:

```powershell
$env:PAYMENT_DELAY="1"
uv run uvicorn payment_service:app --host 127.0.0.1 --port 8001
```

From Terminal C, call `/orders` again. In Jaeger open the **new** trace.

**Expected observation:** Payment `/charge` takes approximately 1 second; Business `/orders` takes at least approximately that long because it awaits Payment. This is evidence that the downstream call dominates this request. Compare actual measured timings rather than assuming precise values.

## 8. Break it: HTTPX pool exhaustion

Keep `PAYMENT_DELAY=1`. Business API has only **2 outbound connections** and a **50 ms pool acquisition timeout**.

Create `load_test.py`:

```python
import asyncio
import httpx
from collections import Counter

async def main():
    async with httpx.AsyncClient(timeout=15.0) as client:
        async def one():
            try:
                response = await client.post("http://127.0.0.1:8000/orders")
                return response.status_code
            except Exception as exc:
                return type(exc).__name__
        results = await asyncio.gather(*(one() for _ in range(10)))
        print(Counter(results))

asyncio.run(main())
```

Run:

```powershell
uv run python load_test.py
```

**Expected:** roughly 2 successful requests and 8 HTTP 503 responses (the precise split can vary). The **Business API** returns 503 after a local `httpx.PoolTimeout`; it is **not** a 503 returned by Payment.

**Important Jaeger limitation:** an outbound HTTPX span alone does **not** reliably measure pool acquisition wait. Inspect the status/error on Business API and add explicit pool-wait instrumentation if you need that measurement. Do not mislabel a missing downstream span as downstream slowness.

## 9. Fix and verify

For a controlled comparison, restart Business API after changing its pool settings:

```python
limits=httpx.Limits(max_connections=10),
timeout=httpx.Timeout(10.0, pool=2.0),
```

Rerun `load_test.py` and compare status counts and end-to-end duration. More connections can improve this local experiment, but **are not a universal production fix**: they can overwhelm a constrained downstream service. In production, choose concurrency based on dependency capacity and use backpressure, deadlines, and retry budgets.

## 10. Capture your evidence

| Checkpoint | Baseline | Broken | After mitigation |
|---|---|---|---|
| Payment delay configured | 0.1s | 1s | 1s |
| Business request duration | measure | measure | measure |
| Payment server span duration | measure | measure | measure |
| 10-request HTTP status counts | measure | measure | measure |
| HTTPX pool configuration | 2 / 50ms | 2 / 50ms | 10 / 2s |

**Explain like a Staff Engineer:** “The downstream was deliberately slowed to 1 second. With a pool of two and 50 ms acquisition timeout, concurrent requests failed before reaching Payment. Jaeger proved downstream processing time for accepted requests, while local HTTPX exceptions established pool exhaustion. Increasing pool capacity reduced this lab's failures, but requires downstream capacity validation before production adoption.”

**Next independent module:** Database Latency Warfare — FastAPI → PostgreSQL, with separate connection pool, SQL plans, lock waits, and Jaeger DB spans. Do not mix its results with this module.
