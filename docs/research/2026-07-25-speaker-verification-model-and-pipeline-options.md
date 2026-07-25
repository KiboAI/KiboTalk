# 声纹模型与判定流水线候选调研

日期：2026-07-25

> **2026-07-26 生产决定**：经本文后续记录的 26-speaker / 104-trial 同集对照，
> 生产默认已切换为 revision-pinned WeSpeaker ResNet34-LM Q8，阈值 `0.49`，
> 保留 `0.05` 迟滞。WavLM FP32 降为历史基线；Mini LibriSpeech 的领域限制仍
> 要通过日/中/英真实设备 held-out 数据持续监控。

## 结论

不要立刻用另一个模型直接替换 WavLM，也不要继续只调一个固定阈值。当前故障至少
包含三个可独立发生的问题：

1. KiboTalk 在每个 VAD `speech-ready` 小段上做一次声纹判定，然后把这个二元标签
   交给会因“换人”立即 flush 的 TurnGate。一次很短、很吵或被串音污染的误判就会
   被放大成错误轮次边界；相关调用和 flush 规则分别见
   [`LiveSession.tsx`](../../apps/playground/src/LiveSession.tsx) 与
   [`aggregator.ts`](../../packages/audio/src/aggregator.ts)。
2. 录入只有一个 embedding，线上只用一个固定 cosine 阈值 `0.8`；而 WavLM
   模型卡明确写着最佳阈值依数据集而变。代码还把 `1 - similarity` 当作
   `other` 的 confidence，虽然 cosine score 并不是已校准概率。当前实现见
   [`embedding-verifier.ts`](../../packages/speaker/src/embedding-verifier.ts) 和
   [`types.ts`](../../packages/speaker/src/types.ts)，阈值警告见
   [Microsoft WavLM 模型卡](https://huggingface.co/microsoft/wavlm-base-plus-sv)。
3. 短语音本来就是声纹确认的困难条件；研究将不超过 2 秒的输入称为会显著降低
   speaker-verification 性能的关键威胁。当前按 VAD 小段判定恰好经常落入这个
   区间。[Jung et al., short-utterance compensation](https://arxiv.org/abs/1810.10884)

因此建议按以下顺序推进：

- **先改评测与判定策略**：建立真实的 target / non-target trial 集，加入
  `unknown`/暂缓区、累计有效语音、多个录入 embedding、双阈值迟滞和按时长校准；
  在此之前任何“模型更准”的结论都不可靠。
- **第一批并行实测三个开放候选**：
  `WavLM Base Plus SV FP32`（现状基线）、
  `WeSpeaker CAM++`（优先替换候选）、
  `WeSpeaker ResNet34-LM`（最小浏览器候选）。
- **ECAPA-TDNN 作为桌面研究基线**，不作为浏览器第一选择；**NeXt-TDNN
  mobile 作为第二批候选**，因为虽小但缺少官方 ONNX 成品；**Picovoice Eagle
  只做有期限的 SDK 对照实验**，在 AccessKey、收费和闭源许可问题解决前不进入
  默认生产方案。
- **远程通话优先做双音轨**：麦克风轨确定为 user，应用/系统音频轨确定为
  other，可绕过声纹模型；同处一室、扬声器外放或只有一支麦克风时仍需要模型。

电影和字幕仍然适合调 VAD、STT、turn boundary 和回复，但**不能单独评测
“已录入的我 vs 其他人”**。影片没有 KiboTalk 用户的 enrollment，也没有按
target/non-target trial 设计的真值；最多在人工标出演员后评估匿名说话人边界。

## 现状基线

KiboTalk 当前在 Web Worker 中通过 Transformers.js 加载
`Xenova/wavlm-base-plus-sv` FP32 ONNX，并对 16 kHz mono PCM 输出 embedding；
实现见 [`speaker-worker.ts`](../../packages/app-shared/src/audio/speaker-worker.ts)。
原模型以 16 kHz 音频预训练，随后在 VoxCeleb1 上用 X-Vector head 与
Additive Margin Softmax 微调；模型卡给出的示例阈值是 `0.86`，并明确说明阈值
依数据集而变。[Microsoft WavLM 模型卡](https://huggingface.co/microsoft/wavlm-base-plus-sv)

这个基线的优点是已经端到端跑通 Transformers.js、Web Worker、IndexedDB 和
Electron 打包，且微软仓库采用 MIT 许可。
[WavLM 官方仓库](https://github.com/microsoft/unilm/tree/master/wavlm)；
[MIT LICENSE](https://github.com/microsoft/unilm/blob/master/LICENSE)

代价是体积大：Transformers.js 仓库的 FP32 ONNX 约 402 MB，Q8 约 102 MB。
[Xenova ONNX 文件目录](https://huggingface.co/Xenova/wavlm-base-plus-sv/tree/main/onnx)
KiboTalk 已用真实模型卡音频复现 Q8 的 non-target score 从 `0.657075` 漂到
`0.796527`，离 `0.8` 阈值只剩约 `0.0035`，所以 Q8 不能再作为“体积优化后的
等价模型”。[本地 Q8 回归记录](../solutions/wavlm-q8-speaker-regression.md)

WavLM 的大规模预训练包含 24,000 小时 VoxPopuli，但这个具体 speaker-verification
checkpoint 的模型卡仍标为 English，且监督微调来自 VoxCeleb1；这不构成
日/中/英跨语言鲁棒性的保证。
[Microsoft WavLM 模型卡](https://huggingface.co/microsoft/wavlm-base-plus-sv)

## 候选比较

下表中的公开 EER 不能横向当作 KiboTalk 排名：不同论文的数据划分、录入方式、
score normalization 和阈值不同。它们只用于筛选值得进入同一套本地 trial 的
候选。

| 候选 | 真正的 enrolled verification | 体积 / 速度证据 | 日中英证据 | Web / Electron 可行性 | 许可 | 判断 |
|---|---|---|---|---|---|---|
| WavLM Base Plus SV FP32 | 是；embedding + cosine | FP32 ONNX 约 402 MB；Q8 约 102 MB，但本项目已观察到危险的 non-target score 漂移。[ONNX 文件](https://huggingface.co/Xenova/wavlm-base-plus-sv/tree/main/onnx) | 预训练含多语 VoxPopuli，但 checkpoint 标签和监督微调不能证明 ja/zh。[模型卡](https://huggingface.co/microsoft/wavlm-base-plus-sv) | 已在本项目跑通 Transformers.js/WASM 与 Electron | MIT（微软仓库） | 保留为质量基线，不再押注 Q8 |
| SpeechBrain ECAPA-TDNN | 是；官方接口支持 embedding 和两音频 verification | checkpoint 83.3 MB；VoxCeleb1 cleaned 报告 EER 0.69%。[模型卡与文件](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb/blob/main/embedding_model.ckpt) | 官方模型卡标为 English、训练于 VoxCeleb1+2；跨语言 ECAPA 研究表明语言错配需要专门训练/score normalization，不能假设天然无关。[模型卡](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb)；[跨语言研究](https://arxiv.org/abs/2007.07689) | 官方成品是 PyTorch/SpeechBrain；浏览器要自行导出 ONNX 并验证特征前处理，桌面 Python/原生 ONNX 可行但会分叉现有运行时 | Apache-2.0 | 作为桌面/离线基线，不是第一 Web 候选 |
| WeSpeaker CAM++ | 是；WeSpeaker 提供 embedding、similarity 和 verification 工具链 | 7.18M 参数；论文单线程 CPU RTF `0.013`，ECAPA baseline 为 `0.033`；官方 VoxCeleb ONNX 29.3 MB。[论文](https://arxiv.org/html/2303.00332)；[ONNX 文件](https://huggingface.co/Wespeaker/wespeaker-voxceleb-campplus/blob/main/voxceleb_CAM%2B%2B.onnx) | 原论文分别在 VoxCeleb 与 CN-Celeb 实验；官方另有 30.14 MB 中文 CAM++。没有日语专项结果。[论文](https://arxiv.org/html/2303.00332)；[中文模型卡](https://www.modelscope.cn/models/iic/speech_campplus_sv_zh-cn_3dspeaker_16k) | 官方已有 ONNX；ORT Web 的 WASM 支持全部 ONNX operators，Electron 也可用 ORT Web，仍须复现 80-bin Fbank、归一化并做实际 operator/数值 smoke test。[ORT Web](https://onnxruntime.ai/docs/tutorials/web/) | WeSpeaker 与官方模型 Apache-2.0 | **第一替换候选**；同时测 VoxCeleb 与中文权重 |
| WeSpeaker ResNet34-LM | 是；embedding + cosine | 官方 FP32 ONNX 26.5 MB；HF ONNX Community 有 6.69 MB INT8 版本。[官方 ONNX](https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34/blob/main/voxceleb_resnet34.onnx)；[INT8 ONNX](https://huggingface.co/onnx-community/wespeaker-voxceleb-resnet34-LM/blob/main/onnx/model_int8.onnx) | VoxCeleb 路线；WeSpeaker 另提供独立 CN-Celeb 权重，但未给日语保证。[WeSpeaker 官方仓库](https://github.com/wenet-e2e/wespeaker) | ONNX/WASM 很有希望，体积最小；INT8 必须像 WavLM Q8 一样比较 target/non-target score 漂移，不能只测“能加载” | 原 WeSpeaker Apache-2.0；HF 转换仓库标 CC-BY-4.0，发包前需按实际取用文件核对归属 | **第一批轻量候选**，尤其适合验证浏览器预算 |
| NeXt-TDNN mobile | 是；speaker embedding + cosine | mobile 配置 1.9M 参数、3 秒输入 0.519G MACs，论文 VoxCeleb1-O EER 1.03%；比论文中的 ECAPA-512 小约 3 倍。[论文表 2](https://arxiv.org/html/2312.08603) | 训练/评测为 VoxCeleb，没有 ja/zh 专项证据 | 官方仓库有 PyTorch 权重但没有官方 ONNX 成品；需导出、实现 Fbank、验证 dynamic time axis 和 ORT operators。[官方仓库](https://github.com/dmlguq456/NeXt_TDNN_ASV) | Apache-2.0 | 架构很有吸引力，但放第二批，避免先花时间做移植 |
| Picovoice Eagle | 是；Profiler 录入 profile，Recognizer 对每个已录入 profile 返回 `[0,1]` score | 厂商称初始化模型 4.5 MB，可流式返回 score；其公开 benchmark 在 VoxConverse 报 EER 0.18%。这些是厂商自测，应在 KiboTalk 数据上独立复核。[产品页](https://picovoice.ai/products/voice/speaker-recognition/)；[benchmark 方法](https://picovoice.ai/docs/benchmark/speaker-recognition/) | 厂商声明 text-independent、language-agnostic，但没有 ja/zh/en 分项数字。[产品页](https://picovoice.ai/products/voice/speaker-recognition/) | 官方支持 Chrome/Safari/Firefox/Edge 与 macOS/Windows/Linux，并提供 Web Worker SDK。[Web quick start](https://picovoice.ai/docs/quick-start/eagle-web/) | 引擎/模型是专有服务许可；免费仅是可撤销、有限额 trial，生产需付费协议。[Terms §6](https://picovoice.ai/docs/terms-of-use/) | 只做时间盒对照；许可与密钥阻塞生产 |

### 为什么优先 CAM++，而不是直接 ECAPA

ECAPA-TDNN 是成熟而且值得保留的研究基线，但 KiboTalk 同时要求 Web 和 Electron。
SpeechBrain 官方 checkpoint 是 83.3 MB PyTorch，而 WeSpeaker 已发布 29.3 MB
CAM++ ONNX；CAM++ 论文在一致实验设置下以 7.18M 参数、1.72G FLOPs、CPU RTF
`0.013` 对比 ECAPA 的 14.66M、3.96G、`0.033`，并同时给出 VoxCeleb 和
CN-Celeb 结果。[CAM++ 论文表 1/3](https://arxiv.org/html/2303.00332)

这不证明 CAM++ 在 KiboTalk 一定更准，但它同时满足“可替换、浏览器体积小、中文
有直接证据、官方 ONNX”四个筛选条件，值得最先实测。

### 为什么不马上押 NeXt-TDNN

NeXt-TDNN mobile 的 1.9M 参数非常适合端侧，论文也报告它在 3 秒输入上的计算量
和 VoxCeleb 表现优于同表的 ECAPA mobile/base 若干配置。
[NeXt-TDNN 论文表 2](https://arxiv.org/html/2312.08603)
但官方仓库目前交付 PyTorch checkpoint 与训练代码，不是可直接放进现有
Transformers.js worker 的 ONNX 包。
[NeXt-TDNN 官方仓库](https://github.com/dmlguq456/NeXt_TDNN_ASV)
先用已有 ONNX 的 CAM++/ResNet34 判断“换成小 TDNN/ResNet 是否能解决真实
trial”，能避免在模型移植上提前投入。

### Eagle 的工程与许可阻塞

Eagle 的产品形态其实最贴近 KiboTalk：录入由 Profiler 累积多段语音并反馈进度，
识别端可在连续音频上返回 profile score；当语音不足时 Web API 会返回 `null`，
天然支持“暂不判定”。
[Web quick start](https://picovoice.ai/docs/quick-start/eagle-web/)；
[Web API](https://picovoice.ai/docs/api/eagle-web/)

但它不是可自由分发的开源模型。官方文档要求 AccessKey，并要求将 AccessKey
保密；Web SDK 又需要在浏览器创建引擎时传入 AccessKey。KiboTalk 的“provider
keys 永不进客户端”约束与此存在直接冲突，需要 Picovoice 给出适用于公开 Web
客户端的正式密钥与许可方案后才能考虑生产。
[Eagle 文档](https://picovoice.ai/docs/eagle/)；
[Web quick start](https://picovoice.ai/docs/quick-start/eagle-web/)；
[Picovoice Terms](https://picovoice.ai/docs/terms-of-use/)

## 比换模型更优先的流水线改造

本轮已先落地其中的低风险部分：录入有效语音质量门、outer-silence trim、
声纹异常不再默认 `other`，以及固定 `0.05` margin 的双阈值迟滞。迟滞阻止
阈值附近的单个 fragment 立刻制造 speaker-change flush；完整的 rolling
voiced buffer、多 utterance enrollment 和数据校准仍是下一阶段，不能把初始
margin 当成最终标定值。实现与回归见
[`speaker-enrollment-hysteresis.md`](../solutions/speaker-enrollment-hysteresis.md)。

### 1. 给声纹判定增加 `unknown`

不要再强迫每个 VAD 小段立即二选一。内部判定应至少有：

```text
score >= targetHigh      → user
score <= nonTargetLow    → other
中间、有效语音太短、低信噪比、重叠语音 → unknown
```

`unknown` 只属于实时判定状态，不必进入持久化 turn schema。它应让 TurnGate
继续累计，或沿用“本轮尚未确认”的 provisional speaker，而不是触发 speaker-change
flush。Eagle 官方 API 在语音不足时返回 `null`，也说明生产型接口需要
“没有足够证据”这一状态。[Eagle Web API](https://picovoice.ai/docs/api/eagle-web/)

### 2. 累计足够的 voiced audio，再做稳定判定

建议把声纹评分从“每个 VAD `speech-ready` 直接定案”改成：

- 为当前活动语音维护 1.5–2.5 秒 voiced-audio rolling buffer；
- 每增加固定 voiced 时长生成一个 window score；
- 对最近 2–3 个 score 取 median/稳健平均；
- 只有连续两个高置信 window 越过同一侧阈值才切 speaker；
- 极短的“嗯 / はい / 对”如果没有足够证据，保持 `unknown`，不得单独制造
  speaker-change flush。

具体时长需要网格评测，不能把上面的初值当结论。短语音研究显示少于 2 秒是明确
退化区；CAM++ 和 NeXt-TDNN 的论文训练均随机裁 3 秒，不能据此声称它们在
300–500 ms 片段仍可靠。
[短语音研究](https://arxiv.org/abs/1810.10884)；
[CAM++ 实验设置](https://arxiv.org/html/2303.00332)；
[NeXt-TDNN 实验设置](https://arxiv.org/html/2312.08603)

### 3. 多录入、同设备校准，不再只有一个中心

录入应采集至少 3 个独立 utterance，覆盖用户实际会用的语言和姿态，例如
ja/zh/en、近讲/正常距离，而不是把一条三秒口令当成完整声纹。每条分别做
embedding，保存集合及 centroid；验证时同时保留对 centroid 的 score 与对各条
录入的稳健聚合。CAM++ 的 CN-Celeb 评测会平均同一 enrollment speaker 的多个
embedding，Eagle Profiler 也明确通过“一系列 utterances”形成 profile。
[CAM++ 数据处理](https://arxiv.org/html/2303.00332)；
[Eagle Web quick start](https://picovoice.ai/docs/quick-start/eagle-web/)

还需要在录入时拒绝削波、过低音量、背景有人声和有效语音不足；当前只做 outer
silence trim、RMS 和最短 2.5 秒检查。
[`audio-quality.ts`](../../packages/speaker/src/audio-quality.ts)

### 4. 用真实 trial 校准阈值和迟滞

每个模型都应在 KiboTalk 数据上画 target/non-target score 分布、ROC/DET，并按
产品代价选 operating point；不要复用 WavLM 的 `0.8`。质量感知校准研究表明，
把时长等质量特征加入 calibration 后，决策阈值可以随 trial 条件变化并在不同
条件下更一致；其短/长 trial 本身就按 2–6 秒和 6 秒以上分组。
[Quality-aware score calibration](https://arxiv.org/abs/2010.11255)

首版不必立刻引入复杂 PLDA：可以先按
`model × device class × voiced-duration bucket` 选择双阈值，并报告中间
`unknown` 的 coverage。`confidence` 应是经 calibration 得到的概率或明确命名为
raw score/margin；不能继续用 `1 - cosine` 伪装成概率。

### 5. 不让一次误判改写 turn boundary

当前 TurnGate 把 speaker change 当强制 flush 条件。
[`aggregator.ts`](../../packages/audio/src/aggregator.ts)
应增加“稳定切换”条件：只有新标签跨过高置信阈值并连续成立，才 flush 前一轮；
low-quality/unknown fragment 先并入待判窗口。这样模型错误不会直接变成两个短
STT 请求、两个重复 LLM 请求和两次卡片跳动。

### 6. 声纹失败时不要默认为 `other`

当前 `verifyWithSpan` 捕获异常后返回 `other`。
[`LiveSession.tsx`](../../apps/playground/src/LiveSession.tsx)
模型加载失败、空音频或推理错误不等于“对方说话”。失败应产生 `unknown` 并显示
一次可恢复状态；只有明确的 non-target score 才能标为 `other`。

## 双音轨能否绕过模型

### 可以绕过的场景

当对方来自同一台电脑里的 Zoom/Meet/微信等远程通话时，可将：

```text
microphone track  → user
window/system track → other
```

作为确定性路由，不再在这两路上跑声纹。Electron 官方 `desktopCapturer` 支持
display media 请求返回 loopback audio；在 macOS 14.2+ 需要相应系统音频权限，
macOS 13 以下还有平台限制。
[Electron desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer/)

麦克风轨仍可能录到扬声器播放的对方声音，所以要请求并实测 echo cancellation。
W3C Media Capture 规范定义 `echoCancellation: true` 至少应尝试消除 remote
audio，但最终处理由 user agent 决定，不能只相信 constraint 已设置。
[Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)

### 不能绕过的场景

- 两个人同处一室，共用一支麦克风；
- 对方通过手机扬声器或电脑外放，而应用拿不到独立 loopback track；
- 浏览器/操作系统没有提供所选窗口的音频；
- system track 混有通知、音乐、KiboTalk 自己的 TTS 或多个远程参与者。

Web 的 `getDisplayMedia()` 只能返回可选的 audio track，且不同浏览器对是否支持
音频、支持哪种音频源并不一致。
[MDN getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
所以产品应把“双音轨”作为桌面远程通话的高质量模式，把单麦克风 + 声纹保留为
现场对话和 Web fallback，而不是二选一。

## 可执行评测计划

### 已完成的浏览器运行时 smoke test

本轮先用 `tools/speaker-model-benchmark.ts` 直接复用项目当前
Transformers.js / ONNX Runtime Node 路径（与 Web Worker 同一模型栈），用
Xenova 模型卡公开的 16 kHz 同人/异人样本跑通 WeSpeaker ResNet34-LM：

| 模型 | 精度 | embedding | 3 条推理总耗时（本机） | same | different |
|---|---:|---:|---:|---:|---:|
| WeSpeaker ResNet34-LM | FP32 | 256 | 214ms | 0.7413 | 0.1273 |
| WeSpeaker ResNet34-LM | Q8 | 256 | 106ms | 0.7353 | 0.1525 |

这证明 25MB FP32 / 约 6.7MB Q8 候选能在现有 JS 运行时完成官方
`WeSpeakerFeatureExtractor` 的 80-bin Fbank 和 ONNX 推理，不必先引入 Python
或手写 DSP。该三条样本上，量化造成 same 漂移约 0.006、different 漂移约
0.025，没有重现 WavLM Q8 的危险大漂移。

它仍然只是 smoke test：ResNet34 的 same score `0.741` 低于当前 WavLM 固定
阈值 `0.8`，所以不能在不做模型独立校准的情况下直接替换。下一步仍须用下述
真实 target/non-target trial 做 FAR/FRR 和短句分桶；这里的结论仅是
“运行时与体积候选成立”，不是“生产准确率已经胜出”。

这个三文件 smoke 接口随后已被下面的多人 trial runner 替换，避免继续用单个
same/different pair 误作模型结论。

### 已完成的公开多人 trial 基线

2026-07-26 从 OpenSLR 官方下载 Mini LibriSpeech `dev-clean-2`，归档 SHA-256 为
`176ec501490eced2d6c1f89f4f0ddc7dfe799e649e5322f8ba49fe3ff50c8012`。
该回归测试子集含 26 位 speaker、1,089 条英语朗读录音，许可为 CC BY 4.0。
[OpenSLR SLR31](https://www.openslr.org/31/)

`tools/prepare-speaker-trials.ts` 将 FLAC 解码为 16 kHz mono PCM16；每人选一条
通过生产 `prepareEnrollmentAudio` 的录入音和两条测试音。13 位 speaker 只用于
校准阈值，另 13 位只用于评估；每位各产生 2 个 target 和 2 个 non-target，
共 104 个平衡 trials。原始语音和逐 trial 分数只放在 gitignored
`.benchmarks/speaker-trials/`。

同一 manifest、相同生产静音裁切的结果：

| 模型 | 精度 | 78 条唯一音频推理 | 校准阈值 | 校准 FAR / FRR | 独立评估 FAR / FRR | 评估集固定 `0.8` FAR / FRR |
|---|---:|---:|---:|---:|---:|---:|
| WavLM Base Plus SV | FP32 | 31.31s | 0.9118 | 7.69% / 7.69% | 11.54% / 23.08% | 30.77% / 3.85% |
| WeSpeaker ResNet34-LM | Q8 | 4.53s | 0.4916 | 0% / 0% | 3.85% / 0% | 0% / 57.69% |

直接含义：

- 当前 WavLM 固定阈值 `0.8` 在 held-out non-target 中误接纳 8/26，足以解释
  “把别人识别成自己”；单靠迟滞只能减少标签抖动，不能消除这个 score overlap。
- 把 WavLM 阈值抬到本集校准的 `0.9118` 会把 held-out target 错拒 6/26，
  所以继续死磕一个阈值无法同时解决 FAR 与 FRR。
- WeSpeaker Q8 在这批数据上分离明显更好、推理约快 6.9 倍，是应继续验证的
  默认替换候选；但其 score 标尺完全不同，沿用 `0.8` 会错拒 15/26 个本人。

这还不是生产换模依据：Mini LibriSpeech 是干净英语朗读，样本少，不能覆盖
日语/中文、短句、跨录音 session、真实麦克风、电视人声、回声和重叠语音。
下一关必须使用下述 KiboTalk 本地 held-out 集；生产迁移还应加入 `unknown`
区间，而不是强迫每个短片段二选一。

复现命令：

```bash
pnpm benchmark:speaker:prepare

pnpm benchmark:speaker \
  --manifest .benchmarks/speaker-trials/mini-librispeech/manifest.json \
  --model onnx-community/wespeaker-voxceleb-resnet34-LM \
  --dtype q8

pnpm benchmark:speaker \
  --manifest .benchmarks/speaker-trials/mini-librispeech/manifest.json \
  --model Xenova/wavlm-base-plus-sv \
  --dtype fp32 \
  --cache apps/desktop/resources/models
```

### A. 数据集

先收最小真实集，再扩容：

1. 每位 target 用户录 3–5 条 enrollment，每条 3–6 秒，覆盖 ja/zh/en 与实际
   麦克风距离。
2. 另开录音 session 采 target trials，并采至少 3 位 non-target 说话人的
   impostor trials；校准与最终测试必须按录音 session 分开，不能把同一条音频
   切片后分到两边。
3. 每类都切出 `0.5 / 1 / 2 / 4 / 8 s` voiced-duration buckets，并覆盖安静、
   咖啡馆噪声、电视人声、近讲/远讲、扬声器回声、轻微重叠语音。
4. 远程通话再录同步的 mic 与 system 两轨，量化 mic 中 remote leakage；
   同一内容同时保留混合单轨，用于比较“确定性双轨”和“声纹单轨”。
5. 电影 + ASS 继续只做 VAD/STT/回复与人工 speaker-boundary 辅助集，不混入
   enrolled-verification 指标。

原始音频应在用户明确同意后只保存在本地测试目录；报告与 CI 只保存匿名
trial manifest、score 和聚合指标，不提交声纹或版权影片。

### B. 第一批模型矩阵

统一输入 trial，但使用每个模型官方要求的前处理：

| 跑次 | 模型 | 精度 |
|---|---|---|
| baseline | WavLM Base Plus SV | FP32 |
| candidate | WeSpeaker CAM++ VoxCeleb | FP32 ONNX |
| candidate | CAM++ Chinese 3D-Speaker/common | 官方 FP32 权重（先离线跑；若胜出再导出 ONNX） |
| candidate | WeSpeaker ResNet34-LM | FP32 ONNX |
| candidate | WeSpeaker ResNet34-LM | INT8 ONNX |
| desktop reference | SpeechBrain ECAPA-TDNN | 官方 FP32 |
| commercial reference | Eagle | 官方 SDK，若 trial/条款允许 |

只有第一批无法达到目标时再投入 NeXt-TDNN ONNX 导出。每个量化模型都必须比较
FP32/INT8 对相同 target 与 non-target trial 的 score drift、阈值翻转和最终
FAR/FRR，沿用这次 WavLM Q8 教训。

### C. 指标

- **模型层**：FAR、FRR、EER、ROC-AUC；按语言、duration、设备、噪声、距离分桶。
- **有 abstention 的系统层**：coverage、已判定样本 FAR/FRR、unknown rate、
  首次稳定判定延迟。
- **流水线层**：错误 speaker-change flush 次数、每真实轮次产生的 STT/LLM
  请求数、重复 transcript/重复 suggestion 次数。
- **工程层**：模型下载/包体、冷启动、单窗与整轮 p50/p95 latency、峰值内存、
  Web Worker 是否阻塞/积压。
- **双轨层**：mic→user / system→other 的路由错误率、remote leakage、系统音频
  权限失败率。

最终门槛应由产品错误代价确定；至少要分别报告 FAR 和 FRR，不能只看 EER。
EER 是 FAR 与 FRR 相等处的比较指标，不一定是实际产品阈值。
[VoxSRC 官方开发工具说明](https://github.com/a-nagrani/VoxSRC2020)

### D. 决策顺序

1. 若双轨在桌面远程通话覆盖主要场景且 leakage 可控，该模式直接不用声纹。
2. 单轨上先比较“现 WavLM + 新判定策略”与“CAM++ + 新判定策略”；若前者已解决
   大多数问题，可先上线流水线修正，避免无必要模型迁移。
3. 若 CAM++ 在 ja/zh/en 和短句上显著降低 held-out FAR/FRR，并满足 Web p95 与
   包体预算，再迁移默认模型。
4. ResNet34 INT8 只有在真实 non-target margin 保持稳定时才用于 Web；否则保留
   FP32 或 CAM++。
5. Eagle 只有在独立实测胜出、公开 Web AccessKey 方案和商业许可都确认后才进入
   production 候选。

## 明确不做

- 不用电影演员的片段冒充用户 enrollment 来宣称“声纹已调好”。
- 不再用一个 TTS same/different pair 选择生产阈值。
- 不因模型能加载、embedding 维度正确就放行量化。
- 不把 diarization 当成 enrolled verification；前者只给匿名 speaker cluster，
  后者回答“是否为已录入用户”。
- 不在没有 KiboTalk held-out trial 的情况下依据论文 EER 直接更换生产模型。
