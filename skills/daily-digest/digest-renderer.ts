/**
 * Deterministic digest renderers for each delivery channel.
 *
 * The LLM returns structured JSON fields (commentary per item, themed vibes, sports intro).
 * These renderers assemble final output with code-controlled layout:
 * headers, bullets, spacing, line breaks — no model-dependent formatting.
 */

import type { ProcessedDigestData } from './rex-engine.js';

// ─── LLM Structured Output Types ────────────────────────────────────

export interface HuntItemCommentary {
  /** Index into processedData.huntData.selected */
  index: number;
  /** 1-2 sentence insight on why this item matters */
  commentary: string;
}

export interface PulseVibe {
  /** Short theme title, e.g. "AI Tooling Fatigue" */
  theme: string;
  /** 2-3 sentence summary of the vibe/trend */
  summary: string;
  /** Indices into processedData.pulseData.selected referencing threads */
  thread_indices: number[];
}

export interface StructuredLlmOutput {
  hunt_items: HuntItemCommentary[];
  pulse_vibes: PulseVibe[];
  sports_intro: string;
  closing_note?: string;
}

// ─── Validation ─────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateStructuredOutput(
  parsed: any,
  processedData: ProcessedDigestData,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, errors: ['LLM response is not an object'], warnings };
  }

  // hunt_items
  if (!Array.isArray(parsed.hunt_items)) {
    errors.push('Missing or invalid hunt_items array');
  } else {
    const huntCount = processedData.huntData.selected.length;
    for (const item of parsed.hunt_items) {
      if (typeof item.index !== 'number' || item.index < 0 || item.index >= huntCount) {
        warnings.push(`hunt_items: invalid index ${item.index} (max ${huntCount - 1})`);
      }
      if (!item.commentary || typeof item.commentary !== 'string') {
        warnings.push(`hunt_items[${item.index}]: missing commentary`);
      }
    }
  }

  // pulse_vibes
  if (!Array.isArray(parsed.pulse_vibes)) {
    errors.push('Missing or invalid pulse_vibes array');
  } else {
    if (parsed.pulse_vibes.length === 0) {
      warnings.push('pulse_vibes is empty');
    }
    for (let i = 0; i < parsed.pulse_vibes.length; i++) {
      const vibe = parsed.pulse_vibes[i];
      if (!vibe.theme || typeof vibe.theme !== 'string') {
        warnings.push(`pulse_vibes[${i}]: missing theme`);
      }
      if (!vibe.summary || typeof vibe.summary !== 'string') {
        warnings.push(`pulse_vibes[${i}]: missing summary`);
      }
      if (!Array.isArray(vibe.thread_indices)) {
        warnings.push(`pulse_vibes[${i}]: missing thread_indices`);
      }
    }
  }

  // sports_intro
  if (!parsed.sports_intro || typeof parsed.sports_intro !== 'string') {
    warnings.push('Missing sports_intro');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Blob Detection & Splitting ─────────────────────────────────────

const MAX_PARAGRAPH_LENGTH = 400; // chars — anything longer gets split

/**
 * If a string is a "blob" (single long paragraph), split it into sentences.
 * Returns an array of sentence groups (max ~2 sentences per group).
 */
export function splitBlob(text: string): string[] {
  if (text.length <= MAX_PARAGRAPH_LENGTH) return [text];

  // Split on sentence boundaries
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [text];
  const groups: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (current && (current + ' ' + trimmed).length > MAX_PARAGRAPH_LENGTH) {
      groups.push(current.trim());
      current = trimmed;
    } else {
      current = current ? current + ' ' + trimmed : trimmed;
    }
  }
  if (current.trim()) groups.push(current.trim());

  return groups.length > 0 ? groups : [text];
}

// ─── Helpers ────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getPlatformTag(item: any): string {
  if (item.platform === 'linkedin') return '[LI]';
  if (item.platform === 'reddit') return '[R]';
  return '';
}

function getItemAuthor(item: any): string {
  if (item.platform === 'linkedin') {
    return item.author || 'Unknown';
  }
  return item.subreddit ? `r/${item.subreddit}` : item.author || 'Unknown';
}

function getItemTitle(item: any): string {
  // Truncate long titles
  const raw = item.title || item.content || '';
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  return cleaned.length > 120 ? cleaned.slice(0, 117) + '...' : cleaned;
}

