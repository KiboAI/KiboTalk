# 好看便签设计调研：对 KiboTalk 的启示

- **日期**：2026-07-25
- **性质**：灵感调研（非决策、非落地清单）
- **对照现状**：`packages/ui` 已有黄纸扁平语言——微旋转、暖棕墨色、`--shadow-note`、desk / island-stage 两套阴影语义；一帖最多 3 条候选（目标语 + meaning + 假名分段）
- **关联**：[产品设计系统](../spec/product-design-system.md)、[桌面 Island 头脑风暴](./2026-07-24-desktop-island-and-reply-stickies.md)

## 1. 为什么做这份调研

我们的回复卡已经是「便利贴」而不是「卡片」，但目前主要靠：黄渐变面 + 暖阴影 + ±1–2° 倾斜。网上好看的便签往往多了几件「文具道具」（折角、胶带、图钉、纸纹、手写分隔），或在信息密度上更克制。本调研挑出对 **实时会话可读性** 仍友好的手法，标出哪些值得试、哪些该跳过。

## 2. 强参考（按启发强度）

### A. Fusen Board（日式付箋设计语言）— 最贴文化语境

- **链接**：[katagami ✦ Fusen Board](https://katagami.ai/language/en-019dacd4-66ef-7d12-a005-aa22019a140b)
- **做得好**：
  - 明确反对玻璃拟态、完美 SaaS 网格、纯黑白——和我们「纸感」方向一致
  - 便签：实色 pastel、**4px 小圆角**、短而近的纸影（`2px 3px 6px`）、淡纸纤维伪元素、微旋转
  - **图钉 / 半透明胶带**只用来表达层级，不装饰每一张
  - 桌面是软木板质感（斑点 radial-gradient），空白 = 露出的板面，不是空白页
  - Hover：抬起 2px + **略减旋转**（更稳），不是只改透明度
- **对我们**：圆角可考虑略收（我们现在偏 `radius-lg`）；纸纹与「只在顶帖加一枚极淡胶带」值得原型；不要整页铺软木——Island 浮在真实桌面上，软木只适合 web session 的 desk-surface

### B. shadcn Sticky Note Wall Grid — 营销墙式便签

- **链接**：[Features Sticky Note Wall Grid](https://www.shadcn.io/blocks/features-sticky-note-wall-grid)
- **做得好**：软木点阵底、琥珀黄帖、顶钉、手写感衬线标题、交替旋转、入场动效
- **对我们**：适合落地页/营销，不适合会话中的 3 行语言候选。可偷的只有：**图钉作「本轮」锚点**、标题手写感（但目标语必须保持高可读无衬线，手写只适合装饰/标签）

### C. UploadStickyBoard（Miro / FigJam 灵感）

- **链接**：[UploadStickyBoard docs](https://docs.uploadkit.dev/docs/sdk/react/upload-sticky-board)
- **做得好**：pastel 色循环、随机 ±6°、**右上折角**、hover 抬升、暖软木底；尊重 `prefers-reduced-motion`
- **对我们**：折角是低成本「这是纸」信号；±6° 对我们太狠（假名/汉字会晃）——保持现有 ~±1.5°；彩虹色循环会稀释品牌黄，仅当「轮次语义色」时极克制试用（如旧轮略偏暖橙灰，仍非粉蓝紫墙）

### D. FigJam Sticky — 协作产品里最「正经」的便签

- **链接**：[Sticky notes in FigJam](https://help.figma.com/hc/en-us/articles/1500004414322-Sticky-notes-in-FigJam)
- **做得好**：
  - **故意不可旋转**——协作可读性优先于「随手扔」
  - 两种固定形（方 / 宽），高度随内容长，色板有限（约 10 色）
  - 折角是图标语言的一部分，但板子上帖子保持正交
- **对我们**：印证一件事——**实时阅读场景应优先可读**。我们已有轻微旋转做「人味」；Island 上不宜再加大倾斜。FigJam 的「宽帖」隐喻也贴我们「一帖三行」的竖向生长

### E. Fog Creek CSS sticky（胶带固定）

- **链接**：[Sticky notes with CSS3](https://robsobers.com/sticky-notes-with-css/)
- **做得好**：顶部半透明胶带 `::before`、交替微旋转、手写字体、短阴影；胶带本身也微倾
- **对我们**：胶带比图钉更「贴在玻璃/显示器上」——对 Island 浮层反而更贴切（图钉暗示软木板）。可作「最新一轮」的可选装饰，旧轮不加

### F. CSS 折角 Post-it / 和纸胶带教程

- **链接**：
  - [CodePen: CSS Post-it folded corner](https://codepen.io/microbians/pen/pdVNpq)（透明折角，任意底色可用）
  - [Washi tape notes (pure CSS)](https://codingartistweb.com/2021/10/how-to-create-washi-tape-notes-with-pure-css/)
- **做得好**：折角用 border 三角做「掀起」；胶带用 repeating-gradient 模拟条纹
- **对我们**：折角可进 `.sticky-note` 伪元素试验；条纹胶带偏 DIY 博客风，会话 UI 过花——若加胶带，用半透明奶油色实条即可（Fusen / Fog Creek 路线）

### G. 产品侧：Post-it App / postalk / かんたん付箋

- **链接**：
  - [Post-it® App](https://www.post-it.com/3M/en_US/post-it/ideas/app/)
  - [postalk](https://postalk.app/)（日本团队白板付箋）
  - [かんたん付箋](https://anothernote.happyneko.com/ja/)（桌面小部件）
- **做得好**：品牌黄家族 + 有限色板；postalk 把「贴/撕/排」做成交互隐喻；桌面便签强调 **小面积、一眼扫完**
- **对我们**：Island 场景接近「桌面小部件」——单帖信息预算要狠；颜色语义留给 speaker/轮次，不要做成调色盘玩具

### H. Notion 纸感（对照，非便签本体）

- **链接**：[Notion design system · Refero](https://styles.refero.design/style/2bf4c61f-de10-4614-ba1b-20c0453bd2a9)
- **做得好**：暖灰画布 + 卡片 **1px 发丝边、无阴影**；pastel 整面当「便签色」
- **对我们**：印证设计系统里已有的判断——Island 上大阴影像黑斑，应靠轻阴影 / hover 边框。Notion 的「无影纸」适合嵌在页面里；浮在系统桌面上仍需一点纸影，但要比 web stage 更轻（你们已在 `.island-stage` 做了）

## 3. 手法目录（可复用）

| 手法 | 好看的原因 | 对 KiboTalk |
|------|------------|-------------|
| 微旋转（±1–2°） | 不像对齐好的 UI 卡 | ✅ 已有，保持；勿到 ±5° |
| 短近纸影 vs 大扩散影 | 短影更「贴板」；大影更「浮空」 | ✅ 继续双语义：stage 用 `--shadow-note`，island 用轻量版 |
| 纸纤维 / 细噪点 | 打破数码渐变的塑料感 | 🟡 可试极淡 `::before` 噪点，注意性能与截图清晰度 |
| 折角 | 瞬间读成「纸」 | 🟡 右下或右上小折角；勿挡假名 |
| 胶带 | 「刚贴上」的时间感 | 🟡 仅顶帖；半透明实色，不要条纹和纸胶带 |
| 图钉 | 钉在软木上的仪式感 | ⚠️ Island 不合适；web desk 可选 |
| 手写字体 | 人情味 | ❌ 目标语/假名禁用；最多用于空态文案 |
| 多色 pastel 墙 | 热闹、可分类 | ⚠️ 主帖保持黄；色只做弱语义（旧轮褪色已有） |
| Hover 抬起 + 减旋转 | 物理反馈 | 🟡 可替代/补充现在的 `:active` 压影 |
| 手绘分隔线 | 比 `border-dashed` 更「笔记」 | 🟡 候选之间可试不规则 1px SVG，但先别牺牲扫描速度 |
| 软木/点阵底 | 场景完整 | 🟡 仅 `desk-surface`；Island 保持透明 |
| 高密度堆叠 | 用过的板子感 | ✅ 已有多轮弱化栈；重叠 4–10px 可微调，勿挡字 |

## 4. 对 KiboTalk 的启示（按优先级）

### 值得认真考虑（高收益 / 低风险）

1. **折角作为「纸」的签名细节**  
   比加大阴影或换字体更便宜，也更符合「不是 card」的主张。放在远离 ruby 的角落；island 与 stage 共用同一伪元素。

2. **顶帖一条极淡胶带（可选）**  
   表达「这一轮刚贴上」；旧轮无胶带 + 已有弱化。比图钉更适合浮在屏幕上的 Island。

3. **Hover：微抬 + 略回正旋转**（Fusen 规则）  
   阅读时更稳，交互仍有纸感；与现有 `--ease-out-soft` 对齐，并尊重 `prefers-reduced-motion`。

4. **圆角略收**  
   Fusen 用 4px；真实 Post-it 几乎直角。我们现在 `radius-lg` 偏「UI 卡」。收到 `radius-md` 或固定 6–8px，可能立刻更像便签。

5. **候选分隔：从「UI 虚线」到「铅笔线」**  
   保持可扫读；颜色用 `sticky-foreground` 低透明，避免灰 SaaS divider。

### 可以原型，但别默认上生产

- 淡纸纹噪点（截图/高 DPI 下易脏）
- web desk 的软木点阵（营销感强；会话页可能抢戏）
- 旧轮极轻微色相偏移（仍在黄色家族内）

### 建议跳过

- 彩虹便签墙 / 每人一色（FigJam 协作逻辑，不是教练回复）
- 手写正文、花哨和纸条纹、每帖都钉图钉
- 大角度旋转、多帖大幅重叠（伤害假名与 meaning 扫读）
- 玻璃拟态便签（和现有 anti-values 冲突）

## 5. 一句话方向

别人好看的便签，多半是因为 **「文具道具精简但到位」+「旋转/阴影服务于纸，不服务于装饰」**。我们已有黄纸与双场景阴影；下一跳最划算的是：**更方的角、一只折角、顶帖一条淡胶带、hover 时回正一点**——让它更像贴在屏上的回复条，而不是又一张圆角卡片。

## 6. 来源

- [Fusen Board · katagami](https://katagami.ai/language/en-019dacd4-66ef-7d12-a005-aa22019a140b)
- [shadcn Sticky Note Wall Grid](https://www.shadcn.io/blocks/features-sticky-note-wall-grid)
- [UploadStickyBoard](https://docs.uploadkit.dev/docs/sdk/react/upload-sticky-board)
- [FigJam sticky notes](https://help.figma.com/hc/en-us/articles/1500004414322-Sticky-notes-in-FigJam)
- [Sticky notes with CSS3 · Rob Sobers](https://robsobers.com/sticky-notes-with-css/)
- [CSS Post-it folded corner · CodePen](https://codepen.io/microbians/pen/pdVNpq)
- [Washi tape notes · Coding Artist](https://codingartistweb.com/2021/10/how-to-create-washi-tape-notes-with-pure-css/)
- [Post-it® App](https://www.post-it.com/3M/en_US/post-it/ideas/app/)
- [postalk](https://postalk.app/)
- [かんたん付箋](https://anothernote.happyneko.com/ja/)
- [Notion design system · Refero](https://styles.refero.design/style/2bf4c61f-de10-4614-ba1b-20c0453bd2a9)
- 内部对照：`packages/ui/src/theme.css`（`.sticky-note` / `--shadow-note` / `.island-stage`）
