from fastapi import FastAPI
import os

app = FastAPI()
service_name = os.getenv("SERVICE_NAME", "unknown-service")

@app.get("/health")
def health_check():
    return {"service": service_name, "status": "ok"}

@app.get("/api/v1/analyze")
def analyze_get():
    return {"service": service_name, "status": "ok"}

@app.post("/api/v1/analyze")
def analyze_post():
    return {"analysis": "dummy result", "status": "ok"}