# Stop only this lab's kind containers. Does not delete cluster or PVCs.
# Docker Desktop and WSL are intentionally left running because other workloads
# may depend on them. To stop them globally, use Docker Desktop UI separately.
$ErrorActionPreference = 'Stop'
$cluster = 'prod-sim'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI is required' }
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker engine is not running' }
$ids = @(docker ps -q --filter "label=io.x-k8s.kind.cluster=$cluster")
if ($LASTEXITCODE -ne 0) { throw 'Failed to list Docker containers' }
if ($ids) {
    docker stop $ids
    if ($LASTEXITCODE -ne 0) { throw 'Failed to stop all kind containers' }
    Write-Host "Stopped kind cluster '$cluster' containers." -ForegroundColor Green
} else {
    Write-Host "No running containers for '$cluster'." -ForegroundColor Yellow
}
