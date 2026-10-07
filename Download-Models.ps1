$ErrorActionPreference = 'Stop'
$ollama = (Get-Command ollama -ErrorAction Stop).Source
$previousHost = $env:OLLAMA_HOST
try {
    foreach ($target in @(
        @{ Port = 11435; Model = 'numind/nuextract3:Q4_K_M' },
        @{ Port = 11434; Model = 'qwen3.5:9b' }
    )) {
        try { $null = Invoke-RestMethod "http://127.0.0.1:$($target.Port)/api/tags" -TimeoutSec 3 }
        catch { throw "Start Ollama on port $($target.Port) before downloading. See README.md." }
        $env:OLLAMA_HOST = "127.0.0.1:$($target.Port)"
        & $ollama pull $target.Model
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $($target.Model). Run this script again to resume." }
    }
} finally { $env:OLLAMA_HOST = $previousHost }
