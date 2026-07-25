---
module: speaker-verification
tags: [wavlm, q8, transformers-js, electron, packaging]
problem_type: model-quantization-validation
---

# WavLM Q8 must be tested on embeddings and speaker decisions

## 风险 / Risk

把 `Xenova/wavlm-base-plus-sv` 从 FP32 换成 Q8 可以显著缩小 Web 下载和 DMG，
但“模型能加载”不能证明声纹判断仍可靠。量化可能改变 cosine similarity，进而
让固定阈值 0.8 的 user / other 结果翻转。

## 做法 / Fix

- 运行时显式使用 `dtype: 'q8'`，只托管 / 打包
  `onnx/model_quantized.onnx`；
- Web 的 Silero 同样只加载 `model_quantized.onnx`，并在回归任务中执行真实
  512-sample 推理，验证概率有限且 TTS 语音可被检测；
- Web 首选固定 commit 的 Hugging Face 文件，失败后以同一路径从 VPS 镜像
  重试；两处文件由同一个下载脚本生成；
- `apps/desktop/scripts/verify-q8-speaker.ts` 同时加载 FP32 与 Q8；
- 对同一说话人的两段音频和另一说话人的一段音频分别计算 embedding；
- 验证 FP32/Q8 embedding 一致性、same/different similarity 漂移，以及阈值
  0.8 的最终分类是否保持稳定；
- macOS workflow 用系统 Samantha / Daniel 声音生成可复现的 16 kHz WAV 后运行
  该回归，再允许打 DMG。

## 2026-07-25 实测证据 / Evidence

| 指标 | 结果 |
|------|------|
| 同一音频 FP32 ↔ Q8 embedding cosine | 0.981909 |
| FP32 同说话人 similarity | 0.975083 |
| Q8 同说话人 similarity | 0.966414 |
| FP32 不同说话人 similarity | 0.425109 |
| Q8 不同说话人 similarity | 0.466246 |
| 同说话人漂移 | 0.008669 |
| 不同说话人漂移 | 0.041138 |
| Silero Q8 真实 TTS 最高 speech probability | 0.999751 |

阈值 0.8 下两种精度的 same / different 决策一致且正确。Q8 bundle 中 WavLM +
Silero 共约 115 MB；最终 Apple Silicon DMG 约 272 MB。
