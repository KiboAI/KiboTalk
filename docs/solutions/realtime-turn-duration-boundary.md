---
module: audio-realtime-billing
tags: [vad, realtime-stt, quota, overdraw, turn-boundary]
problem_type: billing-guardrail
---

# Aggregator max duration does not bound a realtime VAD utterance

## 症状 / Symptom

`SegmentAggregator.maxMs = 30s` 能限制 batch 聚合，但 realtime 主麦克风路径在
VAD `speech-ready` 时直接 commit，不经过 aggregator。持续讲话且没有静音时，
一轮音频可以远超 30 秒；余额不足时会扩大可控透支，恶意客户端也能发送任意长
的单轮音频。

## 原因 / Cause

`maxMs` 只存在于 VAD 之后的聚合层，而 realtime 音频从 VAD speech state 直接
流向 WebSocket。服务端此前只累计样本用于计费，没有硬上限。

## 修复 / Fix

- VAD 新增 `maxSpeechDurationMs`，产品显式传入 `mergeMaxMs`；
- 连续讲话达到边界时发出 `speech-end` / `speech-ready`，立刻以新的
  `speech-start` 继续，无需用户停顿，也不丢边界后的音频；
- 服务端按 16 kHz PCM 样本数再次限制每轮最多 30 秒，异常客户端会收到
  `TURN_AUDIO_LIMIT` 并断开；
- VAD 单测覆盖持续语音自动切段。

这样正常客户端每 30 秒内形成一个可计费 turn，服务端仍保有独立的最终防线。
