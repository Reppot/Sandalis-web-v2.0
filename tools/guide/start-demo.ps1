$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$secretPath = Join-Path $repoRoot "infra\.env.guide"
$composePath = Join-Path $repoRoot "infra\docker-compose.guide.yml"

if (-not (Test-Path -LiteralPath $secretPath)) {
    $secret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
    [System.IO.File]::WriteAllText($secretPath, "JWT_SECRET=$secret`nFRONTEND_URL=http://127.0.0.1:3300`n")
}

docker compose -p sandalis-guide -f $composePath up -d --build
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$dbReady = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    docker exec sandalis-guide-db pg_isready -U sandalis -d postgres *> $null
    if ($LASTEXITCODE -eq 0) {
        $dbReady = $true
        break
    }
    Start-Sleep -Seconds 1
}
if (-not $dbReady) {
    throw "The isolated Sandalis PostgreSQL did not become ready."
}

$testDbExists = docker exec sandalis-guide-db psql -U sandalis -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'sandalis_test'"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
if ($testDbExists.Trim() -ne "1") {
    docker exec sandalis-guide-db psql -U sandalis -d postgres -c "CREATE DATABASE sandalis_test" *> $null
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

Write-Host "Sandalis demo and isolated test DB are ready. Web: http://127.0.0.1:3300  API: http://127.0.0.1:8020/api/v1/health/live  Test DB: 127.0.0.1:55433/sandalis_test"
