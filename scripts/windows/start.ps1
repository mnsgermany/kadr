# КАДР: запускает ComfyUI (если ещё не запущен) и сайт, затем открывает браузер.

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ComfyHome = if ($env:KADR_COMFY_DIR) { $env:KADR_COMFY_DIR } else { Join-Path $Root "comfy" }
$Portable = Join-Path $ComfyHome "ComfyUI_windows_portable"
$Port = if ($env:PORT) { $env:PORT } else { "3000" }

function ComfyAlive {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:8188/system_stats" | Out-Null; return $true }
  catch { return $false }
}

if (-not (ComfyAlive)) {
  if (-not (Test-Path (Join-Path $Portable "python_embeded\python.exe"))) {
    throw "ComfyUI не найден в $Portable. Сначала запусти install.bat."
  }
  Write-Host "Запускаю ComfyUI в отдельном окне..."
  Start-Process -WorkingDirectory $Portable -WindowStyle Minimized `
    -FilePath (Join-Path $Portable "python_embeded\python.exe") `
    -ArgumentList "-s", "ComfyUI\main.py", "--windows-standalone-build", "--listen", "127.0.0.1", "--port", "8188"
  for ($i = 0; $i -lt 90 -and -not (ComfyAlive); $i++) { Start-Sleep -Seconds 2 }
  if (-not (ComfyAlive)) { Write-Warning "ComfyUI пока не отвечает. Сайт всё равно запустится и подхватит его позже." }
}

Push-Location $Root
try {
  if (-not (Test-Path (Join-Path $Root ".next"))) { npm run build }
  Start-Job -ScriptBlock { param($p) Start-Sleep 4; Start-Process "http://localhost:$p" } -ArgumentList $Port | Out-Null
  Write-Host "КАДР работает на http://localhost:$Port (закрой это окно, чтобы остановить сайт)"
  $env:PORT = $Port
  npm run start
} finally {
  Pop-Location
}
