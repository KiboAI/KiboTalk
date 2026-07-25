import { Button } from '@kibotalk/ui'

export type SyncPendingNoticeProps = {
  pending: boolean
  onRetry: () => void
}

export function SyncPendingNotice({ pending, onRetry }: SyncPendingNoticeProps) {
  if (!pending) return null

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">历史记录待同步，本地功能仍可正常使用。</p>
      <Button variant="soft" size="sm" onClick={onRetry}>重试</Button>
    </div>
  )
}
