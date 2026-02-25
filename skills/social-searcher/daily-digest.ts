import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('🦖 Starting Daily Digest Generation...');
  
  const date = new Date().toISOString().split('T')[0];
  const outputDir = path.join(process.env.HOME || '', '.openclaw/data/social-searcher');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const huntFile = path.join(outputDir, `search-results-${date}.json`);
  const pulseFile = path.join(outputDir, `reddit-pulse-${date}.json`);
  const sportsFile = path.join(outputDir, `sports-results-${date}.json`);
  const digestFile = path.join(outputDir, `daily-digest-${date}.md`);

  try {
    // 1. Run Keyword Hunt
    console.log('🔍 Running Keyword Hunt...');
    execSync('npx ts-node --esm social-searcher.ts', { cwd: __dirname });

    // 2. Run Reddit Pulse
    console.log('🔍 Running Reddit Pulse...');
    execSync('npx ts-node --esm reddit-pulse.ts', { cwd: __dirname });

    // 3. Run Sports Pulse
    console.log('🔍 Running Sports Pulse...');
    execSync('npx ts-node --esm sports-pulse.ts', { cwd: __dirname });

    // 4. Load results
    const huntData = fs.existsSync(huntFile) ? JSON.parse(fs.readFileSync(huntFile, 'utf-8')) : [];
    const pulseData = fs.existsSync(pulseFile) ? JSON.parse(fs.readFileSync(pulseFile, 'utf-8')) : [];
    const sportsData = fs.existsSync(sportsFile) ? JSON.parse(fs.readFileSync(sportsFile, 'utf-8')) : [];

    // 5. Build JSON Wrapper for AI Synthesis
    const rawDataSummary = {
      date,
      huntData: huntData.slice(0, 40), 
      pulseData: pulseData.slice(0, 60),
      sportsData
    };

    const rawDataPath = path.join(outputDir, `raw-data-${date}.json`);
    fs.writeFileSync(rawDataPath, JSON.stringify(rawDataSummary, null, 2));

    console.log('🦖 Raw data collected. Powering up Rex Engine for synthesis...');

    // 6. Run Rex Engine for Synthesis and Delivery
    execSync('npx ts-node --esm rex-engine.ts', { cwd: __dirname, stdio: 'inherit' });

    console.log('🦖 Daily Digest complete and delivered!');

  } catch (error: any) {
    console.error('❌ Failed to generate digest:', error.message);
  }
}

main();
