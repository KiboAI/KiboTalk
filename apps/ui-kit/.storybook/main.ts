import type { StorybookConfig } from '@storybook/react-vite'
import { mergeConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: async (config) =>
    mergeConfig(config, {
      plugins: [tailwindcss()],
    }),
}

export default config
