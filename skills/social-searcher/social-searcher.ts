import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

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
      await page.goto(`https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(kw)}&sortBy=%22date_posted%22`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(6000);
      
      const posts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.feed-shared-update-v2, .search-content__result')).map(el => {
          const text = el.querySelector('.feed-shared-text, .update-components-text')?.textContent?.trim() || '';

          // Improved LinkedIn author extraction with multiple fallback selectors
          let author = 'Unknown';
          const authorSelectors = [
            '.update-components-actor__name',
            '.feed-shared-actor__name',
            '.update-components-actor__title .visually-hidden',
            '.feed-shared-actor__title .visually-hidden',
            '.update-components-actor .update-components-actor__name',
            '.feed-shared-actor .feed-shared-actor__name',
            '[data-control-name="actor"] .update-components-actor__name',
            '[data-control-name="actor"] span[aria-hidden="true"]'
          ];

          for (const selector of authorSelectors) {
            const authorEl = el.querySelector(selector);
            if (authorEl?.textContent?.trim()) {
              author = authorEl.textContent.trim();
              break;
            }
          }

          // Extract URL and ensure it's absolute
          let url = '';
          const linkEl = el.querySelector('a.app-aware-link, a[href*="/feed/update/"], a[href*="linkedin.com"]') as HTMLAnchorElement;
          if (linkEl?.href) {
            url = linkEl.href.startsWith('http') ? linkEl.href : `https://www.linkedin.com${linkEl.href}`;
          }

          return { author, content: text, url };
        }).filter(p => p.content.length > 5);
      });
      
      console.log(`  Found ${posts.length} for "${kw}"`);
      posts.forEach(p => results.push({ ...p, platform: 'linkedin', keyword: kw }));
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
