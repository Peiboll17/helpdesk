// Helper para emitir eventos en tiempo real desde las API routes
// hacia el mini-servicio Socket.io (puerto 3003).
// Las llamadas backend->backend van por HTTP interno (localhost),
// el navegador SIEMPRE usa /?XTransformPort=3003 vía Caddy.

const REALTIME_URL = process.env.REALTIME_URL ?? 'http://localhost:3010'

export async function emitEvent(event: string, payload: unknown, room?: string): Promise<void> {
  try {
    await fetch(`${REALTIME_URL}/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload, room }),
      signal: AbortSignal.timeout(1500),
    })
  } catch {
    // El servicio de tiempo real no está disponible: la operación
    // principal (persistencia) no debe fallar por esto.
    console.warn(`[realtime] no se pudo emitir "${event}"`)
  }
}
