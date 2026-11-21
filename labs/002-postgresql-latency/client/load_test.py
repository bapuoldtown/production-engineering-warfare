"""Run from host: python -m pip install httpx; python client/load_test.py"""
import asyncio
import os
import statistics
import time
from collections import Counter

import httpx

BASE = os.getenv("API_URL", "http://localhost:8000")
KC = os.getenv("KEYCLOAK_URL", "http://localhost:8080")
SECRET = os.getenv("CLIENT_SECRET", "lab_client_secret_only")
COUNT = int(os.getenv("REQUESTS", "200"))
CONCURRENCY = int(os.getenv("CONCURRENCY", "200"))
HOLD_MS = int(os.getenv("HOLD_MS", "500"))
MODE = os.getenv("MODE", "pooled")

async def main():
    async with httpx.AsyncClient(timeout=45) as client:
        token_response = await client.post(
            f"{KC}/realms/production-warfare/protocol/openid-connect/token",
            data={"grant_type": "client_credentials",
                  "client_id": "orders-api", "client_secret": SECRET})
        token_response.raise_for_status()
        token = token_response.json()["access_token"]
        sem = asyncio.Semaphore(CONCURRENCY)
        results = []
        async def hit(i):
            async with sem:
                start = time.perf_counter()
                try:
                    r = await client.get(
                        f"{BASE}/orders",
                        params={"customer_id": 420, "mode": MODE, "hold_ms": HOLD_MS},
                        headers={"Authorization": f"Bearer {token}"})
                    status = r.status_code
                except httpx.HTTPError:
                    status = "transport_error"
                results.append((status, (time.perf_counter()-start)*1000))
        await asyncio.gather(*(hit(i) for i in range(COUNT)))
    print("Statuses:", dict(Counter(s for s, _ in results)))
    values = sorted(ms for _, ms in results)
    if values:
        def pct(p):
            return values[min(len(values)-1, max(0, int((len(values)-1)*p)))]
        print(f"All-response latency ms: p50={pct(.50):.1f} p95={pct(.95):.1f} p99={pct(.99):.1f}")
        good = sorted(ms for s, ms in results if s == 200)
        if good:
            print(f"Successful-only p95 ms: {good[min(len(good)-1,int((len(good)-1)*.95))]:.1f}")
if __name__ == "__main__":
    asyncio.run(main())
