import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import {
  balanceHuntContent,
  balanceRedditContent,
  generateEmailSubject,
  logBalanceStats,
} from './digest-utils.js';
import {
  buildSportsSection,
  type RawMatch,
} from './sports-engine.js';
import {
  type StructuredLlmOutput,
  validateStructuredOutput,
  renderEmailHtml,
  renderWhatsAppText,
  renderTelegramText,
  buildFallbackOutput,
} from './digest-renderer.js';

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

export interface ProcessedDigestData {
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

/**
 * Build the LLM prompt requesting structured JSON output.
 * The LLM provides ONLY commentary — all formatting is code-controlled.
 */
function buildStructuredPrompt(processedData: ProcessedDigestData): string {
  // Build a compact data summary for the LLM (strip sports section text to save tokens)
  const llmData = {
    date: processedData.date,
    huntItems: processedData.huntData.selected.map((item: any, i: number) => ({
      index: i,
      platform: item.platform,
      title: (item.title || item.content || '').slice(0, 200),
      author: item.author || item.subreddit || 'Unknown',
      url: item.externalUrl || item.url || '',
      keyword: item.keyword || item.subreddit || '',
    })),
    pulseItems: processedData.pulseData.selected.map((item: any, i: number) => ({
      index: i,
      title: (item.title || '').slice(0, 200),
      subreddit: item.subreddit || '',
      upvotes: item.upvotes || 0,
      url: item.url || '',
    })),
    sportsSummary: processedData.sportsSection.stats,
  };

  return `You are Rex, an insight-hungry AI curator. Return ONLY structured JSON — no HTML, no markdown, no formatting.

The code handles ALL formatting. You provide ONLY commentary text.

### DATA:
${JSON.stringify(llmData, null, 2)}

### TASKS:

1. **hunt_items**: For EACH item in huntItems (by index), write 1-2 plain-text sentences explaining WHY it matters. No links, no HTML, no formatting — just the insight.

2. **pulse_vibes**: Identify 2-3 thematic VIBES or TRENDS across the pulse threads. For each vibe:
   - "theme": Short title (3-6 words)
   - "summary": 2-3 plain-text sentences on what's happening and why it matters
   - "thread_indices": Array of indices (from pulseItems) that relate to this vibe

3. **sports_intro**: 1-2 plain-text sentences of sports context. Do NOT include scores, results, or fixtures — the code adds those.

4. **closing_note**: Optional 1-sentence sign-off thought. Can be empty string.

### OUTPUT:
Return ONLY this exact JSON structure:
{
  "hunt_items": [
    { "index": 0, "commentary": "Plain text insight..." },
    { "index": 1, "commentary": "Plain text insight..." }
  ],
  "pulse_vibes": [
    {
      "theme": "Short Theme Title",
      "summary": "Plain text summary of the vibe...",
      "thread_indices": [0, 3, 7]
    }
  ],
  "sports_intro": "Plain text sports context...",
  "closing_note": "Optional sign-off..."
}

RULES:
- Every hunt item index must have a corresponding entry in hunt_items
- commentary/summary must be plain text only — NO HTML, NO markdown, NO links
- thread_indices must reference valid indices from pulseItems
- Keep commentary concise: max 2 sentences per hunt item, max 3 per vibe summary`;
}

async function synthesize(processedData: ProcessedDigestData): Promise<StructuredLlmOutput> {
  const llmCfgCheck = getLlmConfig();
  if (!llmCfgCheck.apiKey) {
    const keyName = LLM_PROVIDER === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY';
    throw new Error(`${keyName} not found in environment (provider: ${LLM_PROVIDER}).`);
  }

  console.log('\n🤖 Sending to LLM for structured commentary...');

  const prompt = buildStructuredPrompt(processedData);
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const content = await callLlmApi(prompt, attempt);
      const parsed = extractJsonFromResponse(content);

      // Validate structured output
      const validation = validateStructuredOutput(parsed, processedData);
      if (!validation.valid) {
        throw new Error(`Structured validation failed: ${validation.errors.join('; ')}`);
      }
      if (validation.warnings.length > 0) {
        console.warn(`  ⚠️  Validation warnings: ${validation.warnings.join('; ')}`);
      }

      console.log('✅ LLM structured output validated');
      return parsed as StructuredLlmOutput;

    } catch (e: any) {
      lastError = e;
      console.warn(`  ⚠️  Attempt ${attempt} failed: ${e.message}`);

      if (attempt < MAX_RETRIES) {
        const delay = 1000 * attempt;
        console.log(`  ⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed — use fallback
  console.error(`❌ LLM failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
  console.log('🔄 Using fallback renderer (no LLM commentary)...');
  return buildFallbackOutput(processedData);
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

    // Step 2: LLM returns structured commentary (falls back to no-commentary on failure)
    const structuredOutput = await synthesize(processedData);
    status.synthesize = { ok: true };

    // Step 3: Generate email subject with enforced format
    const emailSubject = generateEmailSubject(date);
    console.log(`📧 Email subject: ${emailSubject}`);

    // Step 4: Deterministic rendering — code controls ALL formatting
    const emailBody = renderEmailHtml(structuredOutput, processedData);
    const whatsappBody = renderWhatsAppText(structuredOutput, processedData);
    const telegramBody = renderTelegramText(structuredOutput, processedData);

    console.log('\n📝 Content rendered deterministically for all channels.');

    // Step 5: Deliver to all channels independently
    status.email = deliverEmail(emailSubject, emailBody);

    console.log('\n📱 Proceeding to mobile delivery regardless of email status...');
    const whatsappStatus = runOpenclawMessage('whatsapp', addressCfg.phoneWhatsapp, whatsappBody);

    // Telegram has a 4096-char limit — chunk on section separators if needed
    const TELEGRAM_LIMIT = 4096;
    let telegramStatus: ChannelStatus;
    if (telegramBody.length <= TELEGRAM_LIMIT) {
      telegramStatus = runOpenclawMessage('telegram', addressCfg.telegramChatId, telegramBody);
    } else {
      console.log(`  📏 Telegram body ${telegramBody.length} chars > ${TELEGRAM_LIMIT} limit, sending in chunks...`);
      const sections = telegramBody.split('\n\n———\n\n');
      const chunks: string[] = [];
      let current = '';
      for (const section of sections) {
        const candidate = current ? current + '\n\n———\n\n' + section : section;
        if (candidate.length > TELEGRAM_LIMIT && current) {
          chunks.push(current);
          current = section;
        } else {
          current = candidate;
        }
      }
      if (current) chunks.push(current);

      telegramStatus = { ok: true };
      for (let i = 0; i < chunks.length; i++) {
        const chunkStatus = runOpenclawMessage('telegram', addressCfg.telegramChatId, chunks[i]);
        if (!chunkStatus.ok) {
          telegramStatus = chunkStatus;
          break;
        }
      }
      if (telegramStatus.ok) console.log(`  📨 Sent Telegram in ${chunks.length} chunks.`);
    }

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
