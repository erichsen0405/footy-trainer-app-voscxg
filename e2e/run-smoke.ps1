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

$flows = Get-ChildItem -Path $flowsDir -File |
  Where-Object { $_.Extension -in @(".yaml", ".yml") } |
  Sort-Object Name |
  Select-Object -ExpandProperty FullName

if (-not $flows -or $flows.Count -eq 0) {
  throw "Ingen flow-filer fundet i: $flowsDir"
}

for ($run = 1; $run -le $Repeat; $run++) {
  Write-Host ""
  Write-Host "=== Smoke run $run/$Repeat ==="
  $flowNames = $flows | ForEach-Object { Split-Path -Leaf $_ }
  Write-Host ("Flows: " + ($flowNames -join ", "))

  foreach ($flow in $flows) {
    Write-Host "Running: $flow"
    & maestro test $flow
    if ($LASTEXITCODE -ne 0) {
      throw "Flow fejlede (exit $LASTEXITCODE): $flow"
    }
  }
}

Write-Host ""
Write-Host "Alle smoke flows gennemfoert uden fejl."
