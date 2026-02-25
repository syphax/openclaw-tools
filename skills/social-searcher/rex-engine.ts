import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const addressCfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'cfg', 'addresses.json'), 'utf-8'));
const credentialsEnv = fs.readFileSync(path.join(process.env.HOME || '', '.openclaw/credentials/.env'), 'utf-8');
const GOG_KEYRING_PASSWORD = credentialsEnv.match(/GOG_KEYRING_PASSWORD=(.+)/)?.[1]?.trim();


async function synthesize(rawData: any) {
    if (!OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY not found in environment.");
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
   - Categorize entries from 'sportsData'.
   - WIN, LOSS, or DRAW with scores.
   - Upcoming game times for today.
   - Collapse inactive teams into: "Quiet Stadium: [Teams]."

### FORMATTING:
- Produce TWO versions:
  - **VERSION_EMAIL**: Strict HTML. Use <a> tags for ALL links. No Markdown.
  - **VERSION_MOBILE**: Clean Markdown for WhatsApp/Telegram.

### OUTPUT FORMAT:
Return a JSON object:
{
  "subject": "🦖 Rex Daily Brief: [Brief Catchy Tagline]",
  "email_body": "...",
  "mobile_body": "..."
}
`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://openclaw.io",
            "X-Title": "Social Searcher Rex Engine"
        },
        body: JSON.stringify({
            model: "google/gemini-2.0-flash-001",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        })
    });

    const result = await response.json();
    return JSON.parse(result.choices[0].message.content);
}

import { spawnSync } from 'child_process';

async function deliverEmail(subject: string, htmlBody: string) {
    console.log('📧 Delivering Email via gog...');
    const bodyFile = path.join(__dirname, 'temp_email.html');
    fs.writeFileSync(bodyFile, htmlBody);
    
    try {
        // Using gog with file backend
        // Use child_process.spawn for safer argument handling
        const gog = spawnSync('gog', [
            'gmail', 'send',
            '--account', addressCfg.emailFrom,
            '--to', addressCfg.emailTo,
            '--subject', subject,
            '--body-html', htmlBody
        ], {
            env: { ...process.env, GOG_KEYRING_PASSWORD }
        });

        if (gog.status === 0) {
            console.log('✅ Email sent.');
        } else {
            console.error('❌ Email delivery failed:', gog.stderr.toString());
        }
    } catch (e: any) {
        console.error('❌ Email delivery error:', e.message);
    } finally {
        if (fs.existsSync(bodyFile)) fs.unlinkSync(bodyFile);
    }
}

async function deliverMobile(body: string) {
    console.log('📱 Delivering Mobile Brief...');
    
    const channels = ['whatsapp', 'telegram'];

    for (const channel of channels) {
        try {
            console.log(`  Trying ${channel}...`);
            const target = channel === 'telegram' ? addressCfg.telegramChatId : addressCfg.phoneWhatsapp;
            const oc = spawnSync('openclaw', [
                'message', 'send',
                '--channel', channel,
                '--target', target,
                '--message', body
            ]);

            if (oc.status === 0) {
                console.log(`  ✅ ${channel} message sent.`);
            } else {
                console.error(`  ❌ ${channel} delivery failed:`, oc.stderr.toString());
            }
        } catch (e: any) {
            console.error(`  ❌ ${channel} delivery error:`, e.message);
        }
    }
}

async function main() {
    const date = new Date().toISOString().split('T')[0];
    const outputDir = path.join(process.env.HOME || '', '.openclaw/data/social-searcher');
    const rawDataPath = path.join(outputDir, `raw-data-${date}.json`);

    if (!fs.existsSync(rawDataPath)) {
        console.error(`Missing raw data for ${date}. Run daily-digest.ts first.`);
        return;
    }

    console.log(`🦖 Rex Engine starting for ${date}...`);
    const rawData = JSON.parse(fs.readFileSync(rawDataPath, 'utf-8'));
    
    try {
        const digest = await synthesize(rawData);
        console.log('✨ Synthesis complete.');
        
        await deliverEmail(digest.subject, digest.email_body);
        await deliverMobile(digest.mobile_body);
        
    } catch (error: any) {
        console.error('❌ Synthesis/Delivery failed:', error.message);
    }
}

main();
