import type { ConversationSession, ConversationStorage } from '@kibotalk/conversation'
import { authorizedFetch } from '../api-runtime'

type SessionReviewResponse = {
  title: string
  summary: string
}

/** Runs the background title/summary task after stop; the usable fallback title already exists. */
export async function reviewConversationSession(
  storage: ConversationStorage,
  session: ConversationSession,
): Promise<void> {
  await storage.updateSessionReview(session.id, { reviewStatus: 'pending' })
  try {
    const response = await authorizedFetch('/api/session-review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        turns: session.turns,
        conversationLang: session.snapshot.conversationLang,
        uiLang: session.snapshot.uiLang,
        sessionId: session.id,
      }),
    })
    const body = (await response.json().catch(() => ({}))) as Partial<SessionReviewResponse> & {
      error?: string
    }
    if (!response.ok || !body.title || !body.summary) {
      throw new Error(body.error ?? `Review HTTP ${response.status}`)
    }
    await storage.updateSessionReview(session.id, {
      title: body.title,
      summary: body.summary,
      reviewStatus: 'ready',
    })
  } catch (cause) {
    await storage.updateSessionReview(session.id, {
      reviewStatus: 'failed',
      reviewError: cause instanceof Error ? cause.message : String(cause),
    })
  }
}

export async function resumePendingSessionReviews(storage: ConversationStorage): Promise<void> {
  const pending = (await storage.listSessions()).filter(
    (session) => session.status === 'stopped' && session.reviewStatus === 'pending',
  )
  for (const session of pending) {
    await reviewConversationSession(storage, session)
  }
}
