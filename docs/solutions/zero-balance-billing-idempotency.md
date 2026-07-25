---
module: quota
tags: [billing, idempotency, zero-balance, postgres]
problem_type: billing-correctness
---

# Zero-balance retries still need an idempotency marker

## 症状 / Symptom

完成转写时已经没有可扣额度，账本会写一条 `delta_seconds = 0` 的 controlled
overdraw。相同 `requestId` 重试时，若只用“已扣秒数大于 0”判断是否处理过，
就会再次写入 overdraw 事件。

## 原因 / Cause

零余额请求的已扣秒数天然为 0；而包含 nullable `bucket_id` 的唯一索引也不会阻止
PostgreSQL 中多个 `NULL` 组合。扣减函数已经按用户加行锁，因此无需另造请求表，
只需判断对应账本记录是否存在。

## 修复 / Fix

- 幂等分支同时查询 `count(*)` 与累计扣减秒数；
- 只要同一用户和 `requestId` 已有任意账本记录，就返回原结果，不再写账；
- 扣减后在同一事务内查询实际剩余额度，用它判定 `exhausted`。
