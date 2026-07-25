import React from 'react'
import type { AppLanguage, ConversationTurn, LearnerLevel } from '@kibotalk/conversation'

export type ReplySuggestionsPromptArgs = {
  context: ConversationTurn[]
  level: LearnerLevel
  conversationLang: AppLanguage
  meaningLang: AppLanguage
}

export type ReplySuggestionsChatMessage = {
  role: 'system' | 'user'
  content: string
}

const LANGUAGE_LABEL: Record<AppLanguage, string> = {
  ja: 'Japanese',
  en: 'English',
  zh: 'Chinese',
}

const LEVEL_LABEL: Record<LearnerLevel, string> = {
  beginner: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
}

/**
 * System role for the live reply coach.
 * Split from the user message (vieval: system_split + ruby_kanji_no_phrase).
 * Language-specific details live in the user prompt.
 */
export function buildReplySuggestionsSystem(conversationLang: AppLanguage): string {
  const target = LANGUAGE_LABEL[conversationLang]
  return `You are a live reply coach for a ${target} learner.
After either speaker's turn, decide whether the learner needs opening help.
Return STRICT JSON ONLY: either an array of EXACTLY 3 suggestion objects, or an empty array [].
Never wrap the array. No prose, no code fences, no trailing text.
Tailor vocabulary and grammar to the stated learner level.
When returning 3 replies, prefer natural spoken ${target} and keep them meaningfully different (not near-paraphrases).`
}

/** @deprecated Prefer buildReplySuggestionsSystem(conversationLang). */
export const REPLY_SUGGESTIONS_SYSTEM = buildReplySuggestionsSystem('ja')

function formatContextLines(context: ConversationTurn[]): string[] {
  if (context.length === 0) {
    return ['(no prior turns — this is the opening of the conversation)']
  }
  return context.map((turn) => {
    const speaker = turn.speaker === 'user' ? 'Me (learner)' : 'Other (native speaker)'
    const text = turn.sttFailed ? '(untranscribed)' : turn.text
    return `${speaker}: ${text}`
  })
}

function lastSpeakerLabel(context: ConversationTurn[]): string {
  const last = context[context.length - 1]
  if (!last) return 'none (opening)'
  return last.speaker === 'user' ? 'Me (learner)' : 'Other (native speaker)'
}

function meaningLangLabel(meaningLang: AppLanguage): string {
  switch (meaningLang) {
    case 'ja':
      return '日本語'
    case 'en':
      return 'English'
    case 'zh':
      return '中文'
    default: {
      const _exhaustive: never = meaningLang
      return _exhaustive
    }
  }
}

/**
 * User-message body: langs, level, last speaker, gate rules, conversation, and schema.
 * Furigana / particle rules only when conversationLang is ja.
 */
