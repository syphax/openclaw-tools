import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import {
  balanceHuntContent,
  balanceRedditContent,
  formatTelegramLink,
  generateEmailSubject,
  logBalanceStats,
} from './digest-utils.js';
import {
  buildSportsSection,
  type RawMatch,
} from './sports-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || readEnvVarFromText(credentialsEnv, 'OPENROUTER_API_KEY');
const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || readEnvVarFromText(credentialsEnv, 'OPENAI_API_KEY');

const socialSearchCfg = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'cfg', 'social-search-config.json'), 'utf-8'),
);
const LLM_MODEL: string = socialSearchCfg.llm?.model ?? 'google/gemini-2.0-flash-001';
const LLM_PROVIDER: string = socialSearchCfg.llm?.provider ?? 'openrouter';

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
  alerts?: {
    telegram?: ChannelStatus;
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

interface ProcessedDigestData {
  date: string;
  huntData: {
    selected: any[];
    stats: any;
  };
  pulseData: {
    selected: any[];
    stats: any;
  };
  sportsSection: {
    email: string;
    mobile: string;
    stats: string;
  };
}

/**
 * Pre-process raw data with deterministic balancing and formatting.
 * This enforces structure BEFORE the LLM sees it, allowing the LLM
 * to focus on commentary and summarization.
 */
function preprocessDigestData(rawData: any): ProcessedDigestData {
  console.log('\n🔧 Pre-processing digest data with deterministic logic...');

  const date = rawData.date || new Date().toISOString().split('T')[0];

  // 1. Balance hunt data (reduce r/openclaw dominance)
  console.log('\n📊 Balancing hunt data...');
  const huntResult = balanceHuntContent(rawData.huntData || [], 10, 3);
  logBalanceStats('Hunt Content Balance', huntResult);

  // 2. Balance pulse data
  console.log('\n📊 Balancing pulse data...');
  const pulseResult = balanceRedditContent(rawData.pulseData || [], 15, 5);
  logBalanceStats('Pulse Content Balance', pulseResult);

  // 3. Build sports section deterministically
  console.log('\n⚽ Building sports section...');
  const sportsRawMatches: RawMatch[] = rawData.sportsData || [];
  console.log(`  Processing ${sportsRawMatches.length} raw matches...`);
  const sportsSection = buildSportsSection(sportsRawMatches, date);
  console.log(`  Results: ${sportsSection.stats.resultsCount} completed, ${sportsSection.stats.upcomingCount} upcoming, ${sportsSection.stats.quietTeamsCount} quiet`);
  console.log(`  Teams with activity: ${sportsSection.stats.teamsWithActivity.join(', ')}`);
  if (sportsSection.stats.quietTeams.length > 0) {
    console.log(`  Quiet teams: ${sportsSection.stats.quietTeams.join(', ')}`);
  }

  return {
    date,
    huntData: {
      selected: huntResult.selected,
      stats: huntResult.subCounts,
    },
    pulseData: {
      selected: pulseResult.selected,
      stats: pulseResult.subCounts,
    },
    sportsSection: {
      email: sportsSection.emailHtml,
      mobile: sportsSection.mobileText,
      stats: `${sportsRawMatches.length} raw matches processed`,
    },
  };
}

/**
 * Format the digest for WhatsApp.
 * WhatsApp doesn't support markdown links - it auto-linkifies plain URLs.
 * So we output plain clickable URLs only (no label prefix).
 */
function formatForWhatsApp(emailBody: string): string {
  // Convert HTML links to plain URLs only
  // Pattern: <a href="url">text</a> -> url
  return emailBody.replace(/<a href="([^"]+)">([^<]+)<\/a>/g, (_, url) => {
    return url; // Just the URL, WhatsApp will auto-linkify
  }).replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/?[^>]+(>|$)/g, ''); // Strip remaining HTML tags
}

/**
 * Format the digest for Telegram.
 * Telegram supports markdown-style links.
 */
function formatForTelegram(emailBody: string): string {
  // Convert HTML links to markdown format
  // Pattern: <a href="url">text</a> -> [text](url)
  return emailBody.replace(/<a href="([^"]+)">([^<]+)<\/a>/g, (_, url, text) => {
    return formatTelegramLink(text, url);
  }).replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/?[^>]+(>|$)/g, ''); // Strip remaining HTML tags
}

/**
 * Extract first valid JSON object from potentially noisy LLM output.
 * Handles cases where JSON is wrapped in markdown code blocks or has extra text.
 */
