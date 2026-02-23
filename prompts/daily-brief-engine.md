# Project Spec: "The Rex Edge" Social & Sports Engine (V1.0)

**Objective:** Build an automated system that collects raw data from social platforms and sports results, synthesizes them into an insight-rich "Daily Digest," and delivers them headlessly across Email, WhatsApp, and Telegram.

---

## 1. Data Collection (The Hunt)
*   **LinkedIn Scrape:** 
    *   **Post Permalinks:** Must extract the *unique* permalink for each post (e.g., `https://www.linkedin.com/feed/update/urn:li:activity:ID/`). Avoid company or profile page links.
    *   **External Content:** Identify and extract "Share" links or external article URLs embedded *within* the posts.
    *   **Context:** Capture at least the first 300 characters of post text for synthesis.
*   **Reddit Pulse:**
    *   **Thematic Sweep:** Peek at the "Top" posts for the last 24h across a specific set of subreddits (**r/openclaw, r/vermont, r/agrivoltaics, r/concept2, r/safc, r/trackandfield**).
    *   **Thread Mapping:** Capture the direct URL to the thread and the top 2-3 most upvoted comments.
*   **Sports Desk:**
    *   **Yesterday & Today:** Specifically scrape `flashscore.com` (mobile) for **Yesterday (d=-1)** results and **Today (d=0)** fixtures.
    *   **Multi-Sport Awareness:** Must check specific sub-pages for Basketball, Baseball, and Hockey to ensure US teams are captured.
    *   **Strict Roster:** Only Borussia Dortmund, Sunderland AFC, Wrexham, Red Sox, Bruins, and Celtics.

---

## 2. Synthesis Engine (The Rex Edge)
*   **Keyword search roundup:** (Static Title) Synthesize 8-10 entries from the hunt results. For each, provide a 1-2 sentence description of *why* it’s relevant.
*   **Reddit Pulse:** Synthesize the "Vibe" of each sub. Group activity into 2-3 distinct "Themes" rather than listing posts.
*   **Sports Desk:** 
    *   Label results as clear **WIN, LOSS, or DRAW**.
    *   Include Scores (e.g., 114-106).
    *   List **Upcoming Times** for games scheduled for the day of the digest.
    *   Collapse inactive teams into a single line: "Quiet Stadium: [Teams]."

---

## 3. Delivery Logic (Silent Pigeons)
*   **Headless Gmail:**
    *   **Backend:** Must use `gog` CLI with the `file` backend and `GOG_KEYRING_PASSWORD`. **Prohibited:** macOS `keychain` backend (dialog prevention).
    *   **Formatting:** You MUST use **HTML `<a>` tags** for all hyperlinks. Markdown will not be accepted. 
*   **Mobile (WhatsApp/Telegram):** Standard synthesis with clean Markdown formatting.
*   **Scheduling:** 6:30 AM EST sharp. No fallbacks—if a channel is down, log the failure and proceed to the next.
