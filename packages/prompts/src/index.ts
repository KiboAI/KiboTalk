import { renderComponent } from '@velin-dev/core-react'

import {
  REPLY_SUGGESTIONS_SYSTEM,
  ReplySuggestionsUserPrompt,
  buildReplySuggestionsSystem,
} from './reply-suggestions'
import type {
  ReplySuggestionsChatMessage,
  ReplySuggestionsPromptArgs,
} from './reply-suggestions'
import { SessionReviewUserPrompt } from './session-review'
import type { SessionReviewPromptArgs } from './session-review'

export type {
  ReplySuggestionsChatMessage,
  ReplySuggestionsPromptArgs,
} from './reply-suggestions'
export {
  REPLY_SUGGESTIONS_SYSTEM,
  ReplySuggestionsUserPrompt,
  buildReplySuggestionsSystem,
} from './reply-suggestions'
export { SessionReviewUserPrompt } from './session-review'
export type { SessionReviewPromptArgs } from './session-review'

/**
 * Build system + user messages for the reply-suggestions coach
 * (production: system_split + ruby_kanji_no_phrase for ja).
 */
export async function buildReplySuggestionsMessages(
  args: ReplySuggestionsPromptArgs,
): Promise<ReplySuggestionsChatMessage[]> {
  const user = await renderComponent(ReplySuggestionsUserPrompt, args)
  return [
    { role: 'system', content: buildReplySuggestionsSystem(args.conversationLang) },
    { role: 'user', content: user },
  ]
}

/**
 * Render messages as a single debug string (SSE `prompt` event / playground).
 */
export async function renderReplySuggestionsPrompt(
  args: ReplySuggestionsPromptArgs,
): Promise<string> {
  const messages = await buildReplySuggestionsMessages(args)
  return messages
    .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
    .join('\n\n')
}

export async function buildSessionReviewMessages(
  args: SessionReviewPromptArgs,
): Promise<ReplySuggestionsChatMessage[]> {
  const user = await renderComponent(SessionReviewUserPrompt, args)
  return [
    {
      role: 'system',
      content: 'You organize completed language-learning conversations into a short local history entry.',
    },
    { role: 'user', content: user },
  ]
}
