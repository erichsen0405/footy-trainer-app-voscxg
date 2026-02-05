# scripts/qa-bundle.ps1
# === QA bundle after Codex - zip only (temp folder removed) ===
# Default (koerer lint + typecheck):
#   powershell -ExecutionPolicy Bypass -File scripts/qa-bundle.ps1
# Slaa QA fra:
#   powershell -ExecutionPolicy Bypass -File scripts/qa-bundle.ps1 -NoQaCommands
# Override QA-kommandoer (bagudkompatibelt):
#   powershell -ExecutionPolicy Bypass -File scripts/qa-bundle.ps1 -QaCommands "npm run lint","npm run typecheck","npm test"

param(
  [string[]]$QaCommands,
  [switch]$NoQaCommands
)

$ErrorActionPreference = "Stop"

# Detect whether QaCommands was explicitly supplied
$qaParamProvided = $PSBoundParameters.ContainsKey('QaCommands')

# 1) Find repo root
$repoRoot = (git rev-parse --show-toplevel 2>$null).Trim()
if (-not $repoRoot) { throw "Ikke et git-repo. Aabn PowerShell i projektmappen (eller en undermappe i repo'et)." }
Set-Location $repoRoot

# Default QA commands unless explicitly disabled or overridden
if ($NoQaCommands) {
  $QaCommands = @()
} elseif (-not $qaParamProvided) {
  $QaCommands = @("npm run lint", "npm run typecheck")
}

# Normalize null to empty array for downstream handling
if ($null -eq $QaCommands) { $QaCommands = @() }

# Load package.json scripts for helpful warnings
$packageScripts = @{}
try {
  $pkg = Get-Content -Raw -Path (Join-Path $repoRoot "package.json") | ConvertFrom-Json
  if ($pkg.scripts) {
    foreach ($prop in $pkg.scripts.PSObject.Properties) {
      $packageScripts[$prop.Name] = $true
    }
  }
} catch {
  # Keep going even if package.json cannot be read
}

# Helper: run cmd quietly (suppresses stderr warnings)
function Get-CmdOut([string]$cmd) {
  try {
    $out = (cmd /c "$cmd 2>nul") | Select-Object -First 1
    if ($null -eq $out) { return "" }
    return $out.Trim()
  } catch { return "" }
}

# 2) Output folder (temp) + zip path (kept)
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$baseDir = Join-Path $repoRoot ".qa-export"
$outDir  = Join-Path $baseDir $ts
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# 3) Paths
$patchFile  = Join-Path $outDir "changes.patch"
$namesFile  = Join-Path $outDir "files.txt"
$statFile   = Join-Path $outDir "stats.txt"
$statusFile = Join-Path $outDir "status.txt"
$metaFile   = Join-Path $outDir "meta.txt"
$checkFile  = Join-Path $outDir "diff-check.txt"
$cmdFile    = Join-Path $outDir "qa-commands.txt"

$zipPath = Join-Path $baseDir "$ts.zip"

# 4) Meta/status
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$head   = (git rev-parse --short HEAD).Trim()
$last   = (git log -1 --oneline).Trim()
$nodeV  = Get-CmdOut "node -v"
$npmV   = Get-CmdOut "npm -v"

@(
  "timestamp: $(Get-Date -Format o)"
  "repoRoot:   $repoRoot"
  "branch:     $branch"
  "head:       $head"
  "lastCommit: $last"
  "node:       $nodeV"
  "npm:        $npmV"
) | Out-File -Encoding utf8 $metaFile

git status -sb | Out-File -Encoding utf8 $statusFile

# 5) Diff artefacts (alt ift. HEAD)
git --no-pager diff --name-status HEAD | Out-File -Encoding utf8 $namesFile
git --no-pager diff --stat HEAD        | Out-File -Encoding utf8 $statFile
git --no-pager diff --check HEAD       | Out-File -Encoding utf8 $checkFile
git --no-pager diff --binary HEAD      | Out-File -Encoding utf8 $patchFile

# 6) QA commands output
"=== QA commands output ===" | Out-File -Encoding utf8 $cmdFile
$qaOverallExit = 0

function Invoke-QaCommand {
  param(
    [string]$Command,
    [hashtable]$ScriptsMap,
    [string]$LogFile
  )

  # Ensure native command failures don't become terminating errors on PS7+
  $nativePrefVar = Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue
  if ($nativePrefVar) {
    $nativePrefOriginal = $nativePrefVar.Value
    $PSNativeCommandUseErrorActionPreference = $false
  }

  "" | Out-File -Append -Encoding utf8 $LogFile
  ">>> $Command" | Out-File -Append -Encoding utf8 $LogFile

  $scriptName = $null
  if ($Command -match '^\s*npm\s+run\s+([A-Za-z0-9:_\\-]+)') {
    $scriptName = $matches[1]
  }

  if ($scriptName -and -not $ScriptsMap.ContainsKey($scriptName)) {
    "WARN: package.json mangler scriptet '$scriptName' (forsoeger at koere alligevel)." |
      Out-File -Append -Encoding utf8 $LogFile
  }

  $output = @()
  $exitCode = $null

  try {
    # Run via cmd.exe to keep stderr merged and avoid PowerShell native command quirks
    $cmdLine = "$Command 2>&1"
    $output = cmd.exe /d /c $cmdLine
    $exitCode = $LASTEXITCODE
  } catch {
    $output += $_.ToString()
    if ($exitCode -eq $null) { $exitCode = 1 }
  } finally {
    if ($nativePrefVar) { $PSNativeCommandUseErrorActionPreference = $nativePrefOriginal }
  }

  if ($exitCode -eq $null) { $exitCode = 0 }

  $output | Out-File -Append -Encoding utf8 $LogFile
  "exitCode: $exitCode" | Out-File -Append -Encoding utf8 $LogFile
  if ($exitCode -ne 0) {
    "" | Out-File -Append -Encoding utf8 $LogFile
    "NOTE: Kommando fejlede (exitCode != 0). Se output ovenfor." | Out-File -Append -Encoding utf8 $LogFile
  }

  return $exitCode
}

if ($QaCommands.Count -gt 0) {
  foreach ($c in $QaCommands) {
    $exit = Invoke-QaCommand -Command $c -ScriptsMap $packageScripts -LogFile $cmdFile
    if ($exit -ne 0 -and $qaOverallExit -eq 0) { $qaOverallExit = $exit }
  }
} else {
  "NOTE: QA-kommandoer blev ikke koert (deaktiveret eller tom liste). Default er at koere npm run lint og npm run typecheck. Brug -NoQaCommands for at springe over." |
    Out-File -Append -Encoding utf8 $cmdFile
}

# 7) Zip + remove folder (keep only zip)
Compress-Archive -Path (Join-Path $outDir "*") -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $outDir

# 8) Summary + open base folder
Write-Host ""
Write-Host "[OK] QA bundle (zip only) lavet:" -ForegroundColor Green
Write-Host "  Zip: $zipPath"
Write-Host ""
git --no-pager diff --stat HEAD
Write-Host ""

# Open folder in Explorer (Windows). No-op on non-Windows.
try { Invoke-Item $baseDir | Out-Null } catch {}

# Propagate non-zero QA exit code (zip er stadig lavet)
if ($qaOverallExit -ne 0) { exit $qaOverallExit }
