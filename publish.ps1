# Build + push watchdog-hub vers GHCR (Portainer pull ensuite).
# Depuis C:\DEV_local\watchdog-hub :
#   .\publish.ps1
# Depuis C:\DEV_local :
#   .\watchdog-hub\publish.ps1
# Release : .\publish.ps1 -Version 1.2.4
#
# Prerequis : docker login ghcr.io (compte autorise sur energymgt).

param(
    [string]$Version = "dev",
    [string]$Registry = "ghcr.io/energymgt",
    [string]$Name = "watchdog-hub",
    [string]$SourceRemote = "origin",
    [string]$SourceRepository = "https://github.com/Energymgt/Watchdog-hub.git",
    [switch]$SkipTests,
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
    $workingTree = git status --porcelain
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($workingTree) {
        Write-Error "Le dépôt contient des modifications non commitées. Committer ou annuler ces changements avant le déploiement."
    }

    $branch = git branch --show-current
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if (-not $branch) {
        Write-Error "HEAD détachée : le déploiement exige une branche Git explicite."
    }

    $remoteUrl = git remote get-url $SourceRemote
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if ($remoteUrl.TrimEnd("/") -ne $SourceRepository.TrimEnd("/")) {
        Write-Error "Remote $SourceRemote inattendu : $remoteUrl (attendu : $SourceRepository)."
    }

    $commit = git rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    if (-not $SkipTests) {
        Write-Host "==> Tests locaux"
        npm test
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    docker build --platform linux/amd64 -f $dockerfile `
        --build-arg "WATCHDOG_VERSION=$Version" `
        --label "org.opencontainers.image.source=$SourceRepository" `
        --label "org.opencontainers.image.revision=$commit" `
        -t $image .
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    if ($SkipPush) {
        Write-Host "==> SkipPush : code source et image non poussés ; image locale prête ($image)"
        exit 0
    }

    Write-Host "==> Push code source $SourceRemote/$branch ($commit)"
    git push $SourceRemote $branch
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Échec push Git. Vérifier le remote et l'authentification GitHub."
        exit $LASTEXITCODE
    }

    Write-Host "==> Push $image"
    docker push $image
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Echec push. Verifier : docker login ghcr.io"
        exit $LASTEXITCODE
    }

    $repoDigest = docker image inspect --format '{{index .RepoDigests 0}}' $image 2>$null
    if ($LASTEXITCODE -eq 0 -and $repoDigest) {
        Write-Host "  Digest : $repoDigest"
    } else {
        Write-Warning "Digest indisponible localement. Le verifier dans GHCR avant le redeploiement."
    }

    Write-Host ""
    if ($Version -eq "dev") {
        Write-Host "OK. Tag dev (mutable). Portainer : ne pas changer le tag."
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
