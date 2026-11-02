// ============================================================
// AUTOMATIZACIÓN 2 · Copiloto del Agente (Sugerencia de Respuestas IA)
// ------------------------------------------------------------
// Al abrir un ticket, la IA lee la duda del cliente, busca en la
// Base de Conocimientos y redacta un borrador de respuesta para
// que el agente solo tenga que revisar y pulsar "Enviar".
// El SDK z-ai-web-dev-sdk SOLO se usa en el backend.
// ============================================================

import ZAI from 'z-ai-web-dev-sdk'
import { searchArticles } from './search'
import type { SearchableArticle } from './search'

export interface CopilotDraft {
  draft: string
  sources: { slug: string; title: string }[]
  generatedAt: string
}

export async function generateAgentDraft(
  subject: string,
  description: string,
  thread: { authorName: string; authorType: string; body: string }[],
  kbArticles: SearchableArticle[],
  agentName?: string
): Promise<CopilotDraft> {
  // 1. Búsqueda semántica en la KB con la duda del cliente
  const results = searchArticles(`${subject} ${description}`, kbArticles, 3)
  const sources = results.map((r) => ({ slug: r.article.slug, title: r.article.title }))
  const kbContext = results
    .map((r, i) => `--- Artículo ${i + 1}: "${r.article.title}" ---\n${r.article.content.slice(0, 700)}`)
    .join('\n\n')

  const lastCustomerMsg =
    thread
      .filter((m) => m.authorType === 'CUSTOMER')
      .slice(-2)
      .map((m) => `- ${m.body}`)
      .join('\n') || description

  // 2. Redacción del borrador con el LLM
  const zai = await ZAI.create()

  const systemPrompt = [
    'Eres el Copiloto IA de un equipo de soporte de "NexoDesk".',
    'Redactas BORRADORES de respuesta para que un agente humano los revise antes de enviarlos al cliente.',
    `El agente que firmará la respuesta se llama ${agentName ?? 'el equipo de soporte'}.`,
    'Reglas:',
    '- Responde SIEMPRE en español de España, tono cercano pero profesional.',
    '- Máximo 120 palabras, con un saludo breve y una despedida con tu nombre de agente.',
    '- Usa EXCLUSIVAMENTE la información de los artículos de ayuda proporcionados; si no contienen la solución, di que estás investigando y pide un dato concreto útil.',
    '- No inventes precios, plazos ni políticas.',
    '- Devuelve SOLO el texto del borrador, sin markdown ni comillas.',
  ].join('\n')

  const userPrompt = [
    `TICKET: ${subject}`,
    `DESCRIPCIÓN DEL CLIENTE: ${description}`,
    `ÚLTIMOS MENSAJES DEL CLIENTE:\n${lastCustomerMsg}`,
    kbContext ? `ARTÍCULOS DE LA BASE DE CONOCIMIENTOS:\n${kbContext}` : 'No hay artículos relacionados.',
    '\nRedacta el borrador de respuesta.',
  ].join('\n\n')

  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    thinking: { type: 'disabled' },
  })

  const draft = completion.choices[0]?.message?.content?.trim() ?? ''

  if (!draft) {
    throw new Error('La IA no devolvió ningún borrador')
  }

  return {
    draft,
    sources,
    generatedAt: new Date().toISOString(),
  }
}
