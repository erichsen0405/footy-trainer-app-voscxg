# scripts/qa-bundle.ps1
# === QA bundle after Codex — zip only (temp folder removed) ===
# Usage (recommended):
#   powershell -ExecutionPolicy Bypass -File scripts/qa-bundle.ps1
# Optional: run QA commands and capture output:
#   powershell -ExecutionPolicy Bypass -File scripts/qa-bundle.ps1 -QaCommands "npm run lint","npm run typecheck","npm test"

param(
  [string[]]$QaCommands = @()
)

$ErrorActionPreference = "Stop"

# 1) Find repo root
$repoRoot = (git rev-parse --show-toplevel 2>$null).Trim()
if (-not $repoRoot) { throw "Ikke et git-repo. Åbn PowerShell i projektmappen (eller en undermappe i repo'et)." }
Set-Location $repoRoot

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
git diff --name-status HEAD | Out-File -Encoding utf8 $namesFile
git diff --stat HEAD        | Out-File -Encoding utf8 $statFile
git diff --check HEAD       | Out-File -Encoding utf8 $checkFile
git diff --binary HEAD      | Out-File -Encoding utf8 $patchFile

# 6) Optional QA commands output
"=== QA commands output ===" | Out-File -Encoding utf8 $cmdFile
if ($QaCommands.Count -gt 0) {
  foreach ($c in $QaCommands) {
    "" | Out-File -Append -Encoding utf8 $cmdFile
    ">>> $c" | Out-File -Append -Encoding utf8 $cmdFile
    cmd /c "$c" 2>&1 | Out-File -Append -Encoding utf8 $cmdFile
    "exitCode: $LASTEXITCODE" | Out-File -Append -Encoding utf8 $cmdFile
    if ($LASTEXITCODE -ne 0) {
      "" | Out-File -Append -Encoding utf8 $cmdFile
      "NOTE: Kommando fejlede (exitCode != 0). Se output ovenfor." | Out-File -Append -Encoding utf8 $cmdFile
      # Fortsæt stadig med at lave bundle, så QA kan se fejlen.
    }
  }
} else {
  "NOTE: Ingen QA-kommandoer kørt. Kald scriptet med -QaCommands for at køre lint/typecheck/tests." |
    Out-File -Append -Encoding utf8 $cmdFile
}

# 7) Zip + remove folder (keep only zip)
Compress-Archive -Path (Join-Path $outDir "*") -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $outDir

# 8) Summary + open base folder
Write-Host ""
Write-Host "✅ QA bundle (zip only) lavet:" -ForegroundColor Green
Write-Host "  Zip: $zipPath"
Write-Host ""
git diff --stat HEAD
Write-Host ""

# Open folder in Explorer (Windows). No-op on non-Windows.
try { Invoke-Item $baseDir | Out-Null } catch {}
