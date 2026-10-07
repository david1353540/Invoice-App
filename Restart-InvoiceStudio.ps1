$ErrorActionPreference = 'Stop'
# Run manually after updating the app; never stop an unrelated listener.
$invoiceListener = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
if ($invoiceListener) {
  $invoiceProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($invoiceListener[0].OwningProcess)"
  $invoiceRoot = $PSScriptRoot.Replace('/','\')
  if (-not $invoiceProcess.CommandLine -or $invoiceProcess.CommandLine.Replace('/','\') -notlike "*$invoiceRoot\server.py*") {
    throw 'Port 8765 belongs to another application; no process was stopped.'
  }
  Stop-Process -Id $invoiceProcess.ProcessId
  Wait-Process -Id $invoiceProcess.ProcessId -Timeout 15 -ErrorAction SilentlyContinue
}
& (Join-Path $PSScriptRoot 'Start-InvoiceStudio.ps1')
