import {
  dashscopeRealtimeModel,
  isDashscopeRealtimeConfigured,
} from "./dashscope-realtime";

export {
  dashscopeRealtimeConfigFromEnv,
  dashscopeRealtimeHeaders,
  dashscopeRealtimeUpstreamUrl,
  isDashscopeRealtimeConfigured,
  dashscopeRealtimeModel,
  thinClientToUpstream,
  upstreamToThinServer,
  parseThinClientMessage,
  buildSessionUpdateEvent,
  buildAppendEvent,
  buildCommitEvent,
  buildSessionFinishEvent,
} from "./dashscope-realtime";
export type {
  ThinClientMessage,
  ThinServerMessage,
  DashscopeRealtimeConfig,
} from "./dashscope-realtime";

/** Friendly labels for known provider ids (UI use; the id is the wire value). */
const PROVIDER_LABELS: Record<string, string> = {
  "dashscope-realtime": "阿里云 DashScope Realtime",
  "iflytek-realtime": "讯飞实时语音转写大模型",
};

export type SttMode = "realtime";

export type SttProviderInfo = {
  id: string;
  label: string;
  model: string;
  active: boolean;
  configured: boolean;
  mode: SttMode;
  transport: "relay-websocket" | "direct-websocket";
};

/** Enumerate realtime providers configured in `env`. Keys are never included. */
export function listSttProviders(
  env: Record<string, string | undefined>,
): SttProviderInfo[] {
  const realtimeModel = dashscopeRealtimeModel(env);
  const realtimeConfigured = isDashscopeRealtimeConfigured(env);
  return [
    {
      id: "dashscope-realtime",
      label: PROVIDER_LABELS["dashscope-realtime"],
      model: realtimeModel,
      active: env.STT_ACTIVE === "dashscope-realtime",
      configured: realtimeConfigured,
      mode: "realtime",
      transport: "relay-websocket",
    },
    {
      id: "iflytek-realtime",
      label: PROVIDER_LABELS["iflytek-realtime"],
      model: env.STT_IFLYTEK_MODEL ?? "iflytek-rtasr-llm",
      active: env.STT_ACTIVE === "iflytek-realtime",
      configured: Boolean(
        env.STT_IFLYTEK_APP_ID
        && env.STT_IFLYTEK_API_KEY
        && env.STT_IFLYTEK_API_SECRET
      ),
      mode: "realtime",
      transport: "direct-websocket",
    },
  ];
}
