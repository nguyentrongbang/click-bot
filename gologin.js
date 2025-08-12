// batch-gologin.mjs
import { GologinApi } from 'gologin';
import dotenv from 'dotenv';
dotenv.config();

const token = process.env.GL_API_TOKEN || '';
const PROXY_ID = process.env.PROXY_ID || '689aba41d37334da17e64d06'; // Proxy đã tạo trong dashboard
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);

if (!token) throw new Error('Missing GL_API_TOKEN');
if (!PROXY_ID) throw new Error('Missing PROXY_ID');

const gologin = GologinApi({ token });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runOne(i) {
  let profileId = null;
  let browser = null;

  try {
    console.log(`[${i}] Creating profile with proxy ${PROXY_ID}...`);
    const profile = await gologin.createProfileRandomFingerprint({
      proxy: { id: PROXY_ID },
    });
    profileId = profile.id;

    console.log(`[${i}] Launching profile ${profileId}...`);
    const { browser: br } = await gologin.launch({ profileId });
    browser = br;

    const page = await browser.newPage();
    await page.goto('https://api.ipify.org', { waitUntil: 'domcontentloaded' });
    const ip = await page.evaluate(() => document.body?.innerText || '');
    console.log(`[${i}] Public IP: ${ip}`);

    await sleep(5000);
  } catch (err) {
    console.error(`[${i}] Error:`, err?.message || err);
  } finally {
    try {
      if (browser) await browser.close();
    } catch {}
    if (profileId) {
      try {
        await gologin.deleteProfile(profileId);
        console.log(`[${i}] Deleted profile ${profileId}`);
      } catch (e) {
        console.warn(`[${i}] Cannot delete profile ${profileId}:`, e?.message || e);
      }
    }
  }
}

async function main() {
  console.log(`[INFO] Concurrency = ${CONCURRENCY}`);
  const tasks = Array.from({ length: CONCURRENCY }, (_, idx) => runOne(idx + 1));
  await Promise.all(tasks);
}

main()
  .catch(console.error)
  .finally(gologin.exit);