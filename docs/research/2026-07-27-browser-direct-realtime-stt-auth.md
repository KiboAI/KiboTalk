# Web 端直连实时语音转写的短期授权方案调研

日期：2026-07-27

## 结论

如果目标是“我们的后端只签发一次短期凭证，音频由 Web 客户端直接发给 STT
厂商”，技术上已经有多种成熟方案，但安全边界差别很大：

1. **最完整、最适合普通浏览器的产品化方案**：
   **Soniox、ElevenLabs、AssemblyAI、Deepgram、Gladia、Azure AI Speech**。
   它们都能避免长期密钥进入浏览器；其中 Soniox、ElevenLabs、AssemblyAI
   支持单次/短期客户端凭证，Gladia 直接返回已配置好的 session URL。
2. 如果优先要求**中国大陆节点**，首选验证顺序应改为：
   **由世纪互联运营的 Azure Speech 中国区、腾讯云 ASR、科大讯飞实时转写
   大模型**。Azure 中国明确列出三个大陆 Speech region 并提供 10 分钟 STS
   token；腾讯和讯飞都能由后端签短时 WSS URL，但公开文档没有承诺具体物理区域。
3. **中国厂商里最符合要求的是腾讯云 ASR**：官方 Web 示例明确支持由后端生成
   仅有 ASR 权限的 STS 临时三元组，再由浏览器直连。**科大讯飞也可行**，方式是
   后端生成一次性/短时签名 WSS URL，但官方没有公开精确 TTL。
4. **阿里云 DashScope 目前不适合普通 Web 直连 Qwen-ASR**：虽然已经提供
   1–1800 秒临时 API Key，但 Qwen-ASR WebSocket 仍要求
   `Authorization: Bearer ...` 握手头；浏览器原生 `WebSocket` 不能设置自定义
   `Authorization`。用户账户实际验证还确认东京地域没有所需实时转写能力；
   API Host 或业务空间存在不能证明具体实时模型已在该地域部署。
5. **不建议**百度、火山引擎、华为云和 Google Cloud STT 用于这个架构：
   前三者缺少安全且浏览器可用的 STT 会话凭证，Google 实时识别只有双向 gRPC，
   没有面向普通浏览器的 WebSocket/WebRTC 接口。

对 KiboTalk 的实际建议是：

- 第一轮做 **Azure Speech 中国区、腾讯云、科大讯飞** 的真实设备延迟/准确率
  对照。只有 Azure 中国公开承诺数据在所选大陆 region 处理；腾讯和讯飞需用
  中国大陆用户网络实测其公共 WSS endpoint。
- 如果希望接入最省事、权限边界最小，再加入 **AssemblyAI** 与 **Gladia**；
  但它们公开的实时节点目前不在亚洲，必须用中国、日本用户实测网络延迟。
- **ElevenLabs** 与 KiboTalk 现有 16 kHz PCM、手动 commit 管线很贴合，也应作为
  快速 PoC 候选；其新加坡隔离环境是企业功能。
- 不要因为“厂商提供临时 Key”就判断可直连。浏览器能否在握手时携带它，才是
  决定性条件。

## 判定标准

本文把“合格”定义为同时满足：

- 浏览器可用原生 WebSocket/WebRTC 或厂商明确支持的浏览器 SDK 直接上传音频；
- 长期 API Key、Secret Key 不进入浏览器；
- 后端能签发短期、预签名或单次会话凭证；
- 浏览器无需通过 KiboTalk 服务器转发实时音频。

浏览器原生 `WebSocket(url, protocols)` 不能像 Node WebSocket 客户端一样增加
任意 HTTP 握手头。因此只支持 `Authorization` 自定义头、却没有 query token、
`Sec-WebSocket-Protocol`、SDK 内建交换或预签名 URL 的服务，仍然需要中转。

## 总览

