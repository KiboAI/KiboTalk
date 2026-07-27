import { useEffect, useState, type ReactNode } from 'react'
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
  DesktopProductWindowFrame,
  Input,
  Label,
  Separator,
} from '@kibotalk/ui'
import {
  ArrowLeft,
  Gift,
  Laptop,
  LogOut,
  RefreshCw,
  Shield,
  Trash2,
  UserRound,
} from 'lucide-react'

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
  const [inviteCode, setInviteCode] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [developmentCode, setDevelopmentCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function sendCode() {
    setBusy(true)
    setError('')
    try {
      const result = await requestLoginCode(email, inviteCode)
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
      onAuthenticated(await verifyLoginCode(email, code, inviteCode))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={embedded ? 'w-full p-5' : 'flex min-h-dvh items-center justify-center p-4'}>
      <Card
        className={
          embedded
            ? 'mx-auto w-full max-w-md border-0 shadow-none'
            : 'mx-auto w-full max-w-md'
        }
      >
        <CardHeader>
          <CardTitle>登录 KiboTalk</CardTitle>
          <CardDescription>
            云端语音识别、AI 建议和历史同步需要登录。声纹只保留在当前设备，不会上传。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
            <p className="font-semibold">KiboTalk 正在邀请内测</p>
            <p className="mt-1 text-xs text-muted-foreground">
              新用户注册需要邀请码；已有账户可直接登录。
            </p>
          </div>
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
          <div className="space-y-2">
            <Label htmlFor="account-invite-code">邀请码（仅新用户必填）</Label>
            <Input
              id="account-invite-code"
              autoComplete="off"
              value={inviteCode}
              disabled={busy || codeSent}
              placeholder="已有账户可留空"
              onChange={(event) => setInviteCode(event.target.value)}
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
                placeholder="输入邮件中的验证码"
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
  embedded,
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
  const [section, setSection] = useState<'quota' | 'devices' | 'account'>('quota')

  useEffect(() => {
    void fetchAccountDevices().then(setDevices).catch(() => setDevices([]))
  }, [account.deviceSessionId])

  const quota = account.quota
  const sections = [
    { id: 'quota' as const, label: '额度', icon: Gift },
    { id: 'devices' as const, label: '设备', icon: Laptop },
    { id: 'account' as const, label: '账户', icon: UserRound },
  ]

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

  const windowClassName = 'min-h-dvh bg-background p-2 pb-20 sm:p-5 sm:pb-5'
  const panelClassName = embedded
    ? 'grid min-h-0 w-full flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:grid-cols-[14rem_minmax(0,1fr)] sm:grid-rows-none'
    : 'paper-sheet mx-auto grid h-[calc(100dvh-5.5rem)] w-full max-w-6xl grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:h-[calc(100dvh-2.5rem)] sm:grid-cols-[14rem_minmax(0,1fr)] sm:grid-rows-none'
  const page = (
    <>
      <div className={panelClassName}>
        <aside className="min-w-0 border-b border-border bg-muted/50 p-3 sm:border-b-0 sm:border-r">
          <div className="mb-3 flex items-center gap-2 px-1 sm:mb-6">
            {onBack ? (
              <Button variant="ghost" size="icon" onClick={onBack} aria-label="返回">
                <ArrowLeft className="size-4" />
              </Button>
            ) : null}
            <strong>KiboTalk</strong>
          </div>
          <nav className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:overflow-visible sm:px-0">
            {sections.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors sm:w-full ${
                    section === item.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-foreground/5'
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <main className="min-h-0 min-w-0 overflow-y-auto overscroll-contain p-4 pb-6 sm:p-8">
          <header className="mb-6">
            <h1 className="text-xl font-bold">
              {sections.find((item) => item.id === section)?.label}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">账户与额度</p>
          </header>

          {section === 'quota' ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardDescription>当前可用</CardDescription>
                  <CardTitle className="text-3xl">{minutes(quota.totalSeconds)} 分钟</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    免费额度将在 {new Date(quota.resetsAt).toLocaleDateString()} 更新。
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>兑换码</CardTitle>
                  <CardDescription>输入有效兑换码，额度到账后会自动同步到所有设备。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row">
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
          ) : null}

          {section === 'devices' ? (
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
                      <div className="flex min-w-0 items-center gap-3">
                        <Laptop className="size-5 shrink-0" />
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
          ) : null}

          {section === 'account' ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{account.user.email}</CardTitle>
                  <CardDescription>当前登录账户</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {showAdminLink && account.user.isAdmin ? (
                    <Button variant="soft" onClick={() => window.location.assign('/admin')}>
                      <Shield className="size-4" />
                      管理后台
                    </Button>
                  ) : null}
                  <Button variant="soft" disabled={busy} onClick={() => void logout()}>
                    <LogOut className="size-4" />
                    退出登录
                  </Button>
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
          ) : null}
        </main>
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
    </>
  )

  return embedded ? page : <div className={windowClassName}>{page}</div>
}

export function AccountPage(props: AccountPageProps) {
  let content: ReactNode
  if (props.loading) {
    content = (
      <div
        className={
          props.embedded
            ? 'flex min-h-40 items-center justify-center text-sm text-muted-foreground'
            : 'flex min-h-dvh items-center justify-center text-sm text-muted-foreground'
        }
      >
        正在检查账户…
      </div>
    )
  } else if (!props.account) {
    content = (
      <LoginCard
        embedded={props.embedded}
        onAuthenticated={props.onAuthenticated}
      />
    )
  } else {
    content = <AccountContent {...props} account={props.account} />
  }

  if (!props.embedded) return content
  return (
    <DesktopProductWindowFrame
      heightMode={!props.loading && props.account ? 'viewport' : 'content'}
    >
      {content}
    </DesktopProductWindowFrame>
  )
}
