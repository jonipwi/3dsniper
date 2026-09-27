Set-Location $PSScriptRoot
Write-Host ""
Write-Host "=========================================="
Write-Host "  Sniper Range V1 - Local Web Server"
Write-Host "=========================================="
Write-Host ""
Write-Host "Open: http://localhost:8000"
Write-Host "Press CTRL+C to stop."
Write-Host ""

$python = Get-Command python -ErrorAction SilentlyContinue
$launcher = Get-Command py -ErrorAction SilentlyContinue

if ($python) {
    & $python.Source -m http.server 8000
    if ($LASTEXITCODE -eq 0) { exit 0 }
}

if ($launcher) {
    & $launcher.Source -m http.server 8000
    exit $LASTEXITCODE
}

Write-Error "Python 3 was not found. Install Python, then run this script again."
exit 1
