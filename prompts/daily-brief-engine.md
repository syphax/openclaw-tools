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