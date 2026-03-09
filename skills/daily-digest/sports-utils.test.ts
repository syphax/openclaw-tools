/**
 * Tests for sports-utils.ts
 * Run with: npx ts-node --esm sports-utils.test.ts
 */

import {
  getDisambiguatedTeamName,
  deduplicateMatches,
  filterPastThreeDays,
  filterNextTwoDays,
  formatCompletedMatch,
  formatUpcomingMatch,
  buildSportsSection,
  type SportsMatch,
  type TeamSportsData,
} from './sports-utils.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Test failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

function testCelticsDisambiguation() {
  console.log('\n📋 Testing Celtics disambiguation...');

  const nba = getDisambiguatedTeamName('Celtics', 'Basketball', 'NBA');
  assert(nba === 'Celtics (NBA)', 'Celtics in Basketball should be NBA');

  const soccer = getDisambiguatedTeamName('Celtic', 'Soccer', 'Scottish Premiership');
  assert(soccer === 'Celtic FC', 'Celtic in Soccer should be Celtic FC');

  const generic = getDisambiguatedTeamName('Bruins', 'Hockey', 'NHL');
  assert(generic === 'Bruins', 'Non-ambiguous teams should keep their name');
}

function testDeduplication() {
  console.log('\n📋 Testing match deduplication...');

  const matches: SportsMatch[] = [
    {
      type: 'completed',
      result: 'WIN',
      opponent: 'Lakers',
      score: '110-95',
      time: '19:30',
      effectiveDate: '2026-03-04',
    },
    {
      type: 'completed',
      result: 'WIN',
      opponent: 'Lakers',
      score: '110-95',
      time: '19:30',
      effectiveDate: '2026-03-04',
    },
    {
      type: 'upcoming',
      opponent: 'Warriors',
      location: 'vs',
      time: '20:00',
      effectiveDate: '2026-03-06',
    },
  ];

  const deduped = deduplicateMatches(matches);
  assert(deduped.length === 2, 'Should remove duplicate completed match');
}

function testDateFiltering() {
  console.log('\n📋 Testing date filtering...');

  const refDate = new Date('2026-03-05T12:00:00Z');

  const completedMatches: SportsMatch[] = [
    { type: 'completed', result: 'WIN', opponent: 'A', time: '19:00', effectiveDate: '2026-03-05' }, // Today
    { type: 'completed', result: 'LOSS', opponent: 'B', time: '19:00', effectiveDate: '2026-03-04' }, // Yesterday
    { type: 'completed', result: 'WIN', opponent: 'C', time: '19:00', effectiveDate: '2026-03-03' }, // 2 days ago
    { type: 'completed', result: 'WIN', opponent: 'D', time: '19:00', effectiveDate: '2026-03-02' }, // 3 days ago
    { type: 'completed', result: 'LOSS', opponent: 'E', time: '19:00', effectiveDate: '2026-03-01' }, // 4 days ago (should be filtered)
  ];

  const filtered = filterPastThreeDays(completedMatches, refDate);
  assert(filtered.length === 4, 'Should keep matches from past 3 days (today, -1, -2, -3)');

  const upcomingMatches: SportsMatch[] = [
    { type: 'upcoming', opponent: 'F', location: 'vs', time: '20:00', effectiveDate: '2026-03-05' }, // Today
    { type: 'upcoming', opponent: 'G', location: '@', time: '19:00', effectiveDate: '2026-03-06' }, // Tomorrow
    { type: 'upcoming', opponent: 'H', location: 'vs', time: '21:00', effectiveDate: '2026-03-07' }, // +2 days
    { type: 'upcoming', opponent: 'I', location: '@', time: '18:00', effectiveDate: '2026-03-08' }, // +3 days (should be filtered)
  ];

  const filteredUpcoming = filterNextTwoDays(upcomingMatches, refDate);
  assert(filteredUpcoming.length === 3, 'Should keep matches for today + next 2 days');
}

function testFormatting() {
  console.log('\n📋 Testing match formatting...');

  const completedMatch: SportsMatch = {
    type: 'completed',
    result: 'WIN',
    opponent: 'Lakers',
    score: '110-95',
    time: '19:30',
  };

  const formatted = formatCompletedMatch(completedMatch, 'Celtics');
  assert(formatted.includes('WIN'), 'Should include result');
  assert(formatted.includes('🟢'), 'Should include green emoji for win');
  assert(formatted.includes('110-95'), 'Should include score');
  assert(formatted.includes('Lakers'), 'Should include opponent');

  const upcomingMatch: SportsMatch = {
    type: 'upcoming',
    opponent: 'Warriors',
    location: 'vs',
    time: '20:00',
  };

  const formattedUpcoming = formatUpcomingMatch(upcomingMatch);
  assert(formattedUpcoming.includes('vs'), 'Should include location');
  assert(formattedUpcoming.includes('Warriors'), 'Should include opponent');
  assert(formattedUpcoming.includes('20:00'), 'Should include time');
}

function testBuildSportsSection() {
  console.log('\n📋 Testing sports section building...');

  const sportsData: TeamSportsData[] = [
    {
      team: 'Celtics',
      sport: 'Basketball',
      completed: [
        {
          type: 'completed',
          result: 'WIN',
          opponent: 'Lakers',
          score: '110-95',
          time: '19:30',
          effectiveDate: '2026-03-04',
        },
      ],
      upcoming: [
        {
          type: 'upcoming',
          opponent: 'Warriors',
          location: 'vs',
          time: '20:00',
          effectiveDate: '2026-03-06',
        },
      ],
    },
    {
      team: 'Red Sox',
      sport: 'Baseball',
      completed: [],
      upcoming: [],
    },
    {
      team: 'Bruins',
      sport: 'Hockey',
      completed: [],
      upcoming: [],
    },
  ];

  const section = buildSportsSection(sportsData, false);

  assert(section.includes('CELTICS (NBA)'), 'Should include disambiguated Celtics team');
  assert(section.includes('WIN 🟢'), 'Should include completed match result');
  assert(section.includes('vs Warriors'), 'Should include upcoming match');
  assert(section.includes('Quiet Stadium'), 'Should include quiet teams section');
  assert(section.includes('Red Sox'), 'Should list quiet team Red Sox');
  assert(section.includes('Bruins'), 'Should list quiet team Bruins');

  console.log('\n📄 Generated section:\n', section);
}

function runAllTests() {
  console.log('🧪 Running sports-utils tests...\n');

  try {
    testCelticsDisambiguation();
    testDeduplication();
    testDateFiltering();
    testFormatting();
    testBuildSportsSection();

    console.log('\n✅ All tests passed!\n');
  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

runAllTests();
