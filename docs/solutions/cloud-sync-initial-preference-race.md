---
module: cloud-sync
tags: [preferences, account-switching, local-first, initialization]
problem_type: race-condition
---

# Initial cloud pull must precede preference uploads

## 症状 / Symptom

设备登录一个已有云端偏好的账户时，页面会在首次 `/api/sync` 返回前把设备当前
偏好写成 `pendingPreferences`。初始化随后把它视为离线修改并上传，覆盖账户原有
云端偏好。切换账户时，当前偏好还可能来自上一个账户。

## 原因 / Cause

偏好同步 effect 在 `CloudConversationStorage` 尚未初始化时也运行。这个阶段无法
区分“用户离线修改”与“等待首次拉取时的设备默认值”，因此不能提前建立 dirty
标记。

## 修复 / Fix

- 首次云同步完成前不上传或暂存设备偏好；
- 若云端已有偏好，先应用到客户端；
- 云存储可用后再同步当前偏好；
- 云存储运行期间的用户修改仍会先持久化为 pending，再进入自动重试队列。

## 证据 / Evidence

`packages/app-shared/test/cloud-conversation-storage.test.ts` 覆盖首次拉取前不会建立
pending 偏好标记，以及已有 pending 偏好在重启后恢复并优先上传。
