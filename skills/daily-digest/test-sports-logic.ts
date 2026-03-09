// Test script to validate the findTeamMatches logic
interface MatchData {
  time: string;
  homeTeam: string;
  awayTeam: string;
  homeScore?: string;
  awayScore?: string;
  status?: string;
  competition?: string;
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

// Test data
const testMatches: MatchData[] = [
  // Celtics completed match (yesterday)
  {
    time: '00:30',
    homeTeam: 'Los Angeles Lakers',
    awayTeam: 'Boston Celtics',
    homeScore: '89',
    awayScore: '111',
    competition: 'NBA'
  },
  // Borussia Dortmund upcoming match (today)
  {
    time: '21:00',
    homeTeam: 'Borussia Dortmund',
    awayTeam: 'Shakhtar Donetsk',
    homeScore: '-',
    awayScore: '-',
    competition: 'UEFA Champions League'
  },
  // Wrexham completed match (yesterday)
  {
    time: '20:45',
    homeTeam: 'Wrexham',
    awayTeam: 'Portsmouth',
    homeScore: '2',
    awayScore: '1',
    competition: 'EFL Championship'
  }
];

console.log('Testing findTeamMatches logic:\n');

// Test Celtics
console.log('1. Celtics:');
const celticsMatches = findTeamMatches('Celtics', testMatches);
console.log(JSON.stringify(celticsMatches, null, 2));
console.log(`   Found ${celticsMatches.length} match(es)\n`);

// Test Borussia Dortmund
console.log('2. Borussia Dortmund:');
const dortmundMatches = findTeamMatches('Borussia Dortmund', testMatches);
console.log(JSON.stringify(dortmundMatches, null, 2));
console.log(`   Found ${dortmundMatches.length} match(es)\n`);

// Test Wrexham
console.log('3. Wrexham:');
const wrexhamMatches = findTeamMatches('Wrexham', testMatches);
console.log(JSON.stringify(wrexhamMatches, null, 2));
console.log(`   Found ${wrexhamMatches.length} match(es)\n`);

// Test Bruins (no matches)
console.log('4. Bruins (no matches):');
const bruinsMatches = findTeamMatches('Bruins', testMatches);
console.log(JSON.stringify(bruinsMatches, null, 2));
console.log(`   Found ${bruinsMatches.length} match(es)\n`);
