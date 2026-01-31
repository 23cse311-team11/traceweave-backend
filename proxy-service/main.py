"""
TraceWeave Proxy Addon
Condition: Intercepts traffic only if specific headers are present (Later)
Currently: Pass-through logging
"""
from mitmproxy import http

class TraceWeaveProxy:
    def request(self, flow: http.HTTPFlow) -> None:
        # Placeholder for Task 5.1.1 logic
        print(f"Captured Request: {flow.request.method} {flow.request.url}")

addons = [
    TraceWeaveProxy()
]