/**
 * Looks up ESPN team IDs for all teams in sports-config.json and updates the file in-place.
 *
 * Usage: npx ts-node --esm lookup-team-ids.ts
 */

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
  espnSport: string;
  espnId: string;
}

interface SportsConfig {
  teams: TeamConfig[];
}

interface EspnTeam {
  id: string;
  displayName: string;
  shortDisplayName: string;
  name: string;
  abbreviation: string;
}

async function fetchTeamsForLeague(espnSport: string): Promise<EspnTeam[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${espnSport}/teams?limit=200`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  const data = await resp.json() as any;

  const teams: EspnTeam[] = [];
  for (const sport of (data.sports || [])) {
    for (const league of (sport.leagues || [])) {
      for (const entry of (league.teams || [])) {
        teams.push(entry.team as EspnTeam);
      }
    }
  }
  return teams;
}

/**
 * Find best matching ESPN team for a configured team name.
 * Returns the top candidate, or null if nothing plausible.
 */
function findBestMatch(espnTeams: EspnTeam[], teamName: string): { team: EspnTeam; score: number } | null {
  const needle = teamName.toLowerCase();

  const scored = espnTeams.map(t => {
    const names = [
      t.name.toLowerCase(),
      t.shortDisplayName.toLowerCase(),
      t.displayName.toLowerCase(),
      t.abbreviation.toLowerCase(),
    ];

    // Exact match on any name field → highest score
    if (names.some(n => n === needle)) return { team: t, score: 100 };
    // Name field contains needle or needle contains name field
    if (names.some(n => n.includes(needle) || needle.includes(n))) return { team: t, score: 50 };
    return { team: t, score: 0 };
  });

  const best = scored.sort((a, b) => b.score - a.score)[0];
  return best.score > 0 ? best : null;
}

async function main() {
  const configPath = path.join(__dirname, 'cfg/sports-config.json');
  const config: SportsConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  console.log('🔍 ESPN Team ID Lookup\n');

  const teamsWithoutSport = config.teams.filter(t => !t.espnSport);
  if (teamsWithoutSport.length > 0) {
    console.error('❌ Teams missing espnSport field:', teamsWithoutSport.map(t => t.name).join(', '));
    process.exit(1);
  }

  // Group teams by espnSport to minimise API calls
  const byLeague = new Map<string, TeamConfig[]>();
  for (const team of config.teams) {
    const list = byLeague.get(team.espnSport) ?? [];
    list.push(team);
    byLeague.set(team.espnSport, list);
  }

  let updatedCount = 0;

  for (const [espnSport, teams] of byLeague) {
    console.log(`📡 ${espnSport}`);

    let espnTeams: EspnTeam[];
    try {
      espnTeams = await fetchTeamsForLeague(espnSport);
    } catch (e: any) {
      console.error(`  ❌ Failed: ${e.message}`);
      continue;
    }

    for (const team of teams) {
      const result = findBestMatch(espnTeams, team.name);
      if (result) {
        team.espnId = result.team.id;
        console.log(`  ✅ ${team.name.padEnd(22)} → id=${result.team.id.padStart(4)}  (${result.team.displayName})`);
        updatedCount++;
      } else {
        console.log(`  ❌ ${team.name.padEnd(22)} → NOT FOUND`);
        // Print all teams in this league so we can debug
        console.log(`     Available teams: ${espnTeams.map(t => t.displayName).join(' | ')}`);
      }
    }
    console.log('');
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`✅ Updated ${updatedCount}/${config.teams.length} team IDs → cfg/sports-config.json`);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
