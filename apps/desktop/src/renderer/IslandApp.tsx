import { useEffect, useState } from 'react'
import { loadLanguagePrefs } from '@kibotalk/app-shared'
import { IndexedDbConversationStorage } from '@kibotalk/conversation'
import { IslandBar, IslandDragHandle, IslandSeparator, IslandStatus } from '@kibotalk/ui'
import { IslandPage } from '@kibotalk/pages'

const storage = new IndexedDbConversationStorage()

/**
 * The always-on-top Island window's root — waits for onboarding (language
 * prefs + voiceprint, completed in the separate onboarding window main
 * auto-opens on first run) before handing off to `IslandPage`'s live
 * session. `window.kibotalk` is the preload bridge (see `src/shared/ipc.ts`).
 */
export default function IslandApp() {
  const [completed, setCompleted] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.kibotalk.onboarding.getStatus().then((status) => {
      if (!cancelled) setCompleted(status.completed)
    })
    return window.kibotalk.onboarding.onCompleted(() => setCompleted(true))
  }, [])

  if (completed !== true) {
    return (
      <div className="flex h-screen w-full items-end justify-end p-6">
        <IslandBar>
          <IslandStatus
            label={completed === null ? '正在检查设置…' : '请完成引导'}
            onClick={completed === null ? undefined : () => void window.kibotalk.onboarding.open()}
          />
          <IslandSeparator />
          <IslandDragHandle />
        </IslandBar>
      </div>
    )
  }

  const prefs = loadLanguagePrefs()
  return (
    <IslandPage
      languageSnapshot={{
        conversationLang: prefs.conversationLang,
        meaningLang: prefs.meaningLang,
        level: prefs.levelByLang[prefs.conversationLang],
      }}
      storage={storage}
      onGoSettings={() => void window.kibotalk.onboarding.open()}
    />
  )
}
