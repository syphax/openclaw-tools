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

interface MatchData {
  time: string;
  homeTeam: string;
  awayTeam: string;
  homeScore?: string;
  awayScore?: string;
  status?: string;
  competition?: string;
  /** The effective local date (YYYY-MM-DD) after adjusting for UTC offset.
   *  Matches before 08:00 UTC are considered to belong to the prior day. */
  effectiveDate?: string;
}

/**
 * Compute the effective local date for a match.
 * Flashscore times are UTC. Any match starting before 08:00 is considered
 * to have occurred on the prior calendar day (covers late-night US games).
 *
 * @param utcPageDate - The UTC calendar date of the Flashscore page (Date at midnight UTC)
 * @param timeStr     - The time string from the page, e.g. "01:00" or "20:30"
 * @returns YYYY-MM-DD string for the effective date
 */
function computeEffectiveDate(utcPageDate: Date, timeStr: string): string {
  const hourMatch = timeStr.match(/^(\d{1,2}):/);
  if (hourMatch) {
    const hour = parseInt(hourMatch[1], 10);
    if (hour < 8) {
      // Shift back one day
      const shifted = new Date(utcPageDate);
      shifted.setUTCDate(shifted.getUTCDate() - 1);
      return shifted.toISOString().split('T')[0];
    }
  }
  return utcPageDate.toISOString().split('T')[0];
}

/**
 * Get the UTC calendar date for a given day offset from today.
 * offset 0 = today, -1 = yesterday, +1 = tomorrow (all in UTC).
 */
