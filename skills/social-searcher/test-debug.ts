import {
  balanceRedditContent,
  type RedditPost,
} from './digest-utils.ts';

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

console.log('Result:', JSON.stringify(result, null, 2));
console.log('Selected count:', result.selected.length);
console.log('Expected: 7');
