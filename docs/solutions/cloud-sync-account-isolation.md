---
module: cloud-sync
tags: [indexeddb, account-switching, cancellation, privacy]
problem_type: data-isolation
---

# Local conversation storage must be isolated by account

## 症状 / Symptom

云同步最初直接包装一个设备级 `IndexedDbConversationStorage`。同一浏览器或 Mac
先登录账户 A、退出后再登录账户 B 时，初始化逻辑会把本地存在但 B 云端不存在的
会话当成离线新增内容上传，造成账户 A 的文本历史进入账户 B。

即使切换数据库，账户 A 已排队但尚未发送的请求也可能在账户 B 的凭据生效后才
执行，形成第二条跨账户路径。

## 原因 / Cause

- IndexedDB 数据库名没有账户维度；
- React effect 清理只忽略了旧初始化结果，没有停止旧存储对象的后台同步队列；
- `authorizedFetch` 在真正发送时读取当前凭据，而不是创建队列时的账户身份。

## 修复 / Fix

- Web、桌面设置窗口和桌面悬浮窗都使用
  `accountConversationDatabaseName(userId)` 创建用户级 IndexedDB；
- 删除账户时清除当前用户对应的本地数据库内容；
- `CloudConversationStorage.dispose()` 中止正在进行的 fetch，并让旧队列不再
  启动新操作；
- 每次同步都携带创建存储时冻结的用户 ID，服务端将其与当前认证账户比对；
  即使凭据切换和旧请求发生极小概率的竞态，也会返回 `409` 而不是写入；
- `useCloudConversationStorage` 在账户、本地数据库或重试轮次变化时主动
  dispose 旧实例。

声纹仍按产品约定只保存在设备本地，不进入账户级云同步。
