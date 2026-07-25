import { useEffect, useState } from 'react'
import type { AccountDevice, AccountSession } from '@kibotalk/app-shared'
import {
  deleteCloudAccount,
  fetchAccountDevices,
  logoutAccount,
  redeemCode,
  requestLoginCode,
  revokeAccountDevice,
  verifyLoginCode,
} from '@kibotalk/app-shared'
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
  Progress,
  Separator,
} from '@kibotalk/ui'
import { ArrowLeft, Gift, Laptop, LogOut, RefreshCw, Shield, Trash2 } from 'lucide-react'

export type AccountPageProps = {
  account: AccountSession | null
  loading?: boolean
  embedded?: boolean
  showAdminLink?: boolean
  onAuthenticated: (account: AccountSession) => void
  onAccountChange: (account: AccountSession | null) => void
  onBack?: () => void
  onDeleteLocalData?: () => Promise<void>
}

function minutes(seconds: number): string {
  const value = seconds / 60
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function LoginCard({
  embedded,
  onAuthenticated,
}: Pick<AccountPageProps, 'embedded' | 'onAuthenticated'>) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [developmentCode, setDevelopmentCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function sendCode() {
    setBusy(true)
    setError('')
    try {
      const result = await requestLoginCode(email)
      setCodeSent(true)
      setDevelopmentCode(result.developmentCode ?? '')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function signIn() {
    setBusy(true)
    setError('')
    try {
      onAuthenticated(await verifyLoginCode(email, code))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={embedded ? 'w-full p-5' : 'flex min-h-dvh items-center justify-center p-4'}>
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>登录 KiboTalk</CardTitle>
          <CardDescription>
            云端语音识别、AI 建议和历史同步需要登录。声纹只保留在当前设备，不会上传。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account-email">邮箱</Label>
            <Input
              id="account-email"
              type="email"
              autoComplete="email"
              value={email}
              disabled={busy || codeSent}
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          {codeSent ? (
            <div className="space-y-2">
              <Label htmlFor="account-code">6 位验证码</Label>
              <Input
                id="account-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                placeholder="000000"
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && code.length === 6) void signIn()
                }}
              />
              {developmentCode ? (
                <p className="text-xs text-muted-foreground">本地开发验证码：{developmentCode}</p>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {codeSent ? (
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy || code.length !== 6} onClick={() => void signIn()}>
                {busy ? '登录中…' : '登录并同步'}
              </Button>
              <Button
                variant="soft"
                disabled={busy}
                onClick={() => {
                  setCode('')
                  setCodeSent(false)
                }}
              >
                更换邮箱
              </Button>
            </div>
          ) : (
            <Button className="w-full" disabled={busy || !email.trim()} onClick={() => void sendCode()}>
              {busy ? '发送中…' : '发送验证码'}
            </Button>
          )}
          <p className="text-center text-xs text-muted-foreground">
            登录即启用文本历史自动同步；不上传原始音频或声纹。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function AccountContent({
  account,
  showAdminLink,
  onAccountChange,
  onBack,
  onDeleteLocalData,
}: AccountPageProps & { account: AccountSession }) {
  const [devices, setDevices] = useState<AccountDevice[]>([])
  const [voucher, setVoucher] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    void fetchAccountDevices().then(setDevices).catch(() => setDevices([]))
  }, [account.deviceSessionId])

  const quota = account.quota
  const monthlyTotal = quota.proUntil ? 600 * 60 : 10 * 60
  const monthlyRemaining = quota.freeSeconds + quota.proSeconds
  const progress = Math.min(100, monthlyRemaining / monthlyTotal * 100)

  async function redeem() {
    setBusy(true)
    setMessage('')
    try {
      const nextQuota = await redeemCode(voucher)
      onAccountChange({ ...account, quota: nextQuota })
      setVoucher('')
      setMessage('兑换成功，额度已到账。')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    setBusy(true)
    await logoutAccount()
    onAccountChange(null)
  }

  async function removeAccount() {
    setBusy(true)
    try {
      await deleteCloudAccount()
      await onDeleteLocalData?.()
      onAccountChange(null)
    } finally {
      setBusy(false)
      setDeleteOpen(false)
    }
  }

  return (
    <div className="min-h-dvh bg-background p-3 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {onBack ? (
              <Button variant="ghost" size="icon" onClick={onBack} aria-label="返回">
                <ArrowLeft className="size-4" />
              </Button>
            ) : null}
            <div>
              <h1 className="text-xl font-bold">账户与额度</h1>
              <p className="text-xs text-muted-foreground">{account.user.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {showAdminLink && account.user.isAdmin ? (
              <Button variant="soft" onClick={() => window.location.assign('/admin')}>
                <Shield className="size-4" />
                管理后台
              </Button>
            ) : null}
            <Button variant="soft" disabled={busy} onClick={() => void logout()}>
              <LogOut className="size-4" />
              退出
            </Button>
          </div>
        </header>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>可用 {minutes(quota.totalSeconds)} 分钟</CardTitle>
                <CardDescription>
                  扣减顺序：每月免费额度 → Pro 额度 → 永久充值额度
                </CardDescription>
              </div>
              {quota.proUntil ? <Badge>Pro</Badge> : <Badge variant="secondary">免费版</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progress} />
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md bg-muted p-2">
                <strong className="block text-base">{minutes(quota.freeSeconds)}</strong>免费
              </div>
              <div className="rounded-md bg-muted p-2">
                <strong className="block text-base">{minutes(quota.proSeconds)}</strong>Pro
              </div>
              <div className="rounded-md bg-muted p-2">
                <strong className="block text-base">{minutes(quota.paidSeconds)}</strong>永久
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pro · ¥30</CardTitle>
              <CardDescription>30 天 · 600 分钟，不结转</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">比赛期间仅支持兑换码开通</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>兑换码</CardTitle>
              <CardDescription>兑换 Pro 或永久分钟数</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={voucher}
                  placeholder="KIBO-XXXX-XXXX"
                  onChange={(event) => setVoucher(event.target.value.toUpperCase())}
                />
                <Button disabled={busy || !voucher.trim()} onClick={() => void redeem()}>
                  <Gift className="size-4" />
                  兑换
                </Button>
              </div>
              {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>分钟包</CardTitle>
            <CardDescription>展示价格，暂不开放支付</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            {[
              ['¥10', '120 分钟'],
              ['¥30', '400 分钟'],
              ['¥50', '800 分钟'],
            ].map(([price, amount]) => (
              <div key={price} className="rounded-md border border-border p-3">
                <strong>{price}</strong>
                <p className="text-sm">{amount}</p>
                <Badge className="mt-2" variant="secondary">即将开放</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>登录设备</CardTitle>
            <CardDescription>同一账号可登录多台设备，但同时只能进行一个 AI 会话。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {devices.map((device, index) => (
              <div key={device.id}>
                {index > 0 ? <Separator className="my-2" /> : null}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Laptop className="size-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {device.deviceName} {device.current ? '· 当前设备' : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(device.lastSeenAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="soft"
                    disabled={busy}
                    onClick={async () => {
                      const current = await revokeAccountDevice(device.id)
                      if (current) {
                        onAccountChange(null)
                      } else {
                        setDevices(await fetchAccountDevices())
                      }
                    }}
                  >
                    撤销
                  </Button>
                </div>
              </div>
            ))}
            {devices.length === 0 ? (
              <Button variant="soft" onClick={() => void fetchAccountDevices().then(setDevices)}>
                <RefreshCw className="size-4" />
                刷新设备
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">删除账户</CardTitle>
            <CardDescription>永久删除云端文本历史、额度账本和所有设备会话。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              删除账户
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认永久删除账户？</DialogTitle>
            <DialogDescription>
              此操作会立即删除云端账户、同步历史和额度，无法恢复；当前设备本地数据也会清除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="soft">取消</Button>
            </DialogClose>
            <Button variant="destructive" disabled={busy} onClick={() => void removeAccount()}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function AccountPage(props: AccountPageProps) {
  if (props.loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        正在检查账户…
      </div>
    )
  }
  if (!props.account) {
    return <LoginCard embedded={props.embedded} onAuthenticated={props.onAuthenticated} />
  }
  return <AccountContent {...props} account={props.account} />
}
