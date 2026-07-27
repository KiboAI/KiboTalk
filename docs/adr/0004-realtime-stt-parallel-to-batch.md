# Realtime-only STT（多 provider 传输）

> **2026-07-27 更新**：batch `POST /stt`、本地 mlx-qwen3-asr 与 batch 降级已移除。
> 产品仅保留 realtime。历史「与 batch 并行」叙述见文末 changelog。

STT 仅走 **realtime** 路径。provider 工厂保留两种并行传输：

- `dashscope-realtime`：浏览器连接同源 `WS /stt-realtime`，`apps/api`
  中继并注入 Bearer key；
- `iflytek-realtime`：浏览器向当前 KiboTalk 节点申请一次性签名 WSS URL，
  随后直接连接讯飞并上传二进制 PCM；KiboTalk 节点不接收音频字节。

生产只启用 `iflytek-realtime`，DashScope adapter 保留但不对生产客户端发布。

## 为何 realtime（且不再保留 batch）

Batch 路径曾是：本地 VAD 判停顿 → 再上传整段 WAV → 才开始转写。停顿阈值（默认 1s）之后还要等一轮 STT RTT，体感「说完很久才出字」。Realtime 在说话过程中持续 `append` 音频，停顿后只需 `commit` 取定稿，转写与说话重叠，砍掉的是 **pause 之后的 STT 等待**（不是取消 pause 本身——pause 仍是 turn 边界）。

2026-07-27 起 batch / 本地 mlx 路径从代码与生产配置中移除；失败时**不**降级到 `POST /stt`。

## 为何 Manual + 本地 turn gate（不用 server VAD）

产品要的是 **enrolled 声纹 verification**（`user` / `other`），不是云端
diarization。若把 turn 边界交给 provider VAD，会与本地 Silero + WeSpeaker
双时钟打架，还要对齐时间轴。

因此：本地 VAD + 声纹 + 单一 `pauseMs` 独掌 turn。DashScope 通过 Manual
`commit` 获取 fragment 定稿；讯飞没有 Manual commit，每个 VAD speech fragment
使用一条直接 WSS 连接，并在本地 fragment 结束时发送 `end`，等 `ls=true`
取得定稿。定稿文本与声纹结果进入同一个本地 TurnGate，只有 `pauseMs` / 换人 /
`maxMs` flush 后才 `ingestFinalizedTurn`。

## 鉴权与音频边界

长期签名 Secret 只在服务端。讯飞的 WSS 鉴权位于查询参数，适合原生浏览器
WebSocket；服务端为已登录且持有当前 relay session grant 的客户端签发带唯一
UUID 和时间戳的 URL。客户端把讯飞最终结果和本轮样本数回报当前 KiboTalk 节点，
节点再执行额度扣减。内测期该计费回报信任官方客户端，不作为防破解计费边界。

## 文本与教练契约

- 时间轴可显示进行中草稿（partial，客户端本地状态）
- 正式 `ConversationTurn` 与 LLM 请求只在 TurnGate flush 之后（`pipeline.ingestFinalizedTurn`）
- 不做中途 partial 触发 LLM

## 失败策略

Realtime 断线：短退避重连同一 provider；仍失败则停止转写并显示错误。**不**降级到 batch。

## 接线

| 项 | 说明 |
|----|------|
| Provider id | `dashscope-realtime` / `iflytek-realtime` |
| 生产浏览器 | `POST /api/stt/direct/session` 取签名 URL，再直连讯飞 WSS |
| 生产 Env | `STT_ACTIVE=iflytek-realtime`；`STT_IFLYTEK_APP_ID`；`STT_IFLYTEK_API_KEY`；`STT_IFLYTEK_API_SECRET` |
| 讯飞音频 | 浏览器二进制 PCM 16 kHz / 16-bit mono，1280 bytes / 40 ms |
| 讯飞定稿 | fragment 结束发送 `{"end":true,"sessionId":"..."}`，收到 `ls=true` 后完成 |
| DashScope | 原同源薄协议和 server mapper 保留，生产不启用 |
| TurnGate | `packages/audio` `createSegmentAggregator`：合并 fragment 定稿文本；使用单 `pauseMs`、无 gap 填零 |
| Pipeline | 定稿经 TurnGate flush 后 `ingestFinalizedTurn` |
| Playground | LiveSession 经 WS；草稿 UI；失败重连，无 batch 降级 |

## 后果

- 讯飞音频不经过 KiboTalk 服务器；浏览器网络必须能直达讯飞 WSS
- 讯飞日语使用 `autominor + recognized_language=ja`，需要账户开通多语种能力
- 双 pause（user/other）产品旋钮取消；卡壳仍 = user 在统一 `pauseMs` 后入库的半句
- M1 仅 playground + 一家 realtime；`apps/web` 与第二家厂商另开

## Changelog

- **2026-07-25**：初版标题为「Realtime STT 与 batch 并行」；生产约束见 ADR 0005。
- **2026-07-27**：batch `POST /stt`、mlx-qwen3-asr、R4 降级到 batch 移除；STT 改为 realtime-only；TurnGate 保留（合并 realtime fragment 定稿文本）。
- **2026-07-27**：新增讯飞浏览器直连 adapter，生产 active provider 切换为讯飞；DashScope adapter 并行保留。
