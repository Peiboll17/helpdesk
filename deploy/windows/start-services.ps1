# ============================================================
# NexoDesk · Fase 5 · Instalar y arrancar los servicios systemd
# ------------------------------------------------------------
# Copia las dos unidades (app Next.js + realtime Socket.io) al
# directorio systemd, las habilita y comprueba la salud.
#
# Uso:  powershell -ExecutionPolicy Bypass -File deploy\windows\start-services.ps1
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

Write-Host ">> Copiando unidades systemd…"
ssh $Vps "mkdir -p nx-deploy"
scp "deploy\nexodesk.service" "deploy\nexodesk-realtime.service" "${Vps}:nx-deploy/"
Assert-Last
# Las unidades se copian pasando antes por tr -d '\r': si git las dejó
# con saltos de línea de Windows (CRLF), systemd interpretaría el \r
# como parte del valor (p.ej. SOCKET_PATH="/socket.io\r" rompería el WS).
ssh $Vps "tr -d '\r' < nx-deploy/nexodesk.service > /tmp/nx-app.service && tr -d '\r' < nx-deploy/nexodesk-realtime.service > /tmp/nx-rt.service && sudo -n cp /tmp/nx-app.service /etc/systemd/system/nexodesk.service && sudo -n cp /tmp/nx-rt.service /etc/systemd/system/nexodesk-realtime.service && rm -f /tmp/nx-app.service /tmp/nx-rt.service && sudo -n systemctl daemon-reload && sudo -n systemctl enable --now nexodesk nexodesk-realtime"
Assert-Last

Write-Host ">> Esperando arranque (5 s)…"
Start-Sleep -Seconds 5
ssh $Vps "systemctl is-active nexodesk nexodesk-realtime; curl -s -o /dev/null -w 'app      :3000 -> %{http_code}\n' http://127.0.0.1:3000/api/stats; curl -s -o /dev/null -w 'realtime :3010 -> %{http_code}\n' http://127.0.0.1:3010/health"
Assert-Last

Write-Host ">> Ultimas lineas de log (por si algo fue mal):"
ssh $Vps "sudo -n journalctl -u nexodesk -u nexodesk-realtime -n 12 --no-pager"

Write-Host "OK · Fase 5 completada · la app vive en el puerto 3000 de la VPS"
Write-Host "   Siguiente: dominio + HTTPS con Caddy (Fase 6, te lo indico en el chat)"
