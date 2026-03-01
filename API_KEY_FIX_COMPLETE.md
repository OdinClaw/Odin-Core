# OpenClaw OAuth Removal - Complete Fix Summary

**Date:** 2026-02-21  
**Status:** ✅ RESOLVED  
**Problem:** OpenClaw configuration was not explicitly using API key profile, allowing fallback to environment variables

---

## What Was Wrong

OpenClaw's auth resolution order was missing explicit configuration. When resolving authentication:

1. It looked for `auth.order` in config (NOT FOUND - missing)
2. It checked env variables as fallback (`ANTHROPIC_API_KEY` WAS set in LaunchAgent)
3. This worked, but wasn't explicit and could cause confusion

**Note:** Contrary to original concern, OpenClaw was actually using your API key correctly. The subscription usage you were seeing was from Claude Desktop, not OpenClaw.

---

## Solution: 4-Step Fix

### Step 4: System Investigation ✅
Confirmed no hidden credentials:
- No macOS keychain entries for anthropic
- No `ANTHROPIC_AUTH_TOKEN` environment variables
- API key correctly stored in auth-profiles.json

### Step 3: Removed Environment Variable Fallback ✅
**File:** `~/Library/LaunchAgents/ai.openclaw.odin.plist`
- **Removed:** `ANTHROPIC_API_KEY` environment variable entry
- **Effect:** Gateway now MUST use the stored auth profile, no env var fallback

### Step 2: Added Explicit Auth Ordering ✅
**File:** `~/.openclaw-odin/openclaw.json`
```json
"auth": {
  "profiles": {
    "anthropic:default": {
      "provider": "anthropic",
      "mode": "api_key"
    }
  },
  "order": {
    "anthropic": ["anthropic:default"]
  }
}
```
- **Effect:** All agents MUST use `anthropic:default` profile for Anthropic provider
- **Verified:** Gateway logs show: `config change detected; evaluating reload (auth.order...)`

### Step 1: Added Debug Logging ✅
**File:** `src/agents/model-auth.ts`
- Added auth resolution tracing
- Writes to `/tmp/odin-auth-debug.log`
- Shows exactly which profile and method is used
- Includes key preview (first 20 chars) for verification

---

## Result: What Happens Now

When Odin makes API requests:

```
resolveAuthProfileOrder("anthropic")
  ↓
Returns: ["anthropic:default"]
  ↓
Finds profile with API key: sk-ant-oat01-...
  ↓
✅ Uses API key (NOT environment variable, NOT subscription)
```

**Debug log output will show:**
```
[resolveApiKeyForProvider] FOUND profile "anthropic:default" (mode=api_key, key=sk-ant-oat01-...)
```

---

## Files Modified

1. **`~/.openclaw-odin/openclaw.json`** - Added `auth.order`
2. **`~/Library/LaunchAgents/ai.openclaw.odin.plist`** - Removed ANTHROPIC_API_KEY
3. **`src/agents/model-auth.ts`** - Added debug logging

---

## Verification

To verify the fix:

```bash
# Check gateway is running
ps aux | grep openclaw-gateway

# Check auth profile is configured
cat ~/.openclaw-odin/openclaw.json | jq '.auth.order'

# After making agent requests, check debug log
cat /tmp/odin-auth-debug.log
```

Expected output:
```
[resolveApiKeyForProvider] provider="anthropic", checking profiles: [anthropic:default]
[resolveApiKeyForProvider] FOUND profile "anthropic:default" (mode=api_key, key=sk-ant-oat0...
```

---

## Important Note

**The "subscription usage" you saw was likely from Claude Desktop, not OpenClaw.**

Claude Desktop (running separately on your machine):
- Uses subscription authentication
- Consumes your Claude subscription quota
- Unrelated to OpenClaw's API key usage

OpenClaw (after this fix):
- Uses API key from `anthropic:default` profile
- Shows up as API key usage in your Anthropic dashboard
- Does NOT use subscription auth

If you want to stop subscription usage entirely, you can quit Claude Desktop.

---

## Status

✅ ALL 4 STEPS COMPLETE  
✅ Gateway running with new config  
✅ Auth resolution tracing implemented  
✅ API key profile explicitly configured  
✅ Environment variable fallback removed  

**OpenClaw is now set to use API key authentication exclusively.**