export function ReplySuggestionsUserPrompt({
  context,
  level,
  conversationLang,
  meaningLang,
}: ReplySuggestionsPromptArgs) {
  const contextLines = formatContextLines(context)
  const lastSpeaker = lastSpeakerLabel(context)
  const targetLabel = LANGUAGE_LABEL[conversationLang]
  const meaningLabel = meaningLangLabel(meaningLang)
  const levelLabel = LEVEL_LABEL[level]
  const sameLang = conversationLang === meaningLang
  const isJapanese = conversationLang === 'ja'

  return (
    <article>
      <p>
        Conversation language (what both speakers say / targetText): {targetLabel} ({conversationLang}).
      </p>
      <p>
        Meaning language (short intent in &quot;meaning&quot;): {meaningLabel} ({meaningLang}).
        {sameLang
          ? ' Same as conversation language — write a short intent phrase, do NOT restate targetText.'
          : null}
      </p>
      <p>
        Learner level: {levelLabel}.
      </p>
      <p>Last speaker (this request was triggered by): {lastSpeaker}.</p>

      <h2>When to return 3 vs []</h2>
      <ul>
        <li>
          If the triggering turn is marked (untranscribed), return [] immediately.
          Do not infer a reply from older turns.
        </li>
        <li>
          If last speaker is Other: almost always return EXACTLY 3. Use [] only for
          noise, tiny meaningless fragments, or when the learner is clearly not
          expected to speak yet.
        </li>
        <li>
          If last speaker is Me (learner): be liberal — usually return EXACTLY 3
          unless the learner clearly finished their turn and is waiting for Other.
          Prefer helping when the learner seems stuck mid-utterance (short /
          incomplete / trailing off after a pause).
        </li>
        <li>
          Stuck mid-utterance: return 3 FULL speakable sentences that complete what
          the learner started (the learner can read each suggestion from the start).
          Do NOT return only a continuation tail.
        </li>
        <li>
          Reply vs completion use the SAME object shape (no kind field). meaning
          is still a short intent phrase in {meaningLabel}.
        </li>
      </ul>

      <h2>Conversation so far</h2>
      <pre>{contextLines.join('\n')}</pre>

      <h2>Output format</h2>
      {isJapanese ? (
        <>
          <p>
            Output either [] or a JSON array of EXACTLY 3 objects with keys ONLY:
            meaning, targetText, segments.
            Do NOT include top-level &quot;reading&quot; (obsolete — UI renders furigana from
            segment.reading only).
          </p>
          <ul>
            <li>meaning: learner intent in {meaningLabel}, one short phrase.</li>
            <li>targetText: Japanese the learner should say (full sentence).</li>
            <li>
              segments: word/morpheme spans covering targetText left-to-right.
              Concatenating every segment.surface MUST equal targetText.
              Each: {'{'} &quot;surface&quot;, optional &quot;reading&quot;, &quot;role&quot;:
              &quot;content&quot; | &quot;particle&quot; | &quot;punct&quot; {'}'}.
            </li>
          </ul>

          <h2>Furigana / segment rules (STRICT)</h2>
          <ul>
            <li>
              Include &quot;reading&quot; ONLY when surface contains at least one 漢字 (kanji).
              Reading is kana for that span.
            </li>
            <li>
              NEVER put &quot;reading&quot; on hiragana/katakana-only surfaces
              (です / ます / こんにちは / ありがとう / します…).
            </li>
            <li>NEVER set reading equal to surface.</li>
            <li>
              role &quot;particle&quot; for 助詞 (は/が/を/に/で/と/も/へ/から/まで/より/の/や/か/ね/よ/など/だけ/しか…).
            </li>
            <li>role &quot;punct&quot; for 。！？、…； everything else &quot;content&quot;.</li>
          </ul>

          <h2>BAD (do not do this)</h2>
          <pre>{`{"surface":"こんにちは","reading":"こんにちは","role":"content"}
{"surface":"です","reading":"です","role":"content"}
{"meaning":"...","targetText":"...","reading":"...","segments":[...]}`}</pre>

          <h2>GOOD</h2>
          <pre>{`{"surface":"こんにちは","role":"content"}
{"surface":"一度","reading":"いちど","role":"content"}
{"surface":"を","role":"particle"}
{"surface":"。","role":"punct"}`}</pre>

          <h2>Example (shape only — 3 suggestions)</h2>
          <pre>{`[{"meaning":"请求再说一遍","targetText":"もう一度お願いします。","segments":[{"surface":"もう","role":"content"},{"surface":"一度","reading":"いちど","role":"content"},{"surface":"お願い","reading":"おねがい","role":"content"},{"surface":"します","role":"content"},{"surface":"。","role":"punct"}]},{"meaning":"表示明白","targetText":"わかりました。","segments":[{"surface":"わかりました","role":"content"},{"surface":"。","role":"punct"}]},{"meaning":"礼貌确认","targetText":"それでよろしいですか。","segments":[{"surface":"それ","role":"content"},{"surface":"で","role":"particle"},{"surface":"よろしい","role":"content"},{"surface":"です","role":"content"},{"surface":"か","role":"particle"},{"surface":"。","role":"punct"}]}]`}</pre>
        </>
      ) : (
        <>
          <p>
            Output either [] or a JSON array of EXACTLY 3 objects with keys ONLY:
            meaning, targetText.
            segments is optional and usually omitted for {targetLabel}.
            Do NOT include top-level &quot;reading&quot;.
          </p>
          <ul>
            <li>meaning: learner intent in {meaningLabel}, one short phrase.</li>
            <li>targetText: {targetLabel} the learner should say (full sentence).</li>
          </ul>
          <h2>Example (shape only — 3 suggestions)</h2>
          <pre>{`[{"meaning":"Ask to repeat","targetText":"Could you say that again?"},{"meaning":"Show understanding","targetText":"Got it, thanks."},{"meaning":"Confirm politely","targetText":"Is that correct?"}]`}</pre>
        </>
      )}

      <p>Respond with STRICT JSON ONLY — no prose, no code fences, no trailing text. Output [] or the array of 3 and stop.</p>
    </article>
  )
}

/** @deprecated Prefer ReplySuggestionsUserPrompt; kept as alias for Velin discovery. */
export const ReplySuggestionsPrompt = ReplySuggestionsUserPrompt
