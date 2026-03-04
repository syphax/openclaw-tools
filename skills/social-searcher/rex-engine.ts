import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const addressCfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'cfg', 'addresses.json'), 'utf-8'));

function readCredentialsEnv(): string {
  try {
    const p = path.join(process.env.HOME || '', '.openclaw/credentials/.env');
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return '';
  }
}

function readEnvVarFromText(content: string, key: string): string | undefined {
  const re = new RegExp(`^${key}=(.*)$`, 'm');
  const m = content.match(re);
  return m?.[1]?.trim();
}

const credentialsEnv = readCredentialsEnv();
const RESOLVED_GOG_KEYRING_PASSWORD =
  process.env.GOG_KEYRING_PASSWORD || readEnvVarFromText(credentialsEnv, 'GOG_KEYRING_PASSWORD');
const RESOLVED_GOG_KEYRING_BACKEND =
  process.env.GOG_KEYRING_BACKEND || readEnvVarFromText(credentialsEnv, 'GOG_KEYRING_BACKEND') || 'file';

interface ChannelStatus {
  ok: boolean;
  error?: string;
  stdout?: string;
  stderr?: string;
}

interface DeliveryStatus {
  date: string;
  generatedAt: string;
  synthesize: ChannelStatus;
  email: ChannelStatus;
  mobile: {
    whatsapp: ChannelStatus;
    telegram: ChannelStatus;
  };
  overallOk: boolean;
}

function statusPathForDate(date: string): string {
  const outputDir = path.join(process.env.HOME || '', '.openclaw/data/social-searcher');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  return path.join(outputDir, `delivery-status-${date}.json`);
}

function writeDeliveryStatus(status: DeliveryStatus) {
  const outPath = statusPathForDate(status.date);
  fs.writeFileSync(outPath, JSON.stringify(status, null, 2));
  console.log(`🧾 Delivery status written: ${outPath}`);
}

async function synthesize(rawData: any) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not found in environment.');
  }

  const prompt = `
You are Rex, an insight-hungry AI curator. Your task is to synthesize raw social and sports data into a "Daily Digest" for Brian (BCC).

### DATA:
${JSON.stringify(rawData, null, 2)}

### SPECIFICATIONS:
1. **Keyword Roundup:**
   - Select 8-10 most interesting entries from 'huntData'.
   - Format: "[LI] (or [R]) **Title** - Author/Subreddit: description. [Link]"
   - 1-2 sentence description of relevance for each.
   - For LinkedIn: Author name, Post Link, and Article Link (if provided).
   - For Reddit: Subreddit name, Post Link.
   - USE HTML <a> tags for Email (e.g. <a href="url">Post</a>).

2. **Reddit Pulse:**
   - Synthesize the "Vibe" for each sub in 'pulseData'.
   - Group into 2-3 distinct "Themes".
   - Provide links to specific threads [Thread] driving that vibe.
   - USE HTML <a> tags for Email.

3. **Sports Desk:**
   - Process structured sports data from 'sportsData'.
   - Each team has 'completed' array (yesterday's results) and 'upcoming' array (today's matches).
   - For completed matches: Show result (WIN/LOSS/DRAW), opponent, and score.
   - For upcoming matches: Show opponent, location (vs/@), and time.
   - A team is ACTIVE if they have ANY completed OR ANY upcoming matches.
   - Collapse truly inactive teams into: "🏟️ Quiet Stadium: [Team1], [Team2]."

### FORMATTING:
- Produce TWO versions:
  - **VERSION_EMAIL**: Strict HTML. ALL links MUST be <a> tags.
  - **VERSION_MOBILE**: Clean Markdown for WhatsApp/Telegram.

### OUTPUT FORMAT:
Return a JSON object:
{
  "subject": "🦖 Rex Daily Brief: [Brief Catchy Tagline]",
  "email_body": "...",
  "mobile_body": "..."
}
`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://openclaw.io',
      'X-Title': 'Social Searcher Rex Engine',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });

  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM returned empty content.');

  try {
    return JSON.parse(content);
  } catch (e: any) {
    throw new Error(`Invalid JSON from model: ${e.message}`);
  }
}

