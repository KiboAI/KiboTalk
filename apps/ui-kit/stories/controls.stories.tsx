import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
  Progress,
  ScrollArea,
  Separator,
  Skeleton,
  Slider,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
} from '@kibotalk/ui'

const meta = { title: 'Components/Controls', parameters: { layout: 'padded' } } satisfies Meta
export default meta

type Story = StoryObj<typeof meta>

export const ButtonShowcase: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button>默认</Button>
      <Button variant="soft">软黄</Button>
      <Button variant="outline">描边</Button>
      <Button variant="secondary">次级</Button>
      <Button variant="ghost">幽灵</Button>
      <Button variant="destructive">危险</Button>
      <Button variant="link">链接</Button>
      <Button size="sm">小号</Button>
      <Button size="lg">大号</Button>
      <Button disabled>禁用</Button>
    </div>
  ),
}

export const BadgeShowcase: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge>默认</Badge>
      <Badge variant="secondary">次级</Badge>
      <Badge variant="outline">描边</Badge>
      <Badge variant="destructive">危险</Badge>
    </div>
  ),
}

export const CardShowcase: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>会话卡片</CardTitle>
        <CardDescription>生产页面共用的纸面卡片。</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">内容区域</p>
      </CardContent>
    </Card>
  ),
}

export const FormControls: Story = {
  render: () => (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="demo-input">邮箱</Label>
        <Input id="demo-input" placeholder="you@example.com" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="demo-textarea">备注</Label>
        <Textarea id="demo-textarea" placeholder="写点什么…" />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <div className="text-sm font-medium">回复建议</div>
          <div className="text-xs text-muted-foreground">会话中显示 AI 建议</div>
        </div>
        <Switch />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Toggle>加粗</Toggle>
        <ToggleGroup type="single">
          <ToggleGroupItem value="ja">日本語</ToggleGroupItem>
          <ToggleGroupItem value="en">English</ToggleGroupItem>
          <ToggleGroupItem value="zh">中文</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="grid gap-1.5">
        <Label>阈值</Label>
        <Slider defaultValue={[45]} max={100} />
      </div>
      <div className="grid gap-1.5">
        <Label>进度</Label>
        <Progress value={62} />
      </div>
    </div>
  ),
}

export const SkeletonShowcase: Story = {
  render: () => (
    <div className="w-full max-w-sm space-y-2 rounded-lg border border-border p-4">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  ),
}

export const TabsShowcase: Story = {
  render: () => (
    <Tabs defaultValue="session" className="w-96">
      <TabsList>
        <TabsTrigger value="session">会话</TabsTrigger>
        <TabsTrigger value="history">历史</TabsTrigger>
        <TabsTrigger value="settings">设置</TabsTrigger>
      </TabsList>
      <TabsContent value="session" className="pt-3 text-sm">
        会话内容
      </TabsContent>
      <TabsContent value="history" className="pt-3 text-sm">
        历史内容
      </TabsContent>
      <TabsContent value="settings" className="pt-3 text-sm">
        设置内容
      </TabsContent>
    </Tabs>
  ),
}

export const AccordionShowcase: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-96">
      <AccordionItem value="a">
        <AccordionTrigger>常见问题一</AccordionTrigger>
        <AccordionContent>这是答案。</AccordionContent>
      </AccordionItem>
      <AccordionItem value="b">
        <AccordionTrigger>常见问题二</AccordionTrigger>
        <AccordionContent>这是另一个答案。</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
}

export const CollapsibleShowcase: Story = {
  render: () => (
    <Collapsible className="w-96">
      <CollapsibleTrigger className="text-sm font-medium underline">
        展开/收起
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 rounded-lg border border-border p-3 text-sm text-muted-foreground">
        可折叠内容区域。
      </CollapsibleContent>
    </Collapsible>
  ),
}

export const ScrollAreaShowcase: Story = {
  render: () => (
    <ScrollArea className="h-40 w-80 rounded-lg border border-border p-3">
      <div className="space-y-2">
        {Array.from({ length: 20 }, (_, index) => (
          <p key={index} className="text-sm text-muted-foreground">
            第 {index + 1} 行 · 长内容用于演示滚动。
          </p>
        ))}
      </div>
    </ScrollArea>
  ),
}

export const SeparatorShowcase: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-3">
      <div className="text-sm">上方</div>
      <Separator />
      <div className="text-sm">下方</div>
    </div>
  ),
}
