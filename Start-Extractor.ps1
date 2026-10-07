$ErrorActionPreference = 'Stop'
$ollama = (Get-Command ollama -ErrorAction Stop).Source
$env:OLLAMA_MODELS = Join-Path $PSScriptRoot 'outputs/local-ai/ollama-models'
$env:OLLAMA_HOST = '127.0.0.1:11435'
New-Item -ItemType Directory -Path $env:OLLAMA_MODELS -Force | Out-Null
try {
    $null = Invoke-RestMethod 'http://127.0.0.1:11435/api/tags' -TimeoutSec 3
    Write-Host 'The extraction service is already running on port 11435.'
} catch {
    Write-Host 'Extraction service: leave this terminal open while using Invoice Studio.'
    & $ollama serve
    if ($LASTEXITCODE -ne 0) { throw 'The extraction service stopped with an error.' }
}
