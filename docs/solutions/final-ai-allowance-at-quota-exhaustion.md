---
module: quota-llm
tags: [quota, llm, final-turn, allowance, abuse-prevention]
problem_type: authorization-boundary
---

# Zero quota needs a scoped final-turn AI allowance

## 症状 / Symptom

若 LLM 端点只依赖客户端门禁，余额为 0 的登录用户仍可直接请求建议和复盘；
若服务端简单拒绝所有零余额请求，最后一轮 STT 扣完额度后又拿不到产品承诺的
最终建议与复盘。

## 修复 / Fix

- 最后一轮扣减返回 `exhausted` 时，为 `(user, conversationSessionId)` 写入 24
  小时 allowance：reply 1 次、review 1 次；
- 同一会话的 allowance 在有效期内只创建一次；多个已提交转写随后完成时不能
  再次补满已消费的最终额度；
- `/api/llm` 与 `/api/session-review` 有余额时正常放行；无余额时必须原子消费
  对应 allowance，否则返回 `402 QUOTA_EXHAUSTED`；
- 客户端在建议和复盘请求中都带冻结的 session ID；
- 非用户主动 abort 的上游失败会退回 allowance，允许产品重试；
- allowance 到期或账户删除后自动清理。

因此服务端既保留最后一轮体验，也不会把零余额账户变成无限 LLM 代理。
