// Seed de datos demo para NexoDesk Helpdesk
// Ejecutar: bun prisma/seed.ts

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const mins = (n: number) => new Date(Date.now() - n * 60_000)
const hours = (n: number) => new Date(Date.now() - n * 3_600_000)
const days = (n: number) => new Date(Date.now() - n * 86_400_000)

async function main() {
  console.log('Limpiando base de datos...')
  await db.emailLog.deleteMany()
  await db.internalNote.deleteMany()
  await db.message.deleteMany()
  await db.ticket.deleteMany()
  await db.kBArticle.deleteMany()
  await db.agent.deleteMany()

  console.log('Creando agentes...')
  const [marta, diego, lucia, andres, sofia] = await Promise.all([
    db.agent.create({ data: { name: 'Marta Ruiz', email: 'marta@nexodesk.io', specialties: 'finanzas', color: '#059669' } }),
    db.agent.create({ data: { name: 'Diego Chen', email: 'diego@nexodesk.io', specialties: 'tecnico', color: '#d97706' } }),
    db.agent.create({ data: { name: 'Lucía Fernández', email: 'lucia@nexodesk.io', specialties: 'cuentas', color: '#0d9488' } }),
    db.agent.create({ data: { name: 'Andrés Molina', email: 'andres@nexodesk.io', specialties: 'general,tecnico', color: '#7c3aed' } }),
    db.agent.create({ data: { name: 'Sofía Torres', email: 'sofia@nexodesk.io', specialties: 'finanzas,cuentas', color: '#dc2626' } }),
  ])

  console.log('Creando artículos de la Base de Conocimiento...')
  const kbData = [
    {
      slug: 'cambiar-contrasena',
      title: 'Cómo cambiar o restablecer tu contraseña',
      tags: 'cuenta,contrasena,acceso,login',
      keywords: 'password,clave,restablecer,recuperar,cambiar',
      content:
        'Para cambiar tu contraseña: 1) Haz clic en tu avatar (esquina superior derecha) y entra en "Mi cuenta". 2) Abre la pestaña "Seguridad". 3) Pulsa "Cambiar contraseña", escribe la actual y la nueva dos veces. 4) Guarda cambios. Si no recuerdas la actual, en la pantalla de inicio de sesión pulsa "¿Olvidaste tu contraseña?" y te enviaremos un enlace de restablecimiento a tu correo (caduca en 30 minutos). Revisa también la carpeta de spam. Por seguridad, el enlace es de un solo uso y recomendamos activar la verificación en dos pasos.',
    },
    {
      slug: 'metodos-de-pago',
      title: 'Métodos de pago aceptados',
      tags: 'pagos,tarjeta,suscripcion',
      keywords: 'tarjeta,visa,mastercard,stripe,paypal,sepa',
      content:
        'Aceptamos: tarjetas de crédito y débito Visa, Mastercard y American Express, PayPal, transferencia SEPA y domiciliación bancaria solo para planes anuales. Los pagos se procesan de forma segura a través de Stripe; nunca almacenamos los datos completos de tu tarjeta. Si un pago falla, intenta: comprobar el límite de tu tarjeta, confirmar que permite compras online (pagos por internet activados) y probar otro método. Los cargos aparecen en tu extracto como "NEXODESK.IO".',
    },
    {
      slug: 'actualizar-tarjeta',
      title: 'Cómo actualizar la tarjeta de crédito de tu suscripción',
      tags: 'pagos,tarjeta,suscripcion',
      keywords: 'actualizar,modificar,tarjeta,caduca,renovar',
      content:
        'Para actualizar tu tarjeta: 1) Ve a "Facturación" en los ajustes de tu cuenta. 2) En "Método de pago" pulsa "Editar". 3) Introduce los datos de la nueva tarjeta y guarda. El siguiente ciclo de facturación se cobrará en la nueva tarjeta. Si tu tarjeta caducó y el pago falló, tienes 7 días de gracia: durante ese periodo puedes pagar manualmente desde "Facturación > Pagar ahora" sin perder el servicio.',
    },
    {
      slug: 'politica-reembolsos',
      title: 'Política de reembolsos y devoluciones',
      tags: 'reembolsos,facturacion,pagos',
      keywords: 'devolucion,dinero,cancelar,reembolso',
      content:
        'Garantía de 14 días: si contrataste un plan anual, puedes pedir el reembolso completo dentro de los primeros 14 días desde la compra respondiendo a este ticket. En planes mensuales no hay reembolso prorrateado, pero puedes cancelar la renovación automática en cualquier momento desde "Facturación > Gestionar suscripción". Los reembolsos aprobados se devuelven al mismo método de pago en un plazo de 5-10 días laborables. Los cargos duplicados se reembolsan siempre de forma automática en menos de 48 h.',
    },
    {
      slug: 'descargar-facturas',
      title: 'Descargar las facturas de tu suscripción',
      tags: 'facturacion,impuestos',
      keywords: 'factura,recibo,descargar,pdf,iva',
      content:
        'Todas tus facturas están disponibles en "Facturación > Historial de facturas". Pulsa el icono de descarga (PDF) junto a la factura que necesites. El PDF incluye tu razón social, NIF/CIF y el desglose de IVA. Puedes editar los datos fiscales en "Facturación > Datos fiscales"; los cambios se aplican a partir de la siguiente factura. Si necesitas una factura de una compra anterior a la creación de tu cuenta, solicítala por ticket indicando la fecha aproximada y el importe.',
    },
    {
      slug: 'integrar-api-webhooks',
      title: 'Integrar la API: autenticación y webhooks',
      tags: 'api,webhook,integracion,desarrolladores',
      keywords: 'token,endpoint,eventos,rest',
      content:
        'La API REST está disponible en https://api.nexodesk.io/v1. Autenticación: crea un token en "Ajustes > API > Generar token" y envíalo en la cabecera Authorization: Bearer <token>. Los webhooks se configuran en "Ajustes > API > Webhooks": añade tu URL HTTPS, elige los eventos (ticket.created, ticket.updated, message.created) y guarda. Firmamos cada envío con HMAC-SHA256 en la cabecera X-NexoDesk-Signature para que puedas validar la autenticidad. Reintentamos los envíos fallidos 5 veces con backoff exponencial.',
    },
    {
      slug: 'verificacion-dos-pasos',
      title: 'Activar la verificación en dos pasos (2FA)',
      tags: 'seguridad,cuenta,2fa',
      keywords: 'verificacion,codigo,doble,autenticador',
      content:
        'Para proteger tu cuenta: 1) Entra en "Mi cuenta > Seguridad". 2) Pulsa "Activar verificación en dos pasos". 3) Escanea el código QR con Google Authenticator, Authy o similar. 4) Introduce el código de 6 dígitos para confirmar. Guarda los códigos de respaldo que te ofrecemos: te permitirán acceder si pierdes el móvil. Cada inicio de sesión en un dispositivo nuevo pedirá un código adicional.',
    },
    {
      slug: 'eliminar-cuenta',
      title: 'Eliminar tu cuenta y tus datos personales (RGPD)',
      tags: 'cuenta,rgpd,privacidad',
      keywords: 'eliminar,borrar,darse de baja,datos',
      content:
        'Puedes eliminar tu cuenta desde "Mi cuenta > Privacidad > Eliminar cuenta". Te pediremos confirmación por correo. La eliminación es definitiva tras 30 días de periodo de gracia (por si cambias de idea); después borramos tus datos personales de forma permanente conforme al RGPD y te enviamos un certificado de supresión. Los datos de facturación se conservan 6 años por obligación legal, disociados de tu perfil.',
    },
    {
      slug: 'tiempos-entrega',
      title: 'Tiempos de entrega y seguimiento de pedidos',
      tags: 'envio,entrega,pedidos',
      keywords: 'pedido,llega,retraso,seguimiento,transportista',
      content:
        'Los pedidos se entregan en 3-5 días laborables (península) y 5-8 (Baleares y Canarias). Al expedir el pedido recibes un correo con el número de seguimiento; también puedes verlo en "Mis pedidos". Si han pasado más de 5 días laborables y el seguimiento no se actualiza, escríbenos por ticket: abriremos una incidencia con el transportista y te responderemos en menos de 24 h laborables.',
    },
  ]
  const kb = await Promise.all(
    kbData.map((a, i) => db.kBArticle.create({ data: { ...a, views: [42, 128, 61, 33, 57, 12, 24, 8, 71][i] } }))
  )
  console.log(`  ${kb.length} artículos`)

  console.log('Creando tickets con hilos y notas...')

  // TCK-1001 · El caso estrella: enrutamiento Zero-Touch a Finanzas con prioridad Crítica
  const t1 = await db.ticket.create({
    data: {
      ref: 'TCK-1001',
      subject: 'Error en pasarela de pago al procesar el cobro',
      description:
        'Buenas, desde esta mañana ningún cliente puede completar la compra. Al llegar a la pasarela de pago, Stripe devuelve "payment_failed" y el cargo no se procesa. Estamos perdiendo pedidos en producción, es urgente.',
      status: 'ABIERTO',
      priority: 'CRITICA',
      source: 'EMAIL',
      category: 'FINANZAS',
      customerName: 'Javier Ortega',
      customerEmail: 'javier.ortega@tiendaverde.es',
      assigneeId: marta.id,
      routingReason:
        'Palabras clave detectadas: "pasarela de pago", "pago", "cobro" → especialidad FINANZAS · regla de urgencia por "pasarela de pago" → prioridad CRITICA · agente experto en FINANZAS con menor carga seleccionado: Marta Ruiz (1 tickets abiertos)',
      createdAt: mins(95),
      messages: {
        create: [
          {
            authorType: 'CUSTOMER',
            authorName: 'Javier Ortega',
            body: 'Buenas, desde esta mañana ningún cliente puede completar la compra. Al llegar a la pasarela de pago, Stripe devuelve "payment_failed" y el cargo no se procesa. Estamos perdiendo pedidos en producción, es urgente.',
            createdAt: mins(95),
          },
          {
            authorType: 'SYSTEM',
            authorName: 'Motor Zero-Touch',
            body: '🎫 Ticket creado desde Email · Enrutado automáticamente a Marta Ruiz (Finanzas) con prioridad Crítica.',
            createdAt: mins(94),
          },
        ],
      },
      notes: {
        create: [
          {
            authorName: 'Marta Ruiz',
            body: 'Confirmado con Stripe: es su incidencia de estado 503 en la región eu-west. Ya hay un ticket abierto en su status page. Preparar plantilla de disculpas por si tarda más de 1 h.',
            createdAt: mins(60),
          },
        ],
      },
      emails: {
        create: {
          toEmail: 'javier.ortega@tiendaverde.es',
          subject: 'Hemos recibido tu solicitud · TCK-1001',
          body: 'Hola Javier, tu ticket TCK-1001 "Error en pasarela de pago al procesar el cobro" ha sido recibido y asignado a nuestro equipo de Finanzas. Te responderemos lo antes posible.',
          kind: 'TICKET_CREATED',
          createdAt: mins(94),
        },
      },
    },
  })

  // TCK-1002 · Resuelto, a la espera de CSAT (demo de la encuesta en el portal)
  const t2 = await db.ticket.create({
    data: {
      ref: 'TCK-1002',
      subject: '¿Cómo cambio mi contraseña?',
      description:
        'Hola, quiero cambiar la contraseña de mi cuenta porque creo que alguien más la sabe. ¿Cómo lo hago?',
      status: 'RESUELTO',
      priority: 'MEDIA',
      source: 'FORMULARIO_WEB',
      category: 'CUENTAS',
      customerName: 'Laura Gómez',
      customerEmail: 'laura.gomez@example.com',
      assigneeId: lucia.id,
      routingReason:
        'Palabras clave detectadas: "contrasena", "cuenta" → especialidad CUENTAS · agente experta en CUENTAS con menor carga seleccionada: Lucía Fernández (0 tickets abiertos)',
      firstResponseAt: mins(38),
      resolvedAt: mins(30),
      csatSentAt: mins(29),
      createdAt: hours(3),
      messages: {
        create: [
          {
            authorType: 'CUSTOMER',
            authorName: 'Laura Gómez',
            body: 'Hola, quiero cambiar la contraseña de mi cuenta porque creo que alguien más la sabe. ¿Cómo lo hago?',
            createdAt: hours(3),
          },
          {
            authorType: 'SYSTEM',
            authorName: 'Motor Zero-Touch',
            body: '🎫 Ticket creado desde Formulario Web · Enrutado automáticamente a Lucía Fernández (Cuentas).',
            createdAt: hours(2) /* aprox */,
          },
          {
            authorType: 'AGENT',
            authorName: 'Lucía Fernández',
            body: 'Hola Laura, claro que sí. Ve a tu avatar > "Mi cuenta" > pestaña "Seguridad" > "Cambiar contraseña". Como sospechas que alguien conoce la actual, te recomiendo además cerrar todas las sesiones activas (mismo menú, botón "Cerrar sesiones") y activar la verificación en dos pasos. Si prefieres, en la pantalla de login puedes usar "¿Olvidaste tu contraseña?" y recibir un enlace. Quedo a tu disposición.',
            createdAt: mins(38),
          },
        ],
      },
      emails: {
        create: [
          {
            toEmail: 'laura.gomez@example.com',
            subject: 'Hemos recibido tu solicitud · TCK-1002',
            body: 'Hola Laura, tu ticket TCK-1002 "¿Cómo cambio mi contraseña?" ha sido recibido y asignado a nuestro equipo de Cuentas.',
            kind: 'TICKET_CREATED',
            createdAt: hours(2),
          },
          {
            toEmail: 'laura.gomez@example.com',
            subject: 'Re: ¿Cómo cambio mi contraseña? · TCK-1002',
            body: 'Hola Laura, claro que sí. Ve a tu avatar > "Mi cuenta" > pestaña "Seguridad" > "Cambiar contraseña". [...]',
            kind: 'AGENT_REPLY',
            createdAt: mins(38),
          },
          {
            toEmail: 'laura.gomez@example.com',
            subject: '¿Cómo fue tu experiencia? (1 clic) · TCK-1002',
            body: 'Nos encantaría saber qué tal te fue con la resolución de tu ticket. Responde con un solo clic: 😊 Feliz · 😐 Neutral · ☹️ Triste',
            kind: 'CSAT_REQUEST',
            createdAt: mins(29),
          },
        ],
      },
    },
  })

  // TCK-1003 · WhatsApp, en espera
  const t3 = await db.ticket.create({
    data: {
      ref: 'TCK-1003',
      subject: 'Mi pedido no llega desde hace 10 días',
      description:
        'Hice un pedido el día 20 y sigue sin llegar. El seguimiento lleva una semana igual. ¿Qué pasa?',
      status: 'EN_ESPERA',
      priority: 'MEDIA',
      source: 'WHATSAPP',
      category: 'GENERAL',
      customerName: 'Carmen Ibáñez',
      customerEmail: 'carmen.ibanez@example.com',
      assigneeId: andres.id,
      routingReason:
        'Palabras clave detectadas: "pedido", "llega" → especialidad GENERAL · asignado por carga mínima: Andrés Molina (1 tickets abiertos)',
      firstResponseAt: hours(26),
      createdAt: days(2),
      messages: {
        create: [
          {
            authorType: 'CUSTOMER',
            authorName: 'Carmen Ibáñez',
            body: 'Hice un pedido el día 20 y sigue sin llegar. El seguimiento lleva una semana igual. ¿Qué pasa?',
            createdAt: days(2),
          },
          {
            authorType: 'AGENT',
            authorName: 'Andrés Molina',
            body: 'Hola Carmen, gracias por escribirnos. He abierto una incidencia con el transportista (nº SEUR-88123). Nos confirmarán el estado en 24-48 h. Te escribo en cuanto tenga novedades, disculpa las molestias.',
            createdAt: hours(26),
          },
          {
            authorType: 'SYSTEM',
            authorName: 'Sistema',
            body: '⏸️ Ticket pasado a "En Espera" a la espera de respuesta del transportista.',
            createdAt: hours(25),
          },
        ],
      },
      notes: {
        create: [
          {
            authorName: 'Andrés Molina',
            body: 'Tercer pedido con retraso de este transportista esta semana. Si se repite, proponer a Dirección cambiar de proveedor. Incidencia interna INC-4471.',
            createdAt: hours(24),
          },
        ],
      },
      emails: {
        create: {
          toEmail: 'carmen.ibanez@example.com',
          subject: 'Re: Mi pedido no llega desde hace 10 días · TCK-1003',
          body: 'Hola Carmen, he abierto una incidencia con el transportista (nº SEUR-88123). [...]',
          kind: 'AGENT_REPLY',
          createdAt: hours(26),
        },
      },
    },
  })

  // TCK-1004 · Chat en vivo activo (para demo en tiempo real)
  const t4 = await db.ticket.create({
    data: {
      ref: 'TCK-1004',
      subject: 'No puedo iniciar sesión tras actualizar la app',
      description:
        'Acabo de actualizar la app a la versión 4.2 y al poner mis credenciales dice "sesión no válida".',
      status: 'ABIERTO',
      priority: 'ALTA',
      source: 'CHAT_EN_VIVO',
      category: 'TECNICO',
      customerName: 'Pablo Serrano',
      customerEmail: 'pablo.serrano@example.com',
      assigneeId: diego.id,
      visitorId: 'visitor-demo-pablo',
      routingReason:
        'Palabras clave detectadas: "no funciona", "error", "app" → especialidad TECNICO · agente experto en TECNICO con menor carga seleccionado: Diego Chen (1 tickets abiertos)',
      createdAt: mins(14),
      messages: {
        create: [
          {
            authorType: 'CUSTOMER',
            authorName: 'Pablo Serrano',
            body: '¡Hola! Acabo de actualizar la app a la versión 4.2 y al poner mis credenciales dice "sesión no válida".',
            createdAt: mins(14),
          },
          {
            authorType: 'SYSTEM',
            authorName: 'Motor Zero-Touch',
            body: '💬 Chat en vivo iniciado · Ticket TCK-1004 creado y enrutado a Diego Chen (Técnico).',
            createdAt: mins(13),
          },
        ],
      },
      emails: {
        create: {
          toEmail: 'pablo.serrano@example.com',
          subject: 'Transcripción de tu chat · TCK-1004',
          body: 'Gracias por chatear con NexoDesk. Tu conversación quedó registrada como ticket TCK-1004.',
          kind: 'TICKET_CREATED',
          createdAt: mins(13),
        },
      },
    },
  })

  // TCK-1005 · Finanzas resuelto con CSAT feliz
  const t5 = await db.ticket.create({
    data: {
      ref: 'TCK-1005',
      subject: 'Cargo duplicado en mi tarjeta este mes',
      description:
        'Me han cobrado dos veces la suscripción de este mes (dos cargos de 29,90 € el mismo día). Quiero la devolución.',
      status: 'RESUELTO',
      priority: 'CRITICA',
      source: 'EMAIL',
      category: 'FINANZAS',
      customerName: 'Elena Vidal',
      customerEmail: 'elena.vidal@estudiovidal.com',
      assigneeId: sofia.id,
      routingReason:
        'Palabras clave detectadas: "cargo", "cobro", "tarjeta" → especialidad FINANZAS · regla de urgencia por "cargo duplicado" → prioridad CRITICA · asignada: Sofía Torres',
      firstResponseAt: mins(52),
      resolvedAt: hours(5),
      csatSentAt: hours(5),
      csatScore: 3,
      createdAt: days(1),
      messages: {
        create: [
          {
            authorType: 'CUSTOMER',
            authorName: 'Elena Vidal',
            body: 'Me han cobrado dos veces la suscripción de este mes (dos cargos de 29,90 € el mismo día). Quiero la devolución.',
            createdAt: days(1),
          },
          {
            authorType: 'AGENT',
            authorName: 'Sofía Torres',
            body: 'Hola Elena, tienes razón: confirmo el cargo duplicado de 29,90 € (ref. STRIPE-99182). He solicitado el reembolso automático, lo verás en tu cuenta en 24-48 h. Te envío el justificante por correo. Disculpa las molestias.',
            createdAt: mins(52),
          },
          {
            authorType: 'SYSTEM',
            authorName: 'Sistema',
            body: '✅ Ticket resuelto por Sofía Torres. Encuesta de satisfacción enviada automáticamente.',
            createdAt: hours(5),
          },
        ],
      },
      notes: {
        create: [
          {
            authorName: 'Sofía Torres',
            body: 'Revisar con Ingeniería: otros 3 clientes con doble cargo en el batch del día 28. Posible bug en el reintento del webhook de Stripe.',
            createdAt: mins(50),
          },
        ],
      },
      emails: {
        create: [
          {
            toEmail: 'elena.vidal@estudiovidal.com',
            subject: 'Re: Cargo duplicado en mi tarjeta este mes · TCK-1005',
            body: 'Hola Elena, confirmo el cargo duplicado de 29,90 €. He solicitado el reembolso automático [...]',
            kind: 'AGENT_REPLY',
            createdAt: mins(52),
          },
          {
            toEmail: 'elena.vidal@estudiovidal.com',
            subject: '¿Cómo fue tu experiencia? (1 clic) · TCK-1005',
            body: 'Responde con un solo clic: 😊 Feliz · 😐 Neutral · ☹️ Triste',
            kind: 'CSAT_REQUEST',
            createdAt: hours(5),
          },
        ],
      },
    },
  })

  // TCK-1006 · Técnico, abierto
  const t6 = await db.ticket.create({
    data: {
      ref: 'TCK-1006',
      subject: '¿Cómo integro los webhooks de la API con mi backend?',
      description:
        'Estamos integrando NexoDesk con nuestro CRM. ¿Dónde configuro los webhooks y cómo valido la firma de las peticiones?',
      status: 'ABIERTO',
      priority: 'MEDIA',
      source: 'EMAIL',
      category: 'TECNICO',
      customerName: 'Rubén Castro',
      customerEmail: 'ruben@devforge.io',
      assigneeId: diego.id,
      routingReason:
        'Palabras clave detectadas: "webhook", "api", "integracion" → especialidad TECNICO · asignado: Diego Chen (1 tickets abiertos)',
      createdAt: mins(42),
      messages: {
        create: [
          {
            authorType: 'CUSTOMER',
            authorName: 'Rubén Castro',
            body: 'Estamos integrando NexoDesk con nuestro CRM. ¿Dónde configuro los webhooks y cómo valido la firma de las peticiones?',
            createdAt: mins(42),
          },
          {
            authorType: 'SYSTEM',
            authorName: 'Motor Zero-Touch',
            body: '🎫 Ticket creado desde Email · Enrutado automáticamente a Diego Chen (Técnico).',
            createdAt: mins(41),
          },
        ],
      },
    },
  })

  // TCK-1007 · Finanzas, en espera
  const t7 = await db.ticket.create({
    data: {
      ref: 'TCK-1007',
      subject: 'Solicitud de reembolso del plan anual',
      description:
        'Contratamos el plan anual hace 8 días, pero finalmente no vamos a usar la herramienta. Queremos solicitar la devolución.',
      status: 'EN_ESPERA',
      priority: 'ALTA',
      source: 'FORMULARIO_WEB',
      category: 'FINANZAS',
      customerName: 'Nuria Palacios',
      customerEmail: 'nuria.palacios@grupokairos.es',
      assigneeId: sofia.id,
      routingReason:
        'Palabras clave detectadas: "reembolso", "plan" → especialidad FINANZAS · asignada: Sofía Torres (1 tickets abiertos)',
      firstResponseAt: hours(20),
      createdAt: days(1),
      messages: {
        create: [
          {
            authorType: 'CUSTOMER',
            authorName: 'Nuria Palacios',
            body: 'Contratamos el plan anual hace 8 días, pero finalmente no vamos a usar la herramienta. Queremos solicitar la devolución.',
            createdAt: days(1),
          },
          {
            authorType: 'AGENT',
            authorName: 'Sofía Torres',
            body: 'Hola Nuria, gracias por escribirnos. Tu compra está dentro de la garantía de 14 días, así que procede el reembolso completo. Necesito que me confirmes el CIF de facturación para emitir la abono. En cuanto lo confirmes, proceso la devolución (5-10 días laborables).',
            createdAt: hours(20),
          },
        ],
      },
    },
  })

  // TCK-1008 · Técnico resuelto con CSAT neutral
  const t8 = await db.ticket.create({
    data: {
      ref: 'TCK-1008',
      subject: 'La app se cierra sola en Android al abrir el panel',
      description:
        'Tengo un Samsung A54 y desde el martes la app se cierra sola al abrir el panel de estadísticas.',
      status: 'RESUELTO',
      priority: 'ALTA',
      source: 'WHATSAPP',
      category: 'TECNICO',
      customerName: 'Iván Ledesma',
      customerEmail: 'ivan.ledesma@example.com',
      assigneeId: diego.id,
      routingReason:
        'Palabras clave detectadas: "app", "error", "crash" → especialidad TECNICO · asignado: Diego Chen (0 tickets abiertos)',
      firstResponseAt: hours(70),
      resolvedAt: days(2),
      csatSentAt: days(2),
      csatScore: 2,
      createdAt: days(4),
      messages: {
        create: [
          {
            authorType: 'CUSTOMER',
            authorName: 'Iván Ledesma',
            body: 'Tengo un Samsung A54 y desde el martes la app se cierra sola al abrir el panel de estadísticas.',
            createdAt: days(4),
          },
          {
            authorType: 'AGENT',
            authorName: 'Diego Chen',
            body: 'Hola Iván, es un bug conocido de la 4.1 en Android 14. Publicamos la 4.1.1 esta noche en la Play Store: actualiza y se corrige. Como alternativa inmediata, desactiva "Gráficos animados" en Ajustes > Panel. Gracias por avisarnos.',
            createdAt: hours(70),
          },
        ],
      },
    },
  })

  // TCK-1009 · Cerrado con CSAT feliz
  const t9 = await db.ticket.create({
    data: {
      ref: 'TCK-1009',
      subject: '¿Puedo descargar las facturas de mi suscripción?',
      description: 'Necesito las facturas de los últimos meses para contabilidad.',
      status: 'CERRADO',
      priority: 'BAJA',
      source: 'CHAT_EN_VIVO',
      category: 'CUENTAS',
      customerName: 'Rocío Márquez',
      customerEmail: 'rocio.marquez@estudiomarquez.es',
      assigneeId: lucia.id,
      routingReason:
        'Palabras clave detectadas: "facturas", "suscripcion" → especialidad CUENTAS · asignada: Lucía Fernández',
      firstResponseAt: mins(6),
      resolvedAt: days(6),
      closedAt: days(5),
      csatSentAt: days(6),
      csatScore: 3,
      createdAt: days(6),
      messages: {
        create: [
          {
            authorType: 'CUSTOMER',
            authorName: 'Rocío Márquez',
            body: 'Necesito las facturas de los últimos meses para contabilidad.',
            createdAt: days(6),
          },
          {
            authorType: 'AGENT',
            authorName: 'Lucía Fernández',
            body: '¡Hola Rocío! Están en "Facturación > Historial de facturas", con el icono de descarga en PDF. Incluyen tu NIF y el desglose de IVA. Si necesitas alguna anterior a tu cuenta, dime la fecha y te la genero. ¡Un saludo!',
            createdAt: mins(6),
          },
          {
            authorType: 'SYSTEM',
            authorName: 'Sistema',
            body: '🔒 Ticket cerrado tras 24 h sin respuesta del cliente. CSAT recibido: 😊',
            createdAt: days(5),
          },
        ],
      },
    },
  })

  // TCK-1010 · General sin asignar (colapso de carga)
  const t10 = await db.ticket.create({
    data: {
      ref: 'TCK-1010',
      subject: 'Consulta sobre formación para mi equipo',
      description: '¿Ofrecen sesiones de onboarding en vídeo para equipos nuevos? Somos 12 personas.',
      status: 'ABIERTO',
      priority: 'BAJA',
      source: 'FORMULARIO_WEB',
      category: 'GENERAL',
      customerName: 'Tomás Herrera',
      customerEmail: 'tomas.herrera@example.com',
      assigneeId: andres.id,
      routingReason: 'Sin palabras clave de especialidad → cola General · asignado por carga mínima: Andrés Molina',
      createdAt: mins(8),
      messages: {
        create: [
          {
            authorType: 'CUSTOMER',
            authorName: 'Tomás Herrera',
            body: '¿Ofrecen sesiones de onboarding en vídeo para equipos nuevos? Somos 12 personas.',
            createdAt: mins(8),
          },
        ],
      },
    },
  })

  const count = await db.ticket.count()
  console.log(`✅ Seed completado: ${count} tickets, 5 agentes, ${kb.length} artículos KB`)
  console.log(`   Refs: ${t1.ref} ${t2.ref} ${t3.ref} ${t4.ref} ${t5.ref} ${t6.ref} ${t7.ref} ${t8.ref} ${t9.ref} ${t10.ref}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
