---
module: account-cloud-sync
tags: [offline, indexeddb, electron, account-cache, history]
problem_type: offline-gating
---

# Persisted local history is not enough for offline access

## 症状 / Symptom

会话虽然已经保存在 IndexedDB，但断网启动时 `/api/auth/me` 和初始云同步都会失败。
界面因此停在登录或同步门禁，用户无法进入本地历史页；按用户隔离 IndexedDB 后，
客户端甚至不知道应该打开哪个用户的数据库。

## 原因 / Cause

认证 cookie / token 能证明在线身份，却不能在服务不可达时返回用户 ID。若产品
又把初始云同步当成会话门禁，“本地已经有数据”和“用户能继续使用这些数据”之间
仍会断开。

## 修复 / Fix

- 每次成功认证后只缓存非敏感账户快照（用户 ID、邮箱、设备会话 ID 和额度），
  永不把 access token 写入 Web `localStorage`；
- macOS 端通过 Electron `safeStorage` 加密保存账户快照，与 token 分文件管理；
- 网络失败时使用缓存身份打开对应的账户级 IndexedDB；
- 账户级本地存储在云端对账前立即可用；新会话、转写和建议先写本地，云同步进入
  后台队列，失败时显示“待同步”并自动重试；
- 只有认证失效或 AI 服务本身不可用才阻止需要在线能力的动作，普通同步故障不再
  阻止新会话；
- 401、退出登录、撤销当前设备和删除账户都会清除账户快照；删除账户还会清除
  当前用户的本地会话和声纹数据。

这条设计保持账户隔离，同时将云同步从会话可用性的硬依赖降为可恢复的后台状态。
