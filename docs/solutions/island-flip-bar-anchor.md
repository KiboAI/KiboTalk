---
module: desktop
tags: [electron, island, multi-monitor, window-position]
problem_type: regression
---

# Island flip must use the visible bar as its anchor

## 症状 / Symptom

上下排列且分辨率不同的双显示器上，较高的 Island 窗口可能跨越两个屏幕。使用窗口
重叠面积或窗口中心选择屏幕时，岛条明明位于当前屏幕上半区，内容却可能翻到上方；
React 重排内容后还可能再次触发相反判定。

## 原因 / Cause

用户实际拖动和观察的是岛条，而不是透明窗口外壳。内容从岛条上方切到下方时，
岛条在窗口内的相对位置也会改变；若只重排 DOM、不同步移动窗口外壳，下一次判定
看到的是另一个屏幕坐标，形成反馈回路。

此外，无转写和建议卡片时，`content` 为 `null`，原 flex 布局没有占位内容区。
`contentSide=above` 虽然表示岛条应在底部，实际 DOM 却仍把它放在顶部，任何固定
偏移计算都会读错位置。

## 修复 / Fix

- renderer 始终渲染可伸缩的内容槽，即使当前内容为空；
- renderer 实测岛条中心相对窗口的偏移并通过 IPC 传给主进程，不硬编码高度；
- 用岛条中心点选择其所在或最近的显示器；
- 用该显示器工作区中点和固定滞回区判定内容方向；
- 翻转时只移动窗口外壳，保持岛条的绝对屏幕坐标不变；
- 主进程移动期间抑制一次 settle，renderer 继续持有唯一的 `contentSide`，
  菜单方向也直接由该值派生。

## 证据 / Evidence

`apps/desktop/scripts/verify-island-flip.ts` 使用用户记录的两块不等高显示器坐标，
覆盖两个屏幕的上下半区、两种初始方向，并验证翻转后岛条坐标不变且重复判定不振荡。
