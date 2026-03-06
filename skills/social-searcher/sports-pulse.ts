/**
 * Sports Pulse - Fetches sports data via ESPN public API.
 *
 * Replaces the old Playwright/Flashscore scraper. Key improvements:
 * - No browser required: plain HTTPS fetch, reliable and fast
 * - Dates come from ESPN directly (no page-URL inference)
 * - Games are keyed by ESPN event ID (perfect deduplication)
 * - Teams matched by ESPN team ID (no fuzzy name matching, no wrong-sport confusion)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TeamConfig {
  name: string;
  sport: string;
  league: string;
  country: string;
  espnSport: string;
  espnId: string;
}

interface SportsConfig {
  teams: TeamConfig[];
}

// Matches RawMatch in sports-engine.ts (with eventId added)
interface RawMatch {
  eventId: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  homeScore?: string;
  awayScore?: string;
  status?: string;
  competition?: string;
  effectiveDate: string;
  sport: string;
}

function loadConfig(): SportsConfig {
  const p = path.join(__dirname, 'cfg/sports-config.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().split('T')[0];
}

function toEspnDateParam(dateStr: string): string {
  return dateStr.replace(/-/g, ''); // "2026-03-05" → "20260305"
}

/**
 * If a UTC timestamp falls between midnight and 07:59 UTC it belongs
 * to the previous calendar day in any US timezone (UTC-4 to UTC-8).
 * European afternoon games are unaffected (hour >= 12 UTC).
 */
function effectiveDateFromUTC(d: Date): string {
  if (d.getUTCHours() < 8) {
    const prev = new Date(d);
    prev.setUTCDate(prev.getUTCDate() - 1);
    return toYYYYMMDD(prev);
  }
  return toYYYYMMDD(d);
}

/**
 * Format game start time as "H:MM PM ET" for US sports,
 * "HH:MM" (UTC) for soccer.
 */
function formatGameTime(d: Date, sport: string): string {
  if (sport === 'Soccer') {
    const h = d.getUTCHours().toString().padStart(2, '0');
    const m = d.getUTCMinutes().toString().padStart(2, '0');
    return `${h}:${m} UTC`;
  }

  // US Eastern: detect DST (2nd Sunday of March → 1st Sunday of November)
  function nthSunday(year: number, month: number, n: number): Date {
    const d = new Date(Date.UTC(year, month, 1));
    const firstSun = (7 - d.getUTCDay()) % 7;
    return new Date(Date.UTC(year, month, 1 + firstSun + (n - 1) * 7));
  }
  const year = d.getUTCFullYear();
  const dstStart = nthSunday(year, 2, 2);  // 2nd Sunday of March
  const dstEnd   = nthSunday(year, 10, 1); // 1st Sunday of November
  const offsetH  = d >= dstStart && d < dstEnd ? 4 : 5;

  let etH = (d.getUTCHours() - offsetH + 24) % 24;
  const etM = d.getUTCMinutes().toString().padStart(2, '0');
  const ampm = etH >= 12 ? 'PM' : 'AM';
  etH = etH % 12 || 12;
  return `${etH}:${etM} ${ampm} ET`;
}

function sportForLeague(espnSport: string): string {
  if (espnSport.startsWith('basketball')) return 'Basketball';
  if (espnSport.startsWith('hockey'))     return 'Hockey';
  if (espnSport.startsWith('baseball'))   return 'Baseball';
  if (espnSport.startsWith('soccer'))     return 'Soccer';
  return espnSport;
}

async function fetchScoreboard(espnSport: string, date: string): Promise<any[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${espnSport}/scoreboard`
            + `?dates=${toEspnDateParam(date)}&limit=100`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json() as any;
  return data.events ?? [];
}

async function main() {
  const config = loadConfig();

  const missingConfig = config.teams.filter(t => !t.espnSport || !t.espnId);
  if (missingConfig.length > 0) {
    console.error('❌ Teams missing espnSport/espnId — run lookup-team-ids.ts first:');
    missingConfig.forEach(t => console.error(`   ${t.name}`));
    process.exit(1);
  }

  // Build quick lookups
  const teamById  = new Map(config.teams.map(t => [t.espnId, t]));
  const leagues   = [...new Set(config.teams.map(t => t.espnSport))];

  // Date window: past 3 days (-3) through today+2 days (+2)
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const dates: string[] = [];
  for (let offset = -3; offset <= 2; offset++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + offset);
    dates.push(toYYYYMMDD(d));
  }

  console.log(`🦖 Rex Sports Pulse (ESPN API)`);
  console.log(`📅 Date window: ${dates[0]} → ${dates[dates.length - 1]}`);
  console.log(`📡 Leagues: ${leagues.join(', ')}`);
  console.log(`🔍 ${dates.length * leagues.length} API calls\n`);

  const allMatches: RawMatch[] = [];
  const seenEventIds = new Set<string>();

  for (const espnSport of leagues) {
    const sport = sportForLeague(espnSport);
    let leagueCount = 0;

    for (const date of dates) {
      let events: any[];
      try {
        events = await fetchScoreboard(espnSport, date);
      } catch (e: any) {
        console.warn(`  ⚠️  ${espnSport} ${date}: ${e.message}`);
        continue;
      }

      for (const event of events) {
        if (seenEventIds.has(event.id)) continue;

        const comp = event.competitions?.[0];
        if (!comp) continue;

        const competitors: any[] = comp.competitors ?? [];
        if (competitors.length < 2) continue;

        const home = competitors.find((c: any) => c.homeAway === 'home');
        const away = competitors.find((c: any) => c.homeAway === 'away');
        if (!home || !away) continue;

        // Only emit matches involving at least one configured team
        if (!teamById.has(home.team?.id) && !teamById.has(away.team?.id)) continue;

        seenEventIds.add(event.id);

        const gameDate    = new Date(event.date);
        const status      = comp.status?.type;
        const isCompleted = status?.completed === true;
        const isInPlay    = status?.state === 'in';

        const match: RawMatch = {
          eventId:      event.id,
          time:         formatGameTime(gameDate, sport),
          homeTeam:     home.team?.displayName ?? home.team?.name ?? '',
          awayTeam:     away.team?.displayName ?? away.team?.name ?? '',
          homeScore:    (isCompleted || isInPlay) ? (home.score ?? '-') : '-',
          awayScore:    (isCompleted || isInPlay) ? (away.score ?? '-') : '-',
          status:       status?.shortDetail ?? status?.name ?? '',
          competition:  event.name,
          effectiveDate: effectiveDateFromUTC(gameDate),
          sport,
        };

        allMatches.push(match);
        leagueCount++;
      }
    }

    console.log(`  ${espnSport}: ${leagueCount} relevant matches`);
  }

  const outputDir = path.join(process.env.HOME ?? '', '.openclaw/data/social-searcher');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const todayStr = toYYYYMMDD(now);
  const outFile  = path.join(outputDir, `sports-raw-${todayStr}.json`);
  fs.writeFileSync(outFile, JSON.stringify(allMatches, null, 2));

  console.log(`\n💾 Saved ${allMatches.length} matches → ${outFile}`);
  console.log('🦖 Sports Pulse complete!');
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
