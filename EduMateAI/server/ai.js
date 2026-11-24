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

/** Shuffle a copy of an array (Fisher–Yates). */
const shuffled = (a) => {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] }
  return b
}

/** Put a question's choices (and their notes) in random order so the answer isn't always in the same slot. */
function shuffleChoices(q) {
  const order = shuffled(q.choices.map((_, i) => i))
  return { ...q, choices: order.map((i) => q.choices[i]), choiceNotes: order.map((i) => q.choiceNotes[i] ?? ''), correctIndex: order.indexOf(q.correctIndex) }
}

const NOTE_RULES = `For the correct choice, explain briefly why it is correct. For EVERY wrong choice, explain what that choice actually means or refers to (its own definition or use, from the reviewer if it appears there) and why it does not answer this question. Each note is 1-2 sentences and ends with a short concrete example starting with "Example:".`

const SYSTEM = 'You create accurate, exam-focused study material for university students. You never invent facts that are not in the source you are given.'

/**
 * Step 1: summarise the module into a reviewer. It must keep every definition and key term from the
 * module, because the Q&A, flashcards and quiz are generated from this reviewer alone (step 2).
 */
async function generateReviewer(module, subjectName) {
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
  content.push({ type: 'text', text: `Subject: ${subjectName}
Module title: ${module.title}
${grounded ? 'Use ONLY the attached module content. Do not add facts that are not in it.' : 'The file content is not available; base the reviewer on the standard university-level coverage of this module title.'}

Write a complete, accurate study reviewer of this module in Markdown.

Requirements:
- Read the WHOLE module and summarise every topic it covers, in the module's own order.
- Include EVERY definition and EVERY keyword / technical term that appears in the module. Do not skip any, even minor ones.
  Keep definitions faithful to the module's wording and meaning.
- Structure:
  ## Overview — 2-4 sentences on what the module is about.
  ## <Topic> — one section per topic: short paragraphs and "- " bullets with the key points, steps, formulas, examples, comparisons and lists from the module. **Bold** each key term where it is explained.
  ## Key Terms and Definitions — a glossary listing every key term from the module, one per line, as "- **Term** — definition".
  ## Quick Recap — 4-8 bullets with the most important takeaways.
- Length: as long as needed to cover everything (no word limit), but concise — no filler.
- Return only the Markdown, with no code fences and no title line.` })

  const text = await callAI({ system: SYSTEM, messages: [{ role: 'user', content }], maxTokens: 8000 })
  const reviewer = text.replace(/^```(?:markdown|md)?\s*|\s*```$/g, '').trim()
  if (!reviewer) throw new HttpError(502, 'The AI could not summarise this module. Please try generating again.')
  return { reviewer, grounded }
}

/** Step 2: build flashcards and quiz questions using only what the reviewer says. */
async function generateFromReviewer(reviewer, module, subjectName) {
  const prompt = `Subject: ${subjectName}
Module title: ${module.title}

REVIEWER:
"""
${reviewer}
"""

Using ONLY the information written in the reviewer above, create study material. Every question and answer must be answerable from the reviewer; do not introduce outside facts.

Return ONLY valid JSON (no markdown fences) with this shape:
{"flashcards": [{"question": "...", "answer": "..."}],
 "questions": [{"question": "...", "choices": ["...","...","...","..."], "correctIndex": 0,
   "explanation": "why the correct answer is right, with a short example",
   "choiceNotes": ["note for choice 1", "note for choice 2", "note for choice 3", "note for choice 4"],
   "topic": "short topic name (a reviewer section)", "difficulty": "Easy|Medium|Hard"}]}

Rules:
- Flashcards: one card for every term in the "Key Terms and Definitions" section ("What is <term>?" → its definition), plus cards for other key concepts. Between 10 and 40 cards.
- Questions: 12-20 multiple-choice questions with exactly 4 choices each, covering every section of the reviewer, mixed Easy / Medium / Hard.
- The correct choice should be short (a term, phrase or value) so it can also be used as a typed answer.
- Wrong choices must be plausible (use other terms from the reviewer where possible).
- "choiceNotes" has exactly one entry per choice, in the same order. NEVER leave a note empty. ${NOTE_RULES}`

  const text = await callAI({ system: SYSTEM, messages: [{ role: 'user', content: prompt }], maxTokens: 12000, json: true })
  let json
  try {
    json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    throw new HttpError(502, 'The AI returned an unexpected format. Please try generating again.')
  }
  return {
    flashcards: (json.flashcards || []).filter((f) => f.question && f.answer),
    questions: (json.questions || [])
      .filter((q) => q.question && Array.isArray(q.choices) && q.choices.length >= 2 && Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.choices.length)
      .map((q) => shuffleChoices({ ...q, choiceNotes: Array.isArray(q.choiceNotes) ? q.choiceNotes.map((n) => String(n ?? '')) : [] })),
  }
}

/** Glossary lines from a reviewer ("- **Term** — definition"), keyed by lower-case term. */
function glossary(reviewer) {
  const map = new Map()
  for (const m of (reviewer || '').matchAll(/^\s*[-*]\s+\*\*(.+?)\*\*\s*(?:—|–|-|:)\s*(.+)$/gm)) map.set(m[1].trim().toLowerCase(), m[2].trim())
  return map
}

