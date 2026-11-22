import asyncio
import logging
import os
import time
import uuid
from fastapi import FastAPI
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("gist-api")
app = FastAPI()
started_at = time.monotonic()

@app.get("/ready")
async def ready():
    if time.monotonic() - started_at < 3:
        return JSONResponse(status_code=503, content={"status": "warming_up"})
    return {"status": "ready"}

@app.get("/gists/demo")
async def get_gist():
    request_id = str(uuid.uuid4())[:8]
    pod = os.getenv("HOSTNAME", "unknown")
    logger.info("REQUEST_STARTED id=%s pod=%s", request_id, pod)
    await asyncio.sleep(10)
    logger.info("REQUEST_COMPLETED id=%s pod=%s", request_id, pod)
    return {"request_id": request_id, "pod": pod, "gist": "simulated-github-gist", "status": "completed"}
