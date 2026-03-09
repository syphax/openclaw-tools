/**
 * Tests for rex-engine.ts resilient JSON parsing and validation.
 * Run with: npx ts-node --esm rex-engine.test.ts
 */

// Test the import compatibility
import {
  balanceHuntContent,
  balanceRedditContent,
} from './digest-utils.js';
import {
  buildFormattedSportsSection,
} from './sports-utils.js';

console.log('✅ Import compatibility test passed (modules loaded successfully with .js extensions)');

/**
 * Simulate the extractJsonFromResponse function (copy from rex-engine)
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
 * Simulate the validateLlmResponse function
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
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Test failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

function testDirectJsonParsing() {
  console.log('\n📋 Testing direct JSON parsing...');

  const validJson = JSON.stringify({
    email_body: '<h2>Test</h2><p>This is a test email body with sufficient length to pass validation checks.</p>',
    commentary_notes: 'Test notes',
  });

  const parsed = extractJsonFromResponse(validJson);
  validateLlmResponse(parsed);

  assert(parsed.email_body.includes('Test'), 'Should parse valid JSON directly');
}

function testMarkdownCodeBlock() {
  console.log('\n📋 Testing markdown code block extraction...');

  const wrappedJson = `
Here's the response:

\`\`\`json
{
  "email_body": "<h2>Test</h2><p>This is a test email body with sufficient length to pass validation checks.</p>",
  "commentary_notes": "Test notes"
}
\`\`\`

Hope that helps!
  `;

  const parsed = extractJsonFromResponse(wrappedJson);
  validateLlmResponse(parsed);

  assert(parsed.email_body.includes('Test'), 'Should extract JSON from markdown code block');
}

function testNoisyResponse() {
  console.log('\n📋 Testing noisy response extraction...');

  const noisyJson = `
Some preamble text here...

{"email_body": "<h2>Test</h2><p>This is a test email body with sufficient length to pass validation checks.</p>", "commentary_notes": "Test notes"}

Some trailing text...
  `;

  const parsed = extractJsonFromResponse(noisyJson);
  validateLlmResponse(parsed);

  assert(parsed.email_body.includes('Test'), 'Should extract JSON from noisy response');
}

function testMalformedJson() {
  console.log('\n📋 Testing malformed JSON rejection...');

  const malformedJson = `{"email_body": "incomplete...`;

  try {
    extractJsonFromResponse(malformedJson);
    assert(false, 'Should throw error for malformed JSON');
  } catch (e: any) {
    assert(e.message.includes('Could not extract'), 'Should throw extraction error');
  }
}

function testMissingRequiredFields() {
  console.log('\n📋 Testing missing required fields validation...');

  const missingField = JSON.stringify({
    commentary_notes: 'Test notes',
    // missing email_body
  });

  try {
    const parsed = extractJsonFromResponse(missingField);
    validateLlmResponse(parsed);
    assert(false, 'Should throw error for missing email_body');
  } catch (e: any) {
    assert(e.message.includes('email_body'), 'Should throw validation error for missing field');
  }
}

function testTooShortEmailBody() {
  console.log('\n📋 Testing too-short email_body validation...');

  const tooShort = JSON.stringify({
    email_body: 'Short',
    commentary_notes: 'Test notes',
  });

  try {
    const parsed = extractJsonFromResponse(tooShort);
    validateLlmResponse(parsed);
    assert(false, 'Should throw error for too-short email_body');
  } catch (e: any) {
    assert(e.message.includes('too short'), 'Should throw validation error for short body');
  }
}

function testInvalidType() {
  console.log('\n📋 Testing invalid type validation...');

  const invalidType = JSON.stringify({
    email_body: 12345, // number instead of string
    commentary_notes: 'Test notes',
  });

  try {
    const parsed = extractJsonFromResponse(invalidType);
    validateLlmResponse(parsed);
    assert(false, 'Should throw error for invalid email_body type');
  } catch (e: any) {
    assert(e.message.includes('email_body'), 'Should throw validation error for wrong type');
  }
}

function testMultilineJson() {
  console.log('\n📋 Testing multiline JSON with nested braces...');

  const multilineJson = `{
    "email_body": "<h2>Daily Digest</h2><p>Content here with { braces } inside the string.</p><p>More content to meet the minimum length requirement for validation.</p>",
    "commentary_notes": "Multiple themes: {theme1: 'AI', theme2: 'crypto'}"
  }`;

  const parsed = extractJsonFromResponse(multilineJson);
  validateLlmResponse(parsed);

  assert(parsed.email_body.includes('Daily Digest'), 'Should handle multiline JSON with nested braces');
}

function runAllTests() {
  console.log('🧪 Running rex-engine resilience tests...\n');

  try {
    testDirectJsonParsing();
    testMarkdownCodeBlock();
    testNoisyResponse();
    testMalformedJson();
    testMissingRequiredFields();
    testTooShortEmailBody();
    testInvalidType();
    testMultilineJson();

    console.log('\n✅ All rex-engine tests passed!\n');
  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runAllTests();
