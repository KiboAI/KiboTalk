# Production deployment

Production currently runs on one Japanese primary server (Tokyo, `216.23.82.211`):

- Web, API, authentication, PostgreSQL, quota, and sync;
- browser-direct realtime STT through iFlytek;
- LLM proxy;
- the `jp-primary` data-plane node.

Pushes to `main` and manual workflow dispatches run
`.github/workflows/deploy-production.yml`. The workflow validates the Tokyo
provider configuration, runs typecheck and tests, uploads the API and bundled
on-device models, activates the release, and verifies the public endpoints.

## Primary environment

The primary server keeps its environment at `/opt/kibotalk/.env`. Relevant
node settings are:

```dotenv
SERVER_ROLE=primary
RELAY_NODE_ID=jp-primary
RELAY_PRIMARY_ORIGIN=https://kibotalk.superpowerlulu.win
RELAY_NODES_JSON=[]
```

`RELAY_NODES_JSON=[]` is the authoritative Japan-only topology. The production
workflow writes this value on every release so a retired node cannot
accidentally return through stale server configuration.

iFlytek realtime STT uses:

```dotenv
STT_ACTIVE=iflytek-realtime
STT_IFLYTEK_WS_URL=wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1
```

The app id, API key, and signing secret are stored as GitHub Actions secrets
`STT_IFLYTEK_APP_ID`, `STT_IFLYTEK_API_KEY`, and `STT_IFLYTEK_API_SECRET`.
The browser requests a signed URL from the selected KiboTalk node, then sends
PCM directly to iFlytek; the Japanese server never carries STT audio.

## Verification

The workflow verifies:

```bash
curl --fail https://kibotalk.superpowerlulu.win/health
curl --fail https://kibotalk.superpowerlulu.win/models/onnx-community/wespeaker-voxceleb-resnet34-LM/config.json
```

It also checks the model binary before reporting success. The landing page is
not deployed to production.

The models directory is swapped as a whole (`mv`), so every release recreates
the Caddy container afterwards to re-establish the `/srv/models` bind mount.

## Optional relay nodes

The runtime retains a generic relay module for a future HTTPS node in a region
such as Hong Kong or Singapore. A relay has no user database or long-lived user
credentials. It validates short-lived node-bound grants, proxies realtime STT
and LLM traffic, and reports usage to the primary.

Configure one or more nodes on the primary with JSON:

```dotenv
RELAY_NODES_JSON=[{"id":"sg-relay","origin":"https://sg-relay.superpowerlulu.win"}]
```

Each relay uses the generic `infra/relay/compose.yaml` adapter and must set its
own `RELAY_NODE_ID`, `RELAY_PRIMARY_ORIGIN`, provider keys,
`RELAY_TOKEN_PUBLIC_KEY`, and `RELAY_NODE_SECRET`. Adding a relay requires a
separate deployment path and HTTPS endpoint; the current production workflow
intentionally deploys only Japan.

The client always obtains the node list from the primary, measures
user-to-node latency when a session begins, requires an explicit choice, and
pins that node for the entire session.
