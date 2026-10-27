// Sends one Web Push to every device in spike/notify.json with the values the notify module will
// use (A2): aes128gcm, VAPID from QUEST_VAPID_PRIVATE_KEY (read from toJSON(secrets)) and the public
// key in site/vapid.json, subject https://tasks.patrick-mckinley.com, TTL 12h. Writes a
// quest-status with sent counts and expired device ids (404/410), like D13.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import webpush from 'web-push';

export const SUBJECT = 'https://tasks.patrick-mckinley.com';
export const TTL = 12 * 60 * 60;

/** Sends to each device; `send` is web-push's sendNotification (swapped out in tests). */
export async function sendAll({ devices, publicKey, privateKey, title, body, urgency, only, send = webpush.sendNotification }) {
  const results = [];
  for (const d of devices) {
    if (only && d.id !== only) continue;
    const payload = JSON.stringify({ title, body, url: './', tag: `spike-${Date.now()}`, sentAt: new Date().toISOString() });
    const started = Date.now();
    try {
      const res = await send(d.subscription, payload, {
        TTL,
        urgency,
        contentEncoding: 'aes128gcm',
        vapidDetails: { subject: SUBJECT, publicKey, privateKey },
      });
      results.push({ id: d.id, label: d.label, host: new URL(d.subscription.endpoint).host, status: res.statusCode, ms: Date.now() - started });
    } catch (e) {
      results.push({ id: d.id, label: d.label, host: hostOf(d), status: e.statusCode ?? 'error', ms: Date.now() - started, error: (e.body || e.message || '').toString().slice(0, 200) });
    }
  }
  return {
    results,
    sent: results.filter((r) => typeof r.status === 'number' && r.status < 300).length,
    expiredDevices: results.filter((r) => r.status === 404 || r.status === 410).map((r) => r.id),
  };
}

function hostOf(d) {
  try {
    return new URL(d.subscription.endpoint).host;
  } catch {
    return '?';
  }
}

async function main() {
  const secrets = JSON.parse(process.env.SECRETS_JSON || '{}');
  const privateKey = secrets.QUEST_VAPID_PRIVATE_KEY;
  if (privateKey) console.log(`::add-mask::${privateKey}`);
  const publicKey = JSON.parse(readFileSync('site/vapid.json', 'utf8')).publicKey;
  const devices = existsSync('spike/notify.json') ? JSON.parse(readFileSync('spike/notify.json', 'utf8')).devices ?? [] : [];
  const summary = (s) => process.env.GITHUB_STEP_SUMMARY && appendFileSync(process.env.GITHUB_STEP_SUMMARY, s);

  let out = { results: [], sent: 0, expiredDevices: [] };
  let reason;
  if (!privateKey) reason = 'QUEST_VAPID_PRIVATE_KEY did not arrive through toJSON(secrets)';
  else if (!devices.length) reason = 'no devices in spike/notify.json yet';
  else
    out = await sendAll({
      devices,
      publicKey,
      privateKey,
      title: process.env.PUSH_TITLE || 'Quest Log spike',
      body: process.env.PUSH_BODY || 'Hello from the runner.',
      urgency: process.env.PUSH_URGENCY || 'normal',
      only: process.env.PUSH_ONLY || undefined,
    });

  summary(`### Web Push\n\n${reason ? `Nothing sent: ${reason}.\n` : `| Device | Push service | Result | Time |\n|---|---|---|---|\n${out.results.map((r) => `| ${r.label} (\`${r.id}\`) | ${r.host} | ${r.status}${r.error ? ` ${r.error.replace(/[|\n]/g, ' ')}` : ''} | ${r.ms} ms |`).join('\n')}\n\nSent ${out.sent}; expired: ${out.expiredDevices.join(', ') || 'none'}.\n`}\n`);
  for (const r of out.results) console.log(`${r.label} (${r.id}) → ${r.host}: ${r.status} in ${r.ms} ms${r.error ? ` ${r.error}` : ''}`);

  mkdirSync('quest-status', { recursive: true });
  writeFileSync(
    'quest-status/status.json',
    JSON.stringify({ version: 1, ranAt: new Date().toISOString(), event: process.env.GITHUB_EVENT_NAME || 'local', core: { version: 'spike' }, modules: { notify: reason ? { ran: false, reason } : { ran: true } }, sent: Object.fromEntries(out.results.filter((r) => r.status < 300).map((r) => [r.id, 1])), expiredDevices: out.expiredDevices }, null, 2) + '\n',
  );
  if (reason) console.log(`::warning::${reason}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
