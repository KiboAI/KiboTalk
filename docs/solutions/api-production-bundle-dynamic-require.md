---
module: api
tags: [tsup, docker, esm, cjs, react-dom, dotenv]
problem_type: production-bundle
---

# The production API bundle must not leave dynamic CommonJS requires in ESM

## 症状 / Symptom

`apps/api` 在工作区里可以正常启动，但打成单文件 ESM Docker 镜像后会在启动时
依次报错：

```text
Error: Dynamic require of "dotenv" is not supported
Error: Dynamic require of "react-dom/server" is not supported
```

这只会出现在真正运行生产镜像时，TypeScript、Vitest 和普通 workspace build
都无法暴露该问题。

## 原因 / Cause

生产入口的依赖树同时包含 ESM 和 CommonJS 包。esbuild/tsup 输出 ESM 单文件时，
某些 CommonJS 依赖仍通过运行时 `require()` 加载；Node 的 ESM 运行环境不提供
这个动态加载路径。仅仅 externalize 第一个报错的包会把问题推到下一个依赖，
并不能解决整个依赖图。

## 修复 / Fix

- `apps/api/tsup.config.ts` 输出单文件 CJS，并把 workspace 与 npm 依赖一起打包；
- 生产入口改为异步 `main()`，避免 CJS 不支持顶层 `await`；
- Docker 直接执行 `node dist/index.cjs`；
- 开发环境通过 Node 的 `loadEnvFile()` 加载根目录 `.env`，生产环境仍由 Compose
  注入环境变量。

## 证据 / Evidence

最终镜像分别在本机原生架构和 Linux/amd64 上构建；本机容器启动后
`GET /health` 返回成功，随后同一 amd64 镜像被导入 VPS，完成 PostgreSQL
迁移并从 Caddy 内网返回：

```json
{"ok":true,"database":"ok","version":"0.1.0"}
```

因此以后改动 API 打包方式时，必须实际启动 Docker 镜像并请求健康检查，
不能只以 `pnpm build` 作为生产可运行性的证据。
