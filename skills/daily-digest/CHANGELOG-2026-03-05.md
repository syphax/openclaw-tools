# Daily Digest Pipeline: Deterministic Scaffolding Improvements
**Date:** 2026-03-05
**Implemented by:** Claude Code

## Summary

This update implements deterministic scaffolding for the daily digest pipeline, moving structure/formatting/selection logic into code while keeping the LLM focused on commentary and insight. All five goals from `/prompts/daily-brief-engine.md` lines 54+ have been addressed.

---

## Changes Implemented

### 1. **Subreddit Balancing (Fixes r/openclaw Dominance)**

**Problem:** r/openclaw was dominating both keyword hunt and Reddit pulse results.

**Solution:**
- Created `balanceHuntContent()` and `balanceRedditContent()` functions in `digest-utils.ts`
- Implements round-robin selection across sources/subreddits
- Default limits: max 10 total items, max 3 per source
- Ensures diverse content from multiple subreddits

**Code:**
```typescript
// digest-utils.ts - lines 64-143
export function balanceHuntContent(
  huntData: (LinkedInPost | RedditPost)[],
  maxTotal: number = 10,
  maxPerSource: number = 3
): BalancedContent
```

**Logging:** Added `logBalanceStats()` to show distribution before and after balancing.

---

### 2. **WhatsApp Link Rendering (Fixed Markdown Literals)**

**Problem:** WhatsApp displayed `[text](URL)` as literal text instead of clickable links.

**Solution:**
- Created separate formatting functions for each channel:
  - `formatWhatsAppLink()`: Returns `"Label: URL"` (WhatsApp auto-linkifies plain URLs)
  - `formatTelegramLink()`: Returns `"[Label](URL)"` (Telegram supports markdown)
  - `formatEmailLink()`: Returns `<a href="URL">Label</a>` (HTML for email)
- Rex-engine now generates 3 versions: email (HTML), WhatsApp (plain), Telegram (markdown)

**Code:**
```typescript
// rex-engine.ts - lines 155-175
function formatForWhatsApp(emailBody: string): string {
  return emailBody.replace(/<a href="([^"]+)">([^<]+)<\/a>/g, (_, url, text) => {
    return formatWhatsAppLink(text, url);
  }).replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/?[^>]+(>|$)/g, '');
}
```

---

### 3. **Email Subject Format Enforcement**

**Problem:** Email subject deviated from the preferred format: `🦖 Rex Daily Brief: YYYY-MM-DD`

**Solution:**
- Created `generateEmailSubject(date?: string)` function
- Enforces exact format deterministically
- No longer relies on LLM to generate subject line

**Code:**
```typescript
// digest-utils.ts - lines 191-197
export function generateEmailSubject(date?: string): string {
  const dateStr = date || new Date().toISOString().split('T')[0];
  return `🦖 Rex Daily Brief: ${dateStr}`;
}

// rex-engine.ts - line 263
const emailSubject = generateEmailSubject(date);
```

---

### 4. **Sports Section Deterministic Logic**

**Problem:** Duplicates, inconsistent results display, Celtics/Celtic confusion, missing date filtering.

**Solution:**
- Created `sports-utils.ts` with comprehensive sports formatting
- **Deduplication:** `deduplicateMatches()` prevents same match appearing multiple times
- **Disambiguation:** `getDisambiguatedTeamName()` handles Celtics (NBA) vs Celtic FC
- **Date filtering:**
  - `filterPastThreeDays()`: Shows only results from past 3 days
  - `filterNextTwoDays()`: Shows only upcoming games for today + next 2 days
- **Result formatting:**
  - Completed: `WIN/LOSS/DRAW` with emoji (🟢/🔴/🟡) and scores
  - Upcoming: Shows opponent, location (vs/@), and time
- **Quiet teams:** Teams with no activity listed in "🏟️ Quiet Stadium" section

**Code:**
```typescript
// sports-utils.ts - lines 87-171
export function buildSportsSection(sportsData: TeamSportsData[], useHtml: boolean = false): string

// Example output:
// CELTICS (NBA): WIN 🟢 (111-89 vs Lakers). vs Warriors at 20:00
// RED SOX: WIN 🟢 (11-10 vs Blue Jays)
// SUNDERLAND: LOSS 🔴 (1-3 vs Fulham)
//
// 🏟️ Quiet Stadium: Borussia Dortmund, Wrexham, Bruins
```

**Logging:** Added `logSportsStats()` to show team activity breakdown.

---

### 5. **LLM Focused on Commentary Only**

**Problem:** LLM was doing too much: selection, formatting, structure, AND commentary.

**Solution:**
- Created `preprocessDigestData()` to handle all deterministic logic BEFORE LLM sees data
- LLM now receives pre-selected, pre-balanced, pre-formatted data
- Updated LLM prompt to emphasize commentary and insight only
- LLM instructions explicitly state: "DO NOT re-select items or change the structure"

