import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RedditMonitor {
  sub: string;
  keywords: string[];
}

interface Config {
  linkedin: { keywords: string[]; last_successful_search: string; };
  reddit: { monitors: RedditMonitor[]; last_successful_search: string; };
}

const CONFIG_PATH = path.join(__dirname, 'cfg/social-search-config.json');
const CHROME_USER_DATA = path.join(process.env.HOME || '', '.openclaw/browser-profiles/social-searcher');

async function loadConfig(): Promise<Config> {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

async function searchLinkedIn(keywords: string[]) {
  console.log('🔍 Starting LinkedIn search...');
  const results: any[] = [];
  try {
    const context = await chromium.launchPersistentContext(CHROME_USER_DATA, {
      headless: false, channel: 'chrome', viewport: { width: 1280, height: 720 },
      args: ['--disable-blink-features=AutomationControlled']
    });
    const page = await context.newPage();
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });

    for (const kw of keywords) {
      console.log(`  Hunting: "${kw}"`);

      await page.goto(`https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(kw)}&sortBy=%22date_posted%22`, {
        waitUntil: 'load',
        timeout: 30000
      });

      // Wait for content to render
      await page.waitForTimeout(4000);

      // Scroll to trigger lazy loading
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(2000);

      const posts = await page.evaluate(() => {
        // LinkedIn uses div[role="listitem"] for post containers (CSS classes are obfuscated)
        let containers = Array.from(document.querySelectorAll('div[role="listitem"]'));
        // Filter to substantial containers only
        containers = containers.filter(c => (c.textContent?.length || 0) > 50);

        // Fallback: if no listitem divs, try li elements with profile links
        if (containers.length === 0) {
          containers = Array.from(document.querySelectorAll('li')).filter(li => {
            const text = li.textContent || '';
            const hasProfile = li.querySelector('a[href*="/in/"], a[href*="/company/"]') !== null;
            return text.length > 100 && hasProfile;
          });
        }

        if (containers.length === 0) return [];

        return containers.map(container => {
          // --- Author ---
          let author = 'Unknown';
          const profileLinks = Array.from(container.querySelectorAll('a[href*="/in/"], a[href*="/company/"]'));
          for (const link of profileLinks) {
            const text = (link as HTMLElement).textContent?.trim() || '';
            if (text.length >= 2 && text.length <= 100 &&
                !text.includes('Follow') && !text.includes('View Profile') &&
                !text.includes('Connect')) {
              // Take first line only (before timestamps, titles, etc.)
              author = text.split('\n')[0].trim();
              // Strip trailing connection degree, timestamps, and titles
              // e.g. "Mona Nazari • 3rd+Senior Commercial..." → "Mona Nazari"
              // e.g. "Mechatron Trackers6h •" → "Mechatron Trackers"
              author = author
                .replace(/\s*•\s*\d+(st|nd|rd|th)\+?.*$/, '')  // "• 3rd+..." and everything after
                .replace(/\s*\d+[hdwm]\s*•?\s*$/, '')           // trailing "6h •"
                .replace(/\s*•\s*Edited\s*•?\s*$/, '')          // trailing "• Edited •"
                .trim();
              if (author.length >= 2) break;
              author = 'Unknown';
            }
          }

          // Fallback: aria-hidden spans (LinkedIn uses these for display names)
          if (author === 'Unknown') {
            const spans = Array.from(container.querySelectorAll('span[aria-hidden="true"]'));
            for (const span of spans) {
              const text = span.textContent?.trim() || '';
              if (text.length >= 2 && text.length <= 80 &&
                  !/^(Follow|Like|Comment|Repost|Send|Reply)$/i.test(text) &&
                  !text.includes('•') && !/^\d+[hdwm]$/.test(text)) {
                author = text;
                break;
              }
            }
          }

          // --- Content text ---
          let content = '';
          // Method 1: span[dir="ltr"] — LinkedIn's common text container
          const ltrSpans = Array.from(container.querySelectorAll('span[dir="ltr"]'));
          const contentPieces = ltrSpans
            .map(s => s.textContent?.trim() || '')
            .filter(t => t.length > 10);
          if (contentPieces.length > 0) {
            content = contentPieces.join(' ').trim();
          }

          // Method 2: Fallback — container text minus UI chrome
          if (content.length < 30) {
            const raw = container.textContent || '';
            content = raw
              .replace(/^Feed post\s*/i, '')
              .replace(/\+?\s*Follow/g, '')
              .replace(/Like\s+Comment\s+Repost\s+Send/g, '')
              .replace(/\d+\s+(like|comment|repost)/gi, '')
              .replace(/\d+[hdwm]\s*(ago)?/g, '')
              .replace(/\s+/g, ' ')
              .trim();
          }

          // Clean content: remove "Feed post" prefix and author header
          content = content.replace(/^Feed post\s*/i, '').trim();
          // Strip author name + connection/timestamp prefix from content start
          if (author !== 'Unknown' && content.startsWith(author)) {
            content = content.substring(author.length);
            // Remove trailing metadata like "• 3rd+Title...|" or "6h • Edited •"
            content = content.replace(/^[\s•]*(\d+(st|nd|rd|th)\+?)?[^•]*?•\s*/, '').trim();
            // If still starts with connection/time noise, strip it
            content = content.replace(/^\d+[hdwm]\s*•?\s*(Edited\s*•?\s*)?/, '').trim();
          }

          // --- Post URL ---
          let url = '';
          const allLinks = Array.from(container.querySelectorAll('a[href]'));

          // Priority 1: activity URN links (most specific permalink)
          for (const link of allLinks) {
            const href = (link as HTMLAnchorElement).href;
            if (href.includes('urn:li:activity:') || href.includes('/feed/update/')) {
              url = href.split('?')[0];
              if (!url.startsWith('http')) url = 'https://www.linkedin.com' + url;
              break;
            }
          }
          // Priority 2: company/profile posts links
          if (!url) {
            for (const link of allLinks) {
              const href = (link as HTMLAnchorElement).href;
              if (href.includes('/posts/') && href.includes('linkedin.com')) {
                url = href.split('?')[0];
                break;
              }
            }
          }
          // Priority 3: author profile link as fallback
          if (!url && profileLinks.length > 0) {
            url = (profileLinks[0] as HTMLAnchorElement).href.split('?')[0];
          }

          // --- External URL ---
          let externalUrl = '';
          for (const link of allLinks) {
            const href = (link as HTMLAnchorElement).href;
            if (href && !href.includes('linkedin.com') && href.startsWith('http')) {
              externalUrl = href;
              break;
            }
          }

          return {
            author,
            content: content.substring(0, 1000),
            url,
            externalUrl,
            title: content.substring(0, 80).replace(/\n/g, ' ') + '...'
          };
        }).filter(p => p.url && p.content.length > 5);
      });

      // Diagnostic: warn if page rendered but extraction failed
      if (posts.length === 0) {
        const pageInfo = await page.evaluate(() => ({
          listitemDivs: document.querySelectorAll('div[role="listitem"]').length,
          profileLinks: document.querySelectorAll('a[href*="/in/"], a[href*="/company/"]').length,
          totalDivs: document.querySelectorAll('div').length,
        }));
        if (pageInfo.profileLinks > 5) {
          console.warn(`  ⚠️ WARNING: Page has ${pageInfo.profileLinks} profile links and ${pageInfo.listitemDivs} listitem divs but extracted 0 posts`);
          console.warn(`  ⚠️ LinkedIn DOM structure may have changed — extraction selectors need updating`);
          const screenshotPath = path.join(__dirname, 'logs', `debug-linkedin-${kw.replace(/[^a-z0-9]/gi, '_')}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
          console.warn(`  📸 Debug screenshot: ${screenshotPath}`);
        }
        console.log(`  Found 0 posts for "${kw}"`);
      } else {
        console.log(`  ✓ Found ${posts.length} posts for "${kw}"`);
        const sample = posts[0];
        console.log(`    Sample: ${sample.author} — "${sample.content.substring(0, 60)}..."`);
      }

      // Deduplicate: skip posts we already found for a previous keyword
      const seenUrls = new Set(results.map(r => r.url));
      let newCount = 0;
      posts.forEach(p => {
        if (!seenUrls.has(p.url)) {
          results.push({ ...p, platform: 'linkedin', keyword: kw });
          seenUrls.add(p.url);
          newCount++;
        }
      });
      if (newCount < posts.length) {
        console.log(`    (${posts.length - newCount} duplicates skipped)`);
      }
    }
    await context.close();
  } catch (err) { console.error('  LinkedIn Error:', err.message); }
  return results;
}

async function searchReddit(monitors: RedditMonitor[], lastSearch: Date) {
  console.log('🔍 Starting Reddit search...');
  const results: any[] = [];
  const lastTs = Math.floor(lastSearch.getTime() / 1000);
  for (const monitor of monitors) {
    const { sub, keywords } = monitor;
    for (const kw of keywords) {
      console.log(`  Searching r/${sub}: "${kw}"`);
      const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(kw)}&sort=new&t=week&restrict_sr=on`;
      await new Promise(resolve => {
        https.get(url, { headers: { 'User-Agent': 'RexBot/1.0' } }, res => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(body);
              (json.data?.children || []).forEach((c: any) => {
                if (c.data.created_utc >= lastTs) {
                  results.push({
                    platform: 'reddit', title: c.data.title, content: c.data.selftext,
                    author: c.data.author, subreddit: c.data.subreddit,
                    url: `https://www.reddit.com${c.data.permalink}`
                  });
                }
              });
            } catch (e) {}
            resolve(null);
          });
        }).on('error', () => resolve(null));
      });
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return results;
}

