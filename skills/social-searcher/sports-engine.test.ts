/**
 * Unit tests for sports-engine.ts
 */

import {
  isMatchForTeam,
  isCompletedMatch,
  processMatch,
  filterByDateWindow,
  deduplicateMatches,
  sortMatches,
  formatDateShort,
  formatResultLine,
  formatUpcomingLine,
  buildSportsSection,
  type TeamConfig,
  type RawMatch,
  type ProcessedMatch,
} from './sports-engine.js';

// Test helpers
function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (e: any) {
    console.error(`❌ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// Test data
const celticsConfig: TeamConfig = {
  name: 'Celtics',
  league: 'NBA',
  sport: 'Basketball',
  country: 'USA'
};

const bruinsConfig: TeamConfig = {
  name: 'Bruins',
  league: 'NHL',
  sport: 'Hockey',
  country: 'USA'
};

const sunderlandConfig: TeamConfig = {
  name: 'Sunderland',
  league: 'Championship',
  sport: 'Soccer',
  country: 'England'
};

// Test: isMatchForTeam with strict sport matching
runTest('isMatchForTeam: Celtics NBA match (correct sport)', () => {
  const match: RawMatch = {
    time: '19:30',
    homeTeam: 'Boston Celtics',
    awayTeam: 'LA Lakers',
    sport: 'Basketball',
    effectiveDate: '2026-03-05'
  };
  assert(isMatchForTeam(match, celticsConfig), 'Should match Celtics NBA with Basketball sport');
});

runTest('isMatchForTeam: Celtic FC match (wrong sport for Celtics config)', () => {
  const match: RawMatch = {
    time: '15:00',
    homeTeam: 'Celtic',
    awayTeam: 'Rangers',
    sport: 'Soccer',
    effectiveDate: '2026-03-05'
  };
  assert(!isMatchForTeam(match, celticsConfig), 'Should NOT match Celtic FC soccer with Celtics NBA config');
});

runTest('isMatchForTeam: Bruins hockey match (correct)', () => {
  const match: RawMatch = {
    time: '19:00',
    homeTeam: 'Boston Bruins',
    awayTeam: 'Montreal Canadiens',
    sport: 'Hockey',
    effectiveDate: '2026-03-05'
  };
  assert(isMatchForTeam(match, bruinsConfig), 'Should match Bruins NHL with Hockey sport');
});

runTest('isMatchForTeam: Bruins basketball match (wrong sport)', () => {
  const match: RawMatch = {
    time: '19:00',
    homeTeam: 'Belmont Bruins',
    awayTeam: 'Valparaiso',
    sport: 'Basketball',
    effectiveDate: '2026-03-05'
  };
  assert(!isMatchForTeam(match, bruinsConfig), 'Should NOT match Bruins basketball with Bruins NHL hockey config');
});

// Test: isCompletedMatch
runTest('isCompletedMatch: Completed match with scores', () => {
  const match: RawMatch = {
    time: '19:30',
    homeTeam: 'Celtics',
    awayTeam: 'Lakers',
    homeScore: '111',
    awayScore: '89',
    effectiveDate: '2026-03-05'
  };
  assert(isCompletedMatch(match), 'Should identify completed match');
});

runTest('isCompletedMatch: Upcoming match without scores', () => {
  const match: RawMatch = {
    time: '19:30',
    homeTeam: 'Celtics',
    awayTeam: 'Lakers',
    homeScore: '-',
    awayScore: '-',
    effectiveDate: '2026-03-05'
  };
  assert(!isCompletedMatch(match), 'Should identify upcoming match');
});

// Test: processMatch for completed match
runTest('processMatch: Celtics WIN', () => {
  const match: RawMatch = {
    time: '19:30',
    homeTeam: 'Boston Celtics',
    awayTeam: 'LA Lakers',
    homeScore: '111',
    awayScore: '89',
    sport: 'Basketball',
    effectiveDate: '2026-03-05'
  };
  const processed = processMatch(match, celticsConfig);
  assert(processed !== null, 'Should process match');
  assert(processed?.type === 'result', 'Should be result type');
  assert(processed?.result === 'WIN', 'Should be WIN');
  assert(processed?.score === '111-89', 'Score should be 111-89');
  assert(processed?.opponent === 'LA Lakers', 'Opponent should be Lakers');
});

runTest('processMatch: Celtics LOSS', () => {
  const match: RawMatch = {
    time: '19:30',
    homeTeam: 'LA Lakers',
    awayTeam: 'Boston Celtics',
    homeScore: '111',
    awayScore: '89',
    sport: 'Basketball',
    effectiveDate: '2026-03-05'
  };
  const processed = processMatch(match, celticsConfig);
  assert(processed !== null, 'Should process match');
  assert(processed?.result === 'LOSS', 'Should be LOSS');
  assert(processed?.score === '89-111', 'Score should be 89-111');
});

// Test: processMatch for upcoming match
runTest('processMatch: Upcoming home match', () => {
  const match: RawMatch = {
    time: '19:30',
    homeTeam: 'Boston Celtics',
    awayTeam: 'LA Lakers',
    homeScore: '-',
    awayScore: '-',
    sport: 'Basketball',
    effectiveDate: '2026-03-06'
  };
  const processed = processMatch(match, celticsConfig);
  assert(processed !== null, 'Should process match');
  assert(processed?.type === 'upcoming', 'Should be upcoming type');
  assert(processed?.location === 'vs', 'Should be home game (vs)');
  assert(processed?.opponent === 'LA Lakers', 'Opponent should be Lakers');
});

runTest('processMatch: Upcoming away match', () => {
  const match: RawMatch = {
    time: '19:30',
    homeTeam: 'LA Lakers',
    awayTeam: 'Boston Celtics',
    homeScore: '-',
    awayScore: '-',
    sport: 'Basketball',
    effectiveDate: '2026-03-06'
  };
  const processed = processMatch(match, celticsConfig);
  assert(processed !== null, 'Should process match');
  assert(processed?.location === '@', 'Should be away game (@)');
});

// Test: filterByDateWindow
runTest('filterByDateWindow: Filter results by window', () => {
  const matches: ProcessedMatch[] = [
    { team: 'Celtics', sport: 'Basketball', type: 'result', date: '2026-03-02', result: 'WIN', score: '100-90', opponent: 'Lakers' },
    { team: 'Celtics', sport: 'Basketball', type: 'result', date: '2026-03-04', result: 'WIN', score: '105-95', opponent: 'Nets' },
    { team: 'Celtics', sport: 'Basketball', type: 'result', date: '2026-03-06', result: 'WIN', score: '110-100', opponent: 'Heat' },
  ];
  const filtered = filterByDateWindow(matches, '2026-03-02', '2026-03-04');
  assert(filtered.length === 2, 'Should filter to 2 matches in window');
  assert(filtered[0].date === '2026-03-02', 'First match date correct');
  assert(filtered[1].date === '2026-03-04', 'Second match date correct');
});

// Test: deduplicateMatches
runTest('deduplicateMatches: Remove duplicates', () => {
  const matches: ProcessedMatch[] = [
    { team: 'Celtics', sport: 'Basketball', type: 'result', date: '2026-03-04', result: 'WIN', score: '105-95', opponent: 'Nets', time: '19:30' },
    { team: 'Celtics', sport: 'Basketball', type: 'result', date: '2026-03-04', result: 'WIN', score: '105-95', opponent: 'Nets', time: '19:30' },
    { team: 'Celtics', sport: 'Basketball', type: 'result', date: '2026-03-05', result: 'LOSS', score: '90-100', opponent: 'Heat', time: '20:00' },
  ];
  const deduped = deduplicateMatches(matches);
  assert(deduped.length === 2, 'Should deduplicate to 2 unique matches');
});

// Test: sortMatches
runTest('sortMatches: Sort by date then team', () => {
  const matches: ProcessedMatch[] = [
    { team: 'Red Sox', sport: 'Baseball', type: 'result', date: '2026-03-05', result: 'WIN', score: '5-3', opponent: 'Yankees' },
    { team: 'Celtics', sport: 'Basketball', type: 'result', date: '2026-03-05', result: 'WIN', score: '105-95', opponent: 'Nets' },
    { team: 'Bruins', sport: 'Hockey', type: 'result', date: '2026-03-04', result: 'WIN', score: '4-2', opponent: 'Canadiens' },
  ];
  const sorted = sortMatches(matches);
  assert(sorted[0].date === '2026-03-04', 'First match by date');
  assert(sorted[1].team === 'Celtics', 'Second match Celtics (alphabetically before Red Sox)');
  assert(sorted[2].team === 'Red Sox', 'Third match Red Sox');
});

// Test: formatDateShort
runTest('formatDateShort: Format date correctly', () => {
  const formatted = formatDateShort('2026-03-05');
  assert(formatted === 'Mar 5', 'Should format as Mar 5');
});

// Test: formatResultLine
runTest('formatResultLine: Format WIN correctly', () => {
  const match: ProcessedMatch = {
    team: 'Celtics',
    sport: 'Basketball',
    type: 'result',
    date: '2026-03-05',
    result: 'WIN',
    score: '111-89',
    opponent: 'Lakers'
  };
  const line = formatResultLine(match);
  assert(line.includes('CELTICS'), 'Should include team name');
  assert(line.includes('WIN'), 'Should include result');
  assert(line.includes('🟢'), 'Should include green emoji');
  assert(line.includes('111-89'), 'Should include score');
  assert(line.includes('Lakers'), 'Should include opponent');
  assert(line.includes('Mar 5'), 'Should include formatted date');
});

// Test: formatUpcomingLine
runTest('formatUpcomingLine: Format upcoming match', () => {
  const match: ProcessedMatch = {
    team: 'Celtics',
    sport: 'Basketball',
    type: 'upcoming',
    date: '2026-03-06',
    location: 'vs',
    opponent: 'Lakers',
    time: '19:30'
  };
  const line = formatUpcomingLine(match);
  assert(line.includes('CELTICS'), 'Should include team name');
  assert(line.includes('vs'), 'Should include location');
  assert(line.includes('Lakers'), 'Should include opponent');
  assert(line.includes('Mar 6'), 'Should include formatted date');
  assert(line.includes('19:30'), 'Should include time');
});

// Test: buildSportsSection integration
runTest('buildSportsSection: Full integration test', () => {
  const rawMatches: RawMatch[] = [
    // Celtics results (Mar 2, 3, 4)
    { time: '19:30', homeTeam: 'Boston Celtics', awayTeam: 'LA Lakers', homeScore: '111', awayScore: '89', sport: 'Basketball', effectiveDate: '2026-03-02' },
    { time: '20:00', homeTeam: 'Miami Heat', awayTeam: 'Boston Celtics', homeScore: '95', awayScore: '105', sport: 'Basketball', effectiveDate: '2026-03-04' },

    // Celtics upcoming (Mar 5, 6)
    { time: '19:00', homeTeam: 'Boston Celtics', awayTeam: 'Brooklyn Nets', homeScore: '-', awayScore: '-', sport: 'Basketball', effectiveDate: '2026-03-05' },

    // Sunderland result (Mar 3)
    { time: '15:00', homeTeam: 'Sunderland', awayTeam: 'Leeds', homeScore: '1', awayScore: '0', sport: 'Soccer', effectiveDate: '2026-03-03' },

    // Wrong sport match (should be filtered out)
    { time: '19:00', homeTeam: 'Belmont Bruins', awayTeam: 'Valparaiso', homeScore: '75', awayScore: '70', sport: 'Basketball', effectiveDate: '2026-03-04' },
  ];

  const section = buildSportsSection(rawMatches, '2026-03-05');

  assert(section.stats.resultsCount >= 2, 'Should have at least 2 results');
  assert(section.stats.upcomingCount >= 1, 'Should have at least 1 upcoming');
  assert(section.mobileText.includes('RESULTS'), 'Should include RESULTS section');
  assert(section.mobileText.includes('UPCOMING'), 'Should include UPCOMING section');
  assert(section.mobileText.includes('CELTICS'), 'Should include Celtics');
  assert(section.mobileText.includes('SUNDERLAND'), 'Should include Sunderland');
  assert(!section.mobileText.includes('Belmont'), 'Should NOT include wrong-sport Bruins');
});

console.log('\n🏁 All tests complete!');
