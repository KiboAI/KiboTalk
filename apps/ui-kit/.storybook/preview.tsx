import type { Preview } from '@storybook/react-vite'
import { I18nProvider, defaultProductPrefs } from '@kibotalk/app-shared'
import { TooltipProvider } from '@kibotalk/ui'
import '../stories/storybook.css'

const preview: Preview = {
  globalTypes: {
    theme: {
      description: '明暗主题',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: ['light', 'dark'],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme === 'dark' ? 'dark' : 'light'
      return (
        <I18nProvider value={{ ...defaultProductPrefs, uiLang: 'zh', theme }}>
          <TooltipProvider delayDuration={280}>
            <div className="min-h-dvh w-full bg-background text-foreground">
              <Story />
            </div>
          </TooltipProvider>
        </I18nProvider>
      )
    },
  ],
  parameters: {
    controls: { expanded: true },
    viewport: {
      options: {
        island: {
          name: 'Island 桌面窗口',
          styles: { width: '420px', height: '640px' },
          type: 'desktop',
        },
      },
    },
  },
}

export default preview
