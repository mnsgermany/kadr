# КАДР: установка на Windows 10/11 с видеокартой NVIDIA.
# Ставит Node.js (если нет), портативный ComfyUI, модели Wan 2.2 5B и Real-ESRGAN,
# затем собирает сайт. Повторный запуск докачивает недостающее и ничего не ломает.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ComfyHome = if ($env:KADR_COMFY_DIR) { $env:KADR_COMFY_DIR } else { Join-Path $Root "comfy" }
$Portable = Join-Path $ComfyHome "ComfyUI_windows_portable"
$Models = Join-Path $Portable "ComfyUI\models"

$ComfyRelease = "https://github.com/Comfy-Org/ComfyUI/releases/download/v0.39.0/ComfyUI_windows_portable_nvidia.7z"
$ModelFiles = @(
  @{ Dir = "diffusion_models"; Name = "wan2.2_ti2v_5B_fp16.safetensors"; Url = "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors" },
  @{ Dir = "text_encoders"; Name = "umt5_xxl_fp8_e4m3fn_scaled.safetensors"; Url = "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors" },
  @{ Dir = "vae"; Name = "wan2.2_vae.safetensors"; Url = "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors" },
  @{ Dir = "upscale_models"; Name = "RealESRGAN_x2plus.pth"; Url = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth" }
)

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Green }

# VPN-клиенты в режиме «системный прокси» (Hiddify, v2rayN, Clash и т.п.) настраивают
# прокси Windows. Браузер его видит, а curl и npm нет, поэтому подхватываем его сами.
function SystemProxy($url) {
  try {
    $proxy = [System.Net.WebRequest]::GetSystemWebProxy().GetProxy([Uri]$url)
    if ($proxy -and $proxy.Authority -ne ([Uri]$url).Authority) { return $proxy.AbsoluteUri }
  } catch {}
  return $null
}

function Download($url, $dest) {
  # curl.exe встроен в Windows 10/11; -C - докачивает прерванную загрузку.
  $curlArgs = @("-L", "--fail", "--retry", "5", "--retry-delay", "5", "-C", "-", "-o", "$dest.part")
  $proxy = SystemProxy $url
  if ($proxy) {
    Write-Host "Через системный прокси $proxy"
    $curlArgs += @("--proxy", $proxy)
  }
  & curl.exe @curlArgs $url
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Не получилось скачать файл. Скорее всего, сайт не открывается без VPN." -ForegroundColor Yellow
    Write-Host "1) Включи VPN для всего компьютера (не только для браузера) и запусти install.bat снова." -ForegroundColor Yellow
    Write-Host "2) Или скачай файл в браузере по ссылке:" -ForegroundColor Yellow
    Write-Host "   $url" -ForegroundColor Yellow
    Write-Host "   и сохрани его как: $dest" -ForegroundColor Yellow
    Write-Host "   Потом запусти install.bat снова, он продолжит с этого места." -ForegroundColor Yellow
    throw "Не удалось скачать $url"
  }
  Move-Item -Force "$dest.part" $dest
}

Step "Проверяю видеокарту"
if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
  throw "Не найден драйвер NVIDIA (nvidia-smi). Установи свежий драйвер с nvidia.com и запусти установку снова."
}
& nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader

Step "Проверяю Node.js"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js не найден, ставлю через winget..."
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js установлен, но не виден. Закрой окно и запусти install.bat ещё раз."
  }
}
Write-Host "Node.js $(node -v)"

Step "ComfyUI"
New-Item -ItemType Directory -Force $ComfyHome | Out-Null
if (-not (Test-Path (Join-Path $Portable "run_nvidia_gpu.bat"))) {
  $archive = Join-Path $ComfyHome "comfyui.7z"
  if (-not (Test-Path $archive)) {
    Write-Host "Скачиваю портативный ComfyUI (~2 ГБ)..."
    Download $ComfyRelease $archive
  }
  $sevenZip = Join-Path $ComfyHome "7zr.exe"
  if (-not (Test-Path $sevenZip)) { Download "https://www.7-zip.org/a/7zr.exe" $sevenZip }
  Write-Host "Распаковываю..."
  & $sevenZip x $archive "-o$ComfyHome" -y | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Не удалось распаковать ComfyUI" }
  Remove-Item $archive
} else {
  Write-Host "Уже установлен: $Portable"
}

Step "Модели (~17 ГБ, первый раз это долго)"
foreach ($m in $ModelFiles) {
  $dir = Join-Path $Models $m.Dir
  New-Item -ItemType Directory -Force $dir | Out-Null
  $dest = Join-Path $dir $m.Name
  if (Test-Path $dest) { Write-Host "Есть: $($m.Name)"; continue }
  Write-Host "Скачиваю $($m.Name)..."
  Download $m.Url $dest
}

Step "Собираю сайт"
Push-Location $Root
try {
  $npmProxy = SystemProxy "https://registry.npmjs.org"
  if ($npmProxy) { $env:HTTPS_PROXY = $npmProxy; $env:HTTP_PROXY = $npmProxy }
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci завершился с ошибкой" }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Сборка сайта завершилась с ошибкой" }
} finally {
  Pop-Location
}

Step "Готово! Запускай start.bat"
