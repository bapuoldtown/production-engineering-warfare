# Production Engineering Warfare

Hands-on production engineering: distributed systems, backend scalability, Kubernetes, observability, cloud infrastructure, DevSecOps, and AI platform reliability.

## Module 001 — API Latency Field Guide


Interactive Staff/Principal-level diagnostic guide for **Client → FastAPI → downstream HTTP API**. No database or Kubernetes dependencies.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Deploy this Next.js project to Vercel by importing the GitHub repository.

## Contents
- Guided symptom → evidence → hypothesis → mitigation workflow
- Diagnostic matrix and incident response checklist
- Jaeger/OpenTelemetry span interpretation
- Scenario-based interview practice with answers hidden until submission
- Markdown runbook: `docs/downstream-api-latency-runbook.md`

## Instrumentation caveats
An HTTPX client span may include multiple phases, and standard HTTPX instrumentation does not automatically isolate connection-pool wait, DNS, TCP, TLS, and response-body decoding. Use phase-specific instrumentation, client metrics, logs and profiling when needed. Nested span durations overlap; never sum them. Different hosts' clock skew can distort cross-service waterfall alignment.