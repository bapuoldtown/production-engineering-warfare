# Mission 005 — FastAPI Graceful Shutdown

**Introductory lab completed:** three-replica deployment, Pod deletion/replacement, and HTTP 200 observed from a 10-second simulated Gist request. **Forced in-flight interruption and successful draining under SIGTERM were not conclusively demonstrated.**

See [GIST.md](GIST.md) for findings, measured evidence, and caveats.

## Files
- [app/main.py](app/main.py): FastAPI readiness and 10-second simulated downstream call
- [app/Dockerfile](app/Dockerfile): Uvicorn container
- [manifests/deployment.yaml](manifests/deployment.yaml): namespace, Deployment, Service; intentional 5-second termination grace

## Quick start
```powershell
docker build -t gist-graceful:v1 .\app
kind load docker-image gist-graceful:v1 --name prod-sim
kubectl apply -f .\manifests\deployment.yaml
kubectl rollout status deployment/gist-api -n warfare-shutdown-lab
```

**Note:** `terminationGracePeriodSeconds` defaults to 30 when omitted. The 5-second setting here is an intentionally risky experiment, not a production recommendation.