**Code:**
```typescript
// rex-engine.ts - lines 67-112
function preprocessDigestData(rawData: any): ProcessedDigestData {
  // 1. Balance hunt data
  // 2. Balance pulse data
  // 3. Build sports section deterministically
  return processedData;
}

// rex-engine.ts - lines 178-236
async function synthesize(rawData: any, processedData: ProcessedDigestData) {
  // Prompt emphasizes: "The structure, selection, and formatting have
  // ALREADY been done by code. Your job is to add COLOR COMMENTARY"
}
```

---

## Files Modified

1. **`digest-utils.ts`** (NEW)
   - Content balancing functions
   - Link formatting functions
   - Email subject generation
   - Logging utilities

2. **`sports-utils.ts`** (NEW)
   - Sports section deterministic logic
   - Deduplication, disambiguation, date filtering
   - Match formatting
   - Logging utilities

3. **`rex-engine.ts`** (MODIFIED)
   - Added preprocessing step
   - Separate formatting for WhatsApp/Telegram/Email
   - Updated LLM prompt for commentary focus
   - Enforced email subject format
   - Enhanced logging

4. **`digest-utils.test.ts`** (NEW)
   - Tests for content balancing
   - Tests for link formatting
   - Tests for email subject generation

5. **`sports-utils.test.ts`** (NEW)
   - Tests for Celtics disambiguation
   - Tests for deduplication
   - Tests for date filtering
   - Tests for match formatting
   - Tests for section building

---

## Testing

### Unit Tests

Run tests with:
```bash
npx ts-node --esm digest-utils.test.ts
npx ts-node --esm sports-utils.test.ts
```

Tests cover:
- ✅ Subreddit balancing with various limits
- ✅ Hunt content balancing (LinkedIn + Reddit)
- ✅ Link formatting (WhatsApp, Telegram, Email)
- ✅ Email subject format
- ✅ Celtics (NBA) vs Celtic FC disambiguation
- ✅ Match deduplication
- ✅ Date filtering (past 3 days, next 2 days)
- ✅ Match formatting (completed and upcoming)
- ✅ Full sports section building

### Integration Testing

To test the full pipeline:
```bash
cd /Users/bcc/Code/git/openclaw-tools/skills/social-searcher
npx ts-node --esm daily-digest.ts
```

Monitor logs for:
- 📊 Balance statistics (hunt and pulse)
- ⚽ Sports section statistics
- 📧 Email subject format
- 📱 Channel-specific formatting

---

## Logging Enhancements

New logging output includes:

```
📊 Hunt Content Balance:
  Total available: 40
  Total selected: 10
  Distribution:
    linkedin:AI: 3
    reddit:openclaw: 3
    reddit:agrivoltaics: 2
    reddit:vermont: 2

⚽ Sports Section Stats:
  Celtics (NBA): 1 completed, 1 upcoming
  Red Sox: 1 completed, 0 upcoming
  Total: 2 active teams, 4 quiet teams
  Matches: 2 completed, 1 upcoming

📧 Email subject: 🦖 Rex Daily Brief: 2026-03-05
```

---

## Follow-Up Questions

1. **Testing Preferences:**
   - Would you like to add Playwright-based integration tests that verify the full digest generation?
   - Should we add snapshot testing to ensure consistent output format?

2. **Configuration:**
   - Should the balance limits (max 10 total, max 3 per source) be configurable via `cfg/*.json`?
   - Do you want different balance rules for hunt vs pulse sections?

3. **Sports Enhancements:**
   - Should we add more sports-specific disambiguation (e.g., Red Sox vs Red Sox (cricket))?
   - Do you want score differential highlighting (e.g., "blowout win" for >20 point games)?

4. **LLM Prompt Tuning:**
   - Does the current level of LLM commentary feel right, or should we constrain it further?
   - Should the LLM have the ability to reorder items within a section, or keep strict order from code?

5. **Delivery Status:**
   - Should we add retry logic for failed WhatsApp/Telegram deliveries?
   - Do you want a daily summary report of delivery success rates?

---

## Implementation Notes

- All deterministic logic happens BEFORE LLM synthesis
- Three separate content versions: Email (HTML), WhatsApp (plain URLs), Telegram (markdown)
- Robust deduplication prevents duplicate sports results
- Round-robin balancing ensures no single source dominates
- Comprehensive logging for monitoring and debugging
- Unit tests provide confidence in core utilities
- Email subject format is now enforced in code, not LLM-generated

---

## Next Steps

1. ✅ Run unit tests to verify utilities work correctly
2. ⏭️ Run full daily-digest.ts to test integration
3. ⏭️ Monitor digest output for 2-3 days to ensure quality
4. ⏭️ Tune balance limits if needed based on actual results
5. ⏭️ Consider adding configuration file for balance parameters
