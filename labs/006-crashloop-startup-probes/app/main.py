import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STARTUP_SECONDS = int(os.getenv("STARTUP_SECONDS", "45"))
started = time.monotonic()
print(f"BOOT: initializing for {STARTUP_SECONDS}s", flush=True)
time.sleep(STARTUP_SECONDS)
print("BOOT: application initialized", flush=True)

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/live", "/ready"):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
        else:
            self.send_response(404)
            self.end_headers()

ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
