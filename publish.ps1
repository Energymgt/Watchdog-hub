# Build + push watchdog-hub vers Docker Hub (Portainer pull ensuite).
# Depuis C:\DEV_local\watchdog-hub :
#   .\publish.ps1
# Depuis C:\DEV_local :
#   .\watchdog-hub\publish.ps1
# Release : .\publish.ps1 -Version 1.2.4
#
# Prerequis : docker login (compte kxchrisemgt ou org autorisee).

param(
    [string]$Version = "DEV",
    [string]$Registry = "kxchrisemgt",
    [string]$Name = "watchdog-hub",
    [switch]$SkipPush
)

$ErrorActionPreference = "Stop"

$hubRoot = $PSScriptRoot
if (-not (Test-Path (Join-Path $hubRoot "Dockerfile"))) {
    Write-Error "Dockerfile watchdog-hub introuvable ($hubRoot)."
}

$image = "${Registry}/${Name}:${Version}"
$dockerfile = Join-Path $hubRoot "Dockerfile"

Write-Host "==> Build linux/amd64 $image (context: watchdog-hub/)"
Push-Location $hubRoot
try {
    docker build --platform linux/amd64 -f $dockerfile --build-arg "WATCHDOG_VERSION=$Version" -t $image .
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    if ($SkipPush) {
        Write-Host "==> SkipPush : image locale prete ($image)"
        exit 0
    }

    Write-Host "==> Push $image"
    docker push $image
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Echec push. Verifier : docker login"
        exit $LASTEXITCODE
    }

    Write-Host ""
    if ($Version -eq "DEV") {
        Write-Host "OK. Tag DEV (mutable). Portainer : ne pas changer le tag."
        Write-Host "  Env a laisser : WATCHDOG_HUB_IMAGE=$image"
        Write-Host "  Ensuite : Stack Update + Pull and redeploy"
    } else {
        Write-Host "OK. Tag immuable $Version. Sur Portainer :"
        Write-Host "  1. Env : WATCHDOG_HUB_IMAGE=$image"
        Write-Host "  2. Stack Update (Pull and redeploy)"
    }
    Write-Host "  UI Fleet : http://<serveur>:1884/watchdog-hub"
    Write-Host "  Ingest : http://<serveur>:8091/healthz"
}
finally {
    Pop-Location
}
