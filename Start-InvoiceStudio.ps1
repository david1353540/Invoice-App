$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$pythonArgs = @()
if ($env:INVOICE_PYTHON) { $python = $env:INVOICE_PYTHON }
elseif (Get-Command py -ErrorAction SilentlyContinue) { $python = (Get-Command py).Source; $pythonArgs = @('-3') }
else { $python = (Get-Command python -ErrorAction Stop).Source }
$ollama = (Get-Command ollama -ErrorAction Stop).Source
New-Item -ItemType Directory -Path (Join-Path $projectRoot 'work') -Force | Out-Null
$env:OLLAMA_MODELS = Join-Path $projectRoot 'outputs/local-ai/ollama-models'
$env:OLLAMA_HOST = '127.0.0.1:11435'
try { $null = Invoke-RestMethod 'http://127.0.0.1:11435/api/tags' -TimeoutSec 3 } catch {
  Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden
  $ready = $false
  for ($attempt=0; $attempt -lt 15; $attempt++) {
    Start-Sleep -Seconds 1
    try { $null = Invoke-RestMethod 'http://127.0.0.1:11435/api/tags' -TimeoutSec 2; $ready=$true; break } catch {}
  }
  if (-not $ready) { throw 'Ollama could not start.' }
}
$models = Invoke-RestMethod 'http://127.0.0.1:11435/api/tags'
foreach ($requiredModel in @('numind/nuextract3:Q4_K_M')) { if ($models.models.name -notcontains $requiredModel) { throw "Missing local model: $requiredModel" } }
try { $summaryModels = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3 } catch { throw 'Start the main Ollama application for Qwen3.5 9B, then launch Invoice Studio again.' }
if ($summaryModels.models.name -notcontains 'qwen3.5:9b') { throw 'The main Ollama service is missing qwen3.5:9b.' }
$appListener = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
if ($appListener) {
  $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $($appListener[0].OwningProcess)"
  if ($existing.CommandLine.Replace('/','\') -notlike "*$projectRoot*server.py*") { throw 'Port 8765 belongs to another application.' }
} else {
  Start-Process -FilePath $python -ArgumentList ($pythonArgs + @('-u',('"' + (Join-Path $projectRoot 'server.py') + '"'))) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput "$projectRoot/work/app-server.log" -RedirectStandardError "$projectRoot/work/app-server-errors.log"
}
Write-Output 'Invoice Studio: http://127.0.0.1:8765/ — NuExtract3 extracts images; Qwen3.5 9B writes summaries.'
