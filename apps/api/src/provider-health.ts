let cachedProviderHealthy = false
const REQUIRED_UPSTREAM_COUNT = 2

function configuredUpstreamUrls(env: NodeJS.ProcessEnv): string[] {
  const urls: string[] = []
  if (env.STT_ACTIVE === 'iflytek-realtime') {
    urls.push(
      env.STT_IFLYTEK_WS_URL
      ?? 'wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1',
    )
  } else if (env.STT_DASHSCOPE_WS_URL) {
    urls.push(env.STT_DASHSCOPE_WS_URL)
  }
  const llmProvider = env.LLM_ACTIVE
  if (llmProvider) {
    const llmUrl = env[`LLM_${llmProvider.toUpperCase()}_BASE_URL`]
    if (llmUrl) urls.push(llmUrl)
  }
  return urls
}

async function reachable(
  value: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<boolean> {
  const url = new URL(value)
  if (url.protocol === 'wss:') url.protocol = 'https:'
  if (url.protocol === 'ws:') url.protocol = 'http:'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_000)
  try {
    const response = await fetchImpl(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
    })
    return response.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

export async function refreshProviderHealth(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<boolean> {
  const urls = configuredUpstreamUrls(env)
  cachedProviderHealthy =
    urls.length >= REQUIRED_UPSTREAM_COUNT
    && (await Promise.all(urls.map((url) => reachable(url, fetchImpl)))).every(Boolean)
  return cachedProviderHealthy
}

export function providerHealthy(): boolean {
  return cachedProviderHealthy
}

export function setProviderHealthForTests(healthy: boolean): void {
  cachedProviderHealthy = healthy
}
