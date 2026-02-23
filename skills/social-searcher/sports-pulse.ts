import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

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

function findMatches(teamName: string, html: string) {
  const matches: any[] = [];
  
  // Flashscore mobile puts match data in lines or spans. 
  // Let's replace common tag endings with newlines to help splitting.
  const text = html.replace(/<\/span>|<\/h4>|<br \/>/g, '\n').replace(/<[^>]*>?/gm, ' ');
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (line.toLowerCase().includes(teamName.toLowerCase())) {
      const cleanLine = line.replace(/\s+/g, ' ').trim();
      
      // Look for indicators of a match line
      if (cleanLine.includes(':') || cleanLine.includes('-:-') || cleanLine.includes("'")) {
        // Final sanity check: make sure it's not a massive block of garbage
        if (cleanLine.length < 200) {
          matches.push({ summary: cleanLine });
        }
      }
    }
  }
  return matches;
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
  let allFlashscoreText = '';
  
  for (const pathSuffix of sportsPaths) {
    try {
      const text = execSync(`curl -sL -A "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1" "https://m.flashscore.com/${pathSuffix}"`, { encoding: 'utf8' });
      allFlashscoreText += '\n' + text;
    } catch (e: any) {
      console.error(`Failed to fetch Flashscore ${pathSuffix}:`, e.message);
    }
  }

  const results = [];
  for (const team of config.teams) {
    console.log(`🔍 Hunting for ${team.name} across all competitions...`);
    const matches = findMatches(team.name, allFlashscoreText);
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
