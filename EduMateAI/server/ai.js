// AI features. Uses Google Gemini (GEMINI_API_KEY) or Claude (ANTHROPIC_API_KEY); with neither,
// falls back to a simple search over the student's own flashcards / quiz explanations / reviewer notes.
//
// Callers pass messages as { role: 'user' | 'assistant', content: string | Block[] } where a Block is
// { type: 'text', text } or { type: 'document', source: { media_type, data } } (base64). Each provider
// function converts that to its own API format.
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { all } from './db/index.js'
import { HttpError } from './errors.js'

const provider = () => {
  if (config.aiProvider === 'gemini' && config.geminiApiKey) return 'gemini'
  if (config.aiProvider === 'anthropic' && config.anthropicApiKey) return 'anthropic'
  return null
}
export const aiEnabled = () => provider() !== null

async function failed(res, name) {
  const detail = await res.text().catch(() => '')
  console.error(`[ai] ${name} API error`, res.status, detail.slice(0, 500))
  if (res.status === 429) throw new HttpError(429, 'The AI usage limit has been reached for now. Please wait a minute (or until tomorrow on the free tier) and try again.')
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new HttpError(502, `The AI service rejected the request (${res.status}). Check the API key and model name in the server .env file.`)
  throw new HttpError(502, 'The AI service is unavailable right now. Please try again in a moment.')
}

async function callGemini({ system, messages, maxTokens, json }) {
  const toParts = (content) => (typeof content === 'string' ? [{ text: content }] : content.map((b) =>
    b.type === 'document' ? { inline_data: { mime_type: b.source.media_type, data: b.source.data } } : { text: b.text }))
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: toParts(m.content) })),
    // Gemini "thinking" models spend part of the output budget on reasoning, so leave headroom.
    generationConfig: { maxOutputTokens: maxTokens + 8192, ...(json ? { responseMimeType: 'application/json' } : {}) },
  })
  // Try the main model, then the fallback when it is overloaded (503), rate-limited (429) or retired (404).
  const models = [...new Set([config.geminiModel, config.geminiFallbackModel].filter(Boolean))]
  let res
  for (const [i, model] of models.entries()) {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': config.geminiApiKey },
      body,
    })
    if (res.ok || ![404, 429, 500, 503].includes(res.status) || i === models.length - 1) break
    console.warn(`[ai] Gemini model ${model} returned ${res.status}; trying ${models[i + 1]}`)
  }
  if (!res.ok) await failed(res, 'Gemini')
  const data = await res.json()
  const candidate = data.candidates?.[0]
  const text = candidate?.content?.parts?.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim() || ''
  if (!text) {
    console.error('[ai] Gemini returned no text', candidate?.finishReason, data.promptFeedback?.blockReason)
    throw new HttpError(502, 'The AI could not answer that. Please rephrase and try again.')
  }
  return text
}

async function callClaude({ system, messages, maxTokens }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: config.anthropicModel, max_tokens: maxTokens, system, messages }),
  })
  if (!res.ok) await failed(res, 'Claude')
  const data = await res.json()
  return data.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() || ''
}

function callAI({ system, messages, maxTokens = 1024, json = false }) {
  return provider() === 'gemini' ? callGemini({ system, messages, maxTokens, json }) : callClaude({ system, messages, maxTokens })
}

