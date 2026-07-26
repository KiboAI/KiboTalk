import { clearSpeakerEmbeddingData } from '@kibotalk/app-shared/speaker-embedding-storage'
import '../index.css'

const LANDING_URL = 'https://kibotalk.app/'
const LEGACY_APP_ORIGIN = 'https://advx.kibotalk.app'

async function clearModelCaches(): Promise<void> {
  if (!('caches' in globalThis)) return
  const cacheNames = await caches.keys()
  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
}

async function unregisterServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map((registration) => registration.unregister()))
}

async function clearLegacyOriginData(): Promise<void> {
  await unregisterServiceWorkers().catch(() => undefined)
  await Promise.allSettled([clearModelCaches(), clearSpeakerEmbeddingData()])
}

if (window.location.origin === LEGACY_APP_ORIGIN) {
  void clearLegacyOriginData().finally(() => window.location.replace(LANDING_URL))
} else {
  window.location.replace(LANDING_URL)
}