function extractJsonFromResponse(content: string): any {
  // Try direct parse first
  try {
    return JSON.parse(content);
  } catch (e) {
    // Not direct JSON, try to extract
  }

  // Try to extract from markdown code block
  const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch (e) {
      // Continue to next strategy
    }
  }

  // Try to find first { to last } block
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(content.substring(firstBrace, lastBrace + 1));
    } catch (e) {
      // Continue to next strategy
    }
  }

  throw new Error('Could not extract valid JSON from response');
}

/**
 * Validate that LLM response contains required fields.
 */
function validateLlmResponse(parsed: any): void {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLM response is not an object');
  }

  if (!parsed.email_body || typeof parsed.email_body !== 'string') {
    throw new Error('LLM response missing required field: email_body');
  }

  if (parsed.email_body.trim().length < 50) {
    throw new Error('LLM response email_body is too short (likely malformed)');
  }

  console.log('✅ LLM response validation passed');
}

function getLlmConfig(): { url: string; apiKey: string | undefined; model: string; extraHeaders: Record<string, string> } {
  // Strip openclaw namespace prefixes — the underlying APIs don't use them.
  // e.g. "openrouter/google/gemini-3-flash-preview" → "google/gemini-3-flash-preview"
  //      "openai-codex/gpt-5.4" → "gpt-5.4"
  const stripPrefixes = (id: string, ...prefixes: string[]) => {
    for (const p of prefixes) if (id.startsWith(p + '/')) return id.slice(p.length + 1);
    return id;
  };

  if (LLM_PROVIDER === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      apiKey: OPENAI_API_KEY,
      model: stripPrefixes(LLM_MODEL, 'openai', 'openai-codex'),
      extraHeaders: {},
    };
  }

  // Default: openrouter
  return {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: OPENROUTER_API_KEY,
    model: stripPrefixes(LLM_MODEL, 'openrouter'),
    extraHeaders: {
      'HTTP-Referer': 'https://openclaw.io',
      'X-Title': 'Social Searcher Rex Engine',
    },
  };
}