/** Study material the student owns, used as grounding context. */
function studyContext(userId, subjectId) {
  const where = subjectId ? 'AND m.subject_id = ?' : ''
  const args = subjectId ? [userId, subjectId] : [userId]
  const cards = all(`SELECT f.question, f.answer, m.title FROM flashcards f JOIN modules m ON m.id = f.module_id WHERE f.user_id = ? ${where} LIMIT 200`, ...args)
  const qs = all(`SELECT q.question, q.choices, q.correct_index, q.explanation, m.title FROM quiz_questions q JOIN modules m ON m.id = q.module_id WHERE q.user_id = ? ${where} LIMIT 200`, ...args)
  const notes = all(`SELECT m.title, m.reviewer FROM modules m WHERE m.user_id = ? ${where} AND m.reviewer <> ''`, ...args)
  return [
    ...cards.map((c) => ({ source: c.title, text: `${c.question} ${c.answer}`, answer: c.answer })),
    ...qs.map((q) => {
      const correct = JSON.parse(q.choices)[q.correct_index] ?? ''
      return { source: q.title, text: `${q.question} ${correct} ${q.explanation}`, answer: q.explanation || correct }
    }),
    ...notes.flatMap((n) => n.reviewer.split(/\n{2,}/).map((p) => ({ source: n.title, text: p, answer: p.replace(/[#>*`]/g, '').trim() }))),
  ]
}

const STOP = new Set('a an the is are was were what which who how why does do did of in on for to and or with explain me give tell about can you please my this that be it'.split(' '))
const words = (s) => s.toLowerCase().replace(/[^a-z0-9()]+/g, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w))

function offlineAnswer(question, context) {
  const q = new Set(words(question))
  let best = null
  let bestScore = 0
  for (const item of context) {
    const score = words(item.text).reduce((n, w) => n + (q.has(w) ? 1 : 0), 0)
    if (score > bestScore) { best = item; bestScore = score }
  }
  if (!best) {
    return context.length
      ? "I couldn't find that in your study materials yet. Try rephrasing, or add flashcards/notes for this topic so I can help."
      : 'Upload a module and add some flashcards or quiz questions, and I will answer using your own course material.'
  }
  return `From your “${best.source}” material: ${best.answer}`
}

export async function chatReply(userId, subjectId, history, question) {
  const context = studyContext(userId, subjectId)
  if (!aiEnabled()) return offlineAnswer(question, context)

  const material = context.slice(0, 120).map((c) => `[${c.source}] ${c.text}`).join('\n')
  const system = `You are EduMate, a friendly study assistant for university students. Answer clearly and concisely (under 180 words unless asked for more). Prefer the student's own course material below and mention which module an answer comes from. If the material does not cover the question, say so briefly and answer from general knowledge.\n\nSTUDENT MATERIAL:\n${material || '(none uploaded yet)'}`
  const messages = [...history.slice(-12).map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content })), { role: 'user', content: question }]
  // The API requires the first message to come from the user.
  while (messages.length && messages[0].role !== 'user') messages.shift()
  return callAI({ system, messages, maxTokens: 700 })
}

/** Ask the AI to build a reviewer, flashcards and quiz questions from an uploaded module. */
export async function generateStudyMaterial(module, subjectName) {
  if (!aiEnabled()) throw new HttpError(503, 'AI generation needs a GEMINI_API_KEY or ANTHROPIC_API_KEY in the server .env file. You can still add flashcards and questions manually.')

  const content = []
  const filePath = module.stored_name ? path.join(config.uploadDir, module.stored_name) : null
  if (filePath && fs.existsSync(filePath)) {
    if (module.file_type === 'PDF' && module.size_bytes < 30 * 1024 * 1024) {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fs.readFileSync(filePath).toString('base64') } })
    } else if (['TXT', 'MD'].includes(module.file_type)) {
      content.push({ type: 'text', text: `MODULE TEXT:\n${fs.readFileSync(filePath, 'utf8').slice(0, 150_000)}` })
    }
  }
  const grounded = content.length > 0
  content.push({ type: 'text', text: `Subject: ${subjectName}\nModule title: ${module.title}\n${grounded ? 'Use ONLY the attached module content.' : 'The file content is not available; base the material on the standard university-level coverage of this module title.'}

Return ONLY valid JSON (no markdown fences) with this shape:
{"reviewer": "markdown study notes using ## headings, short paragraphs, - bullet lists and **bold** key terms (300-600 words)",
 "flashcards": [{"question": "...", "answer": "..."}],
 "questions": [{"question": "...", "choices": ["A","B","C","D"], "correctIndex": 0, "explanation": "...", "topic": "short topic name", "difficulty": "Easy|Medium|Hard"}]}
Create 8-12 flashcards and 8-10 multiple-choice questions with exactly 4 choices each.` })

  const text = await callAI({ system: 'You create accurate, exam-focused study material for university students.', messages: [{ role: 'user', content }], maxTokens: 6000, json: true })
  try {
    const json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''))
    return {
      reviewer: String(json.reviewer || ''),
      flashcards: (json.flashcards || []).filter((f) => f.question && f.answer),
      questions: (json.questions || []).filter((q) => q.question && Array.isArray(q.choices) && q.choices.length >= 2 && Number.isInteger(q.correctIndex) && q.correctIndex < q.choices.length),
      grounded,
    }
  } catch {
    throw new HttpError(502, 'The AI returned an unexpected format. Please try generating again.')
  }
}
