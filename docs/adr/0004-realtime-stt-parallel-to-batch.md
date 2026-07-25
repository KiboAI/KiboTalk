# Realtime STT 与 batch 并行（经代理 WebSocket）

> **2026-07-25 生产约束**：开发 / playground 仍保留两条路径；比赛生产只开放
> `qwen3-asr-flash-realtime`，不做 batch 降级。见
> [ADR 0005](./0005-competition-production-platform.md)。

STT 增加一条 **realtime** 路径，与现有 batch（`POST /stt`）并行，不是替换。首家上游：阿里云 DashScope `qwen3-asr-flash-realtime`（WSS）。浏览器只连同源 `WS /stt-realtime`；`apps/api` 中继并注入 key，把薄客户端 JSON 映射为上游事件。

## 为何要 realtime（且不迁走 batch）

Batch 路径是：本地 VAD 判停顿 → 再上传整段 WAV → 才开始转写。停顿阈值（默认 1s）之后还要等一轮 STT RTT，体感「说完很久才出字」。Realtime 在说话过程中持续 `append` 音频，停顿后只需 `commit` 取定稿，转写与说话重叠，砍掉的是 **pause 之后的 STT 等待**（不是取消 pause 本身——pause 仍是 turn 边界）。

Batch 仍保留：本地 mlx-qwen3-asr、OpenRouter、DashScope file/batch 等不提供或不必上长连接的场景；realtime 失败时可降级到已配置的 batch provider。

## 为何 Manual + 本地 turn gate（不用 server VAD）

产品要的是 **enrolled 声纹 verification**（`user` / `other`），不是云端 diarization。`qwen3-asr-flash-realtime` **不支持** speaker diarization；若把 turn 边界交给 server VAD，会与本地 Silero + wavlm 双时钟打架，还要对齐时间轴。

因此：本地 VAD + 声纹 + 单一 `pauseMs` 独掌 turn；realtime 上游设 `turn_detection: null`（Manual），客户端在 turn 结束时 `commit`。只上行 Silero 判为 speech 的 PCM；换人先结束上一轮再喂下一段。

## 为何 WebSocket 经 apps/api 中继（不浏览器直连）

与 ADR 0001 / 0002 同一原则：key 不出浏览器；换 provider 只改服务端。LLM 仍用 SSE；**仅 realtime STT** 使用 WebSocket（双向：上行音频事件 + 下行 partial/completed）。

整场会话一条长连接（开麦建连，停会话再 finish）；每轮 turn 只 `commit`，不停连。

## 文本与教练契约

- 时间轴可显示进行中草稿（partial，客户端本地状态）
- 正式 `ConversationTurn` 与 LLM 请求只在 upstream `completed` 之后（`pipeline.ingestFinalizedTurn`）
- 不做中途 partial 触发 LLM

## 失败策略（R4）

Realtime 断线：短退避重连同一 provider；仍失败且已配置任意 batch provider → 本会话降级为 `POST /stt` 并明示用户；否则停转写并显示错误。

## 接线

| 项 | 说明 |
|----|------|
| Provider id | `dashscope-realtime`（`mode: realtime`） |
| 浏览器 | `WS /stt-realtime?provider=dashscope-realtime&language=ja` |
| Env | 复用 `STT_DASHSCOPE_API_KEY`；`STT_DASHSCOPE_WS_URL`；`STT_DASHSCOPE_REALTIME_MODEL`（默认 `qwen3-asr-flash-realtime`） |
| 薄协议 | 客户端：`session.start` / `append` / `commit` / `finish`；服务端：`ready` / `partial` / `completed` / `error` |
| 映射 | `packages/stt` 的 DashScope realtime 辅助函数；仅 `apps/api` 调用 |
| TurnGate | `packages/audio` `createSegmentAggregator`：单 `pauseMs`、直拼 PCM、无 gap 填零 |
| Pipeline | batch 仍 `ingestSegment`；realtime 定稿走 `ingestFinalizedTurn` |
| Playground | LiveSession 按 provider `mode` 选 POST 或 WS；草稿 UI；R4 降级 |

## 后果

- `apps/api` 持有长连接；开发期 Vite 须代理 WebSocket；Railway 须支持 WS upgrade
- Batch 合并不再为「准确率填静音」；realtime 上下文由上游 session buffer 累积
- 双 pause（user/other）产品旋钮取消；卡壳仍 = user 在统一 `pauseMs` 后入库的半句
- M1 仅 playground + 一家 realtime；`apps/web` 与第二家厂商另开
