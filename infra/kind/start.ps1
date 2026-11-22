# Resume existing kind node containers (does not rebuild cluster).
$ErrorActionPreference = 'Stop'
$cluster = 'prod-sim'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI is required' }
if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) { throw 'kubectl is required' }

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    $desktop = Join-Path $Env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path $desktop)) { throw 'Start Docker Desktop manually, then re-run this script.' }
    Start-Process -FilePath $desktop
    $ready = $false
    for ($i=0; $i -lt 90; $i++) {
        Start-Sleep -Seconds 2
        docker info *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    }
    if (-not $ready) { throw 'Docker Desktop did not become ready' }
}
$ids = @(docker ps -aq --filter "label=io.x-k8s.kind.cluster=$cluster")
if ($LASTEXITCODE -ne 0) { throw 'Failed to list Docker containers' }
if (-not $ids) { throw "No existing '$cluster' containers found. Run rebuild.ps1 to create the cluster." }
docker start $ids
if ($LASTEXITCODE -ne 0) { throw 'Failed to start kind containers' }
kubectl --context "kind-$cluster" wait --for=condition=Ready nodes --all --timeout=300s
if ($LASTEXITCODE -ne 0) { throw 'Cluster did not become Ready' }
kubectl --context "kind-$cluster" get nodes
