# API Setup Guide — Artist Analytics Dashboard

**Goal**: Get credentials for YouTube, Spotify, Instagram, and TikTok so we can pull real data into your daily dashboard.

**Timeline**: 15-30 minutes for all four

---

## 1. YouTube API Key (10 min)

### Step 1: Create Google Cloud Project
1. Go to https://console.cloud.google.com
2. Log in with your Google account
3. Click **"Create Project"** (top left)
4. Name it: `MixedByBazzy Analytics`
5. Click **"Create"**
6. Wait 30 seconds for it to load

### Step 2: Enable YouTube Data API
1. In the left sidebar, click **"APIs & Services" → "Enabled APIs & Services"**
2. Click **"+ ENABLE APIS AND SERVICES"** (top)
3. Search for: `YouTube Data API v3`
4. Click the result
5. Click **"ENABLE"**
6. Wait for confirmation (blue checkmark)

### Step 3: Create API Key
1. Go to **"APIs & Services" → "Credentials"** (left sidebar)
2. Click **"+ CREATE CREDENTIALS"** (top)
3. Choose **"API Key"**
4. Copy the key (you'll need it)
5. Click **"Close"**

**You now have**: `YOUTUBE_API_KEY` ✅

---

## 2. Spotify API Credentials (10 min)

### Step 1: Create Spotify App
1. Go to https://developer.spotify.com/dashboard
2. Log in (or create a Spotify account if needed — free)
3. Click **"Create an App"**
4. Name: `MixedByBazzy Analytics`
5. Accept terms
6. Click **"Create"**

### Step 2: Get Credentials
1. You'll see your app dashboard
2. Copy these two values:
   - **Client ID**
   - **Client Secret** (click "Show Client Secret")
3. Save both somewhere safe

**You now have**:
- `SPOTIFY_CLIENT_ID` ✅
- `SPOTIFY_CLIENT_SECRET` ✅

---

## 3. Instagram API Credentials (15 min)

**Note**: Instagram requires more setup because we need access to your *own* account data.

### Step 1: Create Meta/Facebook App
1. Go to https://developers.facebook.com
2. Log in with your Facebook account (create if needed)
3. Click **"Create App"** (top right)
4. Choose **"Business"** as app type
5. Fill in app details:
   - App Name: `MixedByBazzy Analytics`
   - App Contact Email: _(your email)_
   - Purpose: `Content Analytics`
6. Click **"Create App"**

### Step 2: Add Instagram Graph API
1. In your app dashboard, click **"Add Product"**
2. Search for: `Instagram Graph API`
3. Click **"Add"**
4. Follow the prompts to add **Instagram Basic Display** too

### Step 3: Get Access Token (for your own account)
1. Go to **"Tools" → "Graph API Explorer"** (left sidebar)
2. Make sure you're testing with your own account
3. Search for permissions: `instagram_business_account`
4. Click **"Get Token"** (it will ask for permissions)
5. Accept permissions
6. Copy the **access token** (long string of random characters)

**Important**: This is a **short-lived token** (expires in ~1 hour). We'll refresh it automatically, but you need to:
- Keep your Facebook/Instagram login info handy
- Or create a "Service Account" for longer-lived tokens (advanced)

**You now have**: `INSTAGRAM_ACCESS_TOKEN` ✅

---

## 4. TikTok API Credentials (15 min, but requires approval)

**Note**: TikTok has stricter requirements. We'll set up the app, but approval can take 1-7 days.

### Step 1: Apply for TikTok Developer Access
1. Go to https://developers.tiktok.com
2. Log in (create account if needed)
3. Click **"Create an app"**
4. Choose platform: **Web**
5. App name: `MixedByBazzy Analytics`
6. Application Category: `Content Analytics` or `Music`
7. Describe what you'll do: "Pulling my own TikTok analytics for music promotion dashboard"
8. Click **"Create app"**

### Step 2: Request Permissions
1. Go to your app settings
2. Request these **scopes**:
   - `user.info.basic` (get account info)
   - `video.list` (get your videos)
   - `video.insights` (get video stats)
3. Submit for review

**Note**: TikTok will email you within 1-7 days with approval/feedback.

### Step 3: Get Credentials (once approved)
Once approved, you'll have:
- **Client ID**
- **Client Secret**
- **Access Token** (for your account)

**You now have**:
- `TIKTOK_CLIENT_ID` ✅
- `TIKTOK_CLIENT_SECRET` ✅
- `TIKTOK_ACCESS_TOKEN` ✅

---

## Summary: Save These Somewhere Safe

Once you've completed all steps, you'll have:

```
YOUTUBE_API_KEY = "AIza..."
SPOTIFY_CLIENT_ID = "abc123..."
SPOTIFY_CLIENT_SECRET = "xyz789..."
INSTAGRAM_ACCESS_TOKEN = "IGQVRlcm..."
TIKTOK_CLIENT_ID = "tiktok_abc..."
TIKTOK_CLIENT_SECRET = "tiktok_xyz..."
TIKTOK_ACCESS_TOKEN = "access_token_abc..."
```

### How to Share Them with Me Safely
1. **Do NOT paste them in Discord** (security risk)
2. Instead, save them in a file: `~/.openclaw-odin/workspace/.env.artist`
3. Format:
```
YOUTUBE_API_KEY=your_key_here
SPOTIFY_CLIENT_ID=your_id_here
SPOTIFY_CLIENT_SECRET=your_secret_here
INSTAGRAM_ACCESS_TOKEN=your_token_here
TIKTOK_CLIENT_ID=your_id_here
TIKTOK_CLIENT_SECRET=your_secret_here
TIKTOK_ACCESS_TOKEN=your_token_here
```
4. Tell me: "API keys saved in .env.artist, ready to go"
5. I'll read them from the file (no paste needed)

---

## What Each Platform Gives Us

### YouTube
✅ Subscriber count + growth  
✅ Total channel views + weekly views  
✅ Top videos (title, views, likes, comments)  
✅ Upload frequency  
✅ Audience retention %

### Spotify
✅ Follower count + growth  
✅ Monthly listeners  
✅ Top 3 tracks by streams  
✅ Playlist placements  
✅ Weekly/monthly streams

### Instagram
✅ Follower count  
✅ Post engagement (likes, comments, shares)  
✅ Stories performance  
✅ Account reach + impressions  
✅ Best posting times (if profile is business)  
✅ Top posts (which get most traction)

### TikTok
✅ Follower count  
✅ Total video views  
✅ Top videos (view count, engagement)  
✅ Engagement rate  
✅ Best posting times  
✅ Trending sounds you use (helps with recommendations)

---

## Timeline for Dashboard Live

1. **This week**: You get API keys
2. **Week 2**: I integrate all 4 platforms into dashboard
3. **Week 3**: Daily posts with all metrics (YouTube + Spotify + Instagram + TikTok)
4. **Week 4**: Add insights + recommendations (best posting times, collab opportunities)

---

## Troubleshooting

**"YouTube API key not working"**
- Make sure YouTube Data API v3 is **enabled** in Google Cloud Console
- API keys can take 5 min to activate

**"Instagram token expired"**
- Instagram short-lived tokens expire in ~1 hour
- We'll set up automatic refresh (you just need to grant permission once)
- Or request long-lived token (valid 60 days, needs more setup)

**"TikTok approval pending"**
- This is normal. Check your email for updates.
- In the meantime, we'll build the dashboard with YouTube, Spotify, Instagram
- Add TikTok as soon as approval comes through

**"Spotify API slow?"**
- Sometimes the Spotify API rate-limits if we ask too much too fast
- We'll batch requests smartly (cache data when possible)

---

## Next: Tell Me When Ready

Once you've completed all 4 steps:
1. Save credentials to `~/.openclaw-odin/workspace/.env.artist`
2. Message: "API keys ready"
3. I'll start building the dashboard immediately

No rush — take your time getting the keys. Quality > speed.
