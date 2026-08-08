import type { Meta, StoryObj } from '@storybook/react-vite'
import { History, Play, Settings, Sparkles, Square } from 'lucide-react'
import {
  Badge,
  Button,
  DesktopProductWindowFrame,
  DesktopWindowHeader,
  IslandBar,
  IslandDragHandle,
  IslandNavButton,
  IslandSeparator,
  IslandStatus,
  IslandToggleButton,
  LevelMeter,
  ModelPreloadBadge,
  PillTag,
  ScrollArea,
  SessionListItem,
  StepIndicator,
  StickyNoteCard,
  StickyNoteCardPlaceholder,
  StickyNoteStack,
  WizardScreen,
} from '@kibotalk/ui'
import { fakeCandidates } from './fixtures/session'

const meta = { title: 'Components/Product', parameters: { layout: 'padded' } } satisfies Meta
export default meta

type Story = StoryObj<typeof meta>

export const StickyNoteCardShowcase: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6">
      <StickyNoteCard candidates={fakeCandidates} />
      <StickyNoteCard candidates={fakeCandidates.slice(0, 2)} older />
      <StickyNoteCardPlaceholder label="正在生成建议…" />
    </div>
  ),
}

export const StickyNoteStackShowcase: Story = {
  render: () => (
    <div className="h-[420px] w-full max-w-xl rounded-xl bg-muted/30 p-4">
      <StickyNoteStack
        rounds={[
          { id: 'latest', candidates: fakeCandidates },
          { id: 'previous', candidates: [fakeCandidates[1]] },
        ]}
        maxRounds={3}
        scrollable={false}
      />
    </div>
  ),
}

export const IslandBarShowcase: Story = {
  render: () => (
    <div className="desk-surface flex h-64 w-full items-center justify-center rounded-2xl p-6">
      <IslandBar className="w-full max-w-md">
        <IslandStatus label="听写中" pulse toneClassName="bg-emerald-400" />
        <IslandSeparator />
        <IslandToggleButton on label="停止会话">
          <Square className="size-4" />
        </IslandToggleButton>
        <IslandToggleButton on={false} label="转写：关">
          <Sparkles className="size-4" />
        </IslandToggleButton>
        <IslandToggleButton on label="AI 提示：开">
          <Play className="size-4" />
        </IslandToggleButton>
        <IslandSeparator />
        <IslandNavButton label="设置">
          <Settings className="size-4" />
        </IslandNavButton>
        <IslandNavButton label="历史">
          <History className="size-4" />
        </IslandNavButton>
        <IslandDragHandle />
      </IslandBar>
    </div>
  ),
}

export const LevelMeterShowcase: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <LevelMeter level={0.15} />
      <LevelMeter level={0.5} />
      <LevelMeter level={0.9} />
    </div>
  ),
}

export const StepIndicatorShowcase: Story = {
  render: () => (
    <div className="w-full max-w-md space-y-6">
      <StepIndicator
        current={0}
        steps={[{ label: '语言' }, { label: '声纹' }, { label: '完成' }]}
      />
      <StepIndicator
        current={1}
        steps={[{ label: '语言' }, { label: '声纹' }, { label: '完成' }]}
      />
      <StepIndicator
        current={2}
        steps={[{ label: '语言' }, { label: '声纹' }, { label: '完成' }]}
      />
    </div>
  ),
}

export const PillTagShowcase: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <PillTag>实时转写</PillTag>
      <PillTag>00:07</PillTag>
      <Badge>Badge 对照</Badge>
    </div>
  ),
}

export const SessionListItemShowcase: Story = {
  render: () => (
    <div className="w-full max-w-sm">
      <SessionListItem title="车站问路" subtitle="昨天 09:05 · 7 分钟" />
      <SessionListItem title="咖啡馆点单" subtitle="今天 14:22 · 3 分钟" current />
    </div>
  ),
}

export const WizardScreenShowcase: Story = {
  render: () => (
    <WizardScreen>
      <div className="space-y-3">
        <h2 className="text-xl font-bold">引导卡片</h2>
        <p className="text-sm text-muted-foreground">WizardScreen 是引导/注册流程的共用外框。</p>
        <Button>下一步</Button>
      </div>
    </WizardScreen>
  ),
}

export const ModelPreloadBadgeShowcase: Story = {
  render: () => (
    <div className="relative h-40 w-full">
      <ModelPreloadBadge progress={0.64} done={false} />
      <ModelPreloadBadge progress={0.64} done={false} error />
    </div>
  ),
}

export const DesktopWindowShowcase: Story = {
  render: () => (
    <DesktopProductWindowFrame heightMode="content">
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          桌面端不透明窗口的共用 chrome：顶部拖拽条 + 内容区。
        </p>
      </div>
    </DesktopProductWindowFrame>
  ),
}

export const DesktopWindowHeaderShowcase: Story = {
  render: () => (
    <div className="w-full max-w-md rounded-lg border border-border bg-background">
      <DesktopWindowHeader />
      <div className="p-4 text-sm text-muted-foreground">窗口内容</div>
    </div>
  ),
}
