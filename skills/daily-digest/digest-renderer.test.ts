/**
 * Unit tests for digest-renderer.ts — deterministic rendering.
 * Tests that formatting is code-controlled and model-agnostic.
 */

import {
  type StructuredLlmOutput,
  type HuntItemCommentary,
  type PulseVibe,
  validateStructuredOutput,
  splitBlob,
  renderEmailHtml,
  renderWhatsAppText,
  renderTelegramText,
  buildFallbackOutput,
} from './digest-renderer.js';

import type { ProcessedDigestData } from './rex-engine.js';

// ─── Test Helpers ───────────────────────────────────────────────────

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`\u2705 ${name}`);
  } catch (e: any) {
    console.error(`\u274C ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ─── Test Fixtures ──────────────────────────────────────────────────

function makeProcessedData(): ProcessedDigestData {
  return {
    date: '2026-03-21',
    huntData: {
      selected: [
        {
          platform: 'linkedin',
          keyword: 'agrivoltaics',
          author: 'Jane Doe',
          title: 'Agrivoltaics: The Future of Farming',
          content: 'Full post content here',
          url: 'https://linkedin.com/post/1',
          externalUrl: 'https://example.com/article',
        },
        {
          platform: 'reddit',
          subreddit: 'agrivoltaics',
          author: 'u/solarfan',
          title: 'New study on dual-use solar panels',
          url: 'https://reddit.com/r/agrivoltaics/1',
        },
      ],
      stats: { 'linkedin:agrivoltaics': 1, 'reddit:agrivoltaics': 1 },
    },
    pulseData: {
      selected: [
        {
          title: 'Solar panels improving crop yields',
          subreddit: 'agrivoltaics',
          url: 'https://reddit.com/r/agri/100',
          upvotes: 42,
        },
        {
          title: 'AI tools for farm management',
          subreddit: 'farming',
          url: 'https://reddit.com/r/farming/200',
          upvotes: 89,
        },
        {
          title: 'Grid storage breakthrough announced',
          subreddit: 'energy',
          url: 'https://reddit.com/r/energy/300',
          upvotes: 155,
        },
      ],
      stats: { agrivoltaics: 1, farming: 1, energy: 1 },
    },
    sportsSection: {
      email: '⚽ RESULTS<br>\nBOSTON CELTICS: WIN 🟢 (111-89 vs Knicks, Mar 20)<br>\n<br>\n📅 UPCOMING<br>\nBOSTON CELTICS: vs Lakers, Mar 22 at 7:30 PM ET',
      mobile: '⚽ RESULTS\nBOSTON CELTICS: WIN 🟢 (111-89 vs Knicks, Mar 20)\n\n📅 UPCOMING\nBOSTON CELTICS: vs Lakers, Mar 22 at 7:30 PM ET',
      stats: '5 raw matches processed',
    },
  };
}

function makeLlmOutput(): StructuredLlmOutput {
  return {
    hunt_items: [
      { index: 0, commentary: 'This highlights a growing trend in European agrivoltaics research.' },
      { index: 1, commentary: 'Community interest in dual-use solar is surging on Reddit.' },
    ],
    pulse_vibes: [
      {
        theme: 'Solar-Agriculture Convergence',
        summary: 'Multiple threads are tracking the intersection of solar energy and crop production. Researchers are finding that certain panel configurations actually improve yields for shade-tolerant crops.',
        thread_indices: [0, 2],
      },
      {
        theme: 'AI in AgTech',
        summary: 'Farm management AI tools are getting real traction. Early adopters report measurable ROI on precision agriculture platforms.',
        thread_indices: [1],
      },
    ],
    sports_intro: 'The Celtics kept rolling with a convincing win, and another big matchup looms.',
    closing_note: 'Another day of convergence between energy and agriculture.',
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

// --- splitBlob ---

runTest('splitBlob: short text passes through', () => {
  const result = splitBlob('Short text.');
  assert(result.length === 1, `Expected 1 part, got ${result.length}`);
  assert(result[0] === 'Short text.', 'Content mismatch');
});

runTest('splitBlob: long blob gets split on sentences', () => {
  const blob = 'First sentence here is fairly long to pad things out. ' +
    'Second sentence is also here and adds more words to this paragraph. ' +
    'Third sentence adds even more content to push past the limit. ' +
    'Fourth sentence continues the paragraph with additional details about the topic at hand. ' +
    'Fifth sentence keeps going and going with more information that is relevant. ' +
    'Sixth sentence extends this even further to ensure we definitely cross the four hundred character threshold now. ' +
    'Seventh sentence makes absolutely sure we are well over four hundred characters total in this extremely long blob of text. ' +
    'Eighth sentence adds the final push to guarantee we are far past the limit for splitting.';
  assert(blob.length > 400, `Blob too short: ${blob.length}`);
  const result = splitBlob(blob);
  assert(result.length >= 2, `Expected >= 2 parts, got ${result.length} (blob len: ${blob.length})`);
  for (const part of result) {
    assert(part.length <= 500, `Part too long: ${part.length} chars`);
  }
});

// --- validateStructuredOutput ---

runTest('validate: accepts valid output', () => {
  const data = makeProcessedData();
  const llm = makeLlmOutput();
  const result = validateStructuredOutput(llm, data);
  assert(result.valid, `Expected valid, got errors: ${result.errors.join(', ')}`);
});

runTest('validate: rejects missing hunt_items', () => {
  const data = makeProcessedData();
  const result = validateStructuredOutput({ pulse_vibes: [], sports_intro: '' }, data);
  assert(!result.valid, 'Expected invalid');
  assert(result.errors.some(e => e.includes('hunt_items')), 'Expected hunt_items error');
});

runTest('validate: warns on out-of-range index', () => {
  const data = makeProcessedData();
  const llm = makeLlmOutput();
  llm.hunt_items.push({ index: 99, commentary: 'Bad index' });
  const result = validateStructuredOutput(llm, data);
  assert(result.valid, 'Should still be valid (warnings only)');
  assert(result.warnings.some(w => w.includes('99')), 'Expected warning about index 99');
});

// --- renderEmailHtml ---

runTest('email: contains section headers', () => {
  const html = renderEmailHtml(makeLlmOutput(), makeProcessedData());
  assert(html.includes('<h2>Keyword Search Roundup</h2>'), 'Missing hunt header');
  assert(html.includes('<h2>Reddit Pulse</h2>'), 'Missing pulse header');
  assert(html.includes('<h2>Sports Desk</h2>'), 'Missing sports header');
});

runTest('email: hunt items are bulleted list', () => {
  const html = renderEmailHtml(makeLlmOutput(), makeProcessedData());
  assert(html.includes('<ul>'), 'Missing <ul>');
  assert(html.includes('<li>'), 'Missing <li>');
  // Hunt section has 2 items; pulse vibes also produce <li> for thread refs
  const huntSection = html.split('<h2>Reddit Pulse</h2>')[0];
  assert((huntSection.match(/<li>/g) || []).length === 2, 'Expected 2 hunt list items');
});

runTest('email: contains platform tags', () => {
  const html = renderEmailHtml(makeLlmOutput(), makeProcessedData());
  assert(html.includes('[LI]'), 'Missing [LI] tag');
  assert(html.includes('[R]'), 'Missing [R] tag');
});

runTest('email: contains commentary', () => {
  const html = renderEmailHtml(makeLlmOutput(), makeProcessedData());
  assert(html.includes('European agrivoltaics'), 'Missing hunt commentary');
  assert(html.includes('Solar-Agriculture Convergence'), 'Missing pulse theme');
});

runTest('email: contains view post links', () => {
  const html = renderEmailHtml(makeLlmOutput(), makeProcessedData());
  assert(html.includes('<a href="https://example.com/article">View post</a>'), 'Missing view post link');
});

runTest('email: sports section contains deterministic data', () => {
  const html = renderEmailHtml(makeLlmOutput(), makeProcessedData());
  assert(html.includes('BOSTON CELTICS: WIN'), 'Missing sports results');
  assert(html.includes('vs Lakers'), 'Missing sports upcoming');
});

runTest('email: pulse vibes have h3 subheaders', () => {
  const html = renderEmailHtml(makeLlmOutput(), makeProcessedData());
  assert(html.includes('<h3>Solar-Agriculture Convergence</h3>'), 'Missing vibe subheader');
  assert(html.includes('<h3>AI in AgTech</h3>'), 'Missing vibe subheader');
});

runTest('email: pulse thread refs are bulleted list', () => {
  const html = renderEmailHtml(makeLlmOutput(), makeProcessedData());
  const pulseSection = html.split('<h2>Reddit Pulse</h2>')[1]?.split('<h2>Sports Desk</h2>')[0] || '';
  assert(pulseSection.includes('<em>Threads:</em>'), 'Missing Threads label');
  assert(pulseSection.includes('<ul>'), 'Thread refs should be in <ul>');
  assert((pulseSection.match(/<li>/g) || []).length >= 2, 'Expected at least 2 thread ref bullets');
});

runTest('email: closing note rendered', () => {
  const html = renderEmailHtml(makeLlmOutput(), makeProcessedData());
  assert(html.includes('convergence between energy and agriculture'), 'Missing closing note');
});

// --- renderWhatsAppText ---

runTest('whatsapp: no HTML tags', () => {
  const text = renderWhatsAppText(makeLlmOutput(), makeProcessedData());
  assert(!/<[a-z][\s\S]*>/i.test(text.replace(/<br\s*\/?>/g, '')), `Found HTML tags in WhatsApp output`);
});

runTest('whatsapp: has section headers with asterisks', () => {
  const text = renderWhatsAppText(makeLlmOutput(), makeProcessedData());
  assert(text.includes('*Keyword Search Roundup*'), 'Missing hunt header');
  assert(text.includes('*Reddit Pulse*'), 'Missing pulse header');
  assert(text.includes('*Sports Desk*'), 'Missing sports header');
});

runTest('whatsapp: bullets for hunt items', () => {
  const text = renderWhatsAppText(makeLlmOutput(), makeProcessedData());
  const bullets = text.match(/^• /gm) || [];
  assert(bullets.length === 2, `Expected 2 bullets, got ${bullets.length}`);
});

runTest('whatsapp: plain URLs (no markdown links)', () => {
  const text = renderWhatsAppText(makeLlmOutput(), makeProcessedData());
  assert(text.includes('https://example.com/article'), 'Missing URL');
  assert(!text.includes('[View post]'), 'Should not have markdown links');
});

runTest('whatsapp: sections separated', () => {
  const text = renderWhatsAppText(makeLlmOutput(), makeProcessedData());
  assert(text.includes('———'), 'Missing section separator');
});

// --- renderTelegramText ---

runTest('telegram: no HTML tags', () => {
  const text = renderTelegramText(makeLlmOutput(), makeProcessedData());
  assert(!/<[a-z][\s\S]*>/i.test(text.replace(/<br\s*\/?>/g, '')), 'Found HTML tags in Telegram output');
});

runTest('telegram: has markdown bold headers', () => {
  const text = renderTelegramText(makeLlmOutput(), makeProcessedData());
  assert(text.includes('**Keyword Search Roundup**'), 'Missing hunt header');
  assert(text.includes('**Reddit Pulse**'), 'Missing pulse header');
  assert(text.includes('**Sports Desk**'), 'Missing sports header');
});

runTest('telegram: markdown links for view post', () => {
  const text = renderTelegramText(makeLlmOutput(), makeProcessedData());
  assert(text.includes('[View post](https://example.com/article)'), 'Missing markdown link');
});

runTest('telegram: pulse thread references as markdown links', () => {
  const text = renderTelegramText(makeLlmOutput(), makeProcessedData());
  assert(text.includes('[Solar panels improving crop yields]'), 'Missing pulse thread link');
});

// --- buildFallbackOutput ---

runTest('fallback: produces valid structure without commentary', () => {
  const data = makeProcessedData();
  const fallback = buildFallbackOutput(data);
  assert(fallback.hunt_items.length === 2, 'Expected 2 hunt items');
  assert(fallback.hunt_items[0].commentary === '', 'Expected empty commentary');
  assert(fallback.pulse_vibes.length === 1, 'Expected 1 fallback vibe');
  assert(fallback.sports_intro === '', 'Expected empty sports intro');
});

runTest('fallback: renders without errors', () => {
  const data = makeProcessedData();
  const fallback = buildFallbackOutput(data);
  // All three renderers should work without throwing
  renderEmailHtml(fallback, data);
  renderWhatsAppText(fallback, data);
  renderTelegramText(fallback, data);
});

// --- Deterministic output (golden test) ---

runTest('golden: same input produces identical output across runs', () => {
  const data = makeProcessedData();
  const llm = makeLlmOutput();

  const email1 = renderEmailHtml(llm, data);
  const email2 = renderEmailHtml(llm, data);
  assert(email1 === email2, 'Email output not deterministic');

  const wa1 = renderWhatsAppText(llm, data);
  const wa2 = renderWhatsAppText(llm, data);
  assert(wa1 === wa2, 'WhatsApp output not deterministic');

  const tg1 = renderTelegramText(llm, data);
  const tg2 = renderTelegramText(llm, data);
  assert(tg1 === tg2, 'Telegram output not deterministic');
});

// --- Edge cases ---

runTest('edge: empty hunt data', () => {
  const data = makeProcessedData();
  data.huntData.selected = [];
  const llm = makeLlmOutput();
  llm.hunt_items = [];

  const html = renderEmailHtml(llm, data);
  assert(!html.includes('Keyword Search Roundup'), 'Should skip empty hunt section');
});

runTest('edge: empty pulse data', () => {
  const data = makeProcessedData();
  data.pulseData.selected = [];
  const llm = makeLlmOutput();
  llm.pulse_vibes = [];

  const html = renderEmailHtml(llm, data);
  assert(!html.includes('Reddit Pulse'), 'Should skip empty pulse section');
});

runTest('edge: missing commentary for a hunt item still renders', () => {
  const data = makeProcessedData();
  const llm = makeLlmOutput();
  llm.hunt_items = [{ index: 0, commentary: 'Only first item has commentary' }];
  // Item 1 has no commentary entry

  const html = renderEmailHtml(llm, data);
  const huntSection = html.split('<h2>Reddit Pulse</h2>')[0];
  assert((huntSection.match(/<li>/g) || []).length === 2, 'Both items should render');
});

runTest('edge: invalid thread_indices are skipped gracefully', () => {
  const data = makeProcessedData();
  const llm = makeLlmOutput();
  llm.pulse_vibes[0].thread_indices = [0, 99, 200]; // 99 and 200 don't exist

  // Should not throw
  const html = renderEmailHtml(llm, data);
  assert(html.includes('Solar-Agriculture'), 'Vibe should still render');
});

console.log('\n--- Renderer tests complete ---');