function getItemUrl(item: any): string {
  return item.externalUrl || item.url || '';
}

// ─── Email HTML Renderer ────────────────────────────────────────────

export function renderEmailHtml(
  llm: StructuredLlmOutput,
  data: ProcessedDigestData,
): string {
  const sections: string[] = [];

  // ── Keyword Search Roundup ──
  if (data.huntData.selected.length > 0) {
    const items: string[] = [];

    for (let i = 0; i < data.huntData.selected.length; i++) {
      const item = data.huntData.selected[i];
      const tag = getPlatformTag(item);
      const author = escapeHtml(getItemAuthor(item));
      const title = escapeHtml(getItemTitle(item));
      const url = getItemUrl(item);
      const commentary = llm.hunt_items.find(h => h.index === i)?.commentary || '';

      const linkHtml = url
        ? ` <a href="${url}">View post</a>`
        : '';
      const commentaryHtml = commentary
        ? ` ${escapeHtml(commentary)}`
        : '';

      items.push(
        `<li><strong>${tag}</strong> ${title} <em>— ${author}</em>${commentaryHtml}${linkHtml}</li>`,
      );
    }

    sections.push(
      `<h2>Keyword Search Roundup</h2>\n<ul>\n${items.join('\n')}\n</ul>`,
    );
  }

  // ── Reddit Pulse ──
  if (llm.pulse_vibes.length > 0) {
    const vibeBlocks: string[] = [];

    for (const vibe of llm.pulse_vibes) {
      const summaryParts = splitBlob(vibe.summary);
      const summaryHtml = summaryParts.map(p => `<p>${escapeHtml(p)}</p>`).join('\n');

      // Thread references
      const refs: string[] = [];
      for (const idx of vibe.thread_indices || []) {
        const thread = data.pulseData.selected[idx];
        if (!thread) continue;
        const threadTitle = getItemTitle(thread);
        const threadUrl = thread.url || '';
        const sub = thread.subreddit ? `r/${thread.subreddit}` : '';
        if (threadUrl) {
          refs.push(`<a href="${threadUrl}">${escapeHtml(threadTitle)}</a>${sub ? ` (${sub})` : ''}`);
        } else {
          refs.push(`${escapeHtml(threadTitle)}${sub ? ` (${sub})` : ''}`);
        }
      }

      let block = `<h3>${escapeHtml(vibe.theme)}</h3>\n${summaryHtml}`;
      if (refs.length > 0) {
        const refItems = refs.map(r => `<li>${r}</li>`).join('\n');
        block += `\n<p><em>Threads:</em></p>\n<ul>\n${refItems}\n</ul>`;
      }
      vibeBlocks.push(block);
    }

    sections.push(
      `<h2>Reddit Pulse</h2>\n${vibeBlocks.join('\n')}`,
    );
  }

  // ── Sports Desk ──
  {
    const introHtml = llm.sports_intro
      ? `<p>${escapeHtml(llm.sports_intro)}</p>`
      : '';
    sections.push(
      `<h2>Sports Desk</h2>\n${introHtml}\n${data.sportsSection.email}`,
    );
  }

  // ── Closing Note ──
  if (llm.closing_note) {
    const parts = splitBlob(llm.closing_note);
    sections.push(
      parts.map(p => `<p><em>${escapeHtml(p)}</em></p>`).join('\n'),
    );
  }

  return sections.join('\n\n');
}

// ─── WhatsApp Plain Text Renderer ───────────────────────────────────