async function callLlmApi(prompt: string, attemptNum: number): Promise<any> {
  console.log(`  🔄 LLM API call attempt ${attemptNum} [${LLM_PROVIDER}/${LLM_MODEL}]...`);

  const llm = getLlmConfig();
  const response = await fetch(llm.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${llm.apiKey}`,
      'Content-Type': 'application/json',
      ...llm.extraHeaders,
    },
    body: JSON.stringify({
      model: llm.model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('LLM returned empty content');
  }

  return content;
}

async function synthesize(_rawData: any, processedData: ProcessedDigestData) {
  const llmCfgCheck = getLlmConfig();
  if (!llmCfgCheck.apiKey) {
    const keyName = LLM_PROVIDER === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY';
    throw new Error(`${keyName} not found in environment (provider: ${LLM_PROVIDER}).`);
  }

  console.log('\n🤖 Sending to LLM for commentary and synthesis...');

  const prompt = `
You are Rex, an insight-hungry AI curator. Your SOLE role is COLOR COMMENTARY on pre-structured content.

🚨 CRITICAL: You are NOT responsible for:
- Structure or formatting (already done deterministically in code)
- Link formatting (already handled)
- Section organization (already decided)
- Item selection (already balanced)

Your ONLY job is to add INSIGHTFUL COMMENTARY and CONTEXT to existing structure.

### PRE-PROCESSED DATA:
${JSON.stringify(processedData, null, 2)}

### YOUR TASKS:

1. **Keyword Search Roundup:**
   - Items in 'huntData.selected' are PRE-SELECTED and PRE-BALANCED.
   - For EACH item: Write 1-2 sentences explaining WHY it matters to Brian.
   - Format: Use HTML <a> tags for links.
   - Prefix: [LI] for LinkedIn, [R] for Reddit.
   - Structure: [Platform] Title by Author/Subreddit - Your commentary. <a href="url">View post</a>

2. **Reddit Pulse:**
   - Items in 'pulseData.selected' are PRE-SELECTED and PRE-BALANCED.
   - Identify 2-3 thematic VIBES or TRENDS across discussions.
   - Reference specific threads with HTML <a> tags using post titles.
   - Focus on: WHAT'S HAPPENING and WHY IT MATTERS.

3. **Sports Desk:**
   - The sports text is ALREADY FULLY FORMATTED in 'sportsSection.email'.
   - Your task: Add ONLY a 1-2 sentence headline/intro for context.
   - DO NOT touch the pre-formatted results.
   - DO NOT reformat, restructure, or modify the existing sports text.
   - Just add your brief intro, then include the full pre-formatted section verbatim.

### OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no extra text):
{
  "email_body": "Full digest in HTML with <h2> section headers and your commentary",
  "commentary_notes": "Brief internal notes on themes (optional)"
}

REMINDER: Your role is COMMENTARY ONLY. Structure is handled by code.
`;

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const content = await callLlmApi(prompt, attempt);

      // Try to parse and validate
      const parsed = extractJsonFromResponse(content);
      validateLlmResponse(parsed);

      console.log('✅ LLM synthesis complete and validated');
      return parsed;

    } catch (e: any) {
      lastError = e;
      console.warn(`  ⚠️  Attempt ${attempt} failed: ${e.message}`);

      if (attempt < MAX_RETRIES) {
        const delay = 1000 * attempt; // Exponential backoff: 1s, 2s, 3s
        console.log(`  ⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  throw new Error(
    `LLM synthesis failed after ${MAX_RETRIES} attempts. Last error: ${lastError?.message || 'unknown'}`
  );
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

function isGmailAuthExpired(status: ChannelStatus): boolean {
  const haystack = `${status.stderr || ''}\n${status.error || ''}`;
  return /invalid_grant|expired or revoked|expired|revoked/i.test(haystack);
}

function sendTelegramAlert(body: string): ChannelStatus {
  return runOpenclawMessage('telegram', addressCfg.telegramChatId, body);
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

// Removed deliverMobile function - now handled in main() with separate formatting

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
    alerts: {},
    overallOk: false,
  };

  try {
    if (!fs.existsSync(rawDataPath)) {
      throw new Error(`Missing raw data for ${date}. Run daily-digest.ts first.`);
    }

    console.log(`\n🦖 Rex Engine starting for ${date}...`);
    const rawData = JSON.parse(fs.readFileSync(rawDataPath, 'utf-8'));

    // Step 1: Pre-process with deterministic logic
    const processedData = preprocessDigestData(rawData);

    // Step 2: LLM adds commentary
    const llmResult = await synthesize(rawData, processedData);
    status.synthesize = { ok: true };

    // Step 3: Generate email subject with enforced format
    const emailSubject = generateEmailSubject(date);
    console.log(`📧 Email subject: ${emailSubject}`);

    // Step 4: Format for different channels
    const emailBody = llmResult.email_body;
    const whatsappBody = formatForWhatsApp(emailBody);
    const telegramBody = formatForTelegram(emailBody);

    console.log('\n📝 Content formatted for all channels.');

    // Step 5: Deliver to all channels independently
    status.email = deliverEmail(emailSubject, emailBody);

    console.log('\n📱 Proceeding to mobile delivery regardless of email status...');
    const whatsappStatus = runOpenclawMessage('whatsapp', addressCfg.phoneWhatsapp, whatsappBody);
    const telegramStatus = runOpenclawMessage('telegram', addressCfg.telegramChatId, telegramBody);

    if (whatsappStatus.ok) console.log('  ✅ WhatsApp message sent.');
    else console.error('  ❌ WhatsApp delivery failed:', whatsappStatus.stderr || whatsappStatus.error);

    if (telegramStatus.ok) console.log('  ✅ Telegram message sent.');
    else console.error('  ❌ Telegram delivery failed:', telegramStatus.stderr || telegramStatus.error);

    status.mobile = { whatsapp: whatsappStatus, telegram: telegramStatus };

    // Step 6: Alert on Gmail auth expiry/revocation
    if (!status.email.ok && isGmailAuthExpired(status.email)) {
      const alertBody = [
        '⚠️ Daily Digest email auth failed.',
        `Date: ${date}`,
        'Reason: Gmail token expired or was revoked.',
        'Digest mobile delivery was attempted separately.',
        'Action needed: re-auth gog Gmail before the next run.',
      ].join('\n');
      const alertStatus = sendTelegramAlert(alertBody);
      status.alerts = { ...(status.alerts || {}), telegram: alertStatus };
      if (alertStatus.ok) console.log('  ✅ Telegram auth alert sent.');
      else console.error('  ❌ Telegram auth alert failed:', alertStatus.stderr || alertStatus.error);
    }

    status.overallOk = status.synthesize.ok && (status.email.ok || status.mobile.whatsapp.ok || status.mobile.telegram.ok);
    writeDeliveryStatus(status);

    if (!status.email.ok || !status.mobile.whatsapp.ok || !status.mobile.telegram.ok) {
      console.error('\n❌ One or more delivery channels failed.');
      process.exit(1);
    }

    console.log('\n🦖 Daily Digest complete and delivered on all channels!');
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
