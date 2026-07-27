# Production deployment

Production currently runs on one Japanese primary server:

- Web, API, authentication, PostgreSQL, quota, and sync;
- realtime STT through Alibaba Cloud Japan (Tokyo);
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
RELAY_PRIMARY_ORIGIN=https://app.kibotalk.app
RELAY_NODES_JSON=[]
```

`RELAY_NODES_JSON=[]` is the authoritative Japan-only topology. The production
workflow writes this value on every release so a retired node cannot
accidentally return through stale server configuration.

Tokyo realtime STT uses:

```dotenv
STT_ACTIVE=dashscope-realtime
STT_DASHSCOPE_WS_URL=wss://<workspace>.ap-northeast-1.maas.aliyuncs.com/api-ws/v1/realtime
STT_DASHSCOPE_REALTIME_MODEL=qwen3-asr-flash-realtime
```

The API key and workspace URL are stored as GitHub Actions secrets
`JP_STT_DASHSCOPE_API_KEY` and `JP_STT_DASHSCOPE_WS_URL`.

## Verification

The workflow verifies:

```bash
curl --fail https://app.kibotalk.app/health
curl --fail https://app.kibotalk.app/models/onnx-community/wespeaker-voxceleb-resnet34-LM/config.json
curl --fail https://kibotalk.app/en/
```

It also checks the model binary, the `www` redirect, and the legacy-origin
cleanup page before reporting success.

## Optional relay nodes

The runtime retains a generic relay module for a future HTTPS node in a region
such as Hong Kong or Singapore. A relay has no user database or long-lived user
credentials. It validates short-lived node-bound grants, proxies realtime STT
and LLM traffic, and reports usage to the primary.

Configure one or more nodes on the primary with JSON:

```dotenv
RELAY_NODES_JSON=[{"id":"sg-relay","origin":"https://sg-relay.kibotalk.app"}]
```

Each relay uses the generic `infra/relay/compose.yaml` adapter and must set its
own `RELAY_NODE_ID`, `RELAY_PRIMARY_ORIGIN`, provider keys,
`RELAY_TOKEN_PUBLIC_KEY`, and `RELAY_NODE_SECRET`. Adding a relay requires a
separate deployment path and HTTPS endpoint; the current production workflow
intentionally deploys only Japan.

The client always obtains the node list from the primary, measures
user-to-node latency when a session begins, requires an explicit choice, and
pins that node for the entire session.