export function renderWhatsAppText(
  llm: StructuredLlmOutput,
  data: ProcessedDigestData,
): string {
  const sections: string[] = [];

  // ── Keyword Search Roundup ──
  if (data.huntData.selected.length > 0) {
    const lines: string[] = ['*Keyword Search Roundup*', ''];

    for (let i = 0; i < data.huntData.selected.length; i++) {
      const item = data.huntData.selected[i];
      const tag = getPlatformTag(item);
      const author = getItemAuthor(item);
      const title = getItemTitle(item);
      const url = getItemUrl(item);
      const commentary = llm.hunt_items.find(h => h.index === i)?.commentary || '';

      let line = `• ${tag} ${title} — ${author}`;
      if (commentary) line += `\n  ${commentary}`;
      if (url) line += `\n  ${url}`;
      lines.push(line);
    }

    sections.push(lines.join('\n'));
  }

  // ── Reddit Pulse ──
  if (llm.pulse_vibes.length > 0) {
    const lines: string[] = ['*Reddit Pulse*', ''];

    for (const vibe of llm.pulse_vibes) {
      lines.push(`📡 *${vibe.theme}*`);
      const summaryParts = splitBlob(vibe.summary);
      for (const p of summaryParts) {
        lines.push(p);
      }

      // Thread refs as plain URLs
      for (const idx of vibe.thread_indices || []) {
        const thread = data.pulseData.selected[idx];
        if (!thread) continue;
        const url = thread.url || '';
        if (url) lines.push(`  → ${url}`);
      }
      lines.push('');
    }

    sections.push(lines.join('\n').trimEnd());
  }

  // ── Sports Desk ──
  {
    const lines: string[] = ['*Sports Desk*', ''];
    if (llm.sports_intro) lines.push(llm.sports_intro, '');
    lines.push(data.sportsSection.mobile);
    sections.push(lines.join('\n'));
  }

  // ── Closing Note ──
  if (llm.closing_note) {
    sections.push(llm.closing_note);
  }

  return sections.join('\n\n———\n\n');
}

// ─── Telegram Markdown Renderer ─────────────────────────────────────

export function renderTelegramText(
  llm: StructuredLlmOutput,
  data: ProcessedDigestData,
): string {
  const sections: string[] = [];

  // ── Keyword Search Roundup ──
  if (data.huntData.selected.length > 0) {
    const lines: string[] = ['**Keyword Search Roundup**', ''];

    for (let i = 0; i < data.huntData.selected.length; i++) {
      const item = data.huntData.selected[i];
      const tag = getPlatformTag(item);
      const author = getItemAuthor(item);
      const title = getItemTitle(item);
      const url = getItemUrl(item);
      const commentary = llm.hunt_items.find(h => h.index === i)?.commentary || '';

      const linkPart = url ? ` [View post](${url})` : '';
      let line = `• ${tag} ${title} — _${author}_`;
      if (commentary) line += `\n  ${commentary}`;
      if (linkPart) line += `\n  ${linkPart}`;
      lines.push(line);
    }

    sections.push(lines.join('\n'));
  }

  // ── Reddit Pulse ──
  if (llm.pulse_vibes.length > 0) {
    const lines: string[] = ['**Reddit Pulse**', ''];

    for (const vibe of llm.pulse_vibes) {
      lines.push(`📡 **${vibe.theme}**`);
      const summaryParts = splitBlob(vibe.summary);
      for (const p of summaryParts) {
        lines.push(p);
      }

      // Thread refs as markdown links
      for (const idx of vibe.thread_indices || []) {
        const thread = data.pulseData.selected[idx];
        if (!thread) continue;
        const threadTitle = getItemTitle(thread);
        const url = thread.url || '';
        const sub = thread.subreddit ? `r/${thread.subreddit}` : '';
        if (url) {
          lines.push(`  → [${threadTitle}](${url})${sub ? ` (${sub})` : ''}`);
        }
      }
      lines.push('');
    }

    sections.push(lines.join('\n').trimEnd());
  }

  // ── Sports Desk ──
  {
    const lines: string[] = ['**Sports Desk**', ''];
    if (llm.sports_intro) lines.push(llm.sports_intro, '');
    lines.push(data.sportsSection.mobile);
    sections.push(lines.join('\n'));
  }

  // ── Closing Note ──
  if (llm.closing_note) {
    sections.push(`_${llm.closing_note}_`);
  }

  return sections.join('\n\n———\n\n');
}

// ─── Fallback: Build structured output from raw data (no LLM) ──────

export function buildFallbackOutput(data: ProcessedDigestData): StructuredLlmOutput {
  console.warn('⚠️  Using fallback renderer — LLM output was unusable');

  return {
    hunt_items: data.huntData.selected.map((_, i) => ({
      index: i,
      commentary: '',
    })),
    pulse_vibes: data.pulseData.selected.length > 0
      ? [{
          theme: 'Recent Discussions',
          summary: 'Here are the latest threads from your monitored subreddits.',
          thread_indices: data.pulseData.selected.map((_, i) => i).slice(0, 5),
        }]
      : [],
    sports_intro: '',
    closing_note: undefined,
  };
}
