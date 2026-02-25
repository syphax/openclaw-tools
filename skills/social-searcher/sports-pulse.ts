import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TeamConfig {
  name: string;
  league: string;
  sport: string;
  country: string;
}

interface SportsConfig {
  teams: TeamConfig[];
}

const CONFIG_PATH = path.join(__dirname, 'cfg/sports-config.json');

async function loadConfig(): Promise<SportsConfig> {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

async function scrapeFlashscore(paths: string[]): Promise<string> {
  console.log('🌍 Launching browser for Flashscore...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
    viewport: { width: 375, height: 812 },
    isMobile: true
  });

  let allContent = '';

  for (const p of paths) {
    const page = await context.newPage();
    const url = `https://m.flashscore.com/${p}`;
    console.log(`  Navigating to ${url}...`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      // Wait for the match list to load
      await page.waitForSelector('#score-data, .event__match', { timeout: 10000 }).catch(() => {});
      
      // Expand sections if they are collapsed? (Flashscore mobile usually shows all)
      const content = await page.evaluate(() => {
        // Capture everything in the main container
        return document.querySelector('#score-data')?.innerText || document.body.innerText;
      });
      allContent += `\n--- PAGE: ${url} ---\n` + content;
    } catch (e: any) {
      console.error(`  Error scraping ${url}:`, e.message);
    }
    await page.close();
  }

  await browser.close();
  return allContent;
}

function parseMatches(teamName: string, text: string) {
  const matches: any[] = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.toLowerCase().includes(teamName.toLowerCase())) {
      // Flashscore mobile lines usually look like:
      // [Time/Status] Team A [Score] Team B [Score]
      // or
      // [Time] Team A - Team B
      
      // If the team name matches, we take the surrounding lines too for context
      const start = Math.max(0, i - 1);
      const end = Math.min(lines.length - 1, i + 1);
      const chunk = lines.slice(start, end + 1).join(' ').replace(/\s+/g, ' ').trim();
      
      if (chunk.length > 5 && (chunk.includes(':') || chunk.includes('-'))) {
        matches.push({ summary: chunk });
      }
    }
  }
  
  // Deduplicate
  return Array.from(new Set(matches.map(m => m.summary))).map(s => ({ summary: s }));
}

async function main() {
  const config = await loadConfig();
  console.log(`🦖 Rex Sports Desk: Tracking ${config.teams.length} teams...`);
  
  const sportsPaths = [
    '',               // Football Today
    '?d=-1',          // Football Yesterday
    'basketball/',    // Basketball Today
    'basketball/?d=-1',// Basketball Yesterday
    'baseball/',      // Baseball Today
    'baseball/?d=-1', // Baseball Yesterday
    'hockey/',        // Hockey Today
    'hockey/?d=-1'    // Hockey Yesterday
  ];

  const fullText = await scrapeFlashscore(sportsPaths);

  const results = [];
  for (const team of config.teams) {
    console.log(`🔍 Hunting for ${team.name}...`);
    const matches = parseMatches(team.name, fullText);
    results.push({
      team: team.name,
      sport: team.sport,
      matches: matches.length > 0 ? matches : [{ status: 'No games today/yesterday found.' }]
    });
  }

  const outputDir = path.join(process.env.HOME || '', '.openclaw/data/social-searcher');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const file = path.join(outputDir, `sports-results-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
  
  console.log(`\n💾 Saved sports data to ${file}`);
  console.log('🦖 Sports Desk duty complete!');
}

main();
