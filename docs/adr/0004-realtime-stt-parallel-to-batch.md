# Realtime-only STT（经代理 WebSocket）

> **2026-07-27 更新**：batch `POST /stt`、本地 mlx-qwen3-asr 与 batch 降级已移除。
> 产品仅保留 realtime。历史「与 batch 并行」叙述见文末 changelog。

STT 仅走 **realtime** 路径：阿里云 DashScope `qwen3-asr-flash-realtime`（WSS）。浏览器只连同源 `WS /stt-realtime`；`apps/api` 中继并注入 key，把薄客户端 JSON 映射为上游事件。

## 为何 realtime（且不再保留 batch）

Batch 路径曾是：本地 VAD 判停顿 → 再上传整段 WAV → 才开始转写。停顿阈值（默认 1s）之后还要等一轮 STT RTT，体感「说完很久才出字」。Realtime 在说话过程中持续 `append` 音频，停顿后只需 `commit` 取定稿，转写与说话重叠，砍掉的是 **pause 之后的 STT 等待**（不是取消 pause 本身——pause 仍是 turn 边界）。

2026-07-27 起 batch / 本地 mlx 路径从代码与生产配置中移除；失败时**不**降级到 `POST /stt`。

## 为何 Manual + 本地 turn gate（不用 server VAD）

产品要的是 **enrolled 声纹 verification**（`user` / `other`），不是云端 diarization。`qwen3-asr-flash-realtime` **不支持** speaker diarization；若把 turn 边界交给 server VAD，会与本地 Silero + WeSpeaker 双时钟打架，还要对齐时间轴。

因此：本地 VAD + 声纹 + 单一 `pauseMs` 独掌 turn；realtime 上游设 `turn_detection: null`（Manual）。每个 VAD speech fragment 做一次 `commit` 取得定稿文本，但它还不是正式 turn；定稿文本与声纹结果进入本地 TurnGate，只有 `pauseMs` / 换人 / `maxMs` flush 后才 `ingestFinalizedTurn`。只上行 Silero 判为 speech 的 PCM。

## 为何 WebSocket 经 apps/api 中继（不浏览器直连）

与 ADR 0001 同一原则：key 不出浏览器；换 provider 只改服务端。LLM 仍用 SSE；**STT** 使用 WebSocket（双向：上行音频事件 + 下行 partial/completed）。

整场会话一条长连接（开麦建连，停会话再 finish）；每轮 turn 只 `commit`，不停连。

## 文本与教练契约

- 时间轴可显示进行中草稿（partial，客户端本地状态）
- 正式 `ConversationTurn` 与 LLM 请求只在 TurnGate flush 之后（`pipeline.ingestFinalizedTurn`）
- 不做中途 partial 触发 LLM

## 失败策略

Realtime 断线：短退避重连同一 provider；仍失败则停止转写并显示错误。**不**降级到 batch。

## 接线

| 项 | 说明 |
|----|------|
| Provider id | `dashscope-realtime` |
| 浏览器 | `WS /stt-realtime?provider=dashscope-realtime&language=ja` |
| Env | `STT_ACTIVE=dashscope-realtime`；`STT_DASHSCOPE_API_KEY`；`STT_DASHSCOPE_WS_URL`；`STT_DASHSCOPE_REALTIME_MODEL`（默认 `qwen3-asr-flash-realtime`） |
| 薄协议 | 客户端：`session.start` / `append` / `commit` / `finish`；服务端：`ready` / `partial` / `completed` / `error` |
| 映射 | `packages/stt` 的 DashScope realtime 辅助函数；仅 `apps/api` 调用 |
| TurnGate | `packages/audio` `createSegmentAggregator`：合并 fragment 定稿文本；使用单 `pauseMs`、无 gap 填零 |
| Pipeline | 定稿经 TurnGate flush 后 `ingestFinalizedTurn` |
| Playground | LiveSession 经 WS；草稿 UI；失败重连，无 batch 降级 |

## 后果

- `apps/api` 持有长连接；开发期 Vite 须代理 WebSocket；Railway 须支持 WS upgrade
- 双 pause（user/other）产品旋钮取消；卡壳仍 = user 在统一 `pauseMs` 后入库的半句
- M1 仅 playground + 一家 realtime；`apps/web` 与第二家厂商另开

## Changelog

- **2026-07-25**：初版标题为「Realtime STT 与 batch 并行」；生产约束见 ADR 0005。
- **2026-07-27**：batch `POST /stt`、mlx-qwen3-asr、R4 降级到 batch 移除；STT 改为 realtime-only；TurnGate 保留（合并 realtime fragment 定稿文本）。
