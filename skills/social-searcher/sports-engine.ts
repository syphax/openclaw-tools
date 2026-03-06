/**
 * Clean Sports Engine - Deterministic sports section generation.
 *
 * Hard requirements:
 * 1. Strict team+sport matching (no wrong Bruins/Celtics)
 * 2. Windows: results past 3 days, upcoming today+2 days (relative to run day)
 * 3. Output THREE sections: RESULTS, UPCOMING, QUIET STADIUM
 * 4. One line per event, include date on each event
 * 5. Dedupe guaranteed
 * 6. Sort by date then team name
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TeamConfig {
  name: string;
  league: string;
  sport: string;
  country: string;
}

export interface SportsConfig {
  teams: TeamConfig[];
}

export interface RawMatch {
  eventId?: string; // ESPN event ID — unique per game, used as dedup key when present
  time: string;
  homeTeam: string;
  awayTeam: string;
  homeScore?: string;
  awayScore?: string;
  status?: string;
  competition?: string;
  effectiveDate?: string;
  sport?: string; // Added by scraper to disambiguate
}

export interface ProcessedMatch {
  team: string;
  sport: string;
  type: 'result' | 'upcoming';
  date: string; // YYYY-MM-DD
  eventId?: string; // Passed through from RawMatch for deduplication

  // For results
  result?: 'WIN' | 'LOSS' | 'DRAW';
  score?: string; // e.g., "111-89"
  opponent?: string;

  // For upcoming
  location?: 'vs' | '@';
  time?: string;
  matchup?: string;
}

export interface FormattedSports {
  emailHtml: string;
  mobileText: string;
  stats: {
    resultsCount: number;
    upcomingCount: number;
    quietTeamsCount: number;
    teamsWithActivity: string[];
    quietTeams: string[];
  };
}

/**
 * Load sports configuration.
 */
