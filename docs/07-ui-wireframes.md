# UI Wireframes & Dashboard Layout
# Vet AI Operating System
**Version:** 1.0.0

---

## 1. Overall Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TOP NAVIGATION BAR                                                     │
│  [VetOS Logo]  [Hospital Switcher ▼]     [Search Bar]  [🔔] [Avatar]  │
├──────────┬──────────────────────────────────────────────────────────────┤
│          │                                                               │
│  SIDEBAR │  MAIN CONTENT AREA                                           │
│  (240px) │  (full width, scrollable)                                    │
│          │                                                               │
│  Nav     │                                                               │
│  Items   │                                                               │
│          │                                                               │
│          │                                                               │
│          │                                                               │
│          │                                                               │
│  [AI     │                                                               │
│  Chat    │                                                               │
│  Toggle] │                                                               │
└──────────┴──────────────────────────────────────────────────────────────┘
                                        │
                              AI SIDEBAR (360px)
                              slides in from right
                              when AI chat is open
```

---

## 2. Sidebar Navigation

```
┌──────────────────┐
│  🏥 VetOS        │
│  ──────────────  │
│                  │
│  MAIN            │
│  🏠 Dashboard    │
│  🤖 AI Assistant │
│  🔔 Notifications│
│                  │
│  OPERATIONS      │
│  📅 Calendar     │
│  💬 Communicate  │
│  📋 Projects     │
│  ⚡ Workflows    │
│                  │
│  KNOWLEDGE       │
│  🔍 Knowledge    │
│     Base         │
│  📄 Documents    │
│  🎓 Training     │
│  🖼️ Assets       │
│                  │
│  ANALYTICS       │
│  📊 KPI          │
│     Dashboard    │
│                  │
│  ADMIN           │
│  ⚙️ Settings     │
│  👥 Users        │
│  📋 Audit Log    │
│  (admin only)    │
│                  │
│  ──────────────  │
│  🤖 Ask VetOS    │
│  [open AI chat]  │
└──────────────────┘
```

---

## 3. Home Dashboard

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Good morning, Dr. Hall 👋  |  Town & Country Veterinary              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  TODAY'S OVERVIEW                              Thursday, June 5, 2026  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ 📅 CALENDAR  │ │ ✅ MY TASKS  │ │ 📬 REQUESTS  │ │ 🎓 TRAINING  │  │
│  │              │ │              │ │              │ │              │  │
│  │ 3 events     │ │ 5 due today  │ │ 2 pending    │ │ 1 overdue    │  │
│  │ today        │ │              │ │              │ │              │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
│                                                                         │
│  TODAY'S SCHEDULE                           RECENT ANNOUNCEMENTS       │
│  ┌───────────────────────────────────┐     ┌────────────────────────┐  │
│  │ 10:00 AM  Doctor Meeting          │     │ 📢 Online Pharmacy      │  │
│  │           Conference Room B       │     │    Launch - June 15     │  │
│  │                                   │     │    3 days ago           │  │
│  │ 12:00 PM  Lunch Break             │     │                        │  │
│  │                                   │     │ 📢 New SOP: After-Hours │  │
│  │  2:00 PM  Leadership Meeting      │     │    Emergency Protocol   │  │
│  │           Dr. Hall, Haley         │     │    5 days ago           │  │
│  │                                   │     │                        │  │
│  │ CPR Training → Tomorrow 2 PM      │     │ 📢 Manager Offsite -    │  │
│  │ Manager Offsite → Next week       │     │    June 10-11           │  │
│  └───────────────────────────────────┘     └────────────────────────┘  │
│                                                                         │
│  MY ACTIVE TASKS                           TEAM ACTIVITY               │
│  ┌───────────────────────────────────┐     ┌────────────────────────┐  │
│  │ □ Review Q2 training completion   │     │ Haley posted in #ops   │  │
│  │   Due: Today  ● High              │     │ 5 min ago              │  │
│  │                                   │     │                        │  │
│  │ □ Online Pharmacy launch checklist│     │ Brian updated task     │  │
│  │   Due: June 10  ● Medium          │     │ "Marketing Assets"     │  │
│  │                                   │     │ 12 min ago             │  │
│  │ □ Staff handbook review           │     │                        │  │
│  │   Due: June 15  ○ Low             │     │ New request submitted  │  │
│  │                                   │     │ "Business Cards - Kim" │  │
│  │  [View all tasks →]               │     │ 1 hour ago             │  │
│  └───────────────────────────────────┘     └────────────────────────┘  │
│                                                                         │
│  TRAINING PROGRESS                         QUICK ACTIONS               │
│  ┌───────────────────────────────────┐     ┌────────────────────────┐  │
│  │ Blood Machine Training  ████░ 75% │     │ [+ New Event]          │  │
│  │ OSHA Refresher 2026     ██░░░ 40% │     │ [+ New Task]           │  │
│  │ Onboarding Module       █████100% │     │ [Submit Request]       │  │
│  │                    [View all →]   │     │ [Ask AI Assistant]     │  │
│  └───────────────────────────────────┘     └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Master Calendar View

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Master Calendar                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ [← Prev]  June 2026  [Next →]   [Day] [Week] [Month] [Agenda]   │  │
│  │                                                                  │  │
│  │ FILTER BY:  [All Hospitals ▼] [All Types ▼] [All Departments ▼] │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───┬───┬───┬───┬───┬───┬───┐                                         │
│  │SUN│MON│TUE│WED│THU│FRI│SAT│                                         │
│  ├───┼───┼───┼───┼───┼───┼───┤                                         │
│  │   │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │                                         │
│  │   │   │   │   │   │🟦 │   │                                         │
│  │   │   │   │   │   │Dr │   │                                         │
│  │   │   │   │   │   │Mtg│   │                                         │
│  ├───┼───┼───┼───┼───┼───┼───┤                                         │
│  │ 7 │ 8 │ 9 │10 │11 │12 │13 │                                         │
│  │   │🟩 │   │🟥 │   │🟨 │   │                                         │
│  │   │Mgr│   │Phm│   │CPR│   │                                         │
│  │   │Mtg│   │Lnc│   │Trn│   │                                         │
│  ├───┼───┼───┼───┼───┼───┼───┤                                         │
│                                                                         │
│  Legend: 🟦 Doctor Meeting  🟩 Manager  🟥 Hospital Event  🟨 Training  │
│          🟧 PTO  ⬜ Other                                               │
│                                                                         │
│                              [+ Add Event]  [Sync Outlook]             │
│                                                                         │
│  ⚠️  CONFLICT: Dr. Smith — June 12 has 2 overlapping events            │
│     [View Details] [Dismiss]                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. AI Assistant Sidebar

```
                              ┌────────────────────────────────┐
                              │  🤖 VetOS AI Assistant         │
                              │  [×]                           │
                              ├────────────────────────────────┤
                              │  Conversations                 │
                              │  > Today's schedule           │
                              │  > OSHA training dates         │
                              │  > Emergency protocol          │
                              │  [+ New Conversation]          │
                              ├────────────────────────────────┤
                              │                                │
                              │  ┌──────────────────────────┐ │
                              │  │ 🤖 Hello Dr. Hall! I can  │ │
                              │  │ help you find information  │ │
                              │  │ from our internal docs,   │ │
                              │  │ SOPs, and schedules.      │ │
                              │  └──────────────────────────┘ │
                              │                                │
                              │  ┌──────────────────────────┐ │
                              │  │ 👤 When is the next CPR  │ │
                              │  │ training?                 │ │
                              │  └──────────────────────────┘ │
                              │                                │
                              │  ┌──────────────────────────┐ │
                              │  │ 🤖 The next CPR Training  │ │
                              │  │ is scheduled for:         │ │
                              │  │                           │ │
                              │  │ **June 12, 2026**         │ │
                              │  │ 2:00 PM - 4:00 PM         │ │
                              │  │ Training Room A           │ │
                              │  │                           │ │
                              │  │ Required for: All staff   │ │
                              │  │                           │ │
                              │  │ Source: Master Calendar   │ │
                              │  │ 👍 👎                     │ │
                              │  └──────────────────────────┘ │
                              │                                │
                              ├────────────────────────────────┤
                              │  ┌──────────────────────────┐ │
                              │  │ Ask anything...    🎙️ ↑  │ │
                              │  └──────────────────────────┘ │
                              │  Suggested:                    │
                              │  • What SOPs are updated?     │
                              │  • Who is on PTO this week?   │
                              └────────────────────────────────┘
