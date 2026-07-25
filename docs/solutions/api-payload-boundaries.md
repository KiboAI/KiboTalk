---
module: api
tags: [hono, websocket, payload-limit, denial-of-service]
problem_type: resource-boundary
---

# HTTP and WebSocket payloads need independent size limits

## 症状 / Symptom

正式会话单轮只允许 30 秒 PCM，但默认 `ws` 服务仍接受约 100 MB 的单消息；
Hono JSON / 同步端点也没有统一请求体上限。攻击者可在业务校验前消耗过多内存。

## 修复 / Fix

- `/api/*` 使用 Hono `bodyLimit`，请求体上限为 2 MiB，超限统一返回
  `413 PAYLOAD_TOO_LARGE`；
- WebSocket server 的 `maxPayload` 同样设为 2 MiB；
- 30 秒、16 kHz、16-bit 单声道 PCM 的 base64 消息仍可正常通过；
- 音频样本计数的 30 秒业务上限继续独立执行，不能用压缩或分块绕过。

## 证据 / Evidence

`apps/api/test/sync-auth.test.ts` 覆盖超限请求在路由处理前被拒绝。
