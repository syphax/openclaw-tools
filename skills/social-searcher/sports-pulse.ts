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
}

async function scrapeFlashscore(paths: string[]): Promise<MatchData[]> {
  console.log('🌍 Launching browser for Flashscore...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
    viewport: { width: 375, height: 812 },
    isMobile: true
  });

  let allMatches: MatchData[] = [];

  for (const p of paths) {
    const page = await context.newPage();
    const url = `https://m.flashscore.com/${p}`;
    console.log(`  Navigating to ${url}...`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      // Wait for the match list to load
      await page.waitForSelector('#score-data, .event__match', { timeout: 10000 }).catch(() => {});

      // Extract structured match data
      const matches = await page.evaluate(() => {
        const results: any[] = [];
        let currentCompetition = '';

        // Find all match elements and their context
        const scoreData = document.querySelector('#score-data');
        if (!scoreData) return results;

        const allElements = Array.from(scoreData.querySelectorAll('*'));

        for (let i = 0; i < allElements.length; i++) {
          const el = allElements[i];
          const text = el.textContent?.trim() || '';

          // Track competition/league headers
          if (el.classList.contains('event__header') ||
              el.tagName === 'H3' ||
              (text.includes(':') && text.split(':').length === 2 && text.split(':')[0].length > 10)) {
            currentCompetition = text;
          }

          // Look for match rows
          if (el.classList.contains('event__match') || el.classList.contains('event')) {
            const timeEl = el.querySelector('.event__time');
            const homeTeamEl = el.querySelector('.event__participant--home');
            const awayTeamEl = el.querySelector('.event__participant--away');
            const homeScoreEl = el.querySelector('.event__score--home');
            const awayScoreEl = el.querySelector('.event__score--away');

            if (homeTeamEl && awayTeamEl) {
              results.push({
                time: timeEl?.textContent?.trim() || '',
                homeTeam: homeTeamEl.textContent?.trim() || '',
                awayTeam: awayTeamEl.textContent?.trim() || '',
                homeScore: homeScoreEl?.textContent?.trim() || '-',
                awayScore: awayScoreEl?.textContent?.trim() || '-',
                competition: currentCompetition
              });
            }
          }
        }

        return results;
      });

      allMatches.push(...matches);
      console.log(`  Found ${matches.length} matches on ${url}`);
    } catch (e: any) {
      console.error(`  Error scraping ${url}:`, e.message);
    }
    await page.close();
  }

  await browser.close();
  console.log(`  Total matches found: ${allMatches.length}`);
  return allMatches;
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
          time: match.time
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
          competition: match.competition || 'Unknown'
        });
      }
    }
  }

  return results;
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
