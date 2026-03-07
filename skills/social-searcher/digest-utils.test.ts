/**
 * Tests for digest-utils.ts
 * Run with: npx ts-node --esm digest-utils.test.ts
 */

import {
  balanceRedditContent,
  balanceHuntContent,
  formatWhatsAppLink,
  formatTelegramLink,
  formatEmailLink,
  generateEmailSubject,
  type RedditPost,
  type LinkedInPost,
} from './digest-utils.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Test failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

function testBalanceRedditContent() {
  console.log('\n📋 Testing balanceRedditContent...');

  const posts: RedditPost[] = [
    { platform: 'reddit', title: 'Post 1', author: 'user1', subreddit: 'openclaw', url: 'url1' },
    { platform: 'reddit', title: 'Post 2', author: 'user2', subreddit: 'openclaw', url: 'url2' },
    { platform: 'reddit', title: 'Post 3', author: 'user3', subreddit: 'openclaw', url: 'url3' },
    { platform: 'reddit', title: 'Post 4', author: 'user4', subreddit: 'agrivoltaics', url: 'url4' },
    { platform: 'reddit', title: 'Post 5', author: 'user5', subreddit: 'agrivoltaics', url: 'url5' },
    { platform: 'reddit', title: 'Post 6', author: 'user6', subreddit: 'vermont', url: 'url6' },
    { platform: 'reddit', title: 'Post 7', author: 'user7', subreddit: 'vermont', url: 'url7' },
  ];

  const result = balanceRedditContent(posts, 10, 3);

  assert(result.selected.length === 7, 'Should select all 7 posts (under max)');
  assert(result.subCounts['openclaw'] === 3, 'r/openclaw should have exactly 3 posts');
  assert(result.subCounts['agrivoltaics'] === 2, 'r/agrivoltaics should have exactly 2 posts');
  assert(result.subCounts['vermont'] === 2, 'r/vermont should have exactly 2 posts');
  assert(result.totalAvailable === 7, 'Total available should be 7');

  // Test with stricter limits
  const result2 = balanceRedditContent(posts, 5, 2);
  assert(result2.selected.length === 5, 'Should select exactly 5 posts');
  assert(result2.subCounts['openclaw'] <= 2, 'r/openclaw should have max 2 posts with stricter limit');

  console.log('  Selected distribution:', result2.subCounts);
}

function testBalanceHuntContent() {
  console.log('\n📋 Testing balanceHuntContent...');

  const huntData: (LinkedInPost | RedditPost)[] = [
    { platform: 'linkedin', keyword: 'AI', author: 'john', content: 'AI post 1', url: 'url1', title: 'AI 1' },
    { platform: 'linkedin', keyword: 'AI', author: 'jane', content: 'AI post 2', url: 'url2', title: 'AI 2' },
    { platform: 'reddit', title: 'Reddit 1', author: 'user1', subreddit: 'openclaw', url: 'url3' },
    { platform: 'reddit', title: 'Reddit 2', author: 'user2', subreddit: 'openclaw', url: 'url4' },
    { platform: 'reddit', title: 'Reddit 3', author: 'user3', subreddit: 'openclaw', url: 'url5' },
    { platform: 'reddit', title: 'Reddit 4', author: 'user4', subreddit: 'vermont', url: 'url6' },
  ];

  const result = balanceHuntContent(huntData, 10, 3);

  assert(result.selected.length === 6, 'Should select all 6 posts');
  assert(result.subCounts['reddit:openclaw'] <= 3, 'r/openclaw should have max 3 posts');
  assert(result.subCounts['linkedin:AI'] <= 3, 'LinkedIn AI keyword should have max 3 posts');

  console.log('  Selected distribution:', result.subCounts);

  // Test with stricter limits to force balancing
  const result2 = balanceHuntContent(huntData, 4, 2);
  assert(result2.selected.length === 4, 'Should select exactly 4 posts');
  assert(result2.subCounts['reddit:openclaw'] <= 2, 'r/openclaw should have max 2 with stricter limit');

  console.log('  Stricter distribution:', result2.subCounts);
}

function testLinkFormatting() {
  console.log('\n📋 Testing link formatting...');

  const text = 'Click here';
  const url = 'https://example.com';

  const whatsappLink = formatWhatsAppLink(text, url);
  assert(
    whatsappLink === 'Click here: https://example.com',
    'WhatsApp link should be plain text with colon'
  );

  const telegramLink = formatTelegramLink(text, url);
  assert(
    telegramLink === '[Click here](https://example.com)',
    'Telegram link should be markdown format'
  );

  const emailLink = formatEmailLink(text, url);
  assert(
    emailLink === '<a href="https://example.com">Click here</a>',
    'Email link should be HTML anchor tag'
  );
}

function testEmailSubject() {
  console.log('\n📋 Testing email subject generation...');

  const subject1 = generateEmailSubject('2026-03-05');
  assert(
    subject1 === '🦖 Rex Daily Brief: 2026-03-05',
    'Should generate correct subject with explicit date'
  );

  const subject2 = generateEmailSubject();
  assert(
    subject2.startsWith('🦖 Rex Daily Brief: '),
    'Should generate subject with today\'s date'
  );
  assert(
    /\d{4}-\d{2}-\d{2}$/.test(subject2),
    'Subject should end with YYYY-MM-DD format'
  );
}

function testEmptyInputs() {
  console.log('\n📋 Testing empty inputs...');

  const emptyReddit = balanceRedditContent([], 10, 3);
  assert(emptyReddit.selected.length === 0, 'Empty input should return empty selection');
  assert(Object.keys(emptyReddit.subCounts).length === 0, 'Empty input should have no counts');

  const emptyHunt = balanceHuntContent([], 10, 3);
  assert(emptyHunt.selected.length === 0, 'Empty hunt input should return empty selection');
}

function runAllTests() {
  console.log('🧪 Running digest-utils tests...\n');

  try {
    testBalanceRedditContent();
    testBalanceHuntContent();
    testLinkFormatting();
    testEmailSubject();
    testEmptyInputs();

    console.log('\n✅ All tests passed!\n');
  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

runAllTests();
