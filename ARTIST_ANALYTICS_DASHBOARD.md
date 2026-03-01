# Artist Analytics Dashboard — MVP Spec

**Status**: Building  
**Priority**: High (Artist Toolkit Foundation)  
**Channels**: #toolkit-development, #social-analytics

---

## Overview

Daily analytics dashboard for Bazzy's music career. Pulls real data from YouTube + Spotify, identifies trends, and recommends next steps.

**Goal**: Replace manual tracking. Give Bazzy clarity on what's working so he can focus on making better music, not spreadsheets.

---

## Data Sources

### YouTube (@mixedbybazzy)
**API**: YouTube Data API v3  
**Permissions**: Read-only (channel stats, video performance)

**Metrics**:
- Total subscribers (current, % change from last week)
- Total channel views (current, % change)
- Views this week (new views in last 7 days)
- Top 3 recent videos:
  - Title
  - Upload date
  - View count
  - Like count
  - Comment count
  - Average view duration (if available)
- Upload frequency (posts per week, average)
- Subscriber growth rate (weekly)

### Spotify (Artist ID: 6sNRIgWiyGwj7gikTGPaGb)
**API**: Spotify Web API  
**Permissions**: Read-only (artist profile, track data)

**Metrics**:
- Total followers (current, % change)
- Monthly listeners (current vs last month)
- Top 3 tracks (by play count):
  - Track name
  - Total plays
  - Recent plays (last 7 days)
  - Playlist adds
- Playlist placements (total count, new adds this week)
- Streams this week
- Listener demographics (if available)

### Instagram (@[your handle])
**API**: Instagram Graph API (Business Account)  
**Permissions**: Read-only (account stats, post performance)

**Metrics** (CRITICAL — your primary platform):
- Total followers (current, % change)
- Total post reach + impressions (this week)
- Top 3 recent posts:
  - Caption
  - Engagement (likes, comments, shares)
  - Reach (how many accounts saw it)
  - Saves (how many saved for later)
- Stories performance (if available)
- Best posting times (when followers are most active)
- Average engagement rate
- Follower growth rate (weekly)

### TikTok (@[your handle])
**API**: TikTok API (with user analytics)  
**Permissions**: Read-only (account stats, video performance)

**Metrics** (CRITICAL — your primary platform):
- Total followers (current, % change)
- Total video views (all-time, this week)
- Top 3 recent videos:
  - Video description
  - View count
  - Engagement (likes, comments, shares)
  - Completion rate (% who watched to end)
  - Shares/saves
- Video posting frequency
- Best posting times (when followers are most active)
- Trending sounds you've used
- Engagement rate (avg likes per view)
- Follower growth rate (weekly)

---

## Dashboard Layout (Discord-Friendly)

```
📊 ARTIST ANALYTICS DASHBOARD — March 1, 2026

🎬 INSTAGRAM (@handle) [PRIMARY]
├─ Followers: 8,450 (+2.3% WoW)
├─ Reach This Week: 12,300
├─ Avg Engagement Rate: 5.2%
├─ Top Post: [Caption] — 480 likes, 28 comments
├─ Best Post Time: Thursday 6 PM EST
└─ Trend: 📈 Growing

🎵 TIKTOK (@handle) [PRIMARY]
├─ Followers: 15,200 (+5.1% WoW) 
├─ Video Views: 342K total (67K this week)
├─ Top Video: [Sound + Caption] — 28K views, 1.2K likes
├─ Avg Completion Rate: 68%
├─ Best Post Time: Tuesday 7 PM + Friday 9 PM EST
└─ Trend: 📈🚀 Accelerating Fast

🎥 YOUTUBE (@mixedbybazzy)
├─ Subscribers: 1,250 (+3.2% WoW)
├─ Channel Views: 45,832 (+8.5% WoW)
├─ Views This Week: 3,421
├─ Top Video: "Song Title" — 1,250 views (87 likes)
└─ Trend: 📈 Steady Growth

🎵 SPOTIFY (Artist ID)
├─ Followers: 3,890 (+2.1% MoM)
├─ Monthly Listeners: 2,150 (+5.3% MoM)
├─ Top Track: "Song X" — 12.5K streams this week
├─ Playlist Adds: 8 new playlists
└─ Trend: 📈 Accelerating

📈 CROSS-PLATFORM INSIGHTS
├─ Strongest Platform: TikTok (growth + engagement)
├─ Best Format: Short-form video clips (TikTok/Instagram Reels)
├─ Momentum: 🚀 Accelerating (all platforms trending up)
├─ Collab Opportunity: [Artist Name] — 85% style match, trending on your content
└─ Recommendation: Release 15-sec TikTok version of new track, post Insta Reel Monday 6 PM

⚡ ACTION ITEMS THIS WEEK
├─ 🎯 Post 3 TikToks (Mon, Wed, Fri at 7 PM EST)
├─ 🎯 Post 2 Instagram Reels (Wed 6 PM, Sat 7 PM EST)
├─ ⚠️ Feature collab window open (reach out to [Artist])
└─ ✅ Trending sound identified: [Sound Name] — post within 48 hours for algorithm boost

PLATFORM FOCUS: TikTok + Instagram (68% of your growth)
```

