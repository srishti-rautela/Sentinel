"""AI Engine (Implementation-1 preview): rule-based root-cause analysis.
Same API contract the LLM/RAG version will use in Implementation-3: POST /diagnose -> recommendation.
Standard library only, so no pip install is needed."""
import json, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

def diagnose(req):
    svc = req.get("service", "unknown")
    a = req.get("anomaly", {})
    m = req.get("metrics", {}) or {}
    deps = req.get("dependencies", []) or []
    t = a.get("type")
    rules = {
        "down": ("Process crashed or the container exited", 0.90, "The service no longer answers its health check, so the process is not running."),
        "unhealthy": ("Service is running but failing its own health check", 0.85, "Health endpoint returns 503; the process is alive but in a bad internal state."),
        "high_memory": ("Probable memory leak", 0.80, f"Memory is {m.get('memoryMB', '?')} MB, far above the normal baseline; a restart releases it."),
        "high_error_rate": ("Elevated 5xx error rate inside the service", 0.75, f"About {round((m.get('errorRate') or 0) * 100)}% of recent requests failed with 5xx; the fault is local to this service because none of its dependencies are failing."),
        "high_latency": ("Latency degradation (slow responses)", 0.70, f"Average latency is {m.get('avgLatencyMs', '?')} ms; the service is overloaded or blocked."),
    }
    cause, conf, why = rules.get(t, ("Unknown anomaly", 0.30, "No matching rule."))
    return {
        "service": svc,
        "rootCause": cause,
        "explanation": why,
        "confidence": conf,
        "recommendedAction": "restart" if t in rules else "manual_review",
        "alternatives": ["scale"] if t in ("high_latency", "high_error_rate") else [],
        "dependenciesChecked": deps,
        "source": "rule-based engine (LLM + RAG planned for Implementation-3)",
    }

class H(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        self._send(200 if self.path == "/health" else 404, {"service": "ai-engine", "status": "ok"} if self.path == "/health" else {"error": "not_found"})
    def do_POST(self):
        if self.path != "/diagnose": return self._send(404, {"error": "not_found"})
        try:
            n = int(self.headers.get("Content-Length", 0)); self._send(200, diagnose(json.loads(self.rfile.read(n) or b"{}")))
        except Exception as e:
            self._send(400, {"error": str(e)})
    def log_message(self, *a): pass

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 4002))
    print(f"ai-engine listening on {port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
