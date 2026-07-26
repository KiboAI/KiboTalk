# 灵光能否部署 KiboTalk：官方资料核验

日期：2026-07-25

## 结论

**不能把现有 KiboTalk 仓库直接部署到灵光，至少目前没有任何公开的官方能力或
开发者文档能证明这条路径可行。**

灵光是蚂蚁集团推出的消费级全模态 AI 助手；其中的“闪应用”用于让用户通过
自然语言生成小应用，并在灵光对话内即时运行、编辑、互动和分享。它不是阿里云
的通用应用托管产品，也没有公开成一个可接收既有 Git 仓库、Docker 镜像或
Node.js 服务的 PaaS。[灵光官网](https://www.lingguang.com/)、
[蚂蚁集团发布稿](https://www.antgroup.com/press-releases/1763452800000)、
[蚂蚁集团英文详稿](https://www.antgroup.com/en/news-media/press-releases/1763427600000)

官方 App Store 说明把“发布”定义为将自建闪应用一键发布到“灵光圈”，并明确
闪应用是在对话中运行。它后来增加了长期数据存储、大模型调用、多模态朗读、
陀螺仪、震动反馈等 20 项平台 API，以及导出为手机桌面小组件；这些是灵光
沙箱提供的应用内能力，不能据此推导出任意后端、任意网络协议或独立网站托管。
[灵光 App Store 上架页](https://apps.apple.com/cn/app/%E7%81%B5%E5%85%89-%E5%85%A8%E6%A8%A1%E6%80%81ai%E5%8A%A9%E6%89%8B/id6751496092)

因此可以在灵光里另做一个受限的概念演示或导流小应用，但不应把它当作
KiboTalk Web、Hono API 和数据库的生产部署目标。

## 逐项能力核验

下表的“未公开支持”表示：截至核验日期，灵光官网、蚂蚁集团官方发布材料和
第一方上架说明均没有给出这项能力。缺少文档不是对内部能力的绝对否定，但对
生产部署而言不能把未承诺、未文档化的能力当作可用基础设施。

| KiboTalk 所需能力 | 灵光公开能力 | 判断 |
| --- | --- | --- |
| 导入 Git/GitHub 仓库 | 官方只描述用自然语言或图片生成闪应用，没有 Git 集成说明 | 未公开支持 |
| 上传现有源码、ZIP 或 Docker 镜像 | 没有上传、构建、依赖安装或镜像部署文档 | 未公开支持 |
| React/Vite 前端 | 能生成可交互闪应用，但没有公开受支持的框架、版本、构建命令或静态产物规范 | 不能视作通用前端托管 |
| Node.js 22 / Hono 常驻服务 | 没有 Node.js 运行时、进程、端口、启动命令或容器文档 | 未公开支持 |
| 服务端环境变量和密钥 | 没有项目级环境变量、Secrets、权限或密钥轮换文档 | 未公开支持；无法安全放置 KiboTalk 的上游 Key |
| WebSocket / WSS | 没有让闪应用暴露 WebSocket 服务端的协议、超时或连接数说明 | 未公开支持；不满足 `/stt-realtime` |
| SSE 长响应 | 没有流式 HTTP 服务端、缓冲或超时说明 | 未公开支持；不满足 `/llm` |
| PostgreSQL 和迁移 | 只公开提到平台“长期数据存储”，没有 PostgreSQL、连接串或迁移控制 | 不等价于 KiboTalk 数据库 |
| 自定义域名 / 独立生产 URL | 官方公开的是灵光内运行、分享和发布到灵光圈；没有自定义域名说明 | 未公开支持 |
| 发布 | 可分享、可发布到灵光圈、可导出手机桌面小组件 | 是应用内分发，不是云部署 |

这些判断所依据的正向能力边界来自
[蚂蚁集团灵光发布稿](https://www.antgroup.com/press-releases/1763452800000)、
[蚂蚁集团科技页](https://www.antgroup.com/technology/)和
[灵光 App Store 上架页](https://apps.apple.com/cn/app/%E7%81%B5%E5%85%89-%E5%85%A8%E6%A8%A1%E6%80%81ai%E5%8A%A9%E6%89%8B/id6751496092)。

## “阿里系”与模型平台不是同一件事

这里有两个容易混淆的产品边界：

- 灵光官网标题是“蚂蚁旗下智能全模态 AI 助手”，App Store 上架开发者是
  `Alipay (Hangzhou) Technology Co., Ltd.`；它不是阿里云控制台里的部署产品。
  [灵光官网](https://www.lingguang.com/)、
  [App Store 上架信息](https://apps.apple.com/cn/app/%E7%81%B5%E5%85%89-%E5%85%A8%E6%A8%A1%E6%80%81ai%E5%8A%A9%E6%89%8B/id6751496092)
- 蚂蚁的模型品牌是“百灵”（BaiLing / Ling），阿里云的大模型平台是
  “百炼”（Bailian / Model Studio）。百炼通过阿里云账号、工作空间、
  API Key 和 `maas.aliyuncs.com` / `dashscope.aliyuncs.com` 端点提供模型
  服务。两者不能因名称相近而视为共享账号、Key、模型网关或应用运行环境。
  [蚂蚁 Ling/BaiLing 模型发布稿](https://www.antgroup.com/en/news-media/press-releases/1759982400000)、
  [阿里云百炼产品说明](https://help.aliyun.com/zh/model-studio/what-is-model-studio)、
  [百炼 API Key](https://help.aliyun.com/zh/model-studio/get-api-key/)、
  [百炼接入地址](https://help.aliyun.com/zh/model-studio/base-url)

官方材料没有说明灵光使用百炼/DashScope 作为底座，也没有说明用户能把自己的
DashScope Key 或百炼应用接入灵光。可确认的集成关系只有：KiboTalk 自己的
服务端可以继续直接调用阿里云百炼/DashScope；这不依赖灵光。

另需纠正仓库当前生产配置：KiboTalk 的实时 STT 是阿里云
`qwen3-asr-flash-realtime`，但生产 LLM 是 `deepseek-v4-flash`，并不是所有
云端模型都在阿里云。见
[ADR 0005](../adr/0005-competition-production-platform.md)和
[生产部署说明](../production-deployment.md)。如果后续要把 LLM 也迁到千问，
百炼提供 OpenAI 兼容 API，但当前生产启动检查固定要求
`deepseek-v4-flash`，需要先修改和验证代码，不能只换环境变量。
[百炼 OpenAI 兼容说明](https://help.aliyun.com/zh/model-studio/what-is-model-studio)

## 真正可行的阿里云部署路径

现有仓库已经有可运行 Web + Hono API 的多阶段 `Dockerfile` 和生产
`compose.yaml`，最小迁移不是重做灵光闪应用，而是沿用现有容器交付。可选两条
路线：

- **ECS lift-and-shift（改动最少）**：在 ECS 上继续运行当前 Caddy + Hono +
  PostgreSQL Compose 栈，部署操作基本保持现有日本 VPS runbook；适合先快速
  迁入阿里云。阿里云 ECS 是完整主机环境，官方也把 Node.js 的实时应用列为
  典型场景。
  [ECS Node.js 部署场景](https://www.alibabacloud.com/help/zh/ecs/user-guide/deploy-a-node-js-environment/)
- **SAE + RDS（更少主机运维，推荐中期方案）**：把现有应用镜像托管到 SAE，
  PostgreSQL 改用 RDS，并通过 ALB/MSE 暴露 HTTP、SSE 和 WebSocket。迁移项
  更多，但不用自己维护应用主机和数据库容器。

SAE 方案如下：

```text
GitHub Actions / 本地构建
  → ACR 容器镜像仓库
  → SAE 运行现有 KiboTalk 镜像
      ├─ Web 静态文件
      ├─ Hono HTTP + SSE
      └─ Hono WebSocket → DashScope Realtime
  → RDS PostgreSQL（与 SAE 同 VPC）
  → ALB 或 MSE 网关（HTTPS/WSS、自定义域名）
```

推荐步骤：

1. 将现有根目录 `Dockerfile` 构建的 `linux/amd64` 镜像推到同地域 ACR，再由
   SAE 以镜像方式部署。SAE 官方支持 ACR 镜像，并允许覆盖启动命令。
   [SAE 镜像部署](https://www.alibabacloud.com/help/zh/doc-detail/2862981.html)
2. 在 SAE 配置现有 `.env.example` 对应的变量和密钥，不把 Key 烘焙进镜像。
   SAE 支持自定义环境变量，也可引用配置项。
   [SAE 环境变量](https://www.alibabacloud.com/help/doc-detail/96560.html)
3. 把 Compose 中的 PostgreSQL 换成同 VPC 的 RDS PostgreSQL，并将私网连接串
   配到 `DATABASE_URL`。同 VPC 私网端点是阿里云官方推荐路径。
   [RDS PostgreSQL 网络连接](https://www.alibabacloud.com/help/en/rds/apsaradb-rds-for-postgresql/connections-and-networks/)
4. 入口使用支持长连接的 ALB 或 SAE 的 MSE 网关。ALB 的 HTTP/HTTPS 监听
   默认支持 WebSocket/WSS；MSE 网关明确支持 HTTP、gRPC 和 WebSocket，并将
   WebSocket/SSE 作为 AI 流量的长连接场景。
   [ALB 监听](https://www.alibabacloud.com/help/zh/slb/application-load-balancer/user-guide/create-and-manage-listeners)、
   [SAE MSE 网关约束](https://www.alibabacloud.com/help/zh/doc-detail/2590602.html)、
   [MSE AI 流量说明](https://www.alibabacloud.com/help/en/mse/user-guide/ai-overview/)
5. 绑定自己的 HTTPS 域名并实测 `/stt-realtime` 的 WSS 升级、`/llm` 的
   SSE 首包和持续刷新。若资源位于中国内地，还要先处理 ICP 备案；仓库现有
   ADR 已记录未备案域名在大陆 IDC 的接入问题。

模型侧不需要因为换了运行平台而重写：百炼官方同时支持 HTTP、SSE 和
WebSocket，DashScope Realtime 使用 WebSocket 鉴权；KiboTalk 仍应由服务端
代理持有 API Key，浏览器只连接同源 API。
[百炼地域与协议](https://www.alibabacloud.com/help/zh/model-studio/regions/)、
[Fun-ASR Realtime WebSocket](https://help.aliyun.com/zh/model-studio/fun-asr-realtime-websocket-api)

## 是否值得在灵光里做一个版本

只建议做以下两类实验，不把它们称为“部署 KiboTalk”：

1. 用自然语言重做一个不含实时音频、声纹、账号同步和自有后端的静态演示；
2. 做一个介绍 KiboTalk、展示三张回复卡片并导流到正式站点的灵光圈小应用。

如果必须继续验证灵光的隐藏能力，应在登录后做一个最小实验，并向灵光官方索取
以下书面确认：外部 API 白名单、密钥存储、WebSocket 客户端/服务端能力、
SSE、后台任务、数据导出、独立域名、配额、SLA 和商业使用条款。在这些条件
得到确认前，生产方案应按“灵光不支持现有仓库部署”处理。