```

---

## 6. Knowledge Base

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Knowledge Base                                    [+ New Article]      │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 🔍 Search articles, SOPs, procedures, policies...    [Search]    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────────────────────────────────┐  │
│  │  CATEGORIES     │  │  ARTICLES                                   │  │
│  │                 │  │  ┌──────────────────────────────────────┐   │  │
│  │  📋 SOPs (23)   │  │  │ Emergency Protocol - After Hours     │   │  │
│  │  📚 Handbooks(5)│  │  │ Updated 3 days ago • Practice Mgmt  │   │  │
│  │  🏥 Procedures  │  │  │ Tags: emergency, protocol, after-hours│  │  │
│  │     (18)        │  │  └──────────────────────────────────────┘   │  │
│  │  ⚖️ Policies(12)│  │  ┌──────────────────────────────────────┐   │  │
│  │  📣 Newsletter  │  │  │ OSHA Compliance Checklist 2026       │   │  │
│  │     Archive(47) │  │  │ Updated 1 week ago • HR / Compliance │   │  │
│  │  🎓 Training    │  │  └──────────────────────────────────────┘   │  │
│  │     Guides (31) │  │  ┌──────────────────────────────────────┐   │  │
│  │                 │  │  │ Blood Machine Operating Manual       │   │  │
│  │  + Add Category │  │  │ Updated 2 weeks ago • Clinical Staff │   │  │
│  └─────────────────┘  │  └──────────────────────────────────────┘   │  │
│                        │                               [Load more]   │  │
│                        └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Team Communication

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CHANNELS                  │  #ops-town-and-country                    │
│  ──────────────────────    │  ──────────────────────────────────────   │
│  🏥 Town & Country         │                                           │
│  # general             ●  │  Haley  10:23 AM                          │
│  # ops                 ●  │  Just confirmed - OSHA training moved to  │
│  # announcements           │  Friday June 12 at 9 AM. Please update   │
│  # doctors                 │  your calendars.                          │
│  # marketing               │                                           │
│                            │  Dr. Hall  10:31 AM                       │
│  🏥 Columbia Pike          │  Thanks Haley! Will it be in-person or    │
│  # general                 │  remote?                     [👍1] [❤️1]  │
│  # ops                     │                                           │
│  # announcements           │  Haley  10:33 AM                          │
│                            │  In-person - Training Room A              │
│  🏥 Clifton                │  📎 OSHA_Training_Agenda.pdf              │
│  # general                 │                                           │
│                            │  ────────────────── Today ──────────────  │
│  DIRECT MESSAGES           │                                           │
│  💬 Haley M.           ●  │  Brian  2:15 PM                            │
│  💬 Brian T.               │  @channel Reminder: Online Pharmacy       │
│  💬 Dr. Smith              │  launch meeting tomorrow at 2 PM!         │
│                            │                                           │
│  [+ Add Channel]           ├───────────────────────────────────────────│
│                            │  ┌─────────────────────────────────────┐  │
│                            │  │ Message #ops                  📎 😊│  │
│                            │  └─────────────────────────────────────┘  │
└────────────────────────────┴───────────────────────────────────────────┘
```

