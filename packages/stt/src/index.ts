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
};

export type SttMode = "realtime";

export type SttProviderInfo = {
  id: string;
  label: string;
  model: string;
  active: boolean;
  configured: boolean;
  mode: SttMode;
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
    },
  ];
}
