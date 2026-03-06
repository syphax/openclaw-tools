# Project Spec: "The Rex Edge" Daily Brief (V1.0)

**Objective:** Build an automated system that collects raw data from various sources including social platforms and sports results, synthesizes them into an insight-rich "Daily Digest," and delivers them headlessly across Email, WhatsApp, and Telegram.

---

## 1. Data Collection (The Hunt)
*   **LinkedIn & Reddit Keyword Scan:** 
    *   **Post Permalinks:** Must extract the *unique* permalink for each post (e.g., `https://www.linkedin.com/feed/update/urn:li:activity:ID/`). Avoid company or profile page links.
    *   **External Content:** Identify and extract "Share" links or external article URLs embedded *within* the posts.
    *   **Context:** Capture at least the first 500 characters of post text for synthesis.
    *   **Timing:** Search for content that is new since the last successful run, as indicated in the `social-search-config.md` file.
*   **Reddit Pulse:**
    *   **Thematic Sweep:** Peek at the "Top" posts across a specific set of subreddits (for example: **r/openclaw, r/vermont, r/agrivoltaics, r/concept2, r/safc, r/trackandfield**). These are specified in the `reddit-pulse-config.md` file.
    *   **Thread Mapping:** Capture the direct URL to the post.
    *   **Timing:** Search for content that is from the period specified in the `reddit-pulse-config.md` file, e.g. "default_period": "day". The script must also accomodate ad-hoc time intervals as command-line arguments, expressed in days.
*   **Sports Desk:**
    *   **Yesterday & Today:** Specifically scrape `flashscore.com` (mobile) for **Yesterday (d=-1)** results and **Today (d=0)** fixtures.
    *   **Multi-Sport Awareness:** Must check specific sub-pages for Basketball, Baseball, and Hockey to ensure US teams are captured.

Information about sites, keywords, subreddits, sports teams, etc. are stored in this repo (openclaw-tools):
*   `skills/social-searcher/cfg/reddit-pulse-config.md` - This defines which subreddits to scan, and over what default time period
*   `skills/social-searcher/cfg/social-search-config.md` - This specifies LinkedIn keywords and Reddit sub-reddit/keyword sets to search. It also includes checkpoints for the last search event.
*   `skills/social-searcher/cfg/sports-config.md` - This lists teams and relevant attributes (e.g. league, sport, country)

---

## 2. Synthesis Engine (The Rex Edge)
*   **Keyword search roundup:** (Static Title) Synthesize 8-10 entries from the hunt results. For each, provide a 1-2 sentence description of *why* it’s relevant. For each entry, indicate whether the source was LinkedIn or Reddit, using logos for each, or if that's at all problematic, [LI] and [R] signifiers.
    ** For LinkedIn, include the author (person or organization), the link to the post, and optionally any links to external articles. 
    ** For reddit results, include the subreddit name and the link to the post.
*   **Reddit Pulse:** Synthesize the "Vibe" of each sub. Group activity into 2-3 distinct "Themes". But do provide links to the specific threads that are driving the vibe.
*   **Sports Desk:** 
    *   Label results as clear **WIN, LOSS, or DRAW**.
    *   Include Scores (e.g., 114-106).
    *   List **Upcoming Times** for games scheduled for the day of the digest.
    *   Collapse inactive teams (no results or upcoming games) into a single line: "Quiet Stadium: [Teams]."

---

## 3. Delivery Logic
*   **Headless Gmail:**
    *   **Backend:** Must use `gog` CLI with the `file` backend and `GOG_KEYRING_PASSWORD`. **Prohibited:** macOS `keychain` backend (dialog prevention).
    *   **Formatting:** You MUST use **HTML `<a>` tags** for all hyperlinks. Markdown will not be accepted. 
*   **Mobile (WhatsApp/Telegram):** Standard synthesis with clean Markdown formatting.
*   **Scheduling:** 6:30 AM EST sharp. No fallbacks—if a channel is down, log the failure and proceed to the next.


## Addendum #1 (Feb 23, 2026)

* Email subject should be: 🦖 Rex Daily Brief: [Date]
* The Reddit pulse links should be listed as bullets under each entry with the post title as the link text, instead of a list of links that all say "Thread"

## Addendum #2 (March 5, 2026)

### News balance

Currently, r/openclaw seems to dominate the keyword and Reddit pulse results. While this is likely a function of activity and voting in this subreddit, I don't want any single subreddit to dominate the results. 

### Links

The links in the WhatsApp version are not clean. They look like markdown format- [text](URL), but in the message I see those literals, and not a clickable link that says 'text'.

The Telegram links are A-OK.

Links generally are OK in the email version.

### Email title

For awhile, the email subject text obeyed the format above (🦖 Rex Daily Brief: [Date]), but that stopped after March 2nd. I prefer that format over a descriptive title.

### Sports update

Sports wrap-up: Currently, we have duplicates. inconsistent display of results, and some confusion about who the Celtics are (one update mentioned an upcoming game against Aberdeem, clearly referring to the Scottish football club Celtic).

Here's what I'd like:

* A section with results for the past 3 days, for all teams identified in the config file.
   * Label results as clear **WIN, LOSS, or DRAW**. 
    * Include Scores (e.g., 114-106).

* A section with upcoming games
    * List **Upcoming Times** for games scheduled for the day of the digest, and for the next 2 days (so: today, tomorrow, and the day after that)

* A brief list of the teams with no activity. 

I like this format (from the Feb 23 digest). Note that this example doesn't happen to have any upcoming games.

⚽ SPORTS DESK

CELTICS: WIN 🟢 (111-89 vs Lakers). Jaylen Brown handling business in LA. ☘️
RED SOX: WIN 🟢 (11-10 vs Blue Jays). ⚾️ High-scoring spring training win from yesterday.
SUNDERLAND: LOSS 🔴 (1-3 vs Fulham).

Quiet Stadium: Borussia Dortmund, Wrexham, and the Bruins had no active games yesterday.

### Implementation

Wherever possible, please encode specified functionality in code- Python or Typescript or whatever language is most suitable. This promotes consistency. At run-time, I'd like the LLM to focus on summarizing the news content. Section structure, link formation, etc. should be handled by code as much as possible. The LLM should focus on "color commentary."

