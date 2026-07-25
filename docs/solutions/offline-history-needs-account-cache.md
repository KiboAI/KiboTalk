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

认证 cookie / token 能证明在线身份，却不能在服务不可达时返回用户 ID。产品门禁
又正确地禁止在初始同步失败时创建新会话，所以“本地已经有数据”和“用户能看到
这些数据”之间缺少一条只读路径。

## 修复 / Fix

- 每次成功认证后只缓存非敏感账户快照（用户 ID、邮箱、设备会话 ID 和额度），
  永不把 access token 写入 Web `localStorage`；
- macOS 端通过 Electron `safeStorage` 加密保存账户快照，与 token 分文件管理；
- 网络失败时使用缓存身份打开对应的账户级 IndexedDB；
- Web 和 macOS 都提供“查看本地历史”，但离线历史为只读：不能新建会话、删除、
  重试复盘或调用 AI，避免产生无法可靠同步的墓碑或计费操作；
- 401、退出登录、撤销当前设备和删除账户都会清除账户快照；删除账户还会清除
  当前用户的本地会话和声纹数据。

这条设计保持了“离线可读”和“新云会话必须在线”两个产品约束。
