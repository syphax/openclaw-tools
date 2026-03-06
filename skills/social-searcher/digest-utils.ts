/**
 * Utilities for Daily Digest content balancing and formatting.
 * Implements deterministic scaffolding to ensure consistent structure
 * before LLM summarization.
 */

export interface RedditPost {
  platform: string;
  title: string;
  content?: string;
  author: string;
  subreddit: string;
  url: string;
  upvotes?: number;
  comments_count?: number;
  type?: string;
}

export interface LinkedInPost {
  platform: string;
  keyword: string;
  author: string;
  content: string;
  url: string;
  externalUrl?: string;
  title: string;
}

export interface BalancedContent {
  selected: any[];
  subCounts: { [key: string]: number };
  totalAvailable: number;
}

/**
 * Balance content to prevent any single subreddit from dominating.
 * Implements round-robin selection across subreddits.
 *
 * @param items - Array of Reddit posts
 * @param maxTotal - Maximum total items to select (default: 10)
 * @param maxPerSub - Maximum items per subreddit (default: 3)
 */
export function balanceRedditContent(
  items: RedditPost[],
  maxTotal: number = 10,
  maxPerSub: number = 3
): BalancedContent {
  if (!items || items.length === 0) {
    return { selected: [], subCounts: {}, totalAvailable: 0 };
  }

  // Group by subreddit
  const bySubreddit: { [key: string]: RedditPost[] } = {};
  items.forEach(item => {
    const sub = item.subreddit || 'unknown';
    if (!bySubreddit[sub]) {
      bySubreddit[sub] = [];
    }
    bySubreddit[sub].push(item);
  });

  // Round-robin selection
  const selected: RedditPost[] = [];
  const subCounts: { [key: string]: number } = {};
  const subredditNames = Object.keys(bySubreddit);

  // Initialize counters
  subredditNames.forEach(sub => {
    subCounts[sub] = 0;
  });

  let roundIndex = 0;
  while (selected.length < maxTotal) {
    let addedThisRound = false;

    for (const sub of subredditNames) {
      if (selected.length >= maxTotal) break;

      const subItems = bySubreddit[sub];
      const currentCount = subCounts[sub];

      // Skip if we've hit the per-sub limit or no more items
      if (currentCount >= maxPerSub || currentCount >= subItems.length) {
        continue;
      }

      // Add the next item from this subreddit
      selected.push(subItems[currentCount]);
      subCounts[sub]++;
      addedThisRound = true;
    }

    // If no items were added this round, we're done
    if (!addedThisRound) break;
    roundIndex++;
  }

  return {
    selected,
    subCounts,
    totalAvailable: items.length
  };
}

/**
 * Balance keyword hunt content (Reddit + LinkedIn) to prevent single source dominance.
 *
 * @param huntData - Mixed array of LinkedIn and Reddit posts
 * @param maxTotal - Maximum total items to select (default: 10)
 * @param maxPerSource - Maximum items per source/subreddit (default: 3)
 */
export function balanceHuntContent(
  huntData: (LinkedInPost | RedditPost)[],
  maxTotal: number = 10,
  maxPerSource: number = 3
): BalancedContent {
  if (!huntData || huntData.length === 0) {
    return { selected: [], subCounts: {}, totalAvailable: 0 };
  }

  // Group by source (LinkedIn keyword or Reddit subreddit)
  const bySource: { [key: string]: any[] } = {};

  huntData.forEach(item => {
    let sourceKey: string;
    if (item.platform === 'linkedin') {
      sourceKey = `linkedin:${(item as LinkedInPost).keyword}`;
    } else if (item.platform === 'reddit') {
      sourceKey = `reddit:${(item as RedditPost).subreddit}`;
    } else {
      sourceKey = item.platform || 'unknown';
    }

    if (!bySource[sourceKey]) {
      bySource[sourceKey] = [];
    }
    bySource[sourceKey].push(item);
  });

  // Round-robin selection
  const selected: any[] = [];
  const sourceCounts: { [key: string]: number } = {};
  const sourceKeys = Object.keys(bySource);

  // Initialize counters
  sourceKeys.forEach(key => {
    sourceCounts[key] = 0;
  });

  while (selected.length < maxTotal) {
    let addedThisRound = false;

    for (const sourceKey of sourceKeys) {
      if (selected.length >= maxTotal) break;

      const sourceItems = bySource[sourceKey];
      const currentCount = sourceCounts[sourceKey];

      if (currentCount >= maxPerSource || currentCount >= sourceItems.length) {
        continue;
      }

      selected.push(sourceItems[currentCount]);
      sourceCounts[sourceKey]++;
      addedThisRound = true;
    }

    if (!addedThisRound) break;
  }

  return {
    selected,
    subCounts: sourceCounts,
    totalAvailable: huntData.length
  };
}

/**
 * Format WhatsApp links as plain URLs only.
 * WhatsApp auto-linkifies URLs, so we just return the URL itself.
 *
 * @param text - Text label for the link (not used, kept for API compatibility)
 * @param url - URL to link to
 */
export function formatWhatsAppLink(text: string, url: string): string {
  // WhatsApp auto-linkifies URLs, so just return the URL
  return url;
}

/**
 * Format Telegram links as clean markdown.
 * Telegram supports markdown-style links.
 *
 * @param text - Text label for the link
 * @param url - URL to link to
 */
export function formatTelegramLink(text: string, url: string): string {
  return `[${text}](${url})`;
}

/**
 * Format email links as HTML anchor tags.
 *
 * @param text - Text label for the link
 * @param url - URL to link to
 */
export function formatEmailLink(text: string, url: string): string {
  return `<a href="${url}">${text}</a>`;
}

/**
 * Generate email subject in the exact format: 🦖 Rex Daily Brief: YYYY-MM-DD
 *
 * @param date - Date string in YYYY-MM-DD format (defaults to today)
 */
export function generateEmailSubject(date?: string): string {
  const dateStr = date || new Date().toISOString().split('T')[0];
  return `🦖 Rex Daily Brief: ${dateStr}`;
}

/**
 * Log content balance statistics for debugging and monitoring.
 *
 * @param label - Label for this balance operation
 * @param result - Result from balanceRedditContent or balanceHuntContent
 */
export function logBalanceStats(label: string, result: BalancedContent): void {
  console.log(`\n📊 ${label}:`);
  console.log(`  Total available: ${result.totalAvailable}`);
  console.log(`  Total selected: ${result.selected.length}`);
  console.log(`  Distribution:`);

  const entries = Object.entries(result.subCounts).sort((a, b) => b[1] - a[1]);
  entries.forEach(([source, count]) => {
    console.log(`    ${source}: ${count}`);
  });
}