export function loadSportsConfig(): SportsConfig {
  const configPath = path.join(__dirname, 'cfg/sports-config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

/**
 * Check if a scraped match involves a configured team, with strict sport matching.
 *
 * @param match - Raw match from scraper
 * @param teamConfig - Team configuration
 * @returns true if match is for this team with correct sport
 */
export function isMatchForTeam(match: RawMatch, teamConfig: TeamConfig): boolean {
  const teamLower = teamConfig.name.toLowerCase();
  const homeLower = match.homeTeam.toLowerCase();
  const awayLower = match.awayTeam.toLowerCase();

  // Check if team name matches
  const nameMatches =
    homeLower.includes(teamLower) ||
    awayLower.includes(teamLower) ||
    teamLower.includes(homeLower) ||
    teamLower.includes(awayLower);

  if (!nameMatches) {
    return false;
  }

  // STRICT: Sport must match
  // Scraper should set match.sport based on which page it came from
  // (e.g., "Soccer", "Basketball", "Hockey", "Baseball")
  if (match.sport && teamConfig.sport) {
    const matchSportLower = match.sport.toLowerCase();
    const configSportLower = teamConfig.sport.toLowerCase();

    // Allow some flexibility (e.g., "Football" == "Soccer")
    const sportsMatch =
      matchSportLower === configSportLower ||
      (matchSportLower === 'football' && configSportLower === 'soccer') ||
      (matchSportLower === 'soccer' && configSportLower === 'football');

    if (!sportsMatch) {
      return false; // REJECT: Wrong sport (e.g., Bruins basketball vs Bruins hockey)
    }
  }

  return true;
}

/**
 * Determine if a match is completed or upcoming.
 */
export function isCompletedMatch(match: RawMatch): boolean {
  return !!(
    match.homeScore &&
    match.awayScore &&
    match.homeScore !== '-' &&
    match.awayScore !== '-' &&
    !match.homeScore.includes(':') &&
    !match.awayScore.includes(':')
  );
}

/**
 * Process a raw match into our structured format.
 */
export function processMatch(
  match: RawMatch,
  teamConfig: TeamConfig
): ProcessedMatch | null {
  const teamLower = teamConfig.name.toLowerCase();
  const homeLower = match.homeTeam.toLowerCase();
  const awayLower = match.awayTeam.toLowerCase();
  const isHome = homeLower.includes(teamLower) || teamLower.includes(homeLower);

  if (!match.effectiveDate) {
    return null; // Skip matches without dates
  }

  if (isCompletedMatch(match)) {
    // Completed match - result
    const ourScore = isHome ? match.homeScore : match.awayScore;
    const oppScore = isHome ? match.awayScore : match.homeScore;
    const opponent = isHome ? match.awayTeam : match.homeTeam;

    let result: 'WIN' | 'LOSS' | 'DRAW' = 'DRAW';
    const ourScoreNum = parseInt(ourScore || '0', 10);
    const oppScoreNum = parseInt(oppScore || '0', 10);

    if (ourScoreNum > oppScoreNum) {
      result = 'WIN';
    } else if (ourScoreNum < oppScoreNum) {
      result = 'LOSS';
    }

    return {
      team: teamConfig.name,
      sport: teamConfig.sport,
      type: 'result',
      date: match.effectiveDate,
      eventId: match.eventId,
      result,
      score: `${ourScore}-${oppScore}`,
      opponent,
    };
  } else {
    // Upcoming match
    const opponent = isHome ? match.awayTeam : match.homeTeam;
    const location: 'vs' | '@' = isHome ? 'vs' : '@';

    return {
      team: teamConfig.name,
      sport: teamConfig.sport,
      type: 'upcoming',
      date: match.effectiveDate,
      eventId: match.eventId,
      location,
      opponent,
      time: match.time,
      matchup: `${match.homeTeam} vs ${match.awayTeam}`,
    };
  }
}

/**
 * Filter matches by date window.
 *
 * @param matches - Array of processed matches
 * @param startDate - Start date (inclusive, YYYY-MM-DD)
 * @param endDate - End date (inclusive, YYYY-MM-DD)
 */
export function filterByDateWindow(
  matches: ProcessedMatch[],
  startDate: string,
  endDate: string
): ProcessedMatch[] {
  return matches.filter(m => m.date >= startDate && m.date <= endDate);
}

/**
 * Deduplicate matches based on key attributes.
 */
export function deduplicateMatches(matches: ProcessedMatch[]): ProcessedMatch[] {
  const seen = new Set<string>();
  return matches.filter(match => {
    // Prefer ESPN event ID (globally unique); fall back to attribute composite key
    const key = match.eventId
      ? `${match.team}|${match.eventId}`
      : `${match.team}|${match.type}|${match.date}|${match.opponent}|${match.time}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Sort matches by date (ascending) then team name (alphabetically).
 */
export function sortMatches(matches: ProcessedMatch[]): ProcessedMatch[] {
  return matches.sort((a, b) => {
    // First by date
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    // Then by team name
    return a.team.localeCompare(b.team);
  });
}

/**
 * Format a date as "Mar 5" for display.
 */
export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z'); // Parse as UTC
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/**
 * Format a single result line.
 */
export function formatResultLine(match: ProcessedMatch): string {
  const emoji = match.result === 'WIN' ? '🟢' : match.result === 'LOSS' ? '🔴' : '🟡';
  const dateShort = formatDateShort(match.date);
  return `${match.team.toUpperCase()}: ${match.result} ${emoji} (${match.score} vs ${match.opponent}, ${dateShort})`;
}

/**
 * Format a single upcoming match line.
 */
export function formatUpcomingLine(match: ProcessedMatch): string {
  const dateShort = formatDateShort(match.date);
  const timeStr = match.time ? ` at ${match.time}` : '';
  return `${match.team.toUpperCase()}: ${match.location} ${match.opponent}, ${dateShort}${timeStr}`;
}

/**
 * Build the complete sports section with THREE sections.
 *
 * @param rawMatches - All raw matches from scraper
 * @param runDate - The date the digest is being generated (YYYY-MM-DD)
 */
export function buildSportsSection(
  rawMatches: RawMatch[],
  runDate: string
): FormattedSports {
  const config = loadSportsConfig();

  // Calculate date windows
  const runDateObj = new Date(runDate + 'T00:00:00Z');

  // Results: past 3 days (runDate - 3 to runDate - 1)
  const resultsStart = new Date(runDateObj);
  resultsStart.setUTCDate(resultsStart.getUTCDate() - 3);
  const resultsStartStr = resultsStart.toISOString().split('T')[0];

  const resultsEnd = new Date(runDateObj);
  resultsEnd.setUTCDate(resultsEnd.getUTCDate() - 1);
  const resultsEndStr = resultsEnd.toISOString().split('T')[0];

  // Upcoming: today + 2 days (runDate to runDate + 2)
  const upcomingStart = runDate;
  const upcomingEnd = new Date(runDateObj);
  upcomingEnd.setUTCDate(upcomingEnd.getUTCDate() + 2);
  const upcomingEndStr = upcomingEnd.toISOString().split('T')[0];

  // Process all matches for all teams
  const allResults: ProcessedMatch[] = [];
  const allUpcoming: ProcessedMatch[] = [];
  const teamsWithActivity = new Set<string>();

  for (const teamConfig of config.teams) {
    const teamMatches = rawMatches
      .filter(m => isMatchForTeam(m, teamConfig))
      .map(m => processMatch(m, teamConfig))
      .filter((m): m is ProcessedMatch => m !== null);

    // Filter by date windows
    const results = filterByDateWindow(teamMatches.filter(m => m.type === 'result'), resultsStartStr, resultsEndStr);
    const upcoming = filterByDateWindow(teamMatches.filter(m => m.type === 'upcoming'), upcomingStart, upcomingEndStr);

    if (results.length > 0 || upcoming.length > 0) {
      teamsWithActivity.add(teamConfig.name);
    }

    allResults.push(...results);
    allUpcoming.push(...upcoming);
  }

  // Deduplicate and sort
  const dedupedResults = sortMatches(deduplicateMatches(allResults));
  const dedupedUpcoming = sortMatches(deduplicateMatches(allUpcoming));

  // Identify quiet teams
  const quietTeams = config.teams
    .filter(t => !teamsWithActivity.has(t.name))
    .map(t => t.name)
    .sort();

  // Build output text
  const lines: string[] = [];

  // Section 1: RESULTS
  if (dedupedResults.length > 0) {
    lines.push('⚽ RESULTS');
    lines.push('');
    dedupedResults.forEach(match => {
      lines.push(formatResultLine(match));
    });
    lines.push('');
  }

  // Section 2: UPCOMING
  if (dedupedUpcoming.length > 0) {
    lines.push('📅 UPCOMING');
    lines.push('');
    dedupedUpcoming.forEach(match => {
      lines.push(formatUpcomingLine(match));
    });
    lines.push('');
  }

  // Section 3: QUIET STADIUM
  if (quietTeams.length > 0) {
    lines.push(`🏟️ QUIET STADIUM: ${quietTeams.join(', ')}`);
  }

  const plainText = lines.join('\n').trim();

  return {
    emailHtml: plainText.replace(/\n/g, '<br>\n'),
    mobileText: plainText,
    stats: {
      resultsCount: dedupedResults.length,
      upcomingCount: dedupedUpcoming.length,
      quietTeamsCount: quietTeams.length,
      teamsWithActivity: Array.from(teamsWithActivity).sort(),
      quietTeams,
    },
  };
}
