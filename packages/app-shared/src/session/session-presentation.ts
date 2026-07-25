import type { ProductSessionLifecycle } from './use-conversation-session'

export function shouldShowSessionError(
  lifecycle: ProductSessionLifecycle,
  error: string,
): boolean {
  return lifecycle !== 'paused' && error.length > 0
}
