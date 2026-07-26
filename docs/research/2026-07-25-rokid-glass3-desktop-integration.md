# Rokid Glass3 desktop integration

Date: 2026-07-25

## Recommendation

For KiboTalk's current product surfaces (PWA and macOS Electron, with no
Android phone app), the shortest feature-complete route is:

```text
Glass3 Android app
  ├─ captures 16 kHz mono PCM16 from the glasses microphone
  ├─ sends binary audio over a local WebSocket
  └─ renders status, transcript, and three reply candidates
          ⇅
KiboTalk Electron main process
  ├─ owns the local WebSocket and pairing token
  └─ bridges PCM and display messages to the renderer
          ⇅
Existing KiboTalk session pipeline
  VAD → speaker verification → STT → LLM → exactly three candidates
```

Do not make the Glass3 run the complete PWA pipeline. The glasses have a small
display and constrained memory, while KiboTalk already bundles its VAD and
speaker models in the desktop app. Do not adopt Rokid ASR or AI Chat for this
path: Rokid should be the hardware capture/display adapter, while KiboTalk keeps
its provider-agnostic STT, prompt, schema, and server-side key handling.

For the first wired smoke test, use the Glass3 data debug cable and:

```bash
adb reverse tcp:8787 tcp:8787
```

The glasses can then connect to `ws://127.0.0.1:8787/<one-time-token>`, avoiding
LAN discovery and firewall work. After the pipeline is proven, replace the
wired address with same-Wi-Fi QR pairing. Keep a cloud relay or encrypted
WebRTC transport as a later remote-use option, not a prerequisite for the
first integration.

## Why this is supported

- Glass3 supports an Android application running directly on the glasses. The
  glasses-side SDK exposes media, messaging, voice, recognition, and device
  services; the official overview explicitly lists an independent glasses app
  as a supported scenario. [Glass3 SDK overview](https://x-docs.rokid.com/docs/terminal-sdk/getting-started/%E6%8E%A5%E5%85%A5%E6%8C%87%E5%8D%97.html)
- The current documented dependency is
  `com.rokid.security:glass3.open.sdk:2.2.0-E`, obtained from Rokid's Maven
  repository. The documented environment is Android Studio, JDK 17, and an
  Android 8+ target. [Glass3 quick start](https://x-docs.rokid.com/docs/terminal-sdk/getting-started/%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B.html)
- The glasses media service exposes `startAudioRecord(AudioCallback)` and
  `stopAudioRecord(AudioCallback)`. `AudioCallback.onAudioStream` returns a byte
  buffer and its valid length. [Glasses SDK API](https://x-docs.rokid.com/docs/terminal-sdk/api-reference/Glass3%20%20SDK%28%E7%9C%BC%E9%95%9C%E7%AB%AF%29%20API%E6%96%87%E6%A1%A3.html)
- Rokid's official Demo treats that callback as 16 kHz, mono, 16-bit PCM before
  encoding it to AAC. This exactly matches KiboTalk's 16 kHz mono pipeline after
  converting little-endian `Int16` samples to normalized `Float32`.
  [Official Demo audio encoder](https://gitee.com/as_pixar/glass3sdkdemo/blob/main/glassdemo/app/src/main/java/com/rokid/glass/media/WorkAudioEncoder.kt)
- The official Demo can be built and installed directly on the Glass3 with a
  data debug cable. Rokid documents Android SDK 34 and separate glasses-side
  and phone-side projects. Only the glasses-side project is needed for this
  design. [Demo running guide](https://x-docs.rokid.com/docs/en/downloads/demo-guide.html)
- Rokid's Phone SDK is for Android phone apps, not macOS. The FAQ says the SDK
  targets Android and does not support iOS or native HarmonyOS; the documented
  phone-side package is an Android dependency. Therefore macOS should use a
  product-owned network transport rather than trying to embed the Phone SDK.
  [Glass3 FAQ](https://x-docs.rokid.com/docs/en/faq/%E5%B8%B8%E8%A7%81%E9%97%AE%E9%A2%98.html)
- The screen is a fixed 480×640 portrait canvas. Rokid recommends placing
  primary content in the central 480×400 region, using green as the primary
  color, avoiding the top reflective region, and using a black Activity
  background. [Glass3 FAQ: UI and display](https://x-docs.rokid.com/docs/en/faq/%E5%B8%B8%E8%A7%81%E9%97%AE%E9%A2%98.html)

## Minimal KiboTalk changes

1. Add a small standalone Kotlin/Android glasses project under
   `apps/rokid-glass`. Start from the official `glassdemo` initialization and
   media callback, but implement only SDK binding, microphone capture,
   WebSocket transport, a black/green 480×640 UI, and pause/reconnect handling.
2. Generalize `packages/app-shared/src/audio/audio-source.ts` behind the small
   source shape already consumed by the session:
   `sampleRate`, `start(onChunk)`, and `stop()`. Keep the current browser source
   as the default and add an externally-fed 16 kHz PCM source for desktop.
3. Add a Glass relay to `apps/desktop` main process. Accept one connection,
   validate a rotating high-entropy token, cap frame sizes and queued bytes,
   and forward binary audio to the renderer through the preload bridge.
4. In `apps/desktop/src/renderer/IslandApp.tsx`, select the external PCM source
   while Glass is connected. Publish the latest transcript, session status, and
   newest candidate round back through the same bridge.
5. Preserve the complete `ReplyCandidate` schema in the display message. Render
   `targetText`, `meaning`, and Japanese `segments` where present; do not invent
   a Rokid-specific LLM schema.

Suggested protocol:

- Binary WebSocket frames: little-endian PCM16 only.
- Text frames from glasses: `hello`, `pause`, `resume`, and heartbeat.
- Text frames from desktop: `status`, `transcript`, `suggestions`, and error.
- `suggestions` carries one committed round of exactly three
  `ReplyCandidate` objects. Empty, failed, or in-flight generation does not
  clear the last committed cards.

## Validation order

1. Install the official Glass3 Demo and prove `startAudioRecord` callbacks on
   the actual device/firmware.
2. Stream PCM over `adb reverse` and verify the desktop receives continuous
   16 kHz mono data without drops or byte-order errors.
3. Feed recorded PCM through the injected source and verify existing VAD,
   speaker verification, batch STT, and realtime STT separately.
4. Send a hard-coded three-candidate payload to the glasses, then wire the real
   committed candidate round.
5. Move from USB to same-Wi-Fi pairing and measure reconnect behavior, frame
   backlog, end-to-end latency, thermals, and battery drain.

## Model caveat

This recommendation assumes **Rokid Glass3 / a Glass3-compatible current Rokid
Glasses build with developer mode and the documented glasses-side SDK**. Rokid
Max/AR Lite display accessories and the display-free Rokid AI Glasses Style are
different products and require a different integration plan. Confirm the exact
model and whether the installed firmware is consumer or enterprise before
starting the Android project.
