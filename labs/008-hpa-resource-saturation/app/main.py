import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/burn":
            deadline = time.monotonic() + 0.4
            x = 1
            while time.monotonic() < deadline:
                x = (x * 1664525 + 1013904223) % 4294967296
            self.send_response(200)
            self.end_headers()
            self.wfile.write(str(x).encode())
        elif self.path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
        else:
            self.send_response(404)
            self.end_headers()

ThreadingHTTPServer(("0.0.0.0",8000),Handler).serve_forever()
