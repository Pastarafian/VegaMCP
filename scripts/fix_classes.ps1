$path = Join-Path $PSScriptRoot "..\VegaTech\src\App.tsx"
$f = [System.IO.File]::ReadAllText($path)
$f = $f.Replace('border-accent-red', 'border-[#ef4444]')
$f = $f.Replace('border-accent-green', 'border-[#22c55e]')
$f = $f.Replace('border-accent-amber', 'border-[#f59e0b]')
[System.IO.File]::WriteAllText($path, $f)
Write-Host "Fixed remaining border-accent classes"
