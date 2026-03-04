# OpenClaw 2026.3.2 Update Analysis

**Date**: March 3, 2026  
**Updated From**: 2026.2.15 → 2026.3.2  
**Duration**: ~40 seconds  
**Packages Changed**: 52 added, 35 removed, 642 changed  

---

## New Features

### 1. Native PDF Analysis Tool
- First-class `pdf` tool with native Anthropic and Google provider support
- Extraction fallback for non-native models
- Configurable defaults: `agents.defaults.pdfModel`, `pdfMaxBytesMb`, `pdfMaxPages`
- Full routing, validation, and registration support
- **Impact**: Can analyze PDFs directly without manual extraction

### 2. Sessions Attachments (For Subagents)
- Inline file attachment support for `sessions_spawn` (subagent runtime only)
- Supports base64/utf8 encoding
- Transcript content redaction
- Configurable limits via `tools.sessions_spawn.attachments`
- **Impact**: Can pass agent context files (SOUL.md, AGENTS.md, memory) directly to spawned sessions

### 3. Secrets/SecretRef Expansion
- Expanded SecretRef support across 64 credential targets
- Covers runtime collectors, planning/apply/audit flows, onboarding
- Unresolved refs fail fast on active surfaces
- **Impact**: Better credential management for APIs and external tools

### 4. Zalo Personal Plugin (zalouser)
- Rebuilt to use native `zca-js` integration in-process
- No longer depends on external CLI binaries (`openzca`, `zca-cli`)
- Keep QR/login + send/listen flows fully inside OpenClaw
- **Impact**: Cleaner, more reliable Zalo integration

### 5. Ollama Embeddings for Memory
- `memorySearch.provider = "ollama"` support
- `memorySearch.fallback = "ollama"` support
- Honors `models.providers.ollama` settings
- **Impact**: Local embeddings for memory search (no cloud dependency)

### 6. MiniMax Model Support
- Added `MiniMax-M2.5-highspeed` to built-in provider catalogs
- Keeps legacy `MiniMax-M2.5-Lightning` compatibility
- **Impact**: More model options for cost optimization

### 7. Plugin SDK Improvements
- Expose `channelRuntime` on `ChannelGatewayContext` for extensions
- Audio transcription via `api.runtime.stt.transcribeAudioFile(...)`
- Session lifecycle hooks include `sessionKey` for correlation
- Internal hooks: `message:transcribed`, `message:preprocessed`
- Richer outbound `message:sent` context for group correlation

---

## Critical Security Fixes

### 1. WebSocket Security (Loopback-Only by Default)
- Plaintext `ws://` now loopback-only by default
- Explicit break-glass opt-in via `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1`
- Aligns onboarding, client, call validation

### 2. Webhook Auth Hardening
- Enforce auth-before-body parsing for BlueBubbles, Google Chat
- Strict pre-auth body/time budgets for webhook auth
- Prevent unauthenticated slow-body DoS patterns

### 3. Web Tools SSRF Guard
- DNS pinning for untrusted `web_fetch` and citation-redirect URL checks
- Requires explicit opt-in before env-proxy can bypass pinned dispatch

### 4. ACP Sandbox Enforcement
- Reject ACP spawns from sandboxed requester sessions
- Reject `sandbox="require"` for ACP runtime
- Prevents sandbox-boundary bypass

### 5. Config Backup Hardening
- Owner-only (`0600`) permissions on rotated config backups
- Clean orphan `.bak.*` files outside managed backup ring
- Reduces credential leakage risk

### 6. Node Camera URL Binding
- Bind node `camera.snap`/`camera.clip` URL downloads to resolved node host
- Fail-closed when `remoteIp` unavailable
- SSRF-guarded fetch with redirect host/protocol checks

---

## Channel/Platform Fixes

### Discord
- Fixed Slack/Bolt 4.6+ compatibility crash
- Removed invalid `message.channels`/`message.groups` event registrations
- Fixed audio attachment detection via `content_type`
- Proper guild voice-note mention transcription

### Telegram
- Preserved original `file_name` metadata for attachments
- Model picker fallback for long buttons (Telegram 64-byte callback limit)
- Streaming defaults changed from `off` → `partial`
- DM streaming uses `sendMessageDraft` for native preview
- Optional `disableAudioPreflight` for voice-note mention detection

### Slack
- Socket auth failure handling (fail fast on non-recoverable errors)
- Removed invalid event registrations for Bolt 4.6+
- Null-safe guards for mention text normalization

### Feishu
- Multi-app mention routing (validate mention display name + `open_id`)
- Session-memory hook parity for `/new` and `/reset` commands
- Per-group `systemPrompt` forwarding into inbound context
- Group broadcast dispatch with observer isolation

---

## Breaking Changes

### 1. Default ACP Dispatch
- **Was**: Disabled by default
- **Now**: Enabled by default
- **Fix if needed**: Set `acp.dispatch.enabled=false`

### 2. New Install Profile Defaults
- **Was**: Broad coding/system tools enabled
- **Now**: Defaults to `messaging` profile only
- **For Odin**: No impact (custom setup), but verify if new installs need adjustment

### 3. Plugin SDK HTTP Handlers
- **Removed**: `api.registerHttpHandler(...)`
- **Use instead**: `api.registerHttpRoute({ path, auth, match, handler })`
- **Dynamic webhooks**: Use `registerPluginHttpRoute(...)`

### 4. Zalo Personal Plugin (zalouser)
- **Old**: Depended on external `zca-cli` / `openzca` binaries
- **New**: JS-native integration only
- **Action needed**: Run `openclaw channels login --channel zalouser` after upgrade to refresh sessions

---

## Relevant for Odin Architecture

### Sessions Attachments (Huge for Apollo)
- Can pass context files (SOUL.md, AGENTS.md, memory) directly to `sessions_spawn`
- Cleaner than loading from filesystem during agent startup
- Enables faster agent initialization

### PDF Tool
- If Apollo or other agents need to analyze analytics PDFs or reports
- Native Anthropic support means no extraction overhead

### Ollama Embeddings
- Memory search can now use local Ollama
- Cost-effective alternative to cloud embeddings
- Consider for long-term memory scaling

### Plugin SDK Improvements
- If building custom Discord listener or routing extensions
- Session lifecycle correlation is cleaner now
- Audio transcription support useful for voice commands

---

## Recommendations

1. **For Apollo Development**: Leverage sessions attachments feature when spawning agent sessions
2. **For Security**: Review `acp.dispatch.enabled=false` if ACP routing should be paused
3. **For Zalo Users**: Refresh sessions via `openclaw channels login --channel zalouser` if using Zalo
4. **For Scaling**: Consider Ollama embeddings once memory grows large

---

## Status
✅ Update applied successfully  
✅ No critical blockers for Odin operations  
✅ Discord listener bot auto-restarted via launchctl
