/**
 * Utilities for deterministic sports section formatting.
 * Handles result categorization, disambiguation, deduplication, and formatting.
 */

export interface SportsMatch {
  type: 'completed' | 'upcoming';
  result?: 'WIN' | 'LOSS' | 'DRAW';
  opponent: string;
  score?: string;
  location?: string;
  time: string;
  matchup?: string;
  competition?: string;
  effectiveDate?: string;
  fullScore?: string;
}

export interface TeamSportsData {
  team: string;
  sport: string;
  completed: SportsMatch[];
  upcoming: SportsMatch[];
  summary?: string;
}

export interface FormattedSportsSection {
  emailHtml: string;
  mobileText: string;
}

/**
 * Disambiguate team names to avoid confusion (e.g., Celtics NBA vs Celtic FC).
 * Uses the sports-config.json league information.
 *
 * @param team - Team name
 * @param sport - Sport type
 * @param league - League name
 */
export function getDisambiguatedTeamName(team: string, sport: string, league?: string): string {
  const teamLower = team.toLowerCase();

  // Special case: Celtics (NBA) vs Celtic (Scottish football)
  if (teamLower.includes('celtic')) {
    if (sport === 'Basketball' || league === 'NBA') {
      return 'Celtics (NBA)';
    }
    // If it's football/soccer, likely the Scottish team
    if (sport === 'Soccer' || sport === 'Football') {
      return 'Celtic FC';
    }
  }

  return team;
}

/**
 * Deduplicate sports matches based on key attributes.
 * Prevents the same match from appearing multiple times.
 *
 * @param matches - Array of matches
 */
export function deduplicateMatches(matches: SportsMatch[]): SportsMatch[] {
  const seen = new Set<string>();
  return matches.filter(match => {
    const key = `${match.type}|${match.opponent}|${match.time}|${match.effectiveDate || ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Filter completed matches to show only the past 3 days.
 *
 * @param matches - Array of completed matches
 * @param refDate - Reference date (defaults to today)
 */
export function filterPastThreeDays(matches: SportsMatch[], refDate?: Date): SportsMatch[] {
  const ref = refDate || new Date();
  const threeDaysAgo = new Date(ref);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const cutoffStr = threeDaysAgo.toISOString().split('T')[0];

  return matches.filter(match => {
    if (!match.effectiveDate) return true; // Keep if no date info
    return match.effectiveDate >= cutoffStr;
  });
}

/**
 * Filter upcoming matches to show only today + next 2 days.
 *
 * @param matches - Array of upcoming matches
 * @param refDate - Reference date (defaults to today)
 */
export function filterNextTwoDays(matches: SportsMatch[], refDate?: Date): SportsMatch[] {
  const ref = refDate || new Date();
  const twoDaysFromNow = new Date(ref);
  twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
  const cutoffStr = twoDaysFromNow.toISOString().split('T')[0];

  return matches.filter(match => {
    if (!match.effectiveDate) return true; // Keep if no date info
    return match.effectiveDate <= cutoffStr;
  });
}

/**
 * Format a single completed match result.
 *
 * @param match - Completed match
 * @param teamName - Name of the team (for display)
 */
export function formatCompletedMatch(match: SportsMatch, teamName: string): string {
  const resultEmoji = match.result === 'WIN' ? '🟢' : match.result === 'LOSS' ? '🔴' : '🟡';
  const score = match.score || 'N/A';
  const opponent = match.opponent;

  return `${match.result} ${resultEmoji} (${score} vs ${opponent})`;
}

/**
 * Format a single upcoming match.
 *
 * @param match - Upcoming match
 */
export function formatUpcomingMatch(match: SportsMatch): string {
  const location = match.location || 'vs';
  return `${location} ${match.opponent} at ${match.time}`;
}

/**
 * Build deterministic sports section with proper structure, deduplication,
 * and correct Celtics disambiguation.
 *
 * @param sportsData - Array of team sports data
 * @param useHtml - If true, format for email (HTML), else for mobile (plain text)
 */
export function buildSportsSection(sportsData: TeamSportsData[], useHtml: boolean = false): string {
  const lines: string[] = [];
  const quietTeams: string[] = [];

  // Process each team
  for (const teamData of sportsData) {
    let completed = deduplicateMatches(teamData.completed);
    let upcoming = deduplicateMatches(teamData.upcoming);

    // Filter by date ranges
    completed = filterPastThreeDays(completed);
    upcoming = filterNextTwoDays(upcoming);

    const hasActivity = completed.length > 0 || upcoming.length > 0;

    if (!hasActivity) {
      // No activity - add to quiet teams
      quietTeams.push(teamData.team);
      continue;
    }

    // Team has activity - format results
    const teamName = getDisambiguatedTeamName(teamData.team, teamData.sport);
    const teamLines: string[] = [];

    // Add completed matches
    completed.forEach(match => {
      teamLines.push(formatCompletedMatch(match, teamName));
    });

    // Add upcoming matches
    upcoming.forEach(match => {
      teamLines.push(formatUpcomingMatch(match));
    });

    // Combine team results
    const teamSummary = `${teamName.toUpperCase()}: ${teamLines.join('. ')}`;
    lines.push(teamSummary);
  }

  // Add quiet teams section
  if (quietTeams.length > 0) {
    lines.push('');
    lines.push(`🏟️ Quiet Stadium: ${quietTeams.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Build sports section formatted specifically for email (HTML) and mobile (plain text).
 *
 * @param sportsData - Array of team sports data
 */
export function buildFormattedSportsSection(sportsData: TeamSportsData[]): FormattedSportsSection {
  // For now, both use the same logic (plain text)
  // HTML version could add <br> tags or other formatting later
  const plainText = buildSportsSection(sportsData, false);

  return {
    emailHtml: plainText.replace(/\n/g, '<br>\n'),
    mobileText: plainText
  };
}

/**
 * Log sports processing statistics for debugging.
 *
 * @param sportsData - Array of team sports data
 */
export function logSportsStats(sportsData: TeamSportsData[]): void {
  console.log('\n⚽ Sports Section Stats:');

  let totalCompleted = 0;
  let totalUpcoming = 0;
  let activeTeams = 0;

  sportsData.forEach(team => {
    const completed = deduplicateMatches(filterPastThreeDays(team.completed));
    const upcoming = deduplicateMatches(filterNextTwoDays(team.upcoming));

    totalCompleted += completed.length;
    totalUpcoming += upcoming.length;

    if (completed.length > 0 || upcoming.length > 0) {
      activeTeams++;
      console.log(`  ${team.team}: ${completed.length} completed, ${upcoming.length} upcoming`);
    }
  });

  const quietTeams = sportsData.filter(team => {
    const completed = deduplicateMatches(filterPastThreeDays(team.completed));
    const upcoming = deduplicateMatches(filterNextTwoDays(team.upcoming));
    return completed.length === 0 && upcoming.length === 0;
  });

  console.log(`  Total: ${activeTeams} active teams, ${quietTeams.length} quiet teams`);
  console.log(`  Matches: ${totalCompleted} completed, ${totalUpcoming} upcoming`);
}
