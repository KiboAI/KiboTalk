import type { Meta, StoryObj } from '@storybook/react-vite'

const meta = { title: 'Design System/Tokens' } satisfies Meta
export default meta

type Story = StoryObj<typeof meta>

const colorTokens = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'primary-soft-strong',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'desk',
  'sticky-foreground',
  'island',
  'island-foreground',
] as const

function Swatch({ name }: { name: string }) {
  return (
    <div className="flex w-36 flex-col gap-1.5">
      <div
        className="h-14 w-full rounded-lg border border-border"
        style={{ background: `var(--${name})` }}
      />
      <code className="text-[10px] text-muted-foreground">--{name}</code>
    </div>
  )
}

function RadiusBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="size-16 border-2 border-primary bg-primary/10"
        style={{ borderRadius: value }}
      />
      <code className="text-[10px] text-muted-foreground">{label}</code>
    </div>
  )
}

function ShadowBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="size-20 rounded-lg bg-card" style={{ boxShadow: `var(--${value})` }} />
      <code className="text-[10px] text-muted-foreground">{label}</code>
    </div>
  )
}

export const Colors: Story = {
  render: () => (
    <div className="w-full space-y-8">
      <section>
        <h2 className="mb-4 text-lg font-semibold">颜色 Color</h2>
        <div className="flex flex-wrap gap-3">
          {colorTokens.map((name) => (
            <Swatch key={name} name={name} />
          ))}
        </div>
      </section>
    </div>
  ),
}

export const Radius: Story = {
  render: () => (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">圆角 Radius</h2>
      <div className="flex flex-wrap gap-6">
        <RadiusBox label="--radius-sm" value="var(--radius-sm)" />
        <RadiusBox label="--radius-md" value="var(--radius-md)" />
        <RadiusBox label="--radius-lg" value="var(--radius-lg)" />
        <RadiusBox label="--radius-xl" value="var(--radius-xl)" />
        <RadiusBox label="rounded-full" value="9999px" />
      </div>
    </div>
  ),
}

export const Shadows: Story = {
  render: () => (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">阴影 Shadows</h2>
      <div className="flex flex-wrap gap-6">
        <ShadowBox label="--shadow-tier0" value="shadow-tier0" />
        <ShadowBox label="--shadow-tier1" value="shadow-tier1" />
        <ShadowBox label="--shadow-tier1-lg" value="shadow-tier1-lg" />
        <ShadowBox label="--shadow-panel" value="shadow-panel" />
        <ShadowBox label="--shadow-note" value="shadow-note" />
      </div>
    </div>
  ),
}

export const Typography: Story = {
  render: () => (
    <div className="w-full space-y-3">
      <h2 className="text-lg font-semibold">字阶 Typography</h2>
      <div className="space-y-2">
        <p className="text-4xl font-bold">标题 display — 跟着 KiboTalk 说下一句</p>
        <p className="text-2xl font-bold">标题 h2 — 跟着 KiboTalk 说下一句</p>
        <p className="text-xl font-bold">标题 h3 — 跟着 KiboTalk 说下一句</p>
        <p className="text-base">正文 — 跟着 KiboTalk 说下一句，而不是卡在对话里。</p>
        <p className="text-sm text-muted-foreground">辅助 — 设置、说明与次要信息。</p>
        <p className="text-xs text-muted-foreground">标注 — 时间戳、徽标与元信息。</p>
      </div>
    </div>
  ),
}
