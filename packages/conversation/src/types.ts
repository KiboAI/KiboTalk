export type Speaker = 'user' | 'other'

/** Supported conversation / meaning languages (BCP-47 short codes). */
export type AppLanguage = 'ja' | 'en' | 'zh'

/** Unified learner level (not JLPT/CEFR/HSK certificate labels). */
export type LearnerLevel = 'beginner' | 'intermediate' | 'advanced'

export type LevelByLang = Record<AppLanguage, LearnerLevel>

export type ReplySegmentRole = 'content' | 'particle' | 'punct'

/** One surface span of a reply; used for furigana + particle highlight (ja). */
export type ReplySegment = {
  surface: string
  /** Furigana for kanji spans; omit when surface is already kana/latin/punct. */
  reading?: string
  role: ReplySegmentRole
}

export type ReplyCandidate = {
  id: string
  /** Short learner-intent phrase in `meaningLang`. */
  meaning: string
  /** Speakable reply in `conversationLang`. */
  targetText: string
  /**
   * @deprecated Phrase-level kana fallback. Prefer `segments[].reading` on kanji
   * only. Optional for backward compatibility with older streams.
   */
  reading?: string
  /**
   * Tokenized targetText; required when conversationLang is ja (ruby + particles).
   * When absent, UI shows plain targetText.
   */
  segments?: ReplySegment[]
}

export type ConversationTurn = {
  id: string
  speaker: Speaker
  text: string
  startedAt: number
  endedAt: number
  suggestions?: ReplyCandidate[]
  userId?: string
  sttFailed?: boolean
}