---

## MVP Features (Phase 1)

1. **Daily Dashboard Post** (8 AM EST)
   - Auto-fetch **Instagram + TikTok** (primary) + YouTube + Spotify
   - Generate summary + insights (cross-platform view)
   - Post to #social-analytics
   - Format for Discord (no tables, emoji-based)
   - **Highlight**: Which platform is driving growth? (TikTok vs Instagram vs YouTube)

2. **Trend Detection**
   - Week-over-week growth % (each platform)
   - Month-over-month momentum (all platforms)
   - Identify which content types are trending (short-form vs long-form vs audio)
   - Flag anomalies (unusual growth spikes, engagement drops)
   - **Highlight**: Cross-platform patterns (e.g., "TikTok video went viral, no Insta repost = lost reach")

3. **Platform-Specific Recommendations**
   - **TikTok**: "Post at 7 PM — that's when 68% of your followers are online"
   - **Instagram**: "Thursday 6 PM is your peak engagement time — don't post Friday"
   - **YouTube**: "Longer videos (6-10 min) get better watch time than short clips"
   - **Spotify**: "This track is in 12 new playlists — push it on social"
   - **Collab opportunity**: "Artist X matches your TikTok audience — high collab potential"

---

## Phase 2 Features (Stretch)

1. **Interactive Dashboard** (embed in Discord or web)
   - Real-time metrics (no refresh delay)
   - 30-day, 90-day, 1-year views
   - Comparison (YouTube vs Spotify growth)
   - Export to CSV

2. **Predictive Insights**
   - ML model: predict which future tracks will perform well
   - Recommend release timing based on historical data
   - Estimate growth trajectory (6-month forecast)

3. **Fan Segmentation**
   - Which playlists are adding your music?
   - Listener geography (YouTube Analytics)
   - Identify high-value fans (repeat listeners)

4. **Integration with Collab Finder**
   - Auto-match collaborators based on growth trajectory
   - Suggest features that would diversify your audience

---

## Technical Stack

### Backend
- **Language**: Python (OpenClaw agent)
- **APIs**:
  - YouTube API: google-auth-oauthlib, google-api-python-client
  - Spotify API: spotipy
  - Instagram Graph API: requests library (simple HTTP)
  - TikTok API: requests library (simple HTTP)
- **Data Storage**: Workspace JSON file (tracks last 30 days)
- **Cron**: OpenClaw native (8 AM EST daily)

### Output
- Discord message (via message tool)
- Optional: CSV export to workspace

### Authentication
- **YouTube**: API key (no OAuth needed for public channel)
- **Spotify**: API key (free tier works for public artist data)
- **Instagram**: Access token (OAuth, need to grant permission once)
- **TikTok**: Access token + API credentials (OAuth, need to grant permission once)

---

## Success Metrics

- **MVP Complete**: Daily dashboard posts 7 days in a row with no errors
- **Accuracy**: YouTube + Spotify data matches official dashboards
- **Insight Quality**: At least 1 actionable recommendation per day
- **Engagement**: You act on 3+ recommendations per month

---

## Implementation Timeline

**Week 1 (March 1-7): API Setup + Initial Build**
- You set up all 4 API keys (YouTube, Spotify, Instagram, TikTok)
- I build data fetcher for all platforms
- Create dashboard formatter (emoji-friendly)
- Deploy cron job to #social-analytics
- Run test 1 day

**Week 2 (March 8-14): Refinement + Full Testing**
- Full week of daily dashboard posts
- Refine based on real data
- Add cross-platform comparisons
- Add platform-specific insights

**Week 3 (March 15-21): Trend Detection + Optimization**
- Add trend detection (week-over-week, month-over-month)
- Flag anomalies + patterns
- Optimize posting times based on your real data
- Add recommendation engine

**Week 4+ (Phase 2): Advanced Features**
- Web dashboard (if needed)
- Predictive features (which content will perform well)
- Competitor analysis (how you compare to similar artists)
- Automated content suggestions (what to post when)

---

## API Setup Checklist

See `API_SETUP_GUIDE.md` in workspace for step-by-step instructions.

**Quick Checklist**:

- [ ] YouTube API key (Google Cloud Console)
- [ ] Spotify Client ID + Secret (developer.spotify.com)
- [ ] Instagram Access Token (Facebook/Instagram Graph API)
- [ ] TikTok Client ID + Secret + Access Token (developers.tiktok.com)

**Timeline**: 15-30 min to get all 4

**How to Share with Me**:
1. Create file: `~/.openclaw-odin/workspace/.env.artist`
2. Add all credentials (format in API_SETUP_GUIDE.md)
3. Tell me: "API keys ready in .env.artist"
4. I read them securely from file

---

## Next Steps

1. **Give me the go-ahead** to set up API keys
2. **Share any preferences**: 
   - What metrics matter most to you?
   - Any specific insights you need?
3. **Define success**: What would make this dashboard useful enough that you check it every day?

---

_This is the foundation for the entire Artist Toolkit. Get this right, and everything else (content scheduler, fan bot, collab finder) plugs into it._