| 厂商 | 浏览器直连协议 | 后端签发给前端的内容 | 有效期 / 权限边界 | Web 支持 | 亚洲/中国附近区域 | 判断 |
|---|---|---|---|---|---|---|
| Azure AI Speech | Speech SDK 内部 WSS | Speech STS token | 10 分钟；与签发 endpoint/region 绑定，需续签 | 官方浏览器 JS SDK | Azure 中国：China East 2、China North 2、China North 3 | **大陆节点首选** |
| Soniox | 原生 WSS / Web SDK | Temporary API key | 1–3600 秒；可单次使用并限制 session 时长；限定 `transcribe_websocket` | 官方 Web SDK和直接浏览器示例 | 日本专用全功能 endpoint（需联系开通区域部署） | **强推荐** |
| ElevenLabs Scribe Realtime | 原生 WSS / React SDK | Single-use token | 15 分钟到期、使用一次即消耗 | 官方浏览器/React SDK，query token | 标准集群覆盖东南亚；新加坡隔离环境为 Enterprise | **强推荐** |
| AWS Transcribe Streaming | 原生 WSS | SigV4 预签名 URL | `X-Amz-Expires` 最长 300 秒；IAM action 可限为 `StartStreamTranscriptionWebSocket` | 原生 WS 可用；帧需 AWS EventStream 编码 | 东京、香港、新加坡、首尔等 | **推荐，但协议实现较重** |
| Deepgram | 原生 WSS / JS SDK | `/auth/grant` JWT | 默认 30 秒，可设 1–3600 秒；连接建立后可继续；权限为 `usage::write`，不是单会话 STT-only | 官方 JS SDK；浏览器可用 WS subprotocol | 默认北美，另有 EU、澳洲，无公开亚洲点 | **推荐** |
| AssemblyAI | 原生 WSS / JS SDK | Streaming temporary token | 1–600 秒、单次使用；可把会话上限设为 60–10800 秒 | 官方浏览器方案，query token | Edge 在 Oregon/Virginia/Ireland；可固定 US/EU | **强推荐** |
| Speechmatics | 原生 WSS / JS SDK | Realtime temporary JWT | 60–86400 秒；`type=rt`，有效期内可开多会话；临时 Key 为企业功能 | 官方 `@speechmatics/*` JS 包；query `jwt` | global 自动路由，但公开固定区只有 EU/US | **可用，需企业资格** |
| Gladia | 原生 WSS / JS SDK | 已配置的 session URL + token | session 级 URL；官方未公开连接 token 的独立 TTL；实时会话最长 3 小时 | 官方 JS SDK与原生 WS 示例 | `eu-west`、`us-west` | **强推荐** |
| OpenAI Realtime transcription | WebRTC（浏览器推荐） | Realtime client secret | 短期 ephemeral key；绑定创建时的 realtime/transcription session 配置 | 官方浏览器 WebRTC 流程 | 无公开日本固定 endpoint | **可用，但接入改动较大** |
| 腾讯云 ASR | 原生 WSS / 官方 `asr.js` | 后端预签 WSS URL，或 STS 临时三元组 | URL 的 `expired` 可设很短；STS 默认 1800 秒；CAM 可只授予 `name/asr:*` | 官方 Web 示例 | 国内公共 ASR endpoint；文档不提供指定物理地域参数 | **大陆候选首选** |
| 科大讯飞 | 原生 WSS | 后端生成的签名 WSS URL | 时间戳 + HMAC；重复或过期会拒绝，但官方未公开精确 TTL | 官方 JS 示例/原生 WS | 国内服务；文档不提供指定物理地域参数 | **大陆候选** |
| 阿里云 DashScope Qwen-ASR | WSS，但原生浏览器无法带鉴权头 | 临时 `st-*` API Key | 默认 60 秒，可设 1–1800 秒；继承永久 Key 全部空间/模型权限 | 没有解决 Qwen-ASR 握手头限制 | 东京已实际确认没有所需实时转写能力 | **普通 Web 不可用** |
| 百度智能云语音 | WSS | 没有合格短凭证 | START 帧需长期 `appid + appkey` | 无正式浏览器短凭证流 | 中国服务 | **不建议** |
| 火山引擎 / 豆包语音 | WSS | 没有查到 STT 专用短凭证 | 长期 App Key/Access Token 或 API Key，自定义握手头 | 官方流式 SDK未列 Web | 中国服务 | **不建议** |
| 华为云 SIS | WSS | IAM Token | IAM token 为 24 小时且必须放 `X-Auth-Token` 握手头；临时 AK/SK不能替代该头 | 原生浏览器无法设置该头 | 多区域云 endpoint | **不建议** |
| Google Cloud Speech-to-Text | 双向 gRPC | OAuth token 也不能解决传输协议 | `StreamingRecognize` 只支持 gRPC，scope 为 `cloud-platform` | 没有普通浏览器 WS/WebRTC STT 接口 | global/us/eu；无东京固定 STT 区 | **不符合要求** |

