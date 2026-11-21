import os
import time
from contextlib import asynccontextmanager
from typing import Annotated

import jwt
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from jwt import PyJWKClient
from psycopg import connect
from psycopg_pool import ConnectionPool, PoolTimeout

DATABASE_URL = os.environ["DATABASE_URL"]
ISSUER = os.environ["JWT_ISSUER"]
jwks = PyJWKClient(os.environ["JWKS_URL"], cache_keys=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    with ConnectionPool(conninfo=DATABASE_URL, min_size=2, max_size=5,
                        timeout=2.0, open=False) as pool:
        pool.wait(timeout=30)
        app.state.pool = pool
        yield

app = FastAPI(lifespan=lifespan)

def authenticate(authorization: Annotated[str | None, Header()] = None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    token = authorization[7:]
    try:
        key = jwks.get_signing_key_from_jwt(token)
        return jwt.decode(token, key.key, algorithms=["RS256"],
                          audience="orders-api", issuer=ISSUER,
                          options={"require": ["exp", "iss", "aud"]})
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid access token")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/orders")
def orders(request: Request,
           customer_id: int = Query(420, ge=1, le=1000),
           mode: str = Query("pooled", pattern="^(pooled|unpooled)$"),
           hold_ms: int = Query(0, ge=0, le=2000),
           _claims: dict = Depends(authenticate)):
    t0 = time.perf_counter()
    pool = request.app.state.pool
    conn = None
    try:
        if mode == "pooled":
            conn = pool.getconn()
        else:
            conn = connect(DATABASE_URL)
        acquired = time.perf_counter()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, customer_id, created_at FROM orders "
                "WHERE customer_id=%s ORDER BY created_at DESC LIMIT 20",
                (customer_id,),
            )
            executed = time.perf_counter()
            rows = cur.fetchall()
            fetched = time.perf_counter()
            if hold_ms:
                time.sleep(hold_ms / 1000)  # deliberate fault injection only
        return {
            "count": len(rows),
            "orders": [{"id": r[0], "customer_id": r[1],
                        "created_at": r[2].isoformat()} for r in rows],
            "timing_ms": {
                "acquire": round((acquired-t0)*1000, 3),
                "execute": round((executed-acquired)*1000, 3),
                "fetch": round((fetched-executed)*1000, 3),
                "db_total": round((fetched-t0)*1000, 3),
            },
        }
    except PoolTimeout:
        raise HTTPException(status_code=503,
                            detail="Database pool exhausted",
                            headers={"Retry-After": "2"})
    finally:
        if conn is not None:
            if mode == "pooled":
                pool.putconn(conn)
            else:
                conn.close()
