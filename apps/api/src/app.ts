import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { streamSSE } from 'hono/streaming'
import { createSttClient, sttConfigFromEnv, listSttProviders } from '@kibotalk/stt'
import { createLlmClient, llmConfigFromEnv } from '@kibotalk/llm'
import { buildReplySuggestionsMessages, buildSessionReviewMessages } from '@kibotalk/prompts'
import type { AppLanguage, ConversationTurn, LearnerLevel } from '@kibotalk/conversation'

export const app = new Hono()

const APP_LANGUAGES = new Set<AppLanguage>(['ja', 'en', 'zh'])
const LEARNER_LEVELS = new Set<LearnerLevel>(['beginner', 'intermediate', 'advanced'])

function parseAppLanguage(value: unknown, fallback: AppLanguage): AppLanguage {
  return typeof value === 'string' && APP_LANGUAGES.has(value as AppLanguage)
    ? (value as AppLanguage)
    : fallback
}

function parseLearnerLevel(value: unknown, fallback: LearnerLevel): LearnerLevel {
  return typeof value === 'string' && LEARNER_LEVELS.has(value as LearnerLevel)
    ? (value as LearnerLevel)
    : fallback
}

// GET /stt/providers — list STT providers fully configured in server env (no
// keys), so the browser can offer a provider selector. Each entry carries
// `active` (matches STT_ACTIVE) so the client can default to it.
app.get('/stt/providers', (c) => {
  const providers = listSttProviders(process.env).filter((p) => p.configured)
  return c.json({ providers })
})

// POST /stt — receive a WAV (16kHz mono), forward to an STT provider, return
// { text }. Provider is STT_ACTIVE by default; an optional ?provider= query
// overrides per-request (must be a registered provider; its base URL / key /
// model still come from server env, so keys never leave this process). Optional
// ?language= (BCP-47 short code) is forwarded as an STT language hint.
// Client abort aborts the upstream request.
app.post('/stt', async (c) => {
  const wav = await c.req.arrayBuffer()
  const providerOverride = c.req.query('provider') || undefined
  const language = c.req.query('language') || undefined
  let sttClient
  try {
    sttClient = createSttClient(sttConfigFromEnv(process.env, providerOverride))
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
  try {
    const text = await sttClient.transcribe(wav, {
      signal: c.req.raw.signal,
      language,
    })
    return c.json({ text })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502)
  }
})

// POST /llm — SSE. Body: { context, level, conversationLang, meaningLang }.
// Emit the rendered prompt first (`prompt` event), then stream raw LLM tokens
// as `token` events. On client disconnect, c.req.raw.signal aborts, which we
// forward to the upstream provider fetch so it stops generating. Half-streamed
// candidates are dropped by the client (per spec §1.4 "以 STT 为准").
app.post('/llm', (c) =>
  streamSSE(c, async (stream) => {
    try {
      const signal = c.req.raw.signal
      const body = (await c.req.json().catch(() => null)) as {
        context?: ConversationTurn[]
        level?: string
        conversationLang?: string
        meaningLang?: string
      } | null
      const conversationLang = parseAppLanguage(body?.conversationLang, 'ja')
      const meaningLang = parseAppLanguage(body?.meaningLang, 'zh')
      const level = parseLearnerLevel(body?.level, 'beginner')
      const messages = await buildReplySuggestionsMessages({
        context: body?.context ?? [],
        level,
        conversationLang,
        meaningLang,
      })
      const prompt = messages
        .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
        .join('\n\n')
      await stream.writeSSE({ event: 'prompt', data: prompt })
      let llmClient
      try {
        llmClient = createLlmClient(llmConfigFromEnv(process.env))
      } catch (e) {
        await stream.writeSSE({ event: 'error', data: (e as Error).message })
        return
      }
      const tokenStream = llmClient.streamChat({
        messages,
        signal,
      })
      for await (const token of tokenStream) {
        await stream.writeSSE({ event: 'token', data: token })
      }
    } catch {
      // upstream error or client abort (incl. writeSSE after disconnect) — end silently
    }
  }),
)

app.post('/session-review', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    turns?: ConversationTurn[]
    conversationLang?: string
    uiLang?: string
  } | null
  const conversationLang = parseAppLanguage(body?.conversationLang, 'ja')
  const uiLang = parseAppLanguage(body?.uiLang, 'en')
  try {
    const client = createLlmClient(llmConfigFromEnv(process.env))
    const messages = await buildSessionReviewMessages({
      turns: body?.turns ?? [],
      conversationLang,
      uiLang,
    })
    const raw = await client.generateChat({ messages, signal: c.req.raw.signal })
    const parsed = JSON.parse(raw) as { title?: unknown; summary?: unknown }
    if (typeof parsed.title !== 'string' || typeof parsed.summary !== 'string') {
      throw new Error('invalid session review response')
    }
    const title = parsed.title.trim()
    const summary = parsed.summary.trim()
    if (!title || !summary) throw new Error('empty session review response')
    return c.json({ title, summary })
  } catch (cause) {
    return c.json({ error: cause instanceof Error ? cause.message : String(cause) }, 502)
  }
})

// In production the API also serves the built SPA so one Railway service hosts
// both. Locally `pnpm --filter @kibotalk/api start` after a Web build.
app.use('/*', serveStatic({ root: '../web/dist' }))
app.get('*', serveStatic({ root: '../web/dist', path: './index.html' }))
