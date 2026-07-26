# Production deployment

This runbook covers the public landing page at `https://kibotalk.app` and the
Web product at `https://app.kibotalk.app`. The previous competition hostname
`https://advx.kibotalk.app` clears obsolete origin-local model/voiceprint data
and then replaces browser navigation with the landing page.
It intentionally excludes
payments, automated backups, alerting, notarization, and automatic desktop
updates.

## Runtime layout

- VPS: Ubuntu x86_64 in Japan at the host stored in the GitHub `SERVER_HOST`
  secret.
- `/opt/kibotalk/compose.yaml`: Caddy, stateless Hono API, and PostgreSQL.
- `/opt/kibotalk/.env`: production secrets; mode `0600`; never uploaded by CI.
- Caddy's named volumes retain its automatically issued TLS certificate.
- The Caddy image contains the static `apps/landing` build. `www.kibotalk.app`
  redirects permanently to the apex domain.
- `advx.kibotalk.app` retains only a standalone origin-cleanup entry and legacy
  API/model paths. This keeps already released desktop clients working while
  normal browser navigation proceeds to the landing page.
- `/opt/kibotalk/models`: same revision-pinned Q8 files used only when a Web
  client cannot load the primary Hugging Face copy.
- Desktop models are bundled into the DMG. The VPS does not store installers.

The deploy workflow builds all three Linux/amd64 images on GitHub Actions,
transfers one compressed image archive over SSH, and starts Compose with
`--pull never`. The VPS therefore does not need reliable access to GitHub or
Docker Hub during a release.

## One-time secrets

Create `/opt/kibotalk/.env` from `.env.example` and set at least:

- `POSTGRES_PASSWORD`
- `AUTH_SECRET`
- `SYNC_ENCRYPTION_KEY`
- `STT_DASHSCOPE_API_KEY`
- `LLM_OPENROUTER_API_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME`
- `ADMIN_EMAILS`
- `PUBLIC_APP_URL=https://app.kibotalk.app`

`RESEND_FROM_EMAIL` must use a sender domain verified in Resend. Keep
`ALLOW_DEV_OTP=false` in production.

## HTTPS

Keep the Cloudflare apex, `www`, `app`, and `advx` records DNS-only and point
them at the Japanese VPS. During the cleanup window, do not add a Cloudflare
Redirect Rule for `advx`: the request must reach Caddy so the old origin can
run its cleanup entry, and old desktop API compatibility must remain intact.
Ports 80 and 443 must be open. Caddy obtains and renews the certificates
automatically; no `_acme-challenge` update or Certbot installation is needed.

## Browser-origin cleanup

Changing from `advx.kibotalk.app` to `app.kibotalk.app` changes the browser
origin. Cookies, localStorage, IndexedDB, service workers, and model caches do
not automatically follow the user. Product data does not need a browser-origin
transfer: accounts, quotas, preferences, and conversation history already live
in PostgreSQL through mandatory encrypted sync. Users sign in again on `app`;
voice enrollment can be recorded again.

For normal browser paths on `advx`, Caddy serves the standalone
`legacy-origin-cleanup.html` entry. It deletes Cache Storage (including locally
cached models), unregisters service workers, clears current and known legacy
speaker-embedding stores, then uses `location.replace` to open
`https://kibotalk.app/`. It does not touch conversation IndexedDB, localStorage,
cookies, raw audio, or server data.

Keep the `advx` DNS record and cleanup entry for the announced cleanup window.
After the window, remove the standalone cleanup module and replace its Caddy
fallback with a permanent redirect. Retain legacy API/model paths until every
supported desktop release uses `app.kibotalk.app`.

## Releases

- Push/PR runs Linux CI.
- Push to `main` or manual dispatch deploys production.
- A version tag or manual macOS workflow builds only Apple Silicon, runs the Q8
  speaker regression, creates an ad-hoc-signed DMG, and retains a workflow
  artifact. A version tag also publishes the DMG and SHA-256 file to GitHub
  Releases, which is the only public installer download location.
- No Apple Developer account, provisioning profile, or notarization is used.
  Users must explicitly approve first launch in macOS privacy/security settings.

## Shutdown

Before the competition deployment is removed, create one PostgreSQL export and
copy it off the VPS. Then stop the stack and remove the competition DNS record.
User text is retained until account deletion or this deliberate shutdown
procedure; raw audio and speaker embeddings are never uploaded.
