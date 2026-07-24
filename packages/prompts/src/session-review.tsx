import React from 'react'
import type { AppLanguage, ConversationTurn } from '@kibotalk/conversation'

export type SessionReviewPromptArgs = {
  turns: ConversationTurn[]
  conversationLang: AppLanguage
  uiLang: AppLanguage
}

const LANGUAGE_LABEL: Record<AppLanguage, string> = {
  ja: 'Japanese',
  en: 'English',
  zh: 'Chinese',
}

export function SessionReviewUserPrompt({
  turns,
  conversationLang,
  uiLang,
}: SessionReviewPromptArgs) {
  const transcript = turns
    .map((turn) => `${turn.speaker === 'user' ? 'Learner' : 'Other'}: ${turn.sttFailed ? '(untranscribed)' : turn.text}`)
    .join('\n')
  return (
    <article>
      <p>
        The conversation language was {LANGUAGE_LABEL[conversationLang]}. Write
        the result in {LANGUAGE_LABEL[uiLang]}.
      </p>
      <p>
        Return strict JSON with exactly two string keys: &quot;title&quot; and
        &quot;summary&quot;. The title is a short scene label, at most 18
        characters or 8 English words. The summary is two or three concise
        sentences describing the situation, what the learner practiced, and
        one useful next focus. Do not add markdown or a code fence.
      </p>
      <h2>Transcript</h2>
      <pre>{transcript || '(no transcribed turns)'}</pre>
    </article>
  )
}
