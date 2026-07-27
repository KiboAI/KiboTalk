import { useCallback, useEffect, useState } from 'react'
import { fetchRelayNodes } from './api-runtime'
import { probeRelayNodes, type RelayProbeResult } from './relay-routing'

export function useRelayNodeProbes() {
  const [results, setResults] = useState<RelayProbeResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const nodeList = await fetchRelayNodes()
      setResults(await probeRelayNodes(nodeList))
    } catch (cause) {
      setResults([])
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    results,
    loading,
    error,
    refresh,
  }
}
