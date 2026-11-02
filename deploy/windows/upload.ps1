# ============================================================
# NexoDesk · Fase 3 · Subida del build a la VPS desde Windows
# ------------------------------------------------------------
# Uso (desde la raíz del repo, C:\Users\peibo\helpdesk):
#   powershell -ExecutionPolicy Bypass -File deploy\windows\upload.ps1
#   (pedirá la IP; también vale:  ...\upload.ps1 -VpsIp 1.2.3.4)
#
# Requisitos: haber hecho "bun run build" y tener la llave SSH
# autorizada (ssh peiboll17@IP hostname responde).
# Es idempotente: puedes relanzarlo cuando quieras (actualiza la app).
# ============================================================
param(
  [string]$VpsUser = "peiboll17",
  [string]$VpsIp   = ""
)
$ErrorActionPreference = "Stop"

function Assert-Last {
  if ($LASTEXITCODE -ne 0) { throw "Fallo en el paso anterior (codigo $LASTEXITCODE). Pega este error en el chat." }
}

# ir a la raíz del repo
Set-Location (Join-Path $PSScriptRoot "..\..")

if (-not $VpsIp) { $VpsIp = Read-Host "IP externa de tu VPS" }
$Vps = "$VpsUser@$VpsIp"
Write-Host ">> Destino: $Vps"

if (-not (Get-Command tar -ErrorAction SilentlyContinue)) { throw "tar no esta disponible (lo trae Windows 10 desde la version 1803). Pega este error en el chat." }

# ── 0 · Comprobaciones locales ──────────────────────────────
if (-not (Test-Path ".next\standalone\server.js")) { throw "Falta .next\standalone\server.js · ejecuta antes:  bun run build" }
if (-not (Test-Path ".next\standalone\node_modules\.prisma\client\libquery_engine-debian-openssl-3.0.x.so.node")) { throw "Falta el motor Linux de Prisma · ejecuta:  bun run db:generate:mysql   y repite   bun run build" }

# Completa lo que el build de Windows no pudo hacer solo
if (-not (Test-Path ".next\standalone\.next\static")) { Copy-Item -Recurse -Force .next\static .next\standalone\.next\ }
if (-not (Test-Path ".next\standalone\public"))       { Copy-Item -Recurse -Force public .next\standalone\ }
Set-Content -Path .next\standalone\fix-chunk.js -Encoding ascii -Value 'module.exports=[66680,(e,o,r)=>{o.exports=e.x("node:crypto",()=>require("node:crypto"))}];'

# Dependencias del realtime (JS puro: valen tal cual en Linux)
if (-not (Test-Path "mini-services\realtime\node_modules")) {
  Write-Host ">> Instalando dependencias del realtime…"
  bun install --cwd mini-services/realtime
  Assert-Last
}

# ── 1 · Paquetes tar.gz (Windows 10/11 trae tar) ────────────
Write-Host ">> Empaquetando…"
tar -czf "$env:TEMP\nexodesk-app.tar.gz" -C .next standalone
Assert-Last
tar -czf "$env:TEMP\nexodesk-rt.tar.gz" -C mini-services realtime
Assert-Last
"   app: {0:N1} MB · realtime: {1:N1} MB" -f ((Get-Item "$env:TEMP\nexodesk-app.tar.gz").Length/1MB), ((Get-Item "$env:TEMP\nexodesk-rt.tar.gz").Length/1MB)

# ── 2 · Subida (puede tardar 5-15 min segun tu conexion) ────
Write-Host ">> Preparando carpeta remota…"
ssh $Vps "mkdir -p nx-deploy"
Assert-Last
Write-Host ">> Subiendo paquetes (paciencia)…"
scp "$env:TEMP\nexodesk-app.tar.gz" "$env:TEMP\nexodesk-rt.tar.gz" "deploy\windows\remote-setup.sh" "${Vps}:nx-deploy/"
Assert-Last

# ── 3 · Instalación en la VPS ───────────────────────────────
Write-Host ">> Instalando en la VPS…"
ssh $Vps "tr -d '\r' < nx-deploy/remote-setup.sh > nx-deploy/rs.sh && bash nx-deploy/rs.sh"
Assert-Last

Write-Host ""
Write-Host "OK · Fase 3 completada: contenido desplegado en /opt/nexodesk/current"
Write-Host "   Si arriba aparecieron CLAVES NUEVAS, guardalas YA en un sitio privado."
Write-Host "   Siguiente paso:  powershell -ExecutionPolicy Bypass -File deploy\windows\db-push.ps1"
