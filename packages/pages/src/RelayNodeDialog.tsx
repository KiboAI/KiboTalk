import type { ProductSessionController, RelayNode } from '@kibotalk/app-shared'
import { relayNodeLabelKind, useI18n } from '@kibotalk/app-shared'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kibotalk/ui'
import { CircleAlert, RefreshCw, ShieldCheck, Wifi } from 'lucide-react'

function relayNodeTitle(
  node: Pick<RelayNode, 'origin' | 'role'>,
  t: (key: 'localNode' | 'japanNode' | 'chinaNode') => string,
): string {
  const kind = relayNodeLabelKind(node)
  switch (kind) {
    case 'local':
      return t('localNode')
    case 'primary':
      return t('japanNode')
    case 'relay':
      return t('chinaNode')
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

export function RelayNodeDialog({
  controller,
}: {
  controller: ProductSessionController
}) {
  const { t } = useI18n()
  const {
    providersLoaded,
    preferredRelayNodeId,
    relayProbeResults,
    relayProbeLoading,
    relayProbeError,
    relaySelectionOpen,
    setRelaySelectionOpen,
    refreshRelayProbes,
    startOnRelayNode,
  } = controller

  return (
    <Dialog open={relaySelectionOpen} onOpenChange={setRelaySelectionOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('selectNetworkNode')}</DialogTitle>
          <DialogDescription>{t('networkNodeDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {relayProbeLoading && relayProbeResults.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-foreground/5 px-4 py-4 text-sm text-muted-foreground">
              <RefreshCw className="size-4 animate-spin" />
              {t('checkingLatency')}
            </div>
          ) : null}

          {relayProbeResults.map((result) => {
            const insecure = result.node.origin.startsWith('http:')
            const reachable = result.latencyMs !== null
            return (
              <Button
                key={result.node.id}
                type="button"
                variant="soft"
                className={`h-auto justify-start whitespace-normal px-4 py-3 text-left ${
                  result.node.id === preferredRelayNodeId ? 'ring-2 ring-ring' : ''
                }`}
                disabled={!providersLoaded || relayProbeLoading || !reachable}
                onClick={() => void startOnRelayNode(result.node.id)}
              >
                <span className="flex w-full items-start gap-3">
                  {insecure ? (
                    <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
                  ) : (
                    <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">
                        {relayNodeTitle(result.node, t)}
                        {result.node.id === preferredRelayNodeId ? (
                          <Badge variant="secondary" className="ml-2">
                            {t('defaultNode')}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                        <Wifi className="size-3.5" />
                        {reachable
                          ? `${Math.round(result.latencyMs!)} ms`
                          : t('nodeUnreachable')}
                      </span>
                    </span>
                    <span className={`mt-1 block text-xs ${insecure ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {insecure ? t('insecureRelayWarning') : t('encryptedConnection')}
                    </span>
                  </span>
                </span>
              </Button>
            )
          })}

          {relayProbeError ? (
            <p className="text-sm text-destructive">
              {t('nodeProbeFailed')}：{relayProbeError}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="soft"
            disabled={relayProbeLoading}
            onClick={() => void refreshRelayProbes()}
          >
            <RefreshCw className={`size-4 ${relayProbeLoading ? 'animate-spin' : ''}`} />
            {t('refreshLatency')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
