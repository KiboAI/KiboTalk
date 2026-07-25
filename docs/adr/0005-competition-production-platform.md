# 比赛生产平台：单 VPS、账号、加密同步与额度账本

- **状态**：Accepted
- **日期**：2026-07-25
- **覆盖**：ADR 0001 中 Railway / Supabase / 无账号的部署假设；ADR 0004 中生产降级策略

## 决策

比赛 Beta 正式入口固定为 `https://advx.kibotalk.app`。大陆 IDC 会对未备案
域名的 HTTP Host / HTTPS SNI 做接入重置，因此源站改为日本 VPS。Cloudflare
只做 DNS，VPS 用 Docker Compose 运行 Caddy、Hono 和 PostgreSQL；Caddy 自动
申请和续期证书，80 端口只做 HTTPS 跳转。

Web 的 WeSpeaker ResNet34-LM 与 Silero 都使用 Q8，首选固定 commit 的 Hugging Face 文件并
进入浏览器缓存；加载失败后自动从 VPS 的同源模型镜像重试。桌面版在构建时从
相同 revision 拉取并打进 DMG。VPS 不托管安装包。DMG 由构建任务产出并经人工
确认后发布到 GitHub Release。

客户端编排边界不变：VAD、声纹判定和 turn gate 仍在客户端。Hono 不再只是
无状态 provider 代理，还负责以下服务端状态：

- Resend 邮箱 OTP、90 天设备会话、设备撤销和封禁；
- PostgreSQL 额度桶与不可变扣减账本；
- AES-256-GCM 加密的文本会话与偏好同步；
- 单账号仅一个活跃 AI 会话的短租约；
- 兑换码、人工赠送和 `/admin` 运营后台；
- 不含文本、音频或建议内容的 30 天运行遥测。

原始音频和声纹 embedding 永不入库。同步内容包括 session、turn、suggestion、
review 和偏好；密文按用户派生密钥，服务端只保留查询所需的最小元数据。用户
主动删除会话或账户时永久删除对应数据。

## 认证与客户端行为

开放邮箱注册，只提供 OTP，不提供密码、手机号或社交登录。Web 使用
`HttpOnly; Secure; SameSite=Lax` cookie；桌面端使用随机 bearer token，并通过
Electron `safeStorage` 保存。客户端必须先在本地完成 onboarding 与声纹录入，
再登录。登录后同步自动启用且没有关闭开关。

本地会话库按账户隔离，切换账户会取消旧同步队列；服务端再核对请求冻结的账户
ID，防止凭据切换竞态。客户端只缓存不含 token 的最小账户快照，用于断网时
进入只读历史；离线时不能新建 / 删除会话、重试复盘或调用 AI。创建新云会话前
必须成功写入服务端，离线时明确阻止开始。
同一账号可登录多设备，但活跃 AI 会话租约只允许一个设备 / session。

## 额度

- 免费：每个北京时间自然月 10 分钟；
- Pro：¥30 展示价，30 天 600 分钟，不结转；
- 永久分钟：仅兑换码或后台人工赠送；
- 扣减顺序：免费 → Pro → 永久；
- 按 realtime STT 实际上行音频秒数向上取整记账，界面以分钟展示；
- 当前 turn 最长 30 秒；余额在 turn 中耗尽时仍完成该 turn、最终建议与复盘，
  然后停止，因而可控透支约不超过 30 秒；
- 服务端为耗尽额度的 session 原子签发一次性 final allowance（建议一次、复盘
  一次）；其余余额为 0 的 LLM 请求返回 `QUOTA_EXHAUSTED`，不能绕过客户端门禁；
- 上游失败不扣额度；上游钱包余额自然构成总成本上限。

比赛期只展示 Pro 与 ¥10/120、¥30/400、¥50/800 三档分钟包，不提供支付入口。
兑换码支持总次数、单用户次数、有效期、启停和权益配置。

## 生产 provider

生产只暴露：

- STT：`STT_ACTIVE=dashscope-realtime`，DashScope
  `qwen3-asr-flash-realtime`；
- LLM：DeepSeek `deepseek-v4-flash`，thinking disabled。

Batch STT 继续用于本地 playground 和开发 provider；生产 API 返回
`REALTIME_STT_REQUIRED`，不自动降级到 batch。

## 发布与运维

- Linux CI 在 push / PR 运行 typecheck、test、Web/API build 和 Docker build；
- 生产 workflow 在 GitHub runner 构建 amd64 镜像与 Q8 回退模型包，再用 SSH
  上传；
  VPS 不依赖 GitHub 连通性；
- Apple Silicon DMG 在 `macos-14` runner 的 tag / 手动任务生成；
- 无 Apple Developer 账号，因此应用做 ad-hoc 签名、不公证，仅支持
  Apple Silicon 与 macOS 13+；用户需按比赛说明首次打开；
- DMG 仅通过 GitHub Release 分发，不上传 VPS；更新仅检查
  `/app-version` 并提示手动下载；
- 当前不做周期备份、成本预警、自动更新、Intel 包或真实支付。比赛环境关闭前
  做一次 PostgreSQL 导出。

## 后果

优点是避开大陆 IDC 的未备案域名接入拦截、TLS 可自动续期，且部署不依赖 VPS
访问 GitHub。代价是大陆用户访问日本源站和 Hugging Face 的链路稳定性取决于
跨境网络，团队仍承担 VPS 安全更新、数据库容量和上游余额的人工巡检。比赛
阶段接受该运维成本。