/**
 * Write the missing per-choice notes for existing questions (e.g. ones generated before notes existed).
 * `items` is [{ id, question, choices, correctIndex, explanation, notes }]; returns Map(id -> notes[]).
 * Without an AI key, falls back to the reviewer's glossary so wrong choices still get a definition.
 */
export async function explainChoices(items, reviewer) {
  const result = new Map()
  if (!items.length) return result
  if (aiEnabled()) {
    const prompt = `${reviewer ? `REVIEWER (the study notes these questions come from):\n"""\n${reviewer.slice(0, 60_000)}\n"""\n\n` : ''}For each multiple-choice question below, write a note for every choice, in the same order as the choices. ${NOTE_RULES}
Base the notes on the reviewer where possible.

QUESTIONS:
${JSON.stringify(items.map((q) => ({ id: q.id, question: q.question, choices: q.choices, correctIndex: q.correctIndex, explanation: q.explanation })))}

Return ONLY valid JSON (no markdown fences): {"items": [{"id": <question id>, "choiceNotes": ["...", "..."]}]}`
    try {
      const text = await callAI({ system: SYSTEM, messages: [{ role: 'user', content: prompt }], maxTokens: Math.min(12000, 400 + items.length * 450), json: true })
      const json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''))
      for (const x of json.items || []) {
        const q = items.find((i) => i.id === Number(x.id))
        if (q && Array.isArray(x.choiceNotes)) result.set(q.id, q.choices.map((_, i) => String(x.choiceNotes[i] ?? '').trim() || q.notes[i] || ''))
      }
    } catch (e) {
      console.error('[ai] could not explain choices', e.message)
    }
  }
  // Fill whatever is still missing from the glossary / existing explanation.
  const terms = glossary(reviewer)
  for (const q of items) {
    const notes = result.get(q.id) ?? q.choices.map((_, i) => q.notes[i] || '')
    result.set(q.id, notes.map((n, i) => {
      if (n) return n
      const def = terms.get(String(q.choices[i]).trim().toLowerCase())
      if (i === q.correctIndex) return q.explanation || (def ? `${q.choices[i]}: ${def}` : '')
      return def ? `${q.choices[i]} means: ${def} — that is not what this question describes.` : ''
    }))
  }
  return result
}

/**
 * Feedback for a wrong typed answer in Q&A: why the student's answer is wrong and a corrected version of it.
 * `hint` is a known note about what they wrote (e.g. the note of a wrong choice they typed), if any.
 * Returns { whyWrong, correction }.
 */
export async function explainWrongAnswer({ question, userAnswer, correctAnswer, explanation, reviewer, hint }) {
  if (aiEnabled()) {
    const prompt = `${reviewer ? `REVIEWER (the student's study notes):\n"""\n${reviewer.slice(0, 60_000)}\n"""\n\n` : ''}A student answered a study question incorrectly.

QUESTION: ${question}
STUDENT'S ANSWER: ${userAnswer}
CORRECT ANSWER: ${correctAnswer}
${explanation ? `EXPLANATION OF THE CORRECT ANSWER: ${explanation}\n` : ''}${hint ? `NOTE ABOUT THE STUDENT'S ANSWER: ${hint}\n` : ''}
Write kind, specific feedback, based on the reviewer where possible. Speak to the student as "you".
- "whyWrong": 1-3 sentences on why THEIR answer is wrong. If they named a real term or idea, say what it actually is or does (e.g. "Luksong baka is a leapfrog game where you jump over a crouching player…") and why it doesn't fit this question. Point out any wrong reasoning in what they wrote.
- "correction": their answer rewritten correctly, 1-2 sentences, keeping their wording where possible (e.g. "Piko, because its hopscotch format makes you hop on one foot…").

Return ONLY valid JSON (no markdown fences): {"whyWrong": "...", "correction": "..."}`
    try {
      const text = await callAI({ system: SYSTEM, messages: [{ role: 'user', content: prompt }], maxTokens: 500, json: true })
      const json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''))
      if (json.whyWrong) return { whyWrong: String(json.whyWrong).trim(), correction: String(json.correction || '').trim() }
    } catch (e) {
      console.error('[ai] could not explain wrong answer', e.message)
    }
  }
  // Without AI: use what we know about the answer they gave, if anything.
  const terms = glossary(reviewer)
  const flat = (s) => ` ${String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
  const said = flat(userAnswer)
  const term = [...terms.keys()].find((t) => flat(t) !== flat(correctAnswer) && said.includes(flat(t)))
  const whyWrong = hint || (term ? `“${term}” means: ${terms.get(term)} — that isn't what this question describes.` : `Your answer doesn't match the key idea the question is asking for.`)
  return { whyWrong, correction: `The answer is ${correctAnswer}.${explanation ? ` ${explanation}` : ''}` }
}

/** Ask the AI to build a reviewer from an uploaded module, then flashcards and quiz questions from that reviewer. */
export async function generateStudyMaterial(module, subjectName) {
  if (!aiEnabled()) throw new HttpError(503, 'AI generation needs a GEMINI_API_KEY or ANTHROPIC_API_KEY in the server .env file. You can still add flashcards and questions manually.')
  const { reviewer, grounded } = await generateReviewer(module, subjectName)
  const { flashcards, questions } = await generateFromReviewer(reviewer, module, subjectName)
  return { reviewer, flashcards, questions, grounded }
}
