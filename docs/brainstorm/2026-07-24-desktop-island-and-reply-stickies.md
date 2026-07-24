# 桌面端：Island 日常壳 + 便利贴候选卡（参考 AIRI）

- **日期**：2026-07-24
- **状态**：行为已确认并落地
- **标签**：desktop, electron, island, onboarding, settings, reply-candidates, UX
- **提出人**：路路（grill 会话中；对照 [moeru-ai/airi](https://github.com/moeru-ai/airi) `stage-tamagotchi`）
- **关联**：[产品想法](./2026-07-16-live-reply-coach-language-assist.md) · [MVP spec §2.1 / Electron P1](../spec/live-reply-coach-mvp.md)

## 背景

Playground 在整理成「产品主舞台 + 实验室」时，路路补充了**最终桌面端**的交互愿景：平时不占整屏，只靠悬浮控件过日子；候选回复以消息块（便利贴）贴在悬浮控件附近弹出，而不是进一个大聊天窗。

AIRI 桌面（`apps/stage-tamagotchi`）已有可对照的窗体拆分与 island 组件，值得当结构参考，而不是抄视觉。

## 想法（真正想做什么）

### 一句话

KiboTalk 桌面端日常形态 = **常驻 Island（状态 + 功能按钮）**；AI 给出 3 条回复候选时，在 Island **附近**弹出 **三张便利贴式消息块**（像音乐软件歌词/字幕贴边出现，但是有结构的卡片，不是纯文字）。设置与首次引导走独立窗口，不塞进 Island。

### 三件套窗体（对齐 AIRI 的职责拆分）

| 表面 | 用户何时用 | AIRI 对照（本地仓库） | KiboTalk 设想 |
|------|------------|----------------------|---------------|
| **Onboarding** | 第一次进入 | 独立窗 `windows/onboarding` + `pages/onboarding.vue`；完成后关窗进主舞台 | 语言 prefs、声纹录入门槛、权限说明等「开箱必做」 |
| **Island（悬浮）** | 平时几乎只用这个 | `stage-islands/`：`controls-island`（底右悬浮、展开抽屉、离开后自动收起）、`status-island`（连接态）、`resource-status-island`（下载进度） | 运行状态（听/说/推理中）、开始/暂停、开设置、可能麦克风/置顶等；**不承载完整对话历史** |
| **Settings** | 低频深配 | 独立窗 `windows/settings`，Island 按钮 `electronOpenSettings` 打开 | 语言、水平、阈值、声纹管理、STT/LLM 等；Playground 里现在散落的「用户不该碰」的参数**不应**默认进这里 |

AIRI 还有 `notice` / `chat` / `widgets` / `caption` 等窗——说明「主舞台 ≠ 唯一窗」。KiboTalk 的「三张便利贴」更接近 **贴边 overlay / notice / caption**，而不是把候选塞进一个常驻 Chat 窗。

### Island 附近的「便利贴」候选（核心差异点）

- **触发**：管线产出 3 条 `ReplyCandidate`（或 `[]` 跳过）后，在 Island 附近弹出。
- **形态**：三张**消息块**（便利贴），不是一行字幕。每张至少承载最终产品卡面：目标语、`meaning`、（日语时）读音/`segments`——与现有 `ReplyCandidateCard` 同 schema。
- **动效隐喻**：音乐软件歌词/字幕——贴边、跟主控件有空间锚点、可随 Island 位置偏移；不是 modal 居中挡操作。
- **生命周期（待钉）**：新一轮候选是替换三张、堆叠、还是旧的淡出？用户点选/忽略后如何收起？会话锁定期间是否仍可点开 Settings？

### 从 AIRI Controls Island 可借的行为（不是视觉）

对照 `controls-island/index.vue` + store：

- 角落固定、可拖（AIRI 有 `electronStartDraggingWindow`）
- **折叠 / 展开**；鼠标离开一段时间自动收起（AIRI ~1.5s，有 overlay 打开时不收）
- Island 上只放**高频动作**；深配置跳到 Settings 窗
- Status 用小 island / 色态表达连接与健康，而不是大仪表盘

KiboTalk 要多出来的一层：**候选便利贴是内容表面，不是又一个 controls 按钮。**

## 和当前 Playground 的关系（刻意分开）

| | Playground（[视觉重构 spec](../spec/playground-visual-refactor.md)） | 最终桌面（本文） |
|--|---------------------------|------------------|
| 角色 | 能力试炼 + **产品 UI 组件预演** | 日常陪伴壳 |
| 布局 | 主栏 = 通知中心式竖排黄便利贴；对话左可折 / 调试右可折；语言顶栏 Popover；**无** Island | Island + 附近便利贴；Settings / Onboarding 独立窗 |
| 参数 | 大量用户不可见旋钮必须在，但不能脏产品面 | Settings 只暴露用户该碰的；实验室旋钮不进正式壳 |

Playground 定稿的 Sticky 候选卡应可挂到日后 Island 附近 overlay；Web playground **不**假扮透明 Electron 窗。

## 开放问题（未决议 · 桌面壳）

1. ~~便利贴锚点：永远贴 Island 上沿 / 随屏幕边缘 / 用户可拖？~~ **已决议**：整个透明悬浮窗可通过 Island 拖动并从边缘 / 四角缩放；Island 位于当前屏幕下半区时内容在上，上半区时内容在下。只在拖动松手后翻转，Island 的屏幕坐标保持稳定；内部顺序始终为「转写 → 当前便利贴 → 旧一轮 → 旧二轮」。
2. ~~三张卡同时出现还是错峰动画？点选一张后其余如何？~~ **已决议**：按容器高度显示，最多保留当前 + 两轮旧卡，垂直排列且不重叠；所有端、所有轮次都不旋转或横向错位，旧轮逐轮透明，最旧一轮底部渐隐。旧轮不可点击，也不提供候选点选 / 高亮。
3. ~~对话历史要不要另开「回顾」窗，还是正式产品刻意不做完整 transcript UI？~~ **已决议并落地**：采用 History 列表页 + 详情页 + Web 会话内可折叠对话栏。会话与候选在 IndexedDB 长期保留，停止后后台生成短标题和总结。
4. ~~Onboarding 是否强制声纹 + 语言，还是可跳过？~~ **已决议**：**强制**。`apps/web`/`apps/desktop` 均已按此实现：未确认语言 prefs 前不进 enrollment，未声纹入库前不进会话页/Island。

## 已确认：macOS 状态栏壳

- MVP 是 **macOS 状态栏优先**的工具应用；完成首次引导后默认不占 Dock，但悬浮窗始终可由状态栏菜单找回。
- 状态栏图标本身使用**静态品牌图标**。运行 / 暂停 / 错误等动态图标变体不进 MVP，留作未来工作。
- 菜单包含：当前状态、显示 / 隐藏悬浮窗、开始 / 暂停 / 继续 / 停止、AI 建议开关、历史、设置、退出。
- 隐藏悬浮窗不会暂停；产生新建议也不会自动把窗弹回。MVP 不发系统通知，菜单状态可提示「有新建议」。
- 所有用户主动退出路径（Island 菜单、状态栏菜单、`Cmd+Q`、Dock / 应用菜单）统一进入确认对话框。进行中 / 暂停时使用「结束会话并退出」，已停止时使用普通退出确认；系统关机 / 注销只做尽力持久化。

Playground 本轮布局 / 纸感 / 多轮通知列已写入 [playground-visual-refactor.md](../spec/playground-visual-refactor.md)，不再在此开放。

## 已落地的原缺口

- 首次引导与设置包含麦克风及桌面系统音频 / 屏幕录制权限状态和重试入口。
- 冷启动只显示通用语音能力准备进度，不向用户暴露模型名称或缓存管理。
- 产品设置提供声纹重录 / 删除、清除历史和清除个人数据；个人重置不删除模型文件。
- `ConversationStorage` 已加入 session 生命周期、冻结快照、标题、总结与历史查询。暂停保留同一 session；停止后下一次开始创建新 session。

## 非目标（本文不决定）

- 黄色主题与纸感 token → 见视觉重构 spec；实际 token 现已落地 [`packages/ui/src/theme.css`](../../packages/ui/src/theme.css)，组件清单见 [product-design-system.md](../spec/product-design-system.md)
- 不改 MVP 功能边界（仍是听 → 3 候选 → 用户自己说）
