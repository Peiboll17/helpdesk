# ============================================================
# NexoDesk · Fase 4 · Crear tablas + datos iniciales (MySQL)
# ------------------------------------------------------------
# Abre un túnel SSH (3307 -> 3306 de la VPS), ejecuta
# "prisma db push" con el esquema MySQL y el seed, y cierra.
# La contraseña NUNCA se muestra: se lee de /opt/nexodesk/.env.
#
# Uso:  powershell -ExecutionPolicy Bypass -File deploy\windows\db-push.ps1
# ============================================================
param(
  [string]$VpsUser = "peiboll17",
  [string]$VpsIp   = ""
)
$ErrorActionPreference = "Stop"

function Assert-Last {
  if ($LASTEXITCODE -ne 0) { throw "Fallo en el paso anterior (codigo $LASTEXITCODE). Pega este error en el chat." }
}

Set-Location (Join-Path $PSScriptRoot "..\..")

if (-not $VpsIp) { $VpsIp = Read-Host "IP externa de tu VPS" }
$Vps = "$VpsUser@$VpsIp"

Write-Host ">> Leyendo DATABASE_URL de la VPS (no se mostrara)…"
$raw = "$((ssh $Vps "sudo -n grep '^DATABASE_URL' /opt/nexodesk/.env"))".Trim()
if (-not $raw) { throw "No pude leer /opt/nexodesk/.env (fallo de sudo? · reintenta este script)" }
# quitar el prefijo DATABASE_URL= y las comillas que rodean al valor
$url = ($raw -replace '^\s*DATABASE_URL\s*=\s*', '') -replace '^"(.*)"\s*$', '$1'
if ($url -notmatch '^mysql://') { throw "La DATABASE_URL de la VPS no se pudo interpretar · pega este error en el chat" }
$env:DATABASE_URL = $url -replace '@(127\.0\.0\.1|localhost):3306/', '@127.0.0.1:3307/'

Write-Host ">> Abriendo tunel SSH 3307 -> 3306…"
$tunel = Start-Process ssh -ArgumentList "-N","-L","3307:127.0.0.1:3306",$Vps -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3
try {
  Write-Host ">> Creando tablas (prisma db push, esquema MySQL)…"
  bun run db:push:mysql
  Assert-Last
  Write-Host ">> Cargando datos de ejemplo (seed)…"
  bun prisma/seed.ts
  Assert-Last
} finally {
  if ($tunel) { Stop-Process -Id $tunel.Id -Force -ErrorAction SilentlyContinue }
}

Write-Host ">> Tablas creadas en la VPS:"
ssh $Vps "sudo -n mysql helpdesk -e 'SHOW TABLES;'"
Assert-Last

Write-Host "OK · Fase 4 completada"
Write-Host "   Siguiente paso:  powershell -ExecutionPolicy Bypass -File deploy\windows\start-services.ps1"
