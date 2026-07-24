import { useState } from 'react'
import type { AppLanguage, LearnerLevel, UiLanguage } from '@kibotalk/conversation'
import { languageLabel, levelLabel, useI18n } from '@kibotalk/app-shared'
import {
  Button,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
  WizardScreen,
} from '@kibotalk/ui'
import { ArrowRight, Languages, Loader2 } from 'lucide-react'

const LANGUAGES: AppLanguage[] = ['ja', 'en', 'zh']
const LEVELS: LearnerLevel[] = ['beginner', 'intermediate', 'advanced']

export type OnboardingPageProps = {
  uiLang: UiLanguage
  conversationLang: AppLanguage
  level: LearnerLevel
  onUiLangChange: (lang: UiLanguage) => void
  onConversationLangChange: (lang: AppLanguage) => void
  onLevelChange: (level: LearnerLevel) => void
  onConfirm: () => void
  onRequestPermissions?: () => Promise<void>
  embedded?: boolean
}

/**
 * First-run language step. UI language lives in a small top-right selector;
 * the body only asks for conversation language and level. Meaning language is
 * derived from UI language when the session snapshot is created.
 */
export function OnboardingPage({
  uiLang,
  conversationLang,
  level,
  onUiLangChange,
  onConversationLangChange,
  onLevelChange,
  onConfirm,
  onRequestPermissions,
  embedded,
}: OnboardingPageProps) {
  const { t, language } = useI18n()
  const [working, setWorking] = useState(false)

  async function confirm() {
    setWorking(true)
    try {
      await onRequestPermissions?.()
      onConfirm()
    } finally {
      setWorking(false)
    }
  }

  return (
    <WizardScreen embedded={embedded}>
      <CardHeader className="relative pr-36">
        <div className="absolute right-6 top-5">
          <Select value={uiLang} onValueChange={(value) => onUiLangChange(value as UiLanguage)}>
            <SelectTrigger className="h-9 w-28" aria-label={t('uiLanguage')}>
              <Languages className="size-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zh">中文</SelectItem>
              <SelectItem value="ja">日本語</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <CardTitle className="text-xl">{t('selectLanguage')}</CardTitle>
        <CardDescription className="leading-relaxed">{t('onboardingDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground">{t('conversationLanguage')}</p>
          <ToggleGroup
            variant="chip"
            type="single"
            value={conversationLang}
            onValueChange={(value) => value && onConversationLangChange(value as AppLanguage)}
            className="w-full"
          >
            {LANGUAGES.map((option) => (
              <ToggleGroupItem key={option} value={option} variant="chip">
                {languageLabel(option, language)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground">
            {t('level')} · {languageLabel(conversationLang, language)}
          </p>
          <ToggleGroup
            type="single"
            value={level}
            onValueChange={(value) => value && onLevelChange(value as LearnerLevel)}
          >
            {LEVELS.map((option) => (
              <ToggleGroupItem key={option} value={option} className="flex-1">
                {levelLabel(option, language)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <Button className="w-full" size="lg" onClick={() => void confirm()} disabled={working}>
          {working ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {t('continueVoiceprint')}
        </Button>
      </CardContent>
    </WizardScreen>
  )
}
