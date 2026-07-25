# Competition production deployment

This runbook covers the temporary competition deployment at
`https://advx.kibotalk.app`. It intentionally excludes payments, automated
backups, alerting, notarization, and automatic desktop updates.

## Runtime layout

- VPS: Ubuntu x86_64 in Japan at the host stored in the GitHub `SERVER_HOST`
  secret.
- `/opt/kibotalk/compose.yaml`: Caddy, stateless Hono API, and PostgreSQL.
- `/opt/kibotalk/.env`: production secrets; mode `0600`; never uploaded by CI.
- Caddy's named volumes retain its automatically issued TLS certificate.
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
- `PUBLIC_APP_URL=https://advx.kibotalk.app`

`RESEND_FROM_EMAIL` must use a sender domain verified in Resend. Keep
`ALLOW_DEV_OTP=false` in production.

## HTTPS

Keep the Cloudflare `advx` A record DNS-only and point it at the Japanese VPS.
Ports 80 and 443 must be open. Caddy obtains and renews the certificate
automatically; no `_acme-challenge` update or Certbot installation is needed.

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
