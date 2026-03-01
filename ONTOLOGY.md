# ONTOLOGY.md — Bazzy's Knowledge Graph

Structured tracking of all music projects, IT initiatives, and career goals.

## MUSIC CATALOG

### Track Entity
- **id**: track_001
- **title**: _(song name)_
- **genre**: R&B | Pop | Rap
- **status**: Draft | In Progress | Recorded | Mixed | Released
- **release_date**: _(ISO 8601)_
- **bpm**: _(tempo)_
- **key**: _(musical key)_
- **featuring**: _(artists involved)_
- **tags**: _(style tags, e.g., #lofi, #upbeat, #soulful)_
- **performance**:
  - spotify_streams: _(number)_
  - youtube_views: _(number)_
  - likes: _(engagement)_
  - playlist_adds: _(count)_
- **notes**: _(creative direction, inspiration, production notes)_

### Studio Session Entity
- **id**: session_001
- **date**: _(ISO 8601)_
- **tracks**: _(linked track ids)_
- **focus**: _(e.g., "vocal recording", "mixing", "mastering")_
- **collaborators**: _(featured artists, producers)_
- **notes**: _(what was accomplished, next steps)_

### Collaboration Entity
- **id**: collab_001
- **artist_name**: _(collaborator)_
- **genre**: _(their style)_
- **contact_info**: _(email, social)_
- **status**: Prospect | Outreached | In Talks | Accepted | Complete
- **potential_score**: 1-10 _(compatibility)_
- **notes**: _(why they match, what you want to make)_

---

## IT PROFESSIONAL TRACK

### Project Entity
- **id**: project_001
- **name**: _(project name)_
- **type**: Insurance Agent | Portfolio | Tool | Case Study
- **status**: Planned | In Progress | Beta | Deployed | Complete
- **tech_stack**: _(AWS, Lambda, FastAPI, etc.)_
- **owner**: _(Bazzy)_
- **deliverables**:
  - _(code repo, docs, blog post, video demo)_
- **metrics**:
  - accuracy: _(if applicable)_
  - performance: _(speed, cost, efficiency)_
  - impact: _(time saved, revenue impact, credibility gain)_
- **links**: _(GitHub, docs, deployment URL)_

### Content Entity
- **id**: content_001
- **type**: Blog | LinkedIn | Video | Tutorial | Case Study
- **title**: _(content name)_
- **status**: Draft | Scheduled | Published
- **publish_date**: _(ISO 8601)_
- **platform**: LinkedIn | Medium | GitHub | YouTube
- **topic**: _(AI in Insurance, Building Agents, etc.)_
- **url**: _(published link)_

### Certification/Learning Entity
- **id**: cert_001
- **name**: _(AWS Solutions Architect, etc.)_
- **status**: Not Started | In Progress | Complete
- **deadline**: _(target date)_
- **resources**: _(courses, books, projects to build)_
- **linked_projects**: _(projects that validate this cert)_

---

## INTEGRATED: ARTIST TOOLKIT

### Toolkit Feature Entity
- **id**: feature_001
- **name**: _(Content Scheduler, Analytics Dashboard, etc.)_
- **status**: Planned | Building | Testing | Live
- **description**: _(what it does)_
- **dependencies**: _(other features it needs)_
- **effort**: Small | Medium | Large
- **priority**: High | Medium | Low
- **notes**: _(design thoughts, API specs, integration notes)_

### Toolkit User/Beta Entity
- **id**: beta_001
- **artist_name**: _(user's name)_
- **genre**: _(their music style)_
- **status**: Active | Churned
- **feedback**: _(what they love, what they want)_
- **case_study**: _(results, metrics, testimonial)_

---

## RELATIONSHIPS (Linking Entities)

**Track → Studio Session**: Track was recorded in this session
**Track → Collaboration**: This collab artist is featured
**Collab → Content**: We wrote a case study about this collab
**Project → Content**: This blog/video documents the project
**Project → Certification**: This project demonstrates learning for cert
**Toolkit Feature → Track/Content**: Feature was used to create this

---

## QUICK QUERIES

**"Show all unreleased tracks"**
- Filter: Track.status != "Released"
- Order by: Track.date DESC

**"Show top performing tracks this month"**
- Filter: Track.release_date >= 2026-02-01
- Order by: spotify_streams DESC
- Limit: 5

**"Show my IT projects by status"**
- Filter: Project.owner = "Bazzy"
- Order by: Project.status, Project.priority DESC

**"Which artists have highest collab potential?"**
- Filter: Collab.status IN [Prospect, Outreached]
- Order by: Collab.potential_score DESC
- Limit: 10

**"What content is scheduled to publish?"**
- Filter: Content.status = "Scheduled"
- Order by: Content.publish_date ASC

---

## Implementation

This ontology will be queried by:
- Cron jobs (daily analytics, weekly content)
- Sub-agents (collab finder, portfolio builder)
- Discord bots (community engagement, task tracking)

As you add music, projects, and collaborations, maintain this structure. It's your source of truth.
