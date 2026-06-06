# ANTON Comm — Voice/Video Calling (Wave-3)

**Status:** building (2026-06-06). **Locked choices (user):** voice + video together (1:1);
public STUN; build + loopback-verify now (ship flagged "both peers need this version").

## Architecture
WebRTC for the **media** (direct peer-to-peer), the existing relay for **signaling only** (it
forwards opaque sealed frames — it never sees SDP, ICE, or media). Four new sealed wire kinds
ride the existing `sendInlinePayload` path; inbound ones route through `applyInboundMessage`
into `call.ts` handlers, which emit call state to a subscriber the App renders.

- **Sending:** `call.ts` → `getRelayClient().sendInlinePayload(toHash, JSON.stringify({kind,data}), {persistent:false})`. Non-persistent: signaling is real-time, never queued (a stale queued offer = a phantom ring).
- **Receiving:** `chat.ts` `parseWirePayload` + `applyInboundMessage` dispatch → `call.ts` `onCallOffer/onCallAnswer/onCallIce/onCallEnd`. These are EPHEMERAL — no chat bubble.
- **No circular import:** call.ts imports relay-client (send) + contacts/identity; chat.ts imports call.ts (handlers). One direction each.

## Wire kinds (ephemeral signaling)
- `call_offer`  `{ callId, sdp, video }`
- `call_answer` `{ callId, sdp }`
- `call_ice_candidate` `{ callId, candidate }`  (RTCIceCandidateInit JSON; trickled)
- `call_end`    `{ callId, reason }`  reason ∈ declined | hangup | busy | timeout | failed | cancelled

## State machine (call.ts, single active session)
`idle → calling` (caller: getUserMedia → pc → offer → send call_offer; 60s ring timeout)
`idle → ringing` (callee: call_offer received; store offer, DON'T capture media yet; 60s timeout)
`ringing → connecting` (accept: getUserMedia → setRemote(offer) → answer → send call_answer)
`calling → connecting` (caller: call_answer received → setRemote(answer))
`connecting → connected` (pc connectionState === 'connected'; 30s connect timeout else end)
`* → ended` (hangUp / decline / call_end / pc 'failed'|'disconnected' / timeout) → cleanup → `idle`

ICE candidates that arrive before the remote description is set are **buffered** and flushed after
`setRemoteDescription`. A second inbound offer while busy → reply `call_end{reason:busy}`, ignore.

## NAT / STUN
`iceServers: [{ urls: ['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302'] }]`.
Public STUN: the operator sees the caller's IP + that a call happened (timing), never content
(media is E2E P2P, SDP is relay-sealed). WebRTC also reveals each peer's IP **to the other peer**
(inherent to P2P — acceptable between friends). No TURN fallback in v1 → a symmetric-NAT pair gets
"couldn't connect"; TURN (self-host coturn) is a documented Phase-2 follow-on. Surfaced in a privacy note.

## Permissions
Manifest already has CAMERA + RECORD_AUDIO (+ add MODIFY_AUDIO_SETTINGS). getUserMedia({audio,video})
triggers the WebView permission flow (mic already proven by voice messages). Best-effort
`@capacitor/camera` requestPermissions before a video call; graceful audio-only fallback if video
is denied. Secure context is met (capacitor androidScheme=https).

## UI
- **Call button** in the chat header (voice + video) → `startCall(peerHash, video)`.
- **IncomingCallOverlay** — full-screen (z-50, fixed inset-0, over the TabBar), peer name/avatar,
  Accept/Decline, 60s auto-decline; a `fc-comm-calls` notification channel rings when backgrounded.
- **ActiveCallScreen** — remote video full-bleed + local PiP, call timer, mute / camera-off /
  switch-camera / end; audio-only shows avatars. Back-stack registered.
- **App.tsx** subscribes to call state; renders the overlay/screen above everything.
- **Call-log bubble** — on call end, each side appends a LOCAL system bubble ("📞 Call · 2:34" /
  "📞 Missed call") so a missed call leaves a trace (no wire; kind `call_log`).

## Verification (honest — see the testing constraint)
A real 2-phone call CANNOT be verified here (phone B serves a stale WebView bundle that survives
`install -r`). What IS verified:
- **Loopback unit test** — two `RTCPeerConnection`s in one JS context with a synthetic stream,
  exchanging offer/answer/ICE through a local relay shim, reaching `connected` on both. Proves the
  getUserMedia shape + RTCPeerConnection lifecycle + ICE buffering + the signaling glue.
- **State-machine + wire unit tests** — transitions, timeouts, busy-reject, ICE buffering;
  parseWirePayload round-trips each call wire.
- **Single-phone UI** — the call button, overlay render, in-call controls render on phone A.
The real 2-phone call gets confirmed on a fresh install of BOTH phones (operator-controlled).

## Phasing
1. call.ts core + wires + permissions + manifest + unit/loopback tests.
2. UI (overlay, in-call, call button, App wiring, call-log) + i18n.
3. Review (privacy/state-machine) + device (UI + loopback) + commit/push flagged.

## Deferred (Phase 2+)
Group calling (needs an SFU), TURN fallback, call-history screen, CallKit/Telecom integration,
background foreground-service for long calls, screen share.