---

## 8. Training Module (LMS)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Training                                                               │
│                                                                         │
│  MY COURSES                                    Overall Progress: 68%    │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                                                                    │ │
│  │  ┌───────────────────────────────┐  ┌───────────────────────────┐ │ │
│  │  │ 🩺 Blood Machine Training     │  │ ⚠️  OSHA Compliance 2026  │ │ │
│  │  │ ████████████░░░░ 75%          │  │ ████░░░░░░░░░░░░ 25%      │ │ │
│  │  │ 6/8 lessons complete           │  │ 2/8 lessons complete       │ │ │
│  │  │ Due: June 20                  │  │ Due: June 15 ⚠️ OVERDUE   │ │ │
│  │  │ [Continue →]                  │  │ [Start Now →]              │ │ │
│  │  └───────────────────────────────┘  └───────────────────────────┘ │ │
│  │                                                                    │ │
│  │  ┌───────────────────────────────┐  ┌───────────────────────────┐ │ │
│  │  │ ✅ New Employee Orientation   │  │ 🏥 Hospital Safety 2026   │ │ │
│  │  │ ████████████████ 100%         │  │ Not started               │ │ │
│  │  │ Completed May 15, 2026        │  │ Assigned June 1           │ │ │
│  │  │ 🏆 Certificate Earned         │  │ [Begin →]                 │ │ │
│  │  └───────────────────────────────┘  └───────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  AVAILABLE COURSES (not yet assigned)                                   │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Client Communication Excellence  •  Estimated: 2 hours           │ │
│  │  [Enroll]                                                          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Workflow Request Portal

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Workflow Requests                            [+ Submit New Request]    │
│                                                                         │
│  REQUEST TYPES                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 💼       │ │ 👕       │ │ 🔧       │ │ 💻       │ │ 📋       │    │
│  │ Business │ │ Uniform  │ │ Mainten- │ │ IT       │ │ Other    │    │
│  │ Cards    │ │ Request  │ │ ance     │ │ Support  │ │ Request  │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│                                                                         │
│  MY REQUESTS                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ #2024  Business Cards — Dr. Hall         🟡 In Review            │  │
│  │        Submitted June 3, 2026 • Pending: Haley M. approval       │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ #2019  Uniform Order — Size M Scrubs     🟢 Approved             │  │
│  │        Submitted May 28 • Approved by Admin on May 30            │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ #2011  Maintenance — Exam Room 3 Light   ✅ Completed             │  │
│  │        Submitted May 20 • Completed May 25                       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ─────── MANAGER VIEW: PENDING APPROVAL QUEUE ───────────────────────  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ #2025  Uniform Request — Kim S.          [Approve] [Reject]      │  │
│  │ #2024  Business Cards — Dr. Hall         [Approve] [Reject]      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 10. KPI Dashboard

