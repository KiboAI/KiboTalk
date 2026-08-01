import { useCallback, useEffect, useState } from 'react'
import { authorizedFetch, useAccount } from '@kibotalk/app-shared'
import { AccountPage } from '@kibotalk/pages'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@kibotalk/ui'
import { ArrowLeft, RefreshCw, Shield, UserRound, Users } from 'lucide-react'

type Dashboard = {
  summary: {
    users: number
    activeUsers24h: number
    activeSessions: number
    sttSeconds24h: number
    llmInputTokens24h: number
    llmOutputTokens24h: number
    errors24h: number
    syncUpdates24h: number
    estimatedSttCostCny24h: number
    estimatedLlmCostUsd24h: number
  }
  chart: Array<{
    at: string
    sttSeconds: number
    inputTokens: number
    outputTokens: number
    errors: number
  }>
}

type AdminUser = {
  id: string
  email: string
  status: 'active' | 'banned'
  createdAt: string
  lastSeenAt: string | null
  totalSeconds: number
}

type Voucher = {
  id: string
  code: string
  name: string
  benefit_kind: 'pro' | 'paid'
  grant_seconds: number
  duration_days: number | null
  max_redemptions: number
  per_user_limit: number
  redemption_count: number
  active: boolean
  valid_until: string | null
}

type LedgerEntry = {
  id: number
  email: string
  delta_seconds: number
  event_type: string
  created_at: string
}

type AdminUserDetail = {
  user: {
    id: string
    email: string
    status: 'active' | 'banned'
    createdAt: string
  }
  quota: {
    freeSeconds: number
    proSeconds: number
    paidSeconds: number
    totalSeconds: number
    proUntil: string | null
    resetsAt: string
  }
  devices: Array<{
    id: string
    deviceName: string
    platform: string
    clientVersion: string
    createdAt: string
    lastSeenAt: string
    revokedAt: string | null
  }>
  ledger: Array<{
    id: number
    deltaSeconds: number
    eventType: string
    createdAt: string
  }>
}

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authorizedFetch(path, init)
  const body = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string }
  if (!response.ok) throw new Error(body.message ?? body.error ?? `Admin HTTP ${response.status}`)
  return body
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {detail ? <CardContent className="text-xs text-muted-foreground">{detail}</CardContent> : null}
    </Card>
  )
}

function QuotaTile({ label, seconds }: { label: string; seconds: number }) {
  return (
    <div className="rounded-md bg-muted p-2">
      <strong className="block text-base">{(Number(seconds) / 60).toFixed(1)}</strong>
      {label}分钟
    </div>
  )
}

function UsageBars({ points }: { points: Dashboard['chart'] }) {
  const max = points.reduce((currentMax, point) => Math.max(currentMax, point.sttSeconds), 1)
  return (
    <div className="flex h-44 items-end gap-1 rounded-lg border border-border bg-card p-3">
      {points.length === 0 ? (
        <p className="m-auto text-sm text-muted-foreground">最近 24 小时暂无调用</p>
      ) : (
        points.map((point) => (
          <div key={point.at} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div
              className="w-full min-w-1 rounded-t bg-primary/80"
              style={{ height: `${Math.max(3, point.sttSeconds / max * 120)}px` }}
              title={`${new Date(point.at).toLocaleTimeString()} · ${point.sttSeconds}s · 错误 ${point.errors}`}
            />
            <span className="hidden text-[9px] text-muted-foreground group-[&:nth-child(4n+1)]:block">
              {new Date(point.at).getHours()}h
            </span>
          </div>
        ))
      )}
    </div>
  )
}

