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
const PULSE_CONFIG_PATH = path.join(__dirname, 'cfg/reddit-pulse-config.md');

async function loadPulseConfig(): Promise<any> {
  const content = fs.readFileSync(PULSE_CONFIG_PATH, 'utf-8');
  const match = content.match(/```json\n([\s\S]*?)\n```/);
  return JSON.parse(match ? match[1] : content);
}

async function loadConfig(): Promise<Config> {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

async function getRedditPulse(sub: string, days: number) {
  console.log(`🔍 Getting pulse for r/${sub} (last ${days} days)...`);
  const results: any[] = [];
  
  // Use 'top' or 'hot' to get significant discussions
  const url = `https://www.reddit.com/r/${sub}/top.json?t=${days > 1 ? 'week' : 'day'}&limit=25`;
  
  return new Promise<any[]>((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'RexBot/1.0' } }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const posts = (json.data?.children || [])
            .filter((c: any) => c.data.subreddit.toLowerCase() === sub.toLowerCase())
            .map((c: any) => ({
              platform: 'reddit',
              type: 'pulse',
              title: c.data.title,
              content: c.data.selftext,
              author: c.data.author,
              subreddit: c.data.subreddit,
              upvotes: c.data.ups,
              comments_count: c.data.num_comments,
              url: `https://www.reddit.com${c.data.permalink}`
            }));
          resolve(posts);
        } catch (e) {
          console.error(`  Error parsing r/${sub}:`, e.message);
          resolve([]);
        }
      });
    }).on('error', (err) => {
      console.error(`  Network Error for r/${sub}:`, err.message);
      resolve([]);
    });
  });
}

async function main() {
  const pulseConfig = await loadPulseConfig();
  const args = process.argv.slice(2);
  let days = 1; // Default to 1 day for pulse
  
  const daysIdx = args.indexOf('--days');
  if (daysIdx !== -1 && args[daysIdx+1]) {
    days = parseInt(args[daysIdx+1], 10);
  } else if (pulseConfig.default_period === 'day') {
    days = 1;
  } else if (pulseConfig.default_period === 'week') {
    days = 7;
  }

  console.log(`🦖 Rex Pulse Mode: Analyzing ${pulseConfig.pulse_subreddits.length} subreddits...`);
  
  const allPulseData: any[] = [];
  for (const sub of pulseConfig.pulse_subreddits) {
    const posts = await getRedditPulse(sub, days);
    allPulseData.push(...posts);
    await new Promise(r => setTimeout(r, 1000)); // Be gentle
  }

  // Ensure output directory exists
  const outputDir = path.join(process.env.HOME || '', '.openclaw/data/social-searcher');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const file = path.join(outputDir, `reddit-pulse-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(file, JSON.stringify(allPulseData, null, 2));
  
  console.log(`\n💾 Saved pulse data for ${allPulseData.length} top posts to ${file}`);
  console.log('🦖 Pulse collection complete!');
}

main();
