// ============================================================
// Conexión WebSocket del navegador · configurable por entorno
// ------------------------------------------------------------
//  · Sandbox/desarrollo (Caddy con transform de puertos):
//      sin variables → '/?XTransformPort=3003' con path '/'
//  · VPS de producción (Caddy estándar):
//      NEXT_PUBLIC_SOCKET_URL="/"            (mismo origen)
//      NEXT_PUBLIC_SOCKET_PATH="/socket.io"  (Caddy enruta ese
//      path al mini-servicio :3003 → deploy/Caddyfile.prod)
// OJO: las variables NEXT_PUBLIC_* se incrustan al COMPILAR,
// así que cambiarlas implica re-desplegar (deploy/deploy.sh).
// ============================================================

export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? '/?XTransformPort=3003'
export const SOCKET_PATH = process.env.NEXT_PUBLIC_SOCKET_PATH ?? '/'