export default function AdminApp() {
  const accountState = useAccount()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null)
  const [userDetailId, setUserDetailId] = useState<string | null>(null)
  const [userDetailLoading, setUserDetailLoading] = useState(false)
  const [voucherForm, setVoucherForm] = useState({
    code: '',
    name: '比赛兑换码',
    benefitKind: 'pro',
    minutes: '600',
    durationDays: '30',
    maxRedemptions: '1',
    perUserLimit: '1',
  })

  const refreshDashboard = useCallback(async () => {
    try {
      setDashboard(await adminJson<Dashboard>('/api/admin/dashboard'))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  const refreshUsers = useCallback(async () => {
    const body = await adminJson<{ users: AdminUser[] }>(
      `/api/admin/users?q=${encodeURIComponent(query)}`,
    )
    setUsers(body.users)
  }, [query])

  const refreshVouchers = useCallback(async () => {
    const body = await adminJson<{ vouchers: Voucher[] }>('/api/admin/vouchers')
    setVouchers(body.vouchers)
  }, [])

  const refreshLedger = useCallback(async () => {
    const body = await adminJson<{ ledger: LedgerEntry[] }>('/api/admin/ledger')
    setLedger(body.ledger)
  }, [])

  const loadUserDetail = useCallback(async (userId: string) => {
    setUserDetailId(userId)
    setUserDetailLoading(true)
    try {
      setUserDetail(await adminJson<AdminUserDetail>(`/api/admin/users/${userId}`))
      setError('')
    } catch (cause) {
      setUserDetail(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setUserDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!accountState.account?.user.isAdmin) return
    void Promise.all([
      refreshDashboard(),
      refreshUsers(),
      refreshVouchers(),
      refreshLedger(),
    ])
    const timer = window.setInterval(() => void refreshDashboard(), 5000)
    return () => window.clearInterval(timer)
  }, [
    accountState.account?.user.isAdmin,
    refreshDashboard,
    refreshLedger,
    refreshUsers,
    refreshVouchers,
  ])

  if (accountState.loading || !accountState.account) {
    return (
      <AccountPage
        account={accountState.account}
        loading={accountState.loading}
        onAuthenticated={accountState.setAccount}
        onAccountChange={accountState.setAccount}
      />
    )
  }
  if (!accountState.account.user.isAdmin) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <Shield className="size-10 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold">无管理权限</h1>
          <p className="text-sm text-muted-foreground">当前邮箱不在 ADMIN_EMAILS 白名单中。</p>
        </div>
        <Button onClick={() => window.location.assign('/')}>返回 KiboTalk</Button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background p-3 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => window.location.assign('/')}>
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">KiboTalk 管理后台</h1>
              <p className="text-xs text-muted-foreground">
                仅显示用量与运行元数据，不展示对话、建议、复盘或音频。
              </p>
            </div>
          </div>
          <Button variant="soft" onClick={() => void refreshDashboard()}>
            <RefreshCw className="size-4" />
            刷新
          </Button>
        </header>
        {error ? <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

        <Tabs defaultValue="dashboard">
          <TabsList className="flex w-full justify-start overflow-x-auto">
            <TabsTrigger value="dashboard">实时看板</TabsTrigger>
            <TabsTrigger value="users">用户</TabsTrigger>
            <TabsTrigger value="vouchers">兑换码</TabsTrigger>
            <TabsTrigger value="ledger">额度流水</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            {dashboard ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard label="注册用户" value={String(dashboard.summary.users)} detail={`24h 活跃 ${dashboard.summary.activeUsers24h}`} />
                  <MetricCard label="当前 AI 会话" value={String(dashboard.summary.activeSessions)} detail={`24h 同步 ${dashboard.summary.syncUpdates24h}`} />
                  <MetricCard label="24h STT" value={`${(dashboard.summary.sttSeconds24h / 60).toFixed(1)} min`} detail={`估算 ¥${dashboard.summary.estimatedSttCostCny24h}`} />
                  <MetricCard label="24h LLM tokens" value={String(dashboard.summary.llmInputTokens24h + dashboard.summary.llmOutputTokens24h)} detail={`估算 $${dashboard.summary.estimatedLlmCostUsd24h} · 错误 ${dashboard.summary.errors24h}`} />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>每小时 STT 秒数</CardTitle>
                    <CardDescription>每 5 秒自动刷新；鼠标悬停查看小时与错误数。</CardDescription>
                  </CardHeader>
                  <CardContent><UsageBars points={dashboard.chart} /></CardContent>
                </Card>
              </>
            ) : null}
          </TabsContent>

          <TabsContent value="users" className="space-y-3">
            <div className="flex gap-2">
              <Input value={query} placeholder="按邮箱搜索" onChange={(event) => setQuery(event.target.value)} />
              <Button onClick={() => void refreshUsers()}><Users className="size-4" />搜索</Button>
            </div>
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/60 text-xs">
                    <tr><th className="p-3">用户</th><th className="p-3">额度</th><th className="p-3">最近在线</th><th className="p-3">操作</th></tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-border last:border-0">
                        <td className="p-3"><div className="flex items-center gap-2"><UserRound className="size-4" /><div><strong>{user.email}</strong><p className="text-xs text-muted-foreground">{user.status}</p></div></div></td>
                        <td className="p-3">{(user.totalSeconds / 60).toFixed(1)} min</td>
                        <td className="p-3 text-xs">{user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString() : '—'}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            <Button size="sm" variant="soft" onClick={() => void loadUserDetail(user.id)}>
                              详情
                            </Button>
                            <Button size="sm" variant="soft" onClick={async () => {
                              await adminJson(`/api/admin/users/${user.id}/grants`, {
                                method: 'POST', headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({ kind: 'pro', seconds: 600 * 60, durationDays: 30 }),
                              })
                              await refreshUsers()
                            }}>+ Pro</Button>
                            <Button size="sm" variant="soft" onClick={async () => {
                              await adminJson(`/api/admin/users/${user.id}/grants`, {
                                method: 'POST', headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({ kind: 'paid', seconds: 120 * 60 }),
                              })
                              await refreshUsers()
                            }}>+ 120 永久</Button>
                            <Button size="sm" variant={user.status === 'banned' ? 'default' : 'destructive'} onClick={async () => {
                              await adminJson(`/api/admin/users/${user.id}/status`, {
                                method: 'PATCH', headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({ status: user.status === 'banned' ? 'active' : 'banned' }),
                              })
                              await refreshUsers()
                            }}>{user.status === 'banned' ? '解封' : '封禁'}</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vouchers" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>新建兑换码</CardTitle><CardDescription>可配置总数量、单用户次数、权益与临时开关。</CardDescription></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div><Label>自定义码（可空）</Label><Input value={voucherForm.code} onChange={(event) => setVoucherForm({ ...voucherForm, code: event.target.value })} /></div>
                <div><Label>名称</Label><Input value={voucherForm.name} onChange={(event) => setVoucherForm({ ...voucherForm, name: event.target.value })} /></div>
                <div><Label>权益</Label><Select value={voucherForm.benefitKind} onValueChange={(benefitKind) => setVoucherForm({ ...voucherForm, benefitKind })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pro">Pro</SelectItem><SelectItem value="paid">永久分钟</SelectItem></SelectContent></Select></div>
                <div><Label>分钟数</Label><Input type="number" value={voucherForm.minutes} onChange={(event) => setVoucherForm({ ...voucherForm, minutes: event.target.value })} /></div>
                <div><Label>Pro 天数</Label><Input type="number" disabled={voucherForm.benefitKind !== 'pro'} value={voucherForm.durationDays} onChange={(event) => setVoucherForm({ ...voucherForm, durationDays: event.target.value })} /></div>
                <div><Label>总兑换数</Label><Input type="number" value={voucherForm.maxRedemptions} onChange={(event) => setVoucherForm({ ...voucherForm, maxRedemptions: event.target.value })} /></div>
                <div><Label>每用户次数</Label><Input type="number" value={voucherForm.perUserLimit} onChange={(event) => setVoucherForm({ ...voucherForm, perUserLimit: event.target.value })} /></div>
                <div className="flex items-end"><Button className="w-full" onClick={async () => {
                  await adminJson('/api/admin/vouchers', {
                    method: 'POST', headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      code: voucherForm.code || undefined,
                      name: voucherForm.name,
                      benefitKind: voucherForm.benefitKind,
                      grantSeconds: Number(voucherForm.minutes) * 60,
                      durationDays: Number(voucherForm.durationDays),
                      maxRedemptions: Number(voucherForm.maxRedemptions),
                      perUserLimit: Number(voucherForm.perUserLimit),
                    }),
                  })
                  setVoucherForm({ ...voucherForm, code: '' })
                  await refreshVouchers()
                }}>创建</Button></div>
              </CardContent>
            </Card>
            <div className="grid gap-3 md:grid-cols-2">
              {vouchers.map((voucher) => (
                <Card key={voucher.id}>
                  <CardHeader><div className="flex justify-between gap-2"><div><CardTitle className="font-mono text-base">{voucher.code}</CardTitle><CardDescription>{voucher.name} · {voucher.grant_seconds / 60} 分钟</CardDescription></div><Switch checked={voucher.active} onCheckedChange={async (active) => {
                    await adminJson(`/api/admin/vouchers/${voucher.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active }) })
                    await refreshVouchers()
                  }} /></div></CardHeader>
                  <CardContent className="flex gap-2 text-xs text-muted-foreground"><Badge variant="secondary">{voucher.benefit_kind}</Badge><span>{voucher.redemption_count}/{voucher.max_redemptions} 已兑换</span><span>每人 {voucher.per_user_limit}</span></CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="ledger">
            <Card><CardContent className="overflow-x-auto p-0"><table className="w-full text-left text-sm"><thead className="border-b border-border bg-muted/60 text-xs"><tr><th className="p-3">时间</th><th className="p-3">用户</th><th className="p-3">类型</th><th className="p-3">秒数</th></tr></thead><tbody>{ledger.map((entry) => <tr key={entry.id} className="border-b border-border last:border-0"><td className="p-3 text-xs">{new Date(entry.created_at).toLocaleString()}</td><td className="p-3">{entry.email}</td><td className="p-3">{entry.event_type}</td><td className="p-3">{entry.delta_seconds}</td></tr>)}</tbody></table></CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
      <Dialog
        open={userDetailId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUserDetailId(null)
            setUserDetail(null)
          }
        }}
      >
        <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{userDetail?.user.email ?? '用户详情'}</DialogTitle>
            <DialogDescription>
              仅显示账户、额度、设备和流水元数据，不读取会话内容。
            </DialogDescription>
          </DialogHeader>
          {userDetailLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">正在加载…</p>
          ) : userDetail ? (
            <div className="space-y-5">
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <QuotaTile label="总计" seconds={userDetail.quota.totalSeconds} />
                <QuotaTile label="免费" seconds={userDetail.quota.freeSeconds} />
                <QuotaTile label="Pro" seconds={userDetail.quota.proSeconds} />
                <QuotaTile label="永久" seconds={userDetail.quota.paidSeconds} />
              </div>
              <section className="space-y-2">
                <h3 className="text-sm font-bold">设备</h3>
                {userDetail.devices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无设备</p>
                ) : (
                  userDetail.devices.map((device) => (
                    <div
                      key={device.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{device.deviceName}</p>
                        <p className="text-xs text-muted-foreground">
                          {device.platform} · {device.clientVersion} · 最近在线{' '}
                          {new Date(device.lastSeenAt).toLocaleString()}
                        </p>
                      </div>
                      {device.revokedAt ? (
                        <Badge variant="secondary">已撤销</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={async () => {
                            await adminJson(
                              `/api/admin/users/${userDetail.user.id}/devices/${device.id}`,
                              { method: 'DELETE' },
                            )
                            await loadUserDetail(userDetail.user.id)
                            await refreshUsers()
                          }}
                        >
                          撤销
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </section>
              <section className="space-y-2">
                <h3 className="text-sm font-bold">最近额度流水</h3>
                {userDetail.ledger.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无流水</p>
                ) : (
                  <div className="max-h-52 overflow-y-auto rounded-md border border-border">
                    {Array.from({ length: Math.min(userDetail.ledger.length, 20) }, (_, index) => {
                      const entry = userDetail.ledger[index]
                      return (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between gap-3 border-b border-border p-2 text-xs last:border-0"
                        >
                          <span>{entry.eventType}</span>
                          <span>{entry.deltaSeconds > 0 ? '+' : ''}{entry.deltaSeconds} 秒</span>
                          <span className="text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleString()}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-destructive">无法加载用户详情。</p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="soft">关闭</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
