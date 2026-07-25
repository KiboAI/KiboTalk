---
module: realtime-stt-billing
tags: [dashscope, websocket, quota, fifo, failure]
problem_type: billing-correctness
---

# A failed realtime transcription must leave the billing FIFO

## 症状 / Symptom

每次 client `commit` 都会把该轮音频样本数放进待计费 FIFO，只有收到 upstream
`completed` 才扣额度。若 DashScope 对某轮返回
`conversation.item.input_audio_transcription.failed` 但 WebSocket 保持连接，旧逻辑
只把错误转发给客户端，没有移除 FIFO 首项。下一轮成功时会拿到上一轮的样本数，
造成失败轮被错扣、成功轮时长错配。

## 原因 / Cause

thin protocol 把 provider 的“单轮识别失败”和“整个连接错误”都折叠成无 code 的
`error`，代理无法判断应该丢弃一项还是关闭连接并丢弃全部。

## 修复 / Fix

- mapper 为单轮失败标记 `TRANSCRIPTION_FAILED`，为 provider 连接级错误标记
  `UPSTREAM_ERROR`；
- 单轮失败时只 `shift()` 对应待计费项，记录失败遥测但绝不调用额度扣减；
- 连接错误或意外关闭时清空全部待计费项并关闭两端；
- mapper 回归测试固定失败事件的 code，防止以后再次合并两种语义。

真实生产联调继续以成功完成事件作为唯一扣费点；上游失败不扣额度。