## 国际厂商

### Soniox

Soniox 后端可调用 `POST /v1/auth/temporary-api-key` 创建临时 Key，并把
`usage_type` 限定为 `transcribe_websocket`。有效期可设 1–3600 秒，还支持
`single_use`、`max_session_duration_seconds` 和服务端绑定的
`client_reference_id`。官方直接流示例明确让浏览器取得临时 Key 后绕过业务
服务器连接 Soniox WSS。
[Soniox 浏览器直连指南](https://soniox.com/docs/guides/direct-stream)；
[Soniox Web SDK](https://soniox.com/docs/sdk/web-SDK)

实时 API 接受 16 kHz raw PCM，支持手动 finalization；统一实时模型覆盖中文、
英语、日语等 60 多种语言。Soniox 还提供完整的日本区域 API：
`api.jp.soniox.com` 与 `stt-rt.jp.soniox.com`，音频和转写在日本处理与存储，
但区域部署需要联系 Soniox 开通。
[Soniox realtime WebSocket](https://soniox.com/docs/api-reference/stt/websocket-api)；
[Soniox 支持语言](https://soniox.com/docs/stt/concepts/supported-languages)；
[Soniox 日本区域](https://soniox.com/docs/data-residency)

**判断：对 KiboTalk 最值得先测。** 它同时满足日本 endpoint、中英日、16 kHz
PCM、短期单次凭证和直接 WSS，和现有客户端音频管线的结构最接近。

### ElevenLabs Scribe Realtime

ElevenLabs 后端可创建 `realtime_scribe` 类型的 single-use token。Token 15 分钟
后自动到期，并在首次使用时消耗；浏览器通过 query token 连接实时 WSS，不会拿到
长期 API Key。官方提供 React/JavaScript 客户端直连示例。
[ElevenLabs single-use token](https://elevenlabs.io/docs/api-reference/tokens/create)；
[ElevenLabs client-side streaming](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/client-side-streaming)

Scribe v2 Realtime 支持 16 kHz PCM、手动 commit 与 VAD commit，并覆盖包括中文、
英语、日语在内的 90 多种语言。ElevenLabs 标准服务有东南亚集群；新加坡隔离环境
及其专用 WSS endpoint 是 Enterprise 功能，不能默认按自助版可固定到新加坡。
[ElevenLabs realtime API](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime)；
[commit 策略](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/transcripts-and-commit-strategies)；
[支持语言](https://elevenlabs.io/docs/overview/capabilities/speech-to-text)；
[新加坡区域](https://elevenlabs.io/docs/overview/administration/data-residency)

**判断：强推荐快速 PoC。** 授权边界和客户端协议都很干净，且几乎不用改变
KiboTalk 的采样率与 TurnGate；但日本和中国大陆的实际路由延迟必须实测。

### Azure AI Speech

Azure 可以由后端使用 Speech resource key 调用
`https://<region>.api.cognitive.microsoft.com/sts/v1.0/issueToken`，取得有效期
10 分钟的 Bearer token；官方建议约 9 分钟时更新。Speech SDK 可通过
`SpeechConfig.fromAuthorizationToken` 使用它，已创建的 recognizer 需要在过期前
更新其 `authorizationToken`，仅更新原配置不会自动影响旧 recognizer。
[Azure Speech REST 鉴权与 token](https://learn.microsoft.com/en-za/azure/ai-services/speech-service/rest-text-to-speech)；
[SpeechConfig token 续签要求](https://learn.microsoft.com/en-us/dotnet/api/microsoft.cognitiveservices.speech.speechconfig.fromauthorizationtoken)

Azure 官方 JavaScript Speech SDK提供浏览器 bundle，浏览器可直接采集麦克风；
官方 STT quickstart 还特别说明麦克风输入只在浏览器 JavaScript 环境支持，并指向
React token 交换示例。
[安装浏览器 Speech SDK](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/quickstarts/setup-platform)；
[浏览器 STT quickstart](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/get-started-speech-to-text)

如果使用由世纪互联运营的 Azure 中国，Speech 明确提供 China East 2、
China North 2、China North 3，并说明音频只在 Speech resource 所在 region
处理。中国区 token endpoint 为
`https://<region>.api.cognitive.azure.cn/sts/v1.0/issueToken`，仍是 10 分钟
STS token；它是与全球 Azure 分离的账户、门户和 endpoint。
[Azure 中国 Speech regions](https://docs.azure.cn/en-us/ai-services/speech-service/regions)；
[Azure 中国 STS token](https://docs.azure.cn/en-us/ai-services/speech-service/rest-text-to-speech)

**判断：中国大陆节点首选。** 这是目前查到同时具有明确大陆 region、官方 Web
SDK、后端短 token 和中英日覆盖的最完整候选。需要单独开通 Azure 中国资源，
并实现约 9 分钟的 token 续签。

### AWS Transcribe Streaming

AWS 没有单独的 STT 临时 token endpoint，但官方 WebSocket 协议支持由后端生成
SigV4 预签名 URL。URL 中含 credential scope、session token（如使用临时 IAM
身份）、签名和 `X-Amz-Expires`；后者最大值是 300 秒。只要连接在 URL 到期前
建立，音频随后直接流向 Transcribe。
[AWS Streaming WebSocket 与预签名 URL](https://docs.aws.amazon.com/transcribe/latest/dg/streaming-setting-up.html)

IAM policy 可以只允许
`transcribe:StartStreamTranscriptionWebSocket`。浏览器能原生打开预签名 WSS，
但音频和响应使用 AWS EventStream 二进制编码，自己实现会比普通 JSON WebSocket
复杂。AWS SDK for JavaScript v3 提供 Transcribe Streaming client，不过生产中
仍应让后端签 URL，绝不能把可签名的长期 Secret Access Key 发到前端。
[AWS JS Transcribe Streaming client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/transcribe-streaming)

AWS Transcribe 有东京、香港、新加坡、首尔等区域 endpoint。
[Amazon Transcribe endpoints](https://docs.aws.amazon.com/general/latest/gr/transcribe.html)

**判断：推荐进入延迟测试。** 亚洲节点强，权限可收紧；主要成本是 SigV4 与
EventStream 编解码实现和测试量。

### Deepgram

Deepgram 的 `/auth/grant` 能用长期 API Key 在后端生成临时 JWT，默认 TTL 为
30 秒，可通过 `ttl_seconds` 设为 1–3600 秒。JWT 只需在初次 WebSocket 握手时
有效，连接建立后可以继续运行。
临时 token 的权限是 `usage::write`，可调用 Listen STT、Speak TTS、Agent 等推理
API，不能调用管理 API；它不是严格的 STT-only 或单次会话 token。
[Deepgram token-based authentication](https://developers.deepgram.com/guides/fundamentals/token-based-authentication)

浏览器不能设置 `Authorization` 时，可用 `Sec-WebSocket-Protocol` 传凭证；
Deepgram 有官方 JS SDK并明确支持临时 token。
[Deepgram client-side WebSocket auth](https://developers.deepgram.com/docs/using-the-sec-websocket-protocol)；
[Deepgram Live API](https://developers.deepgram.com/reference/speech-to-text/listen-streaming)

公开 endpoint 目前为北美默认、EU 和 Australia，未见日本/新加坡固定点。
[Deepgram regional endpoints](https://developers.deepgram.com/reference/custom-endpoints)

**判断：推荐，但要注意 token 权限比单个 STT session 大，并先测亚洲延迟。**

### AssemblyAI

后端调用 `GET https://streaming.assemblyai.com/v3/token` 即可生成 Streaming
temporary token。`expires_in_seconds` 为 1–600 秒；还可用
`max_session_duration_seconds` 把该 token 启动的会话限制在 60–10800 秒。
[AssemblyAI generate streaming token](https://www.assemblyai.com/docs/api-reference/streaming-api/generate-streaming-token)

浏览器将 token 作为 `?token=<token>` 打开 WSS，不需要自定义 header。官方说明
token 为单次使用；每个 token 启动一个会话。默认 streaming host 做 Edge
Routing，也有 US/EU 固定数据区。
[AssemblyAI browser/mobile streaming auth](https://www.assemblyai.com/docs/coding-agent-prompts)；
[AssemblyAI API endpoints](https://www.assemblyai.com/docs/api-reference/overview)

**判断：强推荐。** 凭证短、单次使用、会话时长也能由后端限制，是本文权限边界
最清晰的方案之一。缺点是目前公开 Edge 地点为 Oregon、Virginia、Ireland，
中国和日本必须实测。

### Speechmatics

Speechmatics 支持后端调用
`POST https://mp.speechmatics.com/v1/api_keys?type=rt` 创建 Realtime JWT；
`ttl` 范围为 60–86400 秒。该 key 在 TTL 内可以启动任意数量的实时会话，不绑定
region；浏览器通过 `wss://.../v2?jwt=<temporary-key>` 直连。官方说明临时 key
当前需要企业客户联系支持开通。
[Speechmatics authentication and temporary keys](https://docs.speechmatics.com/get-started/authentication)

官方提供 `@speechmatics/real-time-client` 与 `@speechmatics/auth` JavaScript
包。`global.rt.speechmatics.com` 会选择最近区域，但公开可固定的数据区域只有
EU 和 US。
[Speechmatics Realtime quickstart](https://docs.speechmatics.com/speech-to-text/realtime/quickstart)；
[Speechmatics browser handshake](https://docs.speechmatics.com/api-ref/realtime-transcription-websocket)

**判断：可用但不是默认首选。** 企业门槛和“TTL 内可开多会话”的权限面都比
AssemblyAI/Gladia 大。

### Gladia

Gladia 的模式不是单独发一个通用 token：后端带长期 Key 调用 `POST /v2/live`
并同时提交音频与转写配置，返回包含该 session 临时 token 的唯一 WSS URL。
浏览器拿到 URL 后直接连接 Gladia。官方明确说该 URL 可安全发给 Web/iOS/Android
客户端，不暴露 API Key，也可用于断线重连。
[Gladia initiate live session](https://docs.gladia.io/api-reference/v2/live/init)；
[Gladia V2 migration](https://docs.gladia.io/chapters/live-stt/migration-from-v1)

公开文档没有给出 URL token 的独立 TTL；单个实时 session 最长 3 小时。初始化
时可选择 `eu-west` 或 `us-west`。
[Gladia realtime duration](https://docs.gladia.io/chapters/limits-and-specifications/supported-formats)；
[Gladia region parameter](https://docs.gladia.io/api-reference/v2/live/init)

**判断：强推荐。** Session URL天然把配置和连接绑定在一起；主要问题是没有亚洲
节点，以及 token 到期/重放边界不如 AssemblyAI 文档明确。

### Google Cloud Speech-to-Text

Google 的 `StreamingRecognize` 是双向 streaming RPC，官方明确写明
**仅通过 gRPC 提供，不支持 REST**；授权 scope 是整个
`https://www.googleapis.com/auth/cloud-platform`。Google 没有为 Cloud STT
提供等价的浏览器 WebSocket/WebRTC endpoint 或 STT session token。
[Google StreamingRecognize RPC](https://docs.cloud.google.com/speech-to-text/docs/reference/rpc/google.cloud.speech.v1)；
[Google streaming STT guide](https://docs.cloud.google.com/speech-to-text/docs/streaming-recognize)

即使后端生成短期 OAuth access token，普通 Web 应用也仍缺少官方可直接连接的
传输协议；在浏览器前增加 gRPC-Web gateway 本质上又回到了中转服务。

**判断：不符合本次目标。**

### OpenAI Realtime transcription

OpenAI Realtime 支持浏览器通过 WebRTC 直连。后端用标准 API Key 调用
`POST /v1/realtime/client_secrets` 创建 ephemeral client secret，浏览器再用该
secret 直接向 OpenAI 建立 WebRTC；标准 Key 不进入客户端。Realtime transcription
session 使用 `type: "transcription"`，官方也明确浏览器音频使用 WebRTC。
[OpenAI WebRTC ephemeral key 流程](https://developers.openai.com/api/docs/guides/realtime-webrtc)；
[OpenAI Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)

当前官方转写示例使用 24 kHz mono PCM 和 `gpt-realtime-whisper`，与 KiboTalk
内部 16 kHz 管线相比需要额外重采样和 WebRTC 适配；也没有公开可固定到日本的
Realtime endpoint。

**判断：安全直连可行，但不是最小改动方案。** 如果未来还需要实时音频理解或
语音 Agent，可以一并验证；仅替换当前 ASR 时，优先级低于 Soniox、ElevenLabs
和 Azure。

## 中国厂商

### 腾讯云 ASR

腾讯官方 Web 教程提供 `asr.js`，并明确警告不要把永久 SecretID/SecretKey 放到
前端。后端可调用 STS `GetFederationToken`，以 CAM policy 只授予
`name/asr:*`，再把 `TmpSecretId`、`TmpSecretKey`、`Token` 传给浏览器；Web
客户端据此生成签名 WSS URL并直接上传 PCM。
[腾讯云 Web ASR 与临时密钥方案](https://cloud.tencent.com/document/product/1093/68499)；
[腾讯云实时识别 WebSocket 签名](https://cloud.tencent.com/document/api/1093/48982)

STS 默认有效期 1800 秒；主账号调用最长 7200 秒，子账号最长 129600 秒。临时
身份权限是调用身份权限与请求 policy 的交集。生产后端应使用专用子账号和最小
policy，不应使用主账号永久密钥。
[腾讯云 GetFederationToken](https://cloud.tencent.com/document/product/1312/48195)

更收敛的做法是让 KiboTalk 后端直接生成最终 WSS URL，只把 URL 发给浏览器。
协议的 `expired` 只要求大于 `timestamp` 且二者差值小于 90 天，因此我们可以
主动设为约 30–60 秒，并为每次连接生成唯一 `voice_id`；无需把临时 SecretKey
也交给浏览器。

模型方面，腾讯当前 `16k_multi_lang` 大模型覆盖英语、日语等 15 种语言并支持
句/段级自动识别；中文应使用 `16k_zh_en` 大模型，另有通用 `16k_ja`。KiboTalk
每个 session 已冻结 `conversationLang`，可以按 session 选择模型，不需要在
同一连接里兼顾中文与日语。
[腾讯云实时 ASR 模型列表](https://cloud.tencent.com/document/api/1093/48982)

**判断：中国厂商首选。**

### 科大讯飞

讯飞实时转写大模型把 `appId`、`uuid`、UTC 时间戳和 HMAC signature 放在 WSS
URL query 中，因此后端可以只把已签 URL 发给浏览器，长期 secret 不进入客户端。
错误码中同时有“客户端时间与服务器偏差过大”和“签名过期或重复使用”，说明签名
具有短时与防重放约束；但文档没有公布精确 TTL。
[讯飞大模型实时转写协议](https://www.xfyun.cn/doc/spark/asr_llm/rtasr_llm.html)；
[讯飞标准 RTASR 与 JS 示例](https://wuhan.xfyun.cn/doc/asr/rtasr/API.html)

该大模型实时接口为 16 kHz PCM、不限音频时长；`autominor` 支持包括中文、英文、
日语在内的 37 种语言免切识别，但需要单独付费并通过人工对接。若 session 已知
语言，应设置 `recognized_language`。如果账号开启 IP 白名单，终端用户动态 IP
会让直连失败，需关闭白名单或与讯飞确认终端直连的安全控制。

**判断：可行的第二候选；上线前必须实测 URL 可使用时间、是否一次性以及断线重连。**

### 阿里云 DashScope / Qwen-ASR-Realtime

阿里云百炼已经支持由后端生成 `st-*` 临时 API Key：默认 60 秒，允许
`expire_in_seconds=1..1800`。临时 Key 会继承生成它的永久 Key 的全部模型和
业务空间权限。
[百炼临时 API Key](https://help.aliyun.com/zh/model-studio/application-obtain-temporary-authentication-token)

但是 Qwen-ASR-Realtime 的 WSS 握手要求
`Authorization: Bearer <DashScope API Key>`。普通浏览器无法为原生 WebSocket
设置这个自定义头；将 Key 放到 URL也不是该接口文档支持的鉴权方式。
[Qwen-ASR-Realtime interaction flow](https://help.aliyun.com/en/model-studio/qwen-asr-realtime-interaction-process)

用户账户的实际模型/地域验证已经确认东京没有本项目需要的实时转写能力。不能从
东京 API Host、业务空间或“全球部署”标签推导出 Qwen-ASR-Realtime 在东京可调用；
后续配置变更必须先用目标地域与准确模型做握手测试。

阿里另有 Realtime AOQ 客户端 token，但其官方适用范围是 Qwen Omni Realtime/
AOQ，不应当作 Qwen-ASR-only 的可用凭证。
[阿里云 Realtime token authentication](https://help.aliyun.com/en/model-studio/realtime-token-authentication)

**判断：Electron/Node 可以拿临时 Key 直连；普通 Web 仍需中转，不符合本次目标。**

### 百度智能云语音

百度实时语音识别 WebSocket 的 START 消息要求直接提交 `appid` 与
`appkey(API Key)`，没有找到官方 STT 临时凭证或预签名 URL。官方示例也集中在
Java、Android、Python、C++，产品说明建议服务端调用。
[百度实时语音识别 WebSocket API](https://cloud.baidu.com/doc/SPEECH/s/jlbxejt2i)；
[百度语音技术概述](https://cloud.baidu.com/doc/SPEECH/s/qlcirqhz0)

**判断：会暴露长期 Key，不符合要求。**

### 火山引擎 / 豆包语音

火山流式语音 SDK示例使用长期 App Key 与 Access Token；另一个 Realtime 网关
使用 `Authorization: Bearer <API_KEY>` 自定义握手头。没有查到语音 ASR 专用、
可由业务后端签发且适用于浏览器的临时会话 token。官方流式 SDK列出
Android/iOS/Linux，没有 Web。
[火山流式语音 SDK 鉴权](https://www.volcengine.com/docs/6561/1395846)；
[火山 Realtime API 鉴权](https://www.volcengine.com/docs/6893/1527759)

**判断：普通 Web 不符合要求。**

### 华为云 SIS

华为 SIS 实时 WebSocket 要求握手头 `X-Auth-Token`。IAM 用户 token 有效期为
24 小时，浏览器原生 WebSocket 也不能设置这个头。华为虽可签发 15 分钟到 24
小时的临时 AK/SK，但 SIS WebSocket 鉴权仍要求 `X-Auth-Token`；而文档对内嵌
policy 的服务级限权还注明只由 OBS 识别，不能据此构造可靠的 SIS-only 浏览器
凭证。
[华为 SIS WebSocket 公共请求头](https://support.huaweicloud.com/api-sis/sis_03_0042.html)；
[华为 SIS 实时识别](https://support.huaweicloud.com/api-sis/sis_03_0024.html)；
[华为 IAM token 有效期](https://support.huaweicloud.com/api-iam/iam_02_0510.html)；
[华为临时 AK/SK](https://support.huaweicloud.com/api-iam/iam_04_0002.html)

**判断：普通 Web 不符合要求。**

## 服务商规模与模型水平

这些候选不能只按公司大小排序。Azure、AWS、腾讯是综合云巨头，优势是区域、
SLA、采购与长期经营稳定性；Soniox、ElevenLabs、Deepgram、AssemblyAI、
Speechmatics、Gladia 是语音专业厂商，通常模型更新更快，但节点覆盖和经营规模
不如综合云。

厂商公开的 WER/CER 常使用不同数据集、清洗方式、模型版本与 final 判定，不能
横向拼成可靠排行榜。以下“模型判断”只表示是否值得进入 KiboTalk 的同条件实测，
不把厂商自测数字当成最终结论：

| 厂商/模型 | 类型 | 日/中/英适配 | 保守判断 |
|---|---|---|---|
| Soniox `stt-rt-v5` | 语音专业厂商 | 同一个实时模型覆盖三语，支持语言提示、自动语言识别与混合语言 | **第一梯队候选**；日本 endpoint 和现有 16 kHz 管线使其综合适配最好 |
| ElevenLabs `scribe_v2_realtime` | 大型音频 AI 专业厂商 | 三语均在 90+ 语言范围，支持 16 kHz PCM、手动/VAD commit | **第一梯队候选**；模型很新，需验证日本网络和日语口语稳定性 |
| Azure Speech | 超大云厂商 | 三语实时转写成熟；中国区三个 Speech region 均可用 | **大陆稳健基准**；不一定每种口语都最强，但工程成熟度最高之一 |
| AWS Transcribe | 超大云厂商 | `ja-JP`、`zh-CN`、英语均支持 streaming | **稳健中上**；东京网络好，模型和客户端协议不如新专业厂商灵活 |
| 腾讯云 ASR | 大型云厂商 | 中文用 `16k_zh_en`；日语可用 `16k_multi_lang` 大模型或 `16k_ja` 通用模型 | **大陆强候选**；中文和日语必须分模型各自实测 |
| Deepgram Nova-3/Base | 成熟语音专业厂商 | Nova-3 支持日语和英语；中文仍在 Base 模型列表，不是 Nova-3 multilingual | **日/英强、三语方案不理想** |
| AssemblyAI Whisper Streaming | 成熟 STT 专业厂商 | 日语和中文要使用 `whisper-rt`；其旗舰 Universal-3 Streaming 主要覆盖六种欧美语言 | **可用但不是三语首选** |
| Speechmatics | 老牌语音专业厂商 | 官方实时产品覆盖日语、普通话和英语 | **模型值得测**；临时 JWT 的企业门槛降低了优先级 |
| Gladia `solaria-1` | 较新的语音 AI 专业厂商 | 多语覆盖广 | **功能和授权优秀**；亚洲节点、规模和长期实战证据较弱 |
| OpenAI `gpt-realtime-whisper` | 大型 AI 平台 | 多语实时模型，浏览器 WebRTC；当前示例为 24 kHz | **潜力型候选**；模型和接口较新，不是当前最小改动方案 |

模型能力来源：
[Soniox v5 模型说明](https://soniox.com/docs/stt/models)；
[ElevenLabs Scribe v2 Realtime](https://elevenlabs.io/docs/overview/models)；
[Deepgram 模型与语言](https://developers.deepgram.com/docs/models-languages-overview/)；
[AssemblyAI Whisper Streaming](https://www.assemblyai.com/docs/universal-streaming/multilingual-transcription)；
[AWS streaming 语言支持](https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html)。

对 KiboTalk，最有决策价值的不是通用公开视频 WER，而是使用相同的日语敬语、
中日切换、停顿、重叠说话和 Mac 麦克风录音，测首个 partial、稳定 partial、
final 延迟以及字符错误率。大陆优先条件下，更合理的三家模型 PoC 是
**Azure Speech 中国区、腾讯云 ASR、科大讯飞实时转写大模型**。阿里东京没有
所需实时能力，不能再作为实时基线；如需海外对照，再加入 Soniox v5。

## KiboTalk 推荐验证顺序

### 第一组：中国大陆节点/接入

1. **Azure Speech 中国区（世纪互联）**
2. **腾讯云 ASR**
3. **科大讯飞实时转写大模型**

三家都应使用同一组真实日语、中文、英语会话音频，分别测：

- 浏览器到 STT endpoint 的建连时间；
- 首个 partial、稳定 partial、final 的端到端延迟；
- 日中英与 code-switch 准确率；
- 30 分钟会话的断线、续签和恢复；
- 每个用户/会话限额能否在凭证层收紧；
- 中国大陆不同运营商网络下的失败率。

### 第二组：大陆效果不够时的海外直连备选

1. **Soniox Japan**：日本 endpoint、短期单次 Key、三语统一模型。
2. **ElevenLabs**：单次 token、16 kHz PCM 与手动 commit 贴合现有管线。
3. **AssemblyAI**：单次 token 与会话时长上限清晰。
4. **Gladia / Deepgram / Speechmatics**：没有公开大陆节点，优先级更低。

### 不进入当前 PoC

- 阿里 Qwen-ASR：东京已实际确认没有所需实时转写能力；即使换到有模型的地域，
  普通浏览器仍受 `Authorization` 握手头限制。
- Google、百度、火山、华为：当前协议或授权模型无法满足“安全的 Web 直连”。

## 后端即使只发 token，仍必须保留的控制

“不转发音频”不等于“不需要后端”。KiboTalk 的 token/session endpoint 至少要：

- 只向已登录且有剩余分钟的用户签发；
- 每个用户同一时间只允许合理数量的活动 token/session；
- TTL 取厂商允许的最小可用值；
- 对可配置的厂商设置 session 最大时长；
- 记录厂商 session/request ID、签发用户、签发时间和计费归属，但不记录音频；
- 对 token 获取接口做按用户和哈希 IP 的速率限制；
- 服务端按厂商 usage API或回调核对实际分钟数，不能只相信客户端“会话结束”；
- 永远不把厂商长期 Key、可签名 Secret 或云主账号凭证放进 Web bundle。

## 证据边界

本文只依据截至 2026-07-27 可访问的厂商官方文档。以下项目文档没有给出明确值，
因此不能当成已确认事实：

- 科大讯飞签名 URL 的精确 TTL和重连复用规则；
- Gladia session URL token 的独立 TTL；
- 腾讯云公共 ASR endpoint 背后的实际接入地域。

这些内容需要用实际账户做握手测试，并向厂商工单确认后再进入生产决策。
