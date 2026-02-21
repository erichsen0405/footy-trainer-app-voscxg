param(
  [int]$Repeat = 1
)

$ErrorActionPreference = "Stop"

if ($Repeat -lt 1) {
  throw "Repeat skal være mindst 1."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $scriptDir "maestro.env.ps1"

if (-not (Test-Path $envFile)) {
  throw "Mangler env-fil: $envFile"
}

. $envFile

$maestroCmd = Get-Command maestro -ErrorAction SilentlyContinue
if (-not $maestroCmd) {
  throw "maestro command blev ikke fundet i PATH."
}

$flowsDir = Join-Path $scriptDir "flows"
if (-not (Test-Path $flowsDir)) {
  throw "Mangler flows mappe: $flowsDir"
}

$debugRoot = Join-Path $scriptDir "results/maestro-debug"

for ($run = 1; $run -le $Repeat; $run++) {
  $debugDir = Join-Path $debugRoot "run-$run"

  Write-Host ""
  Write-Host "=== Smoke run $run/$Repeat ==="
  Write-Host "Flows dir: $flowsDir"
  Write-Host "Debug output: $debugDir"

  & maestro test --include-tags smoke --debug-output $debugDir $flowsDir
  if ($LASTEXITCODE -ne 0) {
    throw "Smoke run fejlede (exit $LASTEXITCODE). Se debug output: $debugDir"
  }
}

Write-Host ""
Write-Host "Alle smoke flows gennemfoert uden fejl."