function runOpenclawMessage(channel: 'whatsapp' | 'telegram', target: string, body: string): ChannelStatus {
  const oc = spawnSync(
    'openclaw',
    ['message', 'send', '--channel', channel, '--target', target, '--message', body],
    { env: process.env },
  );

  return {
    ok: oc.status === 0,
    stdout: oc.stdout?.toString(),
    stderr: oc.stderr?.toString(),
    error: oc.status === 0 ? undefined : `openclaw message send failed (exit ${oc.status})`,
  };
}

function deliverEmail(subject: string, htmlBody: string): ChannelStatus {
  if (!RESOLVED_GOG_KEYRING_PASSWORD) {
    return { ok: false, error: 'Missing GOG_KEYRING_PASSWORD in env/credentials.' };
  }

  const gog = spawnSync(
    'gog',
    [
      'gmail',
      'send',
      '--account',
      addressCfg.emailFrom,
      '--to',
      addressCfg.emailTo,
      '--subject',
      subject,
      '--body-html',
      htmlBody,
      '--no-input',
    ],
    {
      env: {
        ...process.env,
        GOG_KEYRING_BACKEND: RESOLVED_GOG_KEYRING_BACKEND,
        GOG_KEYRING_PASSWORD: RESOLVED_GOG_KEYRING_PASSWORD,
      },
    },
  );

  const status: ChannelStatus = {
    ok: gog.status === 0,
    stdout: gog.stdout?.toString(),
    stderr: gog.stderr?.toString(),
    error: gog.status === 0 ? undefined : `gog gmail send failed (exit ${gog.status})`,
  };

  if (status.ok) {
    console.log('✅ Email sent.');
  } else {
    console.error('❌ Email delivery failed:', status.stderr || status.error);
  }

  return status;
}

function deliverMobile(body: string) {
  console.log('📱 Delivering Mobile Brief...');
  const whatsapp = runOpenclawMessage('whatsapp', addressCfg.phoneWhatsapp, body);
  const telegram = runOpenclawMessage('telegram', addressCfg.telegramChatId, body);

  if (whatsapp.ok) console.log('  ✅ whatsapp message sent.');
  else console.error('  ❌ whatsapp delivery failed:', whatsapp.stderr || whatsapp.error);

  if (telegram.ok) console.log('  ✅ telegram message sent.');
  else console.error('  ❌ telegram delivery failed:', telegram.stderr || telegram.error);

  return { whatsapp, telegram };
}

async function main() {
  const date = new Date().toISOString().split('T')[0];
  const outputDir = path.join(process.env.HOME || '', '.openclaw/data/social-searcher');
  const rawDataPath = path.join(outputDir, `raw-data-${date}.json`);

  const status: DeliveryStatus = {
    date,
    generatedAt: new Date().toISOString(),
    synthesize: { ok: false },
    email: { ok: false },
    mobile: { whatsapp: { ok: false }, telegram: { ok: false } },
    overallOk: false,
  };

  try {
    if (!fs.existsSync(rawDataPath)) {
      throw new Error(`Missing raw data for ${date}. Run daily-digest.ts first.`);
    }

    console.log(`🦖 Rex Engine starting for ${date}...`);
    const rawData = JSON.parse(fs.readFileSync(rawDataPath, 'utf-8'));

    const digest = await synthesize(rawData);
    status.synthesize = { ok: true };
    console.log('✨ Synthesis complete.');

    status.email = deliverEmail(digest.subject, digest.email_body);
    if (!status.email.ok) {
      status.mobile = deliverMobile(digest.mobile_body);
      status.overallOk = false;
      writeDeliveryStatus(status);
      process.exit(1);
    }

    status.mobile = deliverMobile(digest.mobile_body);
    status.overallOk = status.synthesize.ok && status.email.ok;
    writeDeliveryStatus(status);
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Synthesis/Delivery failed:', error.message);
    status.synthesize = { ok: false, error: error.message };
    status.overallOk = false;
    writeDeliveryStatus(status);
    process.exit(1);
  }
}

main();
