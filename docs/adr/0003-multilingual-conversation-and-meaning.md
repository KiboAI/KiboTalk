# 多语言双轴：对话语言与翻译语言

产品从「学日语 + 中文释义」硬编码，改为可分别选择**对话语言**与**翻译语言**。权威契约见 [live-reply-coach-mvp.md §1.2–1.4](../spec/live-reply-coach-mvp.md)。

## 决策

| 轴 | 字段 | 白名单 | 驱动 |
|----|------|--------|------|
| 对话语言 | `conversationLang` | `ja` \| `en` \| `zh` | STT `language` hint、时间轴原文、候选 `targetText`、录入口令 |
| 翻译语言 | `meaningLang` | `ja` \| `en` \| `zh` | 候选 `meaning`（允许与对话语言相同） |
| 水平 | `levelByLang` | 每语言 `beginner` \| `intermediate` \| `advanced` | 进 prompt；切换对话语言时带出该语言档位 |

- **同场双方**都用 `conversationLang`（不做对方异语 / 跨语同传）。
- **设置**仅会话外可改；开新会话时快照 `{ conversationLang, meaningLang, level }`；进行中锁定。
- **首次**预填 `ja` + `zh` + ja=`beginner`（另两语言水平默认 `intermediate`），须显式确认。
- **Schema**：`meaningZh` → `meaning`；`segments`（ruby + 助詞）仅 `conversationLang === 'ja'` 强制；en/zh 可省略。
- **Prompt**：单套 Velin 模板，参数注入语言与水平；仅 ja 条件块挂注音规则。
- **录入口令**随 `conversationLang` 三套；换语言不强制重录声纹。
- **界面** `uiLang` 概念独立；MVP 不做整站 i18n（playground / 壳暂中文）。
- **结束回顾（F09）**：意向为双语（目标语要点 + meaningLang）；实现可后于本 ADR 对应的 N1 落地。

## 为何双轴而非「只选目标语」

听懂对方与开口练习都落在同一门对话语言上；释义语言是学习者读卡用的 L1（或同语短 intent）。拆开后可支持「练英语、释义中文」等组合，而不把整站 UI 绑死在释义语上。

## 否决 / 后置

| 项 | 理由 |
|----|------|
| 对方说异于对话语言的语 | STT / prompt / 评测立刻双通道；愿景可留，MVP 不做 |
| 会话中热切换语言 | 时间轴多语杂烩、STT hint 突变 |
| 证书对齐水平（JLPT / CEFR / HSK） | 产品要的是难度信号；统一三档即可，日语以后可映射 |
| 按对话语言拆三套 prompt | 闸门逻辑相同，拷贝易漂移；单模板 + 条件块 |
| 整站跟 `meaningLang` 走 | 「改释义」变成「换整站语言」；与会话快照纠缠 |
| 禁止对话语言 = 翻译语言 | 高阶 / 同语用户需要短 intent；禁止增加校验噪音 |
| N1 一次做完 F09 双语 + en/zh vieval + `apps/web` onboarding | 先打通类型 / 设置 / STT / prompt / playground 快照 |

## 后果

- `/llm` body 与 Velin args 携带 `conversationLang` / `meaningLang` / `level`（不再默认 JLPT `N5`）。
- `/stt` 接受 `?language=`，与会话快照的 `conversationLang` 对齐。
- 评测矩阵以 ja↔zh 为主；en/zh case 套件后置；字段名已改为 `meaning`。
- Playground 语言偏好进 Zustand + localStorage；未确认前挡一层确认卡。
