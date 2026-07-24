import { useEffect, useRef, useState } from 'react'
import { IndexedDbConversationStorage } from '@kibotalk/conversation'
import { IndexedDbEmbeddingStorage } from '@kibotalk/speaker'
import {
  loadLanguagePrefs,
  persistLanguagePrefs,
  startModelPreload,
  useModelPreloadStatus,
  type LanguagePrefs,
} from '@kibotalk/app-shared'
import { OnboardingPage, EnrollmentPage, SessionPage } from '@kibotalk/pages'
import { ModelPreloadBadge } from '@kibotalk/ui'

/** Post-onboarding: check voiceprint once, then enroll (fresh) or go straight to the session (returning). */
type Stage = 'checking' | 'enrollment' | 'session'

export default function App() {
  const [prefs, setPrefs] = useState<LanguagePrefs>(loadLanguagePrefs)
  const [stage, setStage] = useState<Stage>('checking')
  const [enrolled, setEnrolled] = useState(false)
  const storageRef = useRef(new IndexedDbConversationStorage())
  const models = useModelPreloadStatus()

  useEffect(() => {
    startModelPreload()
  }, [])

  useEffect(() => {
    if (!prefs.languagesConfirmed) return
    let cancelled = false
    void new IndexedDbEmbeddingStorage()
      .load()
      .then((embedding) => {
        if (cancelled) return
        setEnrolled(!!embedding)
        setStage(embedding ? 'session' : 'enrollment')
      })
      .catch(() => {
        if (!cancelled) setStage('enrollment')
      })
    return () => {
      cancelled = true
    }
  }, [prefs.languagesConfirmed])

  function persist(next: LanguagePrefs) {
    setPrefs(next)
    persistLanguagePrefs(next)
  }

  const modelsBadge = (
    <ModelPreloadBadge
      progress={models.progress}
      done={models.wavlm !== 'loading' && models.vad !== 'loading'}
      error={models.wavlm === 'error' || models.vad === 'error'}
    />
  )

  if (!prefs.languagesConfirmed) {
    return (
      <>
        {modelsBadge}
        <OnboardingPage
          conversationLang={prefs.conversationLang}
          meaningLang={prefs.meaningLang}
          level={prefs.levelByLang[prefs.conversationLang]}
          onConversationLangChange={(lang) => persist({ ...prefs, conversationLang: lang })}
          onMeaningLangChange={(lang) => persist({ ...prefs, meaningLang: lang })}
          onLevelChange={(level) =>
            persist({ ...prefs, levelByLang: { ...prefs.levelByLang, [prefs.conversationLang]: level } })
          }
          onConfirm={() => persist({ ...prefs, languagesConfirmed: true })}
        />
      </>
    )
  }

  if (stage === 'checking') {
    return (
      <>
        {modelsBadge}
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted-foreground">正在读取本机声纹…</p>
        </div>
      </>
    )
  }

  if (stage === 'enrollment') {
    return (
      <>
        {modelsBadge}
        <EnrollmentPage
          conversationLang={prefs.conversationLang}
          enrolled={enrolled}
          onEnrolled={() => setEnrolled(true)}
          onEnterSession={() => setStage('session')}
          recordReady={models.wavlm === 'ready'}
        />
      </>
    )
  }

  // Gate the live session's start on the VAD model (speaker model is already
  // guaranteed ready — enrollment above required it) — proceed on `error` too
  // rather than stranding the user on a permanent loading screen.
  const vadSettled = models.vad === 'ready' || models.vad === 'error'
  if (!vadSettled) {
    return (
      <>
        {modelsBadge}
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted-foreground">正在准备本机模型…</p>
        </div>
      </>
    )
  }

  return (
    <>
      {modelsBadge}
      <SessionPage
        languageSnapshot={{
          conversationLang: prefs.conversationLang,
          meaningLang: prefs.meaningLang,
          level: prefs.levelByLang[prefs.conversationLang],
        }}
        storage={storageRef.current}
      />
    </>
  )
}