async function main() {
  const config = await loadConfig();

  // Parse command-line arguments for optional days override
  let daysOverride: number | null = null;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && i + 1 < args.length) {
      const parsedDays = parseInt(args[i + 1], 10);
      if (!isNaN(parsedDays) && parsedDays > 0) {
        daysOverride = parsedDays;
        console.log(`📅 Using time override: searching last ${daysOverride} days`);
      } else {
        console.error('ERROR: --days must be followed by a positive number');
        process.exit(1);
      }
      break;
    }
  }

  // Calculate search date based on override or config
  let searchStartDate: Date;
  if (daysOverride !== null) {
    searchStartDate = new Date();
    searchStartDate.setDate(searchStartDate.getDate() - daysOverride);
  } else {
    searchStartDate = new Date(config.reddit.last_successful_search);
    console.log(`📅 Using last check date: ${config.reddit.last_successful_search}`);
  }

  const liPosts = await searchLinkedIn(config.linkedin.keywords);
  const rdPosts = await searchReddit(config.reddit.monitors, searchStartDate);

  const all = [...liPosts, ...rdPosts];

  // Ensure output directory exists
  const outputDir = path.join(process.env.HOME || '', '.openclaw/data/social-searcher');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const file = path.join(outputDir, `search-results-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(file, JSON.stringify(all, null, 2));
  console.log(`\n💾 Saved ${all.length} posts to ${file}`);

  // Only update last_successful_search if not using days override
  if (daysOverride === null) {
    config.linkedin.last_successful_search = new Date().toISOString();
    config.reddit.last_successful_search = new Date().toISOString();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log('📝 Updated last_successful_search in config');
  } else {
    console.log('📝 Skipped config update (using --days override)');
  }
  console.log('🦖 Done!');
}
main();
