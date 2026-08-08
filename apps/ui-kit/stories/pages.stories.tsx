import { useMemo } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ConversationSession } from '@kibotalk/conversation'
import { InMemoryConversationStorage } from '@kibotalk/conversation'
import { defaultProductPrefs } from '@kibotalk/app-shared'
import {
  EnrollmentPage,
  HistoryPage,
  IslandPage,
  OnboardingPage,
  SessionPage,
  SettingsPage,
} from '@kibotalk/pages'
import { createFakeSessionController, fakeCandidates, fakeTurns } from './fixtures/session'

const meta = { title: 'Production Pages', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

type Story = StoryObj<typeof meta>

const noop = () => {}

function sessionHistoryStorage(): InMemoryConversationStorage {
  const storage = new InMemoryConversationStorage()
  const base: ConversationSession = {
    id: 'history-1',
    relayNodeId: 'jp-primary',
    status: 'stopped',
    startedAt: Date.now() - 24 * 60 * 60 * 1000,
    endedAt: Date.now() - 24 * 60 * 60 * 1000 + 7 * 60 * 1000,
    pausedDurationMs: 0,
    snapshot: {
      conversationLang: 'ja',
      meaningLang: 'zh',
      uiLang: 'zh',
      level: 'beginner',
      audioSource: 'microphone',
      microphoneDeviceId: 'default',
    },
    turns: fakeTurns,
    title: '车站问路',
    summary: '问路与指路',
    reviewStatus: 'ready',
  }
  void storage.upsertSession(base)
  void storage.upsertSession({
    ...base,
    id: 'history-2',
    title: '咖啡馆点单',
    startedAt: Date.now() - 3 * 60 * 60 * 1000,
    endedAt: Date.now() - 3 * 60 * 60 * 1000 + 3 * 60 * 1000,
  })
  return storage
}

export const SessionPageRunning: Story = {
  render: () => (
    <SessionPage
      controller={createFakeSessionController({
        lifecycle: 'running',
        state: 'LLM_STREAMING',
        vadStatus: 'speech',
        rounds: [{ id: 'round-latest', candidates: fakeCandidates }],
      })}
      onGoSettings={noop}
      onGoHistory={noop}
      onGoAccount={noop}
    />
  ),
}

export const SessionPagePaused: Story = {
  render: () => (
    <SessionPage
      controller={createFakeSessionController({
        lifecycle: 'paused',
        state: 'PAUSED',
        rounds: [{ id: 'round-latest', candidates: fakeCandidates }],
      })}
    />
  ),
}

export const IslandPageRunning: Story = {
  globals: { viewport: 'island' },
  render: () => (
    <div className="desk-surface h-dvh w-full overflow-hidden">
      <IslandPage
        controller={createFakeSessionController({
          lifecycle: 'running',
          state: 'LLM_STREAMING',
          vadStatus: 'speech',
          rounds: [{ id: 'round-latest', candidates: fakeCandidates }],
        })}
        contentSide="below"
        onGoSettings={noop}
        onGoHistory={noop}
        onGoAccount={noop}
      />
    </div>
  ),
}

export const OnboardingPageDemo: Story = {
  render: () => (
    <OnboardingPage
      uiLang="zh"
      conversationLang="ja"
      level="beginner"
      onUiLangChange={noop}
      onConversationLangChange={noop}
      onLevelChange={noop}
      onConfirm={noop}
    />
  ),
}

export const EnrollmentPageIntro: Story = {
  render: () => (
    <EnrollmentPage
      conversationLang="ja"
      enrolled={false}
      onEnrolled={noop}
      onEnterSession={noop}
    />
  ),
}

export const EnrollmentPageDone: Story = {
  render: () => (
    <EnrollmentPage
      conversationLang="ja"
      enrolled
      onEnrolled={noop}
      onEnterSession={noop}
    />
  ),
}

export const SettingsPageDemo: Story = {
  render: () => (
    <SettingsPage
      platform="web"
      prefs={{ ...defaultProductPrefs, uiLang: 'zh', theme: 'light' }}
      sessionActive
      storage={useMemo(() => new InMemoryConversationStorage(), [])}
      onPrefsChange={noop}
      onBack={noop}
      onManageVoiceprint={noop}
    />
  ),
}

export const HistoryPageDemo: Story = {
  render: () => (
    <HistoryPage storage={useMemo(sessionHistoryStorage, [])} onBack={noop} />
  ),
}
