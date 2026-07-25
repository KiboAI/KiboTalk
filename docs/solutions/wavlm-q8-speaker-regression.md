---
module: speaker-verification
tags: [wavlm, q8, transformers-js, electron, packaging]
problem_type: model-quantization-validation
---

# WavLM Q8 must be tested on real embeddings and speaker decisions

## 风险 / Risk

把 `Xenova/wavlm-base-plus-sv` 从 FP32 换成 Q8 可以显著缩小 Web 下载和 DMG，
但“模型能加载”不能证明声纹判断仍可靠。量化可能改变 cosine similarity，进而
让固定阈值 0.8 的 user / other 结果翻转。

## 早期做法（后来证明不足）

- 运行时曾显式使用 `dtype: 'q8'`，只托管 / 打包
  `onnx/model_quantized.onnx`；
- Web 的 Silero 同样只加载 `model_quantized.onnx`，并在回归任务中执行真实
  512-sample 推理，验证概率有限且 TTS 语音可被检测；
- Web 首选固定 commit 的 Hugging Face 文件，失败后以同一路径从 VPS 镜像
  重试；两处文件由同一个下载脚本生成；
- `apps/desktop/scripts/verify-speaker.ts --compare-q8` 同时加载 FP32 与 Q8；
- 对同一说话人的两段音频和另一说话人的一段音频分别计算 embedding；
- 验证 FP32/Q8 embedding 一致性、same/different similarity 漂移，以及阈值
  0.8 的最终分类是否保持稳定；
- macOS workflow 用系统 Samantha / Daniel 声音生成可复现的 16 kHz WAV 后运行
  该回归，再允许打 DMG。

## 2026-07-25 合成音证据（不足以放行）/ Synthetic evidence

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

这组结果在阈值 0.8 下决策一致，但输入是 TTS / `voiceLikeSample`，没有覆盖真实
录音中说话内容、噪声、信道与音色的变化，不能据此放行 speaker Q8。

## 2026-07-25 真实语音复测与修正

用模型卡示例同一套 `sv_speaker-1_1.wav`、`sv_speaker-1_2.wav`、
`sv_speaker-2_1.wav` 运行 `verify:q8`：

| 指标 | FP32 | Q8 |
|------|------|----|
| 同说话人 similarity | 0.954947 | 0.963778 |
| 不同说话人 similarity | 0.657075 | 0.796527 |
| 不同说话人漂移 | — | **0.139452** |

Q8 把不同说话人推到距离生产阈值 `0.8` 仅 `0.0035` 的位置，远超原回归允许的
`0.05` 漂移。虽然这个单样本尚未翻转最终标签，但分离余量已经不可接受，也解释了
真实使用中固定阈值对量化误差非常敏感。

当时 production speaker 运行时因此改回 `dtype: 'fp32'` 并打包
`onnx/model.onnx`；Silero VAD 继续 Q8。代价是 speaker 权重由约 97 MB 增到约
384 MB，换取真实说话人分离质量。模型卡也明确说明最佳阈值依数据集而变，不能用
一组 TTS 得分证明固定阈值适用于真实麦克风。

## 2026-07-26 后续生产替换

WavLM FP32 随后在 26 speaker、104 个平衡 target/non-target trials 上仍出现
明显 score overlap：固定阈值 `0.8` 的 held-out FAR 为 `30.77%`；校准到
`0.9118` 后 held-out FAR / FRR 仍为 `11.54% / 23.08%`。

同一 trial 上，WeSpeaker ResNet34-LM Q8 以模型专属阈值 `0.49` 得到 held-out
FAR / FRR `3.85% / 0%`，78 条唯一音频推理约 4.5 秒（WavLM FP32 约 31.3 秒）。
因此生产默认已替换为 revision-pinned WeSpeaker Q8；本文件保留为“不能把一个
模型的 Q8 当作 FP32 等价物”的历史教训，而不是当前生产配置说明。

参考：

- <https://huggingface.co/Xenova/wavlm-base-plus-sv>（官方 Transformers.js 示例夹具与相似度）
- <https://huggingface.co/microsoft/wavlm-base-plus-sv>（FP32 模型卡；threshold dataset-dependent）
