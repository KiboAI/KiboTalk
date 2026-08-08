import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Toaster,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from '@kibotalk/ui'

const meta = { title: 'Components/Overlays', parameters: { layout: 'padded' } } satisfies Meta
export default meta

type Story = StoryObj<typeof meta>

export const DialogShowcase: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">打开对话框</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认操作</DialogTitle>
          <DialogDescription>这是生产共用的对话框。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button>确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}

export const DropdownShowcase: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">菜单</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>操作</DropdownMenuLabel>
        <DropdownMenuItem>进入设置</DropdownMenuItem>
        <DropdownMenuItem>查看历史</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive">删除</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}

export const PopoverShowcase: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">弹层</Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <p className="text-sm font-medium">提示内容</p>
        <p className="mt-1 text-xs text-muted-foreground">Popover 内容区域。</p>
      </PopoverContent>
    </Popover>
  ),
}

export const SelectShowcase: Story = {
  render: () => (
    <Select defaultValue="ja">
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ja">日本語</SelectItem>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="zh">中文</SelectItem>
      </SelectContent>
    </Select>
  ),
}

export const SheetShowcase: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">侧栏</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>侧栏标题</SheetTitle>
          <SheetDescription>生产共用的 Sheet 侧栏。</SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-full">
          <div className="space-y-2 p-2">
            {Array.from({ length: 30 }, (_, index) => (
              <p key={index} className="text-sm text-muted-foreground">
                第 {index + 1} 项
              </p>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  ),
}

export const TooltipShowcase: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">悬停提示</Button>
        </TooltipTrigger>
        <TooltipContent>这里是提示文字。</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
}

export const ToasterShowcase: Story = {
  render: () => (
    <>
      <Toaster />
      <Button onClick={() => toast('这是一条 toast 消息')}>触发 toast</Button>
    </>
  ),
}
