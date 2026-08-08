import type {
  ConversationSession,
  ConversationTurn,
  ReplyCandidate,
  ReplySegment,
} from '@kibotalk/conversation'
import type { ProductSessionController } from '@kibotalk/app-shared'

const now = Date.now()
const minute = 60_000

function segments(
  parts: Array<[surface: string, role: ReplySegment['role'], reading?: string]>,
): ReplySegment[] {
  return parts.map(([surface, role, reading]) => ({ surface, role, ...(reading ? { reading } : {}) }))
}

export const fakeCandidates: ReplyCandidate[] = [
  {
    id: 'candidate-1',
    meaning: '不客气。',
    targetText: 'どういたしまして。',
    segments: segments([
      ['どう', 'content'],
      ['いたしまして', 'content'],
      ['。', 'punct'],
    ]),
  },
  {
    id: 'candidate-2',
    meaning: '随时都可以问我。',
    targetText: 'いつでも聞いてください。',
    segments: segments([
      ['いつでも', 'content'],
      ['聞', 'content', 'き'],
      ['いてください', 'content'],
      ['。', 'punct'],
    ]),
  },
  {
    id: 'candidate-3',
    meaning: '很高兴能帮上忙。',
    targetText: 'お役に立てて嬉しいです。',
    segments: segments([
      ['お役', 'content', 'やく'],
      ['に立てて', 'content'],
      ['嬉', 'content', 'うれ'],
      ['しいです', 'content'],
      ['。', 'punct'],
    ]),
  },
]

export const fakeTurns: ConversationTurn[] = [
  {
    id: 'turn-1',
    speaker: 'other',
    text: '駅はどこですか？',
    startedAt: now - 6 * minute,
    endedAt: now - 6 * minute + 3000,
  },
  {
    id: 'turn-2',
    speaker: 'user',
    text: '駅はあそこです。',
    startedAt: now - 5 * minute,
    endedAt: now - 5 * minute + 2500,
    suggestions: fakeCandidates,
  },
  {
    id: 'turn-3',
    speaker: 'other',
    text: 'ありがとうございます！',
    startedAt: now - 4 * minute,
    endedAt: now - 4 * minute + 2000,
  },
]

export const fakeActiveSession: ConversationSession = {
  id: 'session-demo',
  relayNodeId: 'jp-primary',
  status: 'running',
  startedAt: now - 10 * minute,
  pausedDurationMs: 0,
  snapshot: {
    conversationLang: 'ja',
    meaningLang: 'zh',
    uiLang: 'zh',
    level: 'beginner',
    audioSource: 'microphone',
    microphoneDeviceId: 'default',
  },
  turns: fakeTurns,
  title: '车站问路',
  reviewStatus: 'pending',
}

export function createFakeSessionController(options: {
  lifecycle?: 'restoring' | 'stopped' | 'starting' | 'running' | 'paused'
  state?: string
  vadStatus?: 'idle' | 'speech' | 'silence'
  loading?: string
  error?: string
  turns?: ConversationTurn[]
  rounds?: Array<{ id: string; candidates: ReplyCandidate[] }>
} = {}): ProductSessionController {
  const lifecycle = options.lifecycle ?? 'running'
  const turns = options.turns ?? fakeTurns
  const rounds = options.rounds ?? [
    { id: 'round-latest', candidates: fakeCandidates },
    { id: 'round-previous', candidates: [fakeCandidates[1]] },
  ]
  const session = {
    lifecycle,
    state: options.state ?? 'IDLE',
    vadStatus: options.vadStatus ?? 'idle',
    loading: options.loading ?? '',
    error: options.error ?? '',
    statusNote: '',
    turns,
    draft: null,
    activeSession: lifecycle === 'stopped' ? null : fakeActiveSession,
    recoveredUnexpectedPause: false,
    quotaExhausted: false,
    mode: 'auto',
    confidence: null,
    activeSttPath: 'realtime',
    candidateRounds: rounds,
    relayNodeId: 'jp-primary',
    relayLatencyMs: 42,
    interrupt: async () => {},
    start: async () => {},
    pause: async () => {},
    resume: async () => {},
    stop: async () => {},
  }
  return {
    session,
    rounds,
    replyEnabled: true,
    setReplyEnabled: () => {},
    providersLoaded: true,
    preferredRelayNodeId: 'jp-primary',
    relayProbeResults: [],
    relayProbeLoading: false,
    relayProbeError: null,
    relaySelectionOpen: false,
    setRelaySelectionOpen: () => {},
    refreshRelayProbes: async () => {},
    requestSessionStart: () => {},
    startOnRelayNode: async () => {},
  } as unknown as ProductSessionController
}
