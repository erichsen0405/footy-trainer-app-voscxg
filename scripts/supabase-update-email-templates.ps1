Param()

$projectRefPath = "supabase/.temp/project-ref"
$templatePath = "supabase/email-templates/confirm-signup.html"
$subject = "Bekraeft din email til Football Coach"

if (-not (Test-Path $projectRefPath)) {
  Write-Error "PROJECT_REF mangler. Opret '$projectRefPath' med dit Supabase project ref."
  exit 1
}

$projectRef = (Get-Content -Raw $projectRefPath).Trim()
if (-not $projectRef) {
  Write-Error "PROJECT_REF er tom i '$projectRefPath'."
  exit 1
}

$token = $env:SUPABASE_ACCESS_TOKEN
if (-not $token) {
  Write-Error "SUPABASE_ACCESS_TOKEN mangler. Opret en Access Token i Supabase Dashboard (Account -> Access Tokens) og saet den lokalt:"
  Write-Error '$env:SUPABASE_ACCESS_TOKEN="sbp_..."; powershell -ExecutionPolicy Bypass -File scripts/supabase-update-email-templates.ps1'
  exit 1
}

if (-not (Test-Path $templatePath)) {
  Write-Error "Template mangler: $templatePath"
  exit 1
}

$htmlContent = Get-Content -Raw $templatePath

Add-Type -AssemblyName System.Web.Extensions
$serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$subjectJson = $serializer.Serialize($subject)
$templateJson = $serializer.Serialize($htmlContent)

$json = "{`"mailer_subjects_confirmation`":$subjectJson,`"mailer_templates_confirmation_content`":$templateJson}"
$utf8Body = [System.Text.Encoding]::UTF8.GetBytes($json)

$url = "https://api.supabase.com/v1/projects/$projectRef/config/auth"
$headers = @{
  Authorization = "Bearer $token"
  apikey        = $token
  "Content-Type" = "application/json; charset=utf-8"
  Accept         = "application/json"
}

try {
  $response = Invoke-WebRequest -Uri $url -Method Patch -Headers $headers -Body $utf8Body -UseBasicParsing -ErrorAction Stop
  Write-Host "HTTP $($response.StatusCode) OK"
  if ($response.Content) {
    Write-Host $response.Content
  } else {
    Write-Host "(no response body)"
  }
} catch {
  if ($_.Exception.Response) {
    $resp = $_.Exception.Response
    $status = [int]$resp.StatusCode
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $respBody = $reader.ReadToEnd()
    Write-Error "HTTP $status - fejl ved PATCH. Response body: $respBody"
  } else {
    Write-Error "Ukendt fejl: $($_.Exception.Message)"
  }
  exit 1
}
