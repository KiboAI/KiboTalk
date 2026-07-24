import type { AppLanguage, LearnerLevel } from '@kibotalk/conversation'
import { APP_LANGUAGE_OPTIONS, LEARNER_LEVEL_OPTIONS } from '@kibotalk/app-shared'
import { Button, CardContent, CardHeader, CardTitle, CardDescription, ToggleGroup, ToggleGroupItem, WizardScreen } from '@kibotalk/ui'
import { ArrowRight, Mic } from 'lucide-react'

export type OnboardingPageProps = {
  conversationLang: AppLanguage
  meaningLang: AppLanguage
  level: LearnerLevel
  onConversationLangChange: (lang: AppLanguage) => void
  onMeaningLangChange: (lang: AppLanguage) => void
  onLevelChange: (level: LearnerLevel) => void
  onConfirm: () => void
  /** Desktop's standalone onboarding window — see `WizardScreen`. */
  embedded?: boolean
  /**
   * `setup` (default) = first-run confirm → enrollment.
   * `settings` = session-out prefs edit; optional voiceprint management entry.
   */
  variant?: 'setup' | 'settings'
  onManageVoiceprint?: () => void
}

/**
 * Language prefs — conversation language (what both speakers use), meaning
 * language (candidate translations), and level for the chosen conversation
 * language. First-run (`setup`) hands off to enrollment; `settings` saves
 * and can open voiceprint re-enrollment.
 */
export function OnboardingPage({
  conversationLang,
  meaningLang,
  level,
  onConversationLangChange,
  onMeaningLangChange,
  onLevelChange,
  onConfirm,
  embedded,
  variant = 'setup',
  onManageVoiceprint,
}: OnboardingPageProps) {
  const settings = variant === 'settings'

  return (
    <WizardScreen embedded={embedded}>
      <CardHeader>
        <CardTitle className="text-xl">{settings ? '设置' : '选择语言'}</CardTitle>
        <CardDescription className="leading-relaxed">
          {settings
            ? '会话外可改对话语言、翻译语言和水平；进行中的会话会锁定当前快照。'
            : '首次使用请确认对话语言（双方说的语言）、翻译语言（候选释义）和当前水平。设置里仍可修改；进行中的会话会锁定。'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground">对话语言（双方说的语言）</p>
          <ToggleGroup
            variant="chip"
            type="single"
            value={conversationLang}
            onValueChange={(v) => v && onConversationLangChange(v as AppLanguage)}
            className="w-full"
          >
            {APP_LANGUAGE_OPTIONS.map((opt) => (
              <ToggleGroupItem key={opt.value} value={opt.value} variant="chip">
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground">翻译语言（候选释义）</p>
          <ToggleGroup
            variant="chip"
            type="single"
            value={meaningLang}
            onValueChange={(v) => v && onMeaningLangChange(v as AppLanguage)}
            className="w-full"
          >
            {APP_LANGUAGE_OPTIONS.map((opt) => (
              <ToggleGroupItem key={opt.value} value={opt.value} variant="chip">
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground">
            当前水平（{APP_LANGUAGE_OPTIONS.find((o) => o.value === conversationLang)?.label}）
          </p>
          <ToggleGroup type="single" value={level} onValueChange={(v) => v && onLevelChange(v as LearnerLevel)}>
            {LEARNER_LEVEL_OPTIONS.map((opt) => (
              <ToggleGroupItem key={opt.value} value={opt.value} className="flex-1">
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="space-y-2">
          <Button className="w-full" size="lg" onClick={onConfirm}>
            {settings ? '保存并关闭' : '确认并继续 · 录声纹'}
            <ArrowRight className="size-4" />
          </Button>
          {settings && onManageVoiceprint ? (
            <Button className="w-full" variant="soft" size="lg" onClick={onManageVoiceprint}>
              <Mic className="size-4" />
              重新录制声纹
            </Button>
          ) : null}
        </div>
      </CardContent>
    </WizardScreen>
  )
}