```
┌─────────────────────────────────────────────────────────────────────────┐
│  KPI Dashboard          [All Hospitals ▼]  [June 2026 ▼]  [Export CSV] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ORG-WIDE METRICS                                                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ 📚 TRAINING  │ │ 📬 REQUESTS  │ │ 📅 EVENTS    │ │ 👥 ACTIVE    │  │
│  │              │ │              │ │              │ │    USERS     │  │
│  │    78%       │ │    94        │ │    47        │ │    156       │  │
│  │ completion   │ │ this month   │ │ this month   │ │ this month   │  │
│  │ ↑ 12% vs May │ │ ↓ 3% vs May  │ │ ↑ 8% vs May  │ │ ↑ 5% vs May  │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
│                                                                         │
│  TRAINING COMPLETION BY HOSPITAL             REQUESTS BY TYPE          │
│  ┌──────────────────────────────────┐  ┌──────────────────────────┐   │
│  │  Town & Country    ████████ 82%  │  │ Business Cards  ■■■■ 32  │   │
│  │  Columbia Pike     ██████░ 71%   │  │ Uniforms        ■■■ 28   │   │
│  │  Clifton           ███████░ 79%  │  │ Maintenance     ■■ 19    │   │
│  │                                  │  │ IT Support      ■■ 15    │   │
│  └──────────────────────────────────┘  └──────────────────────────┘   │
│                                                                         │
│  CALENDAR ACTIVITY (events per week)         OVERDUE TRAINING           │
│  ┌──────────────────────────────────┐  ┌──────────────────────────┐   │
│  │  ▄ ▄ ▄ █ ▄ ▄ ▄ █ ▄ █ ▄ ▄ █ ▄  │  │ OSHA 2026  •  12 staff   │   │
│  │  w1 w2 w3 w4 w5 w6 w7 w8 w9 w10│  │ Bloodborne •   8 staff   │   │
│  └──────────────────────────────────┘  │ View details →           │   │
│                                         └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Admin Panel - User Management

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Administration > Users                        [+ Invite User]          │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 🔍 Search users...   [All Hospitals ▼] [All Roles ▼] [Active ▼] │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────┬────────────────────┬────────────┬──────────────┬──────────┐  │
│  │ AVATAR│ NAME              │ ROLE       │ HOSPITAL     │ ACTIONS  │  │
│  ├──────┼────────────────────┼────────────┼──────────────┼──────────┤  │
│  │  👤  │ Dr. James Hall     │ Doctor     │ Town &       │ [Edit]   │  │
│  │      │ dr.hall@vet.com    │            │ Country      │ [•••]    │  │
│  ├──────┼────────────────────┼────────────┼──────────────┼──────────┤  │
│  │  👤  │ Haley Morrison     │ Practice   │ Town &       │ [Edit]   │  │
│  │      │ haley@vet.com      │ Manager    │ Country      │ [•••]    │  │
│  ├──────┼────────────────────┼────────────┼──────────────┼──────────┤  │
│  │  👤  │ Brian Torres       │ Marketing  │ All          │ [Edit]   │  │
│  │      │ brian@vet.com      │ Manager    │ Hospitals    │ [•••]    │  │
│  ├──────┼────────────────────┼────────────┼──────────────┼──────────┤  │
│  │  👤  │ Kim Sanders        │ CSR        │ Columbia     │ [Edit]   │  │
│  │      │ kim@vet.com        │            │ Pike         │ [•••]    │  │
│  └──────┴────────────────────┴────────────┴──────────────┴──────────┘  │
│                                                                         │
│  Showing 1-20 of 156 users                    [← Prev]  [1] [2] [3] [Next →] │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Mobile Responsive Design

On mobile (< 768px):
- Sidebar collapses to bottom tab bar (5 primary tabs: Home, Calendar, Chat, AI, More)
- Cards stack vertically
- Calendar switches to agenda view by default
- AI assistant opens as full-screen overlay
- Chat is full-screen when open

---

## 13. Design System

**Colors:**
```
Primary:    #2563EB  (Blue 600 — primary actions)
Secondary:  #7C3AED  (Violet 600 — AI elements)
Success:    #16A34A  (Green 600)
Warning:    #D97706  (Amber 600)
Danger:     #DC2626  (Red 600)
Background: #F8FAFC  (Slate 50 — main bg)
Surface:    #FFFFFF  (white — cards)
Border:     #E2E8F0  (Slate 200)
Text:       #0F172A  (Slate 900 — primary)
Muted:      #64748B  (Slate 500)
```

**Hospital Brand Colors (for calendar events):**
```
Town & Country:  #2563EB  (Blue)
Columbia Pike:   #16A34A  (Green)
Clifton:         #D97706  (Amber)
```

**Typography:**
```
Font: Inter (Google Fonts)
H1: 2rem / 700 weight
H2: 1.5rem / 600 weight
H3: 1.25rem / 600 weight
Body: 0.875rem / 400 weight
Small: 0.75rem / 400 weight
```

**Spacing:** 4px base unit (Tailwind default)
**Radius:** 8px for cards, 6px for inputs, 4px for badges
**Shadows:** Shadcn UI defaults