function utcDateForOffset(offset: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

interface ScrapePath {
  path: string;
  dayOffset: number; // 0=today, -1=yesterday, +1=tomorrow in UTC
}

async function scrapeFlashscore(paths: ScrapePath[]): Promise<MatchData[]> {
  console.log('🌍 Launching browser for Flashscore...');
  const browser = await chromium.launch({ headless: true });

  // Switch to DESKTOP version instead of mobile
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });

  let allMatches: MatchData[] = [];

  // Create debug directory
  const debugDir = path.join(__dirname, 'debug');
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }

  for (const { path: p, dayOffset } of paths) {
    const utcPageDate = utcDateForOffset(dayOffset);
    const page = await context.newPage();
    const url = `https://www.flashscore.com/${p}`;
    console.log(`  Navigating to ${url}...`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Wait for the live table container
      await page.waitForSelector('#live-table', { timeout: 10000 }).catch(() => {});

      // Important: Flashscore loads content dynamically via JS
      // Wait for actual match elements to appear (not just skeleton)
      await page.waitForFunction(() => {
        const matches = document.querySelectorAll('.event__match');
        // Check if we have actual content (not skeleton placeholders)
        return matches.length > 0 &&
               Array.from(matches).some(m => {
                 const homeTeam = m.querySelector('.event__participant--home');
                 return homeTeam && homeTeam.textContent && homeTeam.textContent.trim().length > 2;
               });
      }, { timeout: 15000 }).catch(() => {
        console.log(`    ⚠️  Timeout waiting for matches to load with content`);
      });

      // Additional wait to ensure all content is rendered
      await page.waitForTimeout(2000);

      // Extract structured match data
      const matches = await page.evaluate(() => {
        const results: any[] = [];
        let currentCompetition = '';

        // Desktop Flashscore structure - matches are in divs with event__match class
        const matchElements = document.querySelectorAll('.event__match');

        // Track which league header we're currently under
        const container = document.querySelector('#live-table');
        if (!container) return results;

        // Walk through all children to maintain context
        const allChildren = Array.from(container.querySelectorAll('*'));

        for (const child of allChildren) {
          // Update competition when we hit a header
          if (child.classList.contains('event__header')) {
            const titleEl = child.querySelector('.event__title');
            if (titleEl) {
              currentCompetition = titleEl.textContent?.trim() || '';
            }
          }

          // Process match if we hit a match element
          if (child.classList.contains('event__match')) {
            const matchEl = child;

            // Extract match details - try multiple selector patterns
            const timeEl = matchEl.querySelector('.event__time');

            // Home team - try both patterns
            let homeTeamEl = matchEl.querySelector('.event__participant--home');
            if (!homeTeamEl) {
              homeTeamEl = matchEl.querySelector('[class*="participant"][class*="home"]');
            }

            // Away team - try both patterns
            let awayTeamEl = matchEl.querySelector('.event__participant--away');
            if (!awayTeamEl) {
              awayTeamEl = matchEl.querySelector('[class*="participant"][class*="away"]');
            }

            // Scores
            const homeScoreEl = matchEl.querySelector('.event__score--home');
            const awayScoreEl = matchEl.querySelector('.event__score--away');
            const statusEl = matchEl.querySelector('.event__stage, .event__status');

            if (homeTeamEl && awayTeamEl) {
              const homeTeamText = homeTeamEl.textContent?.trim() || '';
              const awayTeamText = awayTeamEl.textContent?.trim() || '';

              // Skip if teams are empty (skeleton/placeholder)
              if (homeTeamText.length > 1 && awayTeamText.length > 1) {
                results.push({
                  time: timeEl?.textContent?.trim() || '',
                  homeTeam: homeTeamText,
                  awayTeam: awayTeamText,
                  homeScore: homeScoreEl?.textContent?.trim() || '-',
                  awayScore: awayScoreEl?.textContent?.trim() || '-',
                  status: statusEl?.textContent?.trim() || '',
                  competition: currentCompetition
                });
              }
            }
          }
        }

        return results;
      });

      // DEBUG: If no matches found, save HTML and screenshot
      if (matches.length === 0) {
        console.log(`  ⚠️  DEBUG: 0 matches found, saving debug info...`);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safePath = p.replace(/[\/\?=]/g, '_') || 'home_today';

        // Save HTML
        const html = await page.content();
        const htmlFile = path.join(debugDir, `${safePath}_${timestamp}.html`);
        fs.writeFileSync(htmlFile, html);
        console.log(`    📄 HTML saved to: ${htmlFile}`);

        // Save screenshot
        const screenshotFile = path.join(debugDir, `${safePath}_${timestamp}.png`);
        await page.screenshot({ path: screenshotFile, fullPage: true });
        console.log(`    📸 Screenshot saved to: ${screenshotFile}`);

        // Log some diagnostic info
        const diagnostics = await page.evaluate(() => {
          return {
            title: document.title,
            bodyClasses: document.body.className,
            matchElementsFound: document.querySelectorAll('.event__match').length,
            scoreDataExists: !!document.querySelector('#score-data'),
            liveTableExists: !!document.querySelector('#live-table'),
            allClassesInBody: Array.from(document.body.querySelectorAll('[class]'))
              .slice(0, 20)
              .map(el => el.className)
          };
        });
        console.log(`    🔍 Diagnostics:`, JSON.stringify(diagnostics, null, 2));
      }

      // Stamp each match with its effective date
      for (const m of matches) {
        m.effectiveDate = computeEffectiveDate(utcPageDate, m.time);
      }

      allMatches.push(...matches);
      console.log(`  Found ${matches.length} matches on ${url}`);
    } catch (e: any) {
      console.error(`  Error scraping ${url}:`, e.message);
    }
    await page.close();
  }

  await browser.close();

  // Deduplicate: the same match may appear on overlapping day pages
  const seen = new Set<string>();
  const dedupedMatches = allMatches.filter(m => {
    const key = `${m.homeTeam}|${m.awayTeam}|${m.time}|${m.effectiveDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`  Total matches found: ${dedupedMatches.length} (${allMatches.length} before dedup)`);
  return dedupedMatches;
}

function findTeamMatches(teamName: string, allMatches: MatchData[]) {
  const teamLower = teamName.toLowerCase();
  const results: any[] = [];

  for (const match of allMatches) {
    const homeLower = match.homeTeam.toLowerCase();
    const awayLower = match.awayTeam.toLowerCase();

    // Check if this match involves the team
    if (homeLower.includes(teamLower) || awayLower.includes(teamLower) ||
        teamLower.includes(homeLower) || teamLower.includes(awayLower)) {

      // Determine if it's a completed match or upcoming
      const hasScore = match.homeScore && match.awayScore &&
                      match.homeScore !== '-' && match.awayScore !== '-' &&
                      !match.homeScore.includes(':');

      if (hasScore) {
        // Completed match
        const isHome = homeLower.includes(teamLower) || teamLower.includes(homeLower);
        const ourScore = isHome ? match.homeScore : match.awayScore;
        const oppScore = isHome ? match.awayScore : match.homeScore;
        const opponent = isHome ? match.awayTeam : match.homeTeam;

        let result = 'DRAW';
        if (parseInt(ourScore!) > parseInt(oppScore!)) {
          result = 'WIN';
        } else if (parseInt(ourScore!) < parseInt(oppScore!)) {
          result = 'LOSS';
        }

        results.push({
          type: 'completed',
          result: result,
          opponent: opponent,
          score: `${ourScore}-${oppScore}`,
          fullScore: `${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}`,
          competition: match.competition || 'Unknown',
          time: match.time,
          effectiveDate: match.effectiveDate
        });
      } else {
        // Upcoming match
        const isHome = homeLower.includes(teamLower) || teamLower.includes(homeLower);
        const opponent = isHome ? match.awayTeam : match.homeTeam;
        const location = isHome ? 'vs' : '@';

        results.push({
          type: 'upcoming',
          opponent: opponent,
          location: location,
          time: match.time,
          matchup: `${match.homeTeam} vs ${match.awayTeam}`,
          competition: match.competition || 'Unknown',
          effectiveDate: match.effectiveDate
        });
      }
    }
  }

  return results;
}

async function main() {
  const config = await loadConfig();
  console.log(`🦖 Rex Sports Desk: Tracking ${config.teams.length} teams...`);

  const sportsPaths: ScrapePath[] = [
    { path: '',                  dayOffset:  0 },  // Football Today
    { path: '?d=-1',             dayOffset: -1 },  // Football Yesterday
    { path: '?d=1',              dayOffset:  1 },  // Football Tomorrow
    { path: 'basketball/',       dayOffset:  0 },  // Basketball Today
    { path: 'basketball/?d=-1',  dayOffset: -1 },  // Basketball Yesterday
    { path: 'basketball/?d=1',   dayOffset:  1 },  // Basketball Tomorrow
    { path: 'baseball/',         dayOffset:  0 },  // Baseball Today
    { path: 'baseball/?d=-1',    dayOffset: -1 },  // Baseball Yesterday
    { path: 'baseball/?d=1',     dayOffset:  1 },  // Baseball Tomorrow
    { path: 'hockey/',           dayOffset:  0 },  // Hockey Today
    { path: 'hockey/?d=-1',      dayOffset: -1 },  // Hockey Yesterday
    { path: 'hockey/?d=1',       dayOffset:  1 },  // Hockey Tomorrow
  ];

  const allMatches = await scrapeFlashscore(sportsPaths);

  const results = [];
  for (const team of config.teams) {
    console.log(`🔍 Hunting for ${team.name}...`);
    const teamMatches = findTeamMatches(team.name, allMatches);

    if (teamMatches.length > 0) {
      // Separate completed and upcoming
      const completed = teamMatches.filter(m => m.type === 'completed');
      const upcoming = teamMatches.filter(m => m.type === 'upcoming');

      results.push({
        team: team.name,
        sport: team.sport,
        completed: completed,
        upcoming: upcoming,
        summary: `${completed.length} completed, ${upcoming.length} upcoming`
      });
    } else {
      results.push({
        team: team.name,
        sport: team.sport,
        completed: [],
        upcoming: [],
        summary: 'No games found today/yesterday'
      });
    }
  }

  const outputDir = path.join(process.env.HOME || '', '.openclaw/data/social-searcher');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const file = path.join(outputDir, `sports-results-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(file, JSON.stringify(results, null, 2));

  console.log(`\n💾 Saved sports data to ${file}`);
  console.log('\n📊 Summary:');
  for (const r of results) {
    console.log(`  ${r.team}: ${r.summary}`);
  }
  console.log('\n🦖 Sports Desk duty complete!');
}

main();
