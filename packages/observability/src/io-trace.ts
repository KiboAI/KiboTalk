export const IOSubsystems = {
  VAD: 'vad',
  SpeakerVerify: 'speaker',
  STT: 'stt',
  Aggregator: 'aggregator',
  LLM: 'llm',
} as const
export type IOSubsystem = (typeof IOSubsystems)[keyof typeof IOSubsystems]

export const IOSpanNames = {
  InteractionTurn: 'Interaction turn',
  VoiceActivity: 'Voice activity',
  SpeakerVerify: 'Speaker verification',
  SpeechRecognition: 'Speech recognition',
  SegmentAggregate: 'Segment aggregate',
  LLMInference: 'LLM inference',
} as const

const customPrefix = 'ai.kibotalk.io'

export const IOAttributes = {
  GenAIRequestModel: 'gen_ai.request.model',
  GenAIProviderName: 'gen_ai.provider.name',

  Subsystem: `${customPrefix}.subsystem`,
  TooltipKeys: `${customPrefix}.tooltip.keys`,
  CorrelationId: `${customPrefix}.correlation_id`,
  LLM_TTFT: `${customPrefix}.llm.time_to_first_token`,
  LLMTextLength: `${customPrefix}.llm.text_length`,
  ASRText: `${customPrefix}.asr.text`,
  ASRAbort: `${customPrefix}.asr.abort`,
  SttPath: `${customPrefix}.stt.path`,
  SpeakerConfidence: `${customPrefix}.speaker.confidence`,
  SpeakerThreshold: `${customPrefix}.speaker.threshold`,
  SpeakerResult: `${customPrefix}.speaker.result`,
  VadDuration: `${customPrefix}.vad.duration`,
  VadSpeechSamples: `${customPrefix}.vad.speech_samples`,
  AggregatorSegments: `${customPrefix}.aggregator.segments`,
  AggregatorTotalMs: `${customPrefix}.aggregator.total_ms`,
  TurnId: `${customPrefix}.turn_id`,
} as const

export const IOEvents = {
  LLMFirstToken: `${customPrefix}.llm.first_token`,
  ASRSentenceEnd: `${customPrefix}.asr.sentence_end`,
} as const

/** Event captured inside an IO tracing span. */
export interface IOSpanEvent {
  /** OTel event name. */
  name: string
  /** Event timestamp in milliseconds. */
  timeTs: number
  /** Event attributes normalized for the devtools UI. */
  meta: Record<string, unknown>
}

export interface IOSpan {
  id: string
  traceId: string
  parentSpanId?: string
  /** Optional correlation for grouping pre-turn spans (VAD / Aggregator). */
  correlationId?: string
  startTs: number
  endTs?: number
  subsystem: IOSubsystem
  name: string
  meta: Record<string, any>
  /** OTel events attached to the span. */
  events?: IOSpanEvent[]
}

export interface IOTurn {
  id: string
  startTs: number
  endTs?: number
  inputText?: string
  outputText?: string
  spans: IOSpan[]
}
