import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@kibotalk/ui'
import {
  Eraser,
  Fingerprint,
  Loader2,
  Mic,
  Play,
  Square,
  User,
  Users,
} from 'lucide-react'

const STATE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  IDLE: 'secondary',
  OTHER_SPEAKING: 'default',
  USER_SPEAKING: 'default',
  LLM_STREAMING: 'outline',
}

export type SessionToolbarProps = {
  running: boolean
  loading: string
  state: string
  vadStatus: string
  activeSttPath: 'idle' | 'realtime' | 'batch'
  mode: 'auto' | 'manual' | 'checking'
  confidence: number | null
  speaker: 'user' | 'other'
  onSpeakerChange: (s: 'user' | 'other') => void
  hasEmbedding: boolean
  statusNote: string
  error: string
  onStart: () => void
  onStop: () => void
  onClear: () => void
  onGoEnroll: () => void
}

export function SessionToolbar({
  running,
  loading,
  state,
  vadStatus,
  activeSttPath,
  mode,
  confidence,
  speaker,
  onSpeakerChange,
  hasEmbedding,
  statusNote,
  error,
  onStart,
  onStop,
  onClear,
  onGoEnroll,
}: SessionToolbarProps) {
  const sttLabel =
    activeSttPath === 'realtime' ? '实时' : activeSttPath === 'batch' ? 'batch' : null
  const vadLabel =
    vadStatus === 'speech' ? '说话中' : vadStatus === 'silence' ? '静音' : null
  const speakerLabel =
    mode === 'auto'
      ? `自动${confidence !== null ? ` ${confidence.toFixed(2)}` : ''}`
      : mode === 'manual'
        ? '手动'
        : null

  return (
    <div className="paper-sheet space-y-2.5 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {!running ? (
          <Button size="sm" onClick={onStart} disabled={!!loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {loading || '开始会话'}
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={onStop}>
            <Square className="size-3.5" />
            停止
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onClear} disabled={running}>
          <Eraser className="size-3.5" />
          清空
        </Button>
        <Select
          value={speaker}
          onValueChange={(v) => onSpeakerChange(v as 'user' | 'other')}
          disabled={mode === 'auto' || running}
        >
          <SelectTrigger className="h-8 w-[7.5rem]">
            <SelectValue placeholder="说话人" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="other">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" />
                对方
              </span>
            </SelectItem>
            <SelectItem value="user">
              <span className="inline-flex items-center gap-1.5">
                <User className="size-3.5" />
                我
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        {!hasEmbedding ? (
          <Button size="sm" variant="secondary" onClick={onGoEnroll}>
            <Fingerprint className="size-3.5" />
            去录入声纹
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={STATE_VARIANT[state] ?? 'secondary'}>{state}</Badge>
          </TooltipTrigger>
          <TooltipContent>管线状态</TooltipContent>
        </Tooltip>
        {sttLabel ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1">
                <Mic className="size-3" />
                {sttLabel}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>当前 STT 路径</TooltipContent>
          </Tooltip>
        ) : null}
        {vadLabel ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline">VAD {vadLabel}</Badge>
            </TooltipTrigger>
            <TooltipContent>本地 VAD</TooltipContent>
          </Tooltip>
        ) : null}
        {speakerLabel ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline">{speakerLabel}</Badge>
            </TooltipTrigger>
            <TooltipContent>说话人判定</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {statusNote ? (
        <p className="text-xs text-muted-foreground">{statusNote}</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
