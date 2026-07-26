# Production deployment

This runbook covers the public landing page at `https://kibotalk.app`, the
Web product and primary API at `https://app.kibotalk.app`, and the data-plane
relay at `https://cn-api.kibotalk.app:8443`. The previous competition hostname
`https://advx.kibotalk.app` clears obsolete origin-local model/voiceprint data
and then replaces browser navigation with the landing page.
It intentionally excludes payments, automated backups, alerting, notarization,
and automatic desktop updates.

## Runtime layout

- Japan primary: Ubuntu x86_64 at the host stored in `SERVER_HOST`.
  `/opt/kibotalk/compose.yaml` runs Caddy, Hono, and PostgreSQL. Authentication,
  account data, quota authority, relay discovery, token signing, Web UI, and a
  complete fallback data plane stay here.
- China relay: Ubuntu x86_64 at the host stored in `CN_SERVER_HOST`.
  `/opt/kibotalk-relay/compose.yaml` runs only Caddy and Hono. It has no product
  database. It accepts session-scoped STT/LLM traffic, keeps a durable minimal
  usage outbox, and reports it to Japan.
- Each host has a local `.env` with mode `0600`; CI never uploads or replaces
  either secret file.
- Caddy's named volumes retain its automatically issued TLS certificate.
- The Caddy image contains the static `apps/landing` build. `www.kibotalk.app`
  redirects permanently to the apex domain.
- `advx.kibotalk.app` retains only a standalone origin-cleanup entry and legacy
  API/model paths. This keeps already released desktop clients working while
  normal browser navigation proceeds to the landing page.
- `/opt/kibotalk/models`: same revision-pinned Q8 files used only when a Web
  client cannot load the primary Hugging Face copy.
- Desktop models are bundled into the DMG. The VPS does not store installers.

The deploy workflow builds the Linux/amd64 API, both Caddy images, and
PostgreSQL image on GitHub Actions, transfers one compressed archive to each
host over SSH, and starts Compose with `--pull never`. Neither host needs
reliable access to GitHub or Docker Hub during a release.

## One-time cryptographic material

Generate one Ed25519 key pair and one independent node credential on an
offline/admin machine:

```bash
openssl genpkey -algorithm Ed25519 -out relay-token-private.pem
openssl pkey -in relay-token-private.pem -pubout -out relay-token-public.pem
openssl rand -base64 48
```

Put the complete private PEM only in the Japan `.env` as
`RELAY_TOKEN_PRIVATE_KEY`. Put the public PEM on both hosts as
`RELAY_TOKEN_PUBLIC_KEY`. Put the same random 48-byte value on both hosts as
`RELAY_NODE_SECRET`. Shell multiline values are fragile; base64-encoding each
PEM into one line is also accepted:

```bash
base64 < relay-token-private.pem | tr -d '\n'
base64 < relay-token-public.pem | tr -d '\n'
```

Delete local plaintext key files after placing and backing up the secrets.

## Japan primary environment

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
- `SERVER_ROLE=primary`
- `RELAY_NODE_ID=jp-primary`
- `RELAY_PRIMARY_ORIGIN=https://app.kibotalk.app`
- `RELAY_CN_ORIGIN=https://cn-api.kibotalk.app:8443`
- `RELAY_CN_NODE_ID=cn-relay`
- `RELAY_CN_ENABLED=true`
- `RELAY_TOKEN_PRIVATE_KEY`
- `RELAY_TOKEN_PUBLIC_KEY`
- `RELAY_NODE_SECRET`

`RESEND_FROM_EMAIL` must use a sender domain verified in Resend. Keep
`ALLOW_DEV_OTP=false` in production.

## China relay environment

Create `/opt/kibotalk-relay/.env` with mode `0600`. Copy the same provider
configuration and provider keys used by Japan, then set:

