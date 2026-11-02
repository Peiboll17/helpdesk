// ============================================================
// NexoDesk · Servicio de Conectividad en Tiempo Real (Socket.io)
// ------------------------------------------------------------
// - Chat en vivo: los mensajes del cliente llegan al agente al
//   instante y sin retrasos (requisito crítico del MVP).
// - Canal HTTP interno (:3010 POST /emit) para que las API de
//   Next.js emitan eventos persistidos (nuevos tickets, cambios
//   de estado, CSAT) sin pasar por el navegador.
// El navegador SIEMPRE conecta a /?XTransformPort=3003 (vía Caddy).
// ============================================================

import { createServer } from 'http'
import { Server } from 'socket.io'

// ---------- Servidor WebSocket (navegador) ----------
const httpServer = createServer()

const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

interface VisitorSession {
  visitorId: string
  name: string
  email: string
}

const visitors = new Map<string, VisitorSession>()

io.on('connection', (socket) => {
  console.log(`[realtime] conectado: ${socket.id}`)

  // ---------- AGENTES ----------
  socket.on('agent:join', () => {
    socket.join('agent-room')
    socket.emit('agent:welcome', { agentRoomSize: io.sockets.adapter.rooms.get('agent-room')?.size ?? 1 })
  })

  // ---------- CHAT EN VIVO (cliente) ----------
  socket.on('chat:start', (data: { visitorId: string; name: string; email: string }) => {
    const session: VisitorSession = { visitorId: data.visitorId, name: data.name, email: data.email }
    visitors.set(socket.id, session)
    socket.join(`chat:${data.visitorId}`)
    socket.leave('agent-room') // el visitante nunca escucha el canal de agentes
    console.log(`[chat] ${data.name} (${data.visitorId}) inició chat`)
    io.to('agent-room').emit('chat:visitor-online', session)
  })

  // Mensaje del cliente en el chat en vivo → eco en su sala + aviso a agentes
  socket.on('chat:customer-message', (data: { visitorId: string; body: string; name: string }) => {
    const payload = {
      visitorId: data.visitorId,
      authorName: data.name,
      body: data.body,
      createdAt: new Date().toISOString(),
    }
    io.to(`chat:${data.visitorId}`).emit('chat:customer-message', payload)
    io.to('agent-room').emit('chat:customer-message', payload)
    console.log(`[chat] ${data.name}: ${data.body}`)
  })

  // Indicador "escribiendo..."
  socket.on('chat:typing', (data: { visitorId: string; who: 'customer' | 'agent' }) => {
    if (data.who === 'customer') {
      socket.to('agent-room').emit('chat:typing', data)
    } else {
      socket.to(`chat:${data.visitorId}`).emit('chat:typing', data)
    }
  })

  socket.on('disconnect', () => {
    const s = visitors.get(socket.id)
    if (s) {
      io.to('agent-room').emit('chat:visitor-offline', { visitorId: s.visitorId })
      visitors.delete(socket.id)
    }
    console.log(`[realtime] desconectado: ${socket.id}`)
  })

  socket.on('error', (err) => console.error('[realtime] error', err))
})

httpServer.listen(3003, () => {
  console.log('[realtime] Socket.io escuchando en puerto 3003')
})

// ---------- Canal HTTP interno para las API de Next.js ----------
// POST /emit { event, payload, room? } → emite por WebSocket
const emitServer = createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url ?? '').startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, connections: io.engine.clientsCount }))
    return
  }
  if (req.method === 'POST' && (req.url ?? '').startsWith('/emit')) {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}') as {
        event?: string
        payload?: unknown
        room?: string
      }
      if (!body.event) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end('{"error":"event requerido"}')
        return
      }
      if (body.room) {
        io.to(body.room).emit(body.event, body.payload)
      } else {
        io.emit(body.event, body.payload)
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, event: body.event }))
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end('{"error":"emit failed"}')
    }
    return
  }
  res.writeHead(404)
  res.end()
})

emitServer.listen(3010, () => {
  console.log('[realtime] canal interno de emisión en puerto 3010')
})

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0))
  emitServer.close(() => process.exit(0))
})