```dotenv
SERVER_ROLE=relay
RELAY_NODE_ID=cn-relay
RELAY_PRIMARY_ORIGIN=https://app.kibotalk.app
RELAY_OUTBOX_PATH=/app/data/usage-outbox.json
RELAY_ACCEPT_NEW_SESSIONS=true
RELAY_DOMAIN=cn-api.kibotalk.app
RELAY_HTTPS_PORT=8443
RELAY_TOKEN_PUBLIC_KEY=<public Ed25519 key or base64>
RELAY_NODE_SECRET=<independent node credential>
ACME_EMAIL=admin@kibotalk.app
CLOUDFLARE_API_TOKEN=<token restricted to DNS edit for kibotalk.app>
```

Do not set `DATABASE_URL`, `AUTH_SECRET`, `SYNC_ENCRYPTION_KEY`, Resend
credentials, or `RELAY_TOKEN_PRIVATE_KEY` on this host.
The relay does not persist raw IP addresses or IP hashes. The Japan primary
may retain only the existing keyed IP hash used for OTP abuse prevention; it
does not store the original IP value.

## China port and HTTPS

The relay does not use ports 80 or 443. Before first deployment, test 8443 on
the China host:

```bash
sudo ss -lntup | grep -E ':(8443|9443)\b' || true
sudo ufw allow 8443/tcp
sudo ufw allow 8443/udp
```

From a machine outside the provider network, verify that a temporary listener
can be reached. If the provider blocks 8443, set `RELAY_HTTPS_PORT=9443`, open
TCP/UDP 9443, and change both `RELAY_CN_ORIGIN` and the `CN_RELAY_ORIGIN`
GitHub secret to `https://cn-api.kibotalk.app:9443`. Compose and Caddy use the
configured port automatically.

Create a DNS-only `A`/`AAAA` record for `cn-api.kibotalk.app` pointing to the
China host. Caddy obtains its certificate with the Cloudflare DNS-01 challenge,
so inbound 80/443 are unnecessary. The Cloudflare token needs only
`Zone:DNS:Edit` for this zone.

For the Japan host, keep the Cloudflare apex, `www`, `app`, and `advx` records
DNS-only and point them at the Japanese VPS. Ports 80 and 443 must remain open.
Caddy obtains and renews those certificates automatically.

## GitHub deployment credentials

Set these repository Actions secrets:

- Japan: `DEPLOY_SSH_KEY`, `SERVER_HOST`, `SERVER_USER`
- China: `CN_DEPLOY_SSH_KEY`, `CN_SERVER_HOST`, `CN_SERVER_USER`
- Public relay origin including the port: `CN_RELAY_ORIGIN`
- Cloudflare DNS-edit token for relay certificate issuance:
  `CN_CLOUDFLARE_API_TOKEN`

Pushes to `main` and manual dispatches deploy both nodes. A release succeeds
only after Japan health/model/landing checks and China health/latency checks
all pass.

## First-node verification

After deployment, verify discovery and the data plane:

```bash
curl --fail https://app.kibotalk.app/health
curl --fail https://cn-api.kibotalk.app:8443/health
curl --fail https://cn-api.kibotalk.app:8443/api/latency
```

Sign in to the production Web app, start a new conversation, and inspect the
session status. It must show one selected node and keep that node for the whole
session. Temporarily set `RELAY_CN_ENABLED=false` on Japan and restart only its
API to exercise the emergency Japan-only path.

## Drain, rollback, and recovery

- Drain China without breaking active sessions by setting
  `RELAY_ACCEPT_NEW_SESSIONS=false` on China and restarting its API. Its
  heartbeat removes it from new-session discovery; existing 30-minute tokens
  remain valid.
- Immediately remove China from all new sessions by setting
  `RELAY_CN_ENABLED=false` on Japan and restarting its API.
- Roll back application code by setting `KIBOTALK_API_IMAGE` on both hosts to
  the same previously loaded SHA image and running `docker compose up -d
  --pull never` in each deployment directory.
- Never delete the relay data volume while usage events are pending. Confirm
  `/app/data/usage-outbox.json` is `[]` before replacing or removing it.

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
