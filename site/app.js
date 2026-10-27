// Quest Log push spike: subscribe this device, register it in spike/notify.json, show what arrived.
const REPO = 'lilmuckers/quest-log-spike';
const NOTIFY_PATH = 'spike/notify.json';
const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const utf8b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const b64utf8 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const hasPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function deviceId() {
  let id = store.get('spike-device-id');
  if (!id) store.set('spike-device-id', (id = `spike-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`));
  return id;
}

function defaultLabel() {
  const browser = /Firefox\//.test(ua) ? 'Firefox' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = isIOS ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return `${os} ${browser}${standalone ? ' (home screen)' : ''}`.trim();
}

function support() {
  const state = !hasPush ? (isIOS && !standalone ? 'ios-needs-install' : 'unsupported') : Notification.permission === 'denied' ? 'denied' : 'ready';
  const rows = [
    ['Browser', defaultLabel()],
    ['Service worker', 'serviceWorker' in navigator ? '✅' : '❌'],
    ['PushManager', 'PushManager' in window ? '✅' : '❌'],
    ['Installed (standalone)', standalone ? '✅' : '–'],
    ['Permission', 'Notification' in window ? Notification.permission : '–'],
    ['support() for G4', state],
  ];
  $('support').replaceChildren(...rows.map(([k, v]) => tr(k, v)));
  $('ios-hint').hidden = state !== 'ios-needs-install';
  return state;
}

function tr(...cells) {
  const row = document.createElement('tr');
  for (const c of cells) row.append(Object.assign(document.createElement('td'), { textContent: c }));
  return row;
}

async function registration() {
  return navigator.serviceWorker.register('sw.js');
}

async function vapidPublicKey() {
  const res = await fetch('vapid.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`vapid.json: HTTP ${res.status}`);
  return (await res.json()).publicKey;
}

async function currentSubscription() {
  if (!hasPush) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function deviceEntry(sub) {
  const json = sub.toJSON();
  return {
    id: deviceId(),
    label: $('label').value.trim() || defaultLabel(),
    addedAt: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    events: { timebox: true, review: 'fri', warpZone: true },
    subscription: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
  };
}

async function showSubscription() {
  const sub = await currentSubscription();
  $('device-json').textContent = sub ? JSON.stringify(deviceEntry(sub), null, 2) : 'Not subscribed yet.';
  $('sub-status').textContent = sub ? `Subscribed via ${new URL(sub.endpoint).host}.` : 'Not subscribed.';
  $('unsubscribe').disabled = !sub;
  $('save').disabled = $('copy').disabled = !sub;
  return sub;
}

async function subscribe() {
  $('sub-status').textContent = 'Asking…';
  try {
    const permission = await Notification.requestPermission();
    support();
    if (permission !== 'granted') return void ($('sub-status').textContent = `Permission ${permission}.`);
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const key = await vapidPublicKey();
    let sub = await reg.pushManager.getSubscription();
    const serverKey = sub?.options?.applicationServerKey;
    const same = sub && (!serverKey || b64url(serverKey) === key);
    if (sub && !same) await sub.unsubscribe();
    if (!sub || !same) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(key) });
    await showSubscription();
  } catch (e) {
    $('sub-status').textContent = `Failed: ${e.message}`;
  }
}

async function unsubscribe() {
  const sub = await currentSubscription();
  if (sub) await sub.unsubscribe();
  await showSubscription();
  $('sub-status').textContent += ' Leave it in notify.json and send again to see the 404/410.';
}

async function localTest() {
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    await reg.showNotification('Local test', { body: 'Permission and the service worker work. No server involved.', icon: 'icon-192.png', tag: 'local' });
  } catch (e) {
    $('sub-status').textContent = `Local test failed: ${e.message}`;
  }
}

async function gh(path, init = {}) {
  const token = $('token').value.trim();
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...init,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...init.headers },
  });
  return res;
}

async function save() {
  const sub = await currentSubscription();
  if (!sub) return;
  if (!$('token').value.trim()) return void ($('save-status').textContent = 'Paste a token first.');
  try { sessionStorage.setItem('spike-token', $('token').value.trim()); } catch {}
  $('save-status').textContent = 'Saving…';
  for (let attempt = 0; attempt < 3; attempt++) {
    const got = await gh(`contents/${NOTIFY_PATH}`);
    if (!got.ok && got.status !== 404) return void ($('save-status').textContent = `Read failed: HTTP ${got.status}`);
    const file = got.ok ? await got.json() : null;
    const notify = file ? JSON.parse(b64utf8(file.content)) : { devices: [] };
    const entry = deviceEntry(sub);
    const old = notify.devices.find((d) => d.id === entry.id);
    if (old) entry.addedAt = old.addedAt;
    notify.devices = [...notify.devices.filter((d) => d.id !== entry.id), entry];
    const put = await gh(`contents/${NOTIFY_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({ message: `spike: register ${entry.label} (${entry.id})`, content: utf8b64(JSON.stringify(notify, null, 2) + '\n'), ...(file ? { sha: file.sha } : {}) }),
    });
    if (put.ok) return void ($('save-status').textContent = `Saved ${entry.id}. Run the "Send push" workflow to test it.`);
    if (put.status !== 409) return void ($('save-status').textContent = `Save failed: HTTP ${put.status}`);
  }
  $('save-status').textContent = 'Save failed: kept conflicting with another write.';
}

async function copy() {
  await navigator.clipboard.writeText($('device-json').textContent);
  $('save-status').textContent = 'Copied.';
}

/** Asks the service worker for its log (sw v3+); null if it doesn't answer. */
async function logFromWorker() {
  const sw = navigator.serviceWorker?.controller ?? (await navigator.serviceWorker?.getRegistration())?.active;
  if (!sw) return null;
  return new Promise((resolve) => {
    const onMessage = (e) => {
      if (!e.data?.log) return;
      navigator.serviceWorker.removeEventListener('message', onMessage);
      resolve(e.data);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    sw.postMessage('log');
    setTimeout(() => (navigator.serviceWorker.removeEventListener('message', onMessage), resolve(null)), 1500);
  });
}

/** Arrivals from the worker (sw v3+), this page's IndexedDB view and Cache Storage (sw v1), de-duplicated. */
async function showLog() {
  const byAt = new Map();
  const notes = [];
  const fromWorker = await logFromWorker();
  if (fromWorker?.error) notes.push(`worker: ${fromWorker.error}`);
  for (const e of fromWorker?.log ?? []) byAt.set(e.at + (e.title ?? ''), e);
  try {
    for (const e of await self.spikeLog.all()) byAt.set(e.at + (e.title ?? ''), e);
  } catch (e) {
    notes.push(`IndexedDB: ${e.message}`);
  }
  try {
    const cache = await caches.open('spike-log');
    for (const k of await cache.keys()) {
      const e = await (await cache.match(k)).json();
      if (!byAt.has(e.at + (e.title ?? ''))) byAt.set(e.at + (e.title ?? ''), e);
    }
  } catch (e) {
    notes.push(`Cache: ${e.message}`);
  }
  const entries = [...byAt.values()].sort((a, b) => b.at.localeCompare(a.at));
  if (notes.length) entries.unshift({ at: new Date().toISOString(), title: `read error: ${notes.join('; ')}`, delay: null });
  const head = tr('Arrived', 'Title', 'Delay');
  head.classList.add('muted');
  $('log').replaceChildren(head, ...(entries.length ? entries.slice(0, 20).map((e) => tr(new Date(e.at).toLocaleString(), e.title ?? '–', e.delay == null ? '–' : `${e.delay}s`)) : [tr('Nothing yet.', '', '')]));
}

/** The app will make the VAPID pair in the browser (G4); web-push wants a 65-byte raw public key and a 32-byte d. */
async function vapidCheck() {
  try {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const d = fromB64url(jwk.d);
    const ok = raw.length === 65 && raw[0] === 4 && d.length === 32;
    $('vapid-check').textContent = `${ok ? '✅' : '❌'} public key ${raw.length} bytes (uncompressed point), private d ${d.length} bytes.`;
    $('vapid-check').className = ok ? 'ok' : 'bad';
  } catch (e) {
    $('vapid-check').textContent = `❌ ${e.message}`;
    $('vapid-check').className = 'bad';
  }
}

$('label').value = store.get('spike-label') || defaultLabel();
$('label').addEventListener('change', () => store.set('spike-label', $('label').value));
try { $('token').value = sessionStorage.getItem('spike-token') || ''; } catch {}
$('subscribe').addEventListener('click', subscribe);
$('unsubscribe').addEventListener('click', unsubscribe);
$('local').addEventListener('click', localTest);
$('save').addEventListener('click', save);
$('copy').addEventListener('click', copy);
$('refresh').addEventListener('click', showLog);
$('sw-update').addEventListener('click', async () => {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return void ($('sw-version').textContent = 'No service worker registered yet.');
  await reg.update();
  location.reload();
});
$('clicked').hidden = new URLSearchParams(location.search).get('from') !== 'notification';

const state = support();
$('subscribe').disabled = $('local').disabled = state !== 'ready';
if (hasPush) registration().then(showSubscription, (e) => ($('sub-status').textContent = `Service worker failed: ${e.message}`));
else showSubscription();
showLog();
vapidCheck();
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data === 'pushed') showLog();
  if (e.data?.version) $('sw-version').textContent = `Service worker v${e.data.version} (page expects v3).`;
});
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && showLog());
navigator.serviceWorker?.ready.then((reg) => {
  $('sw-version').textContent = 'Service worker v1 (no version reply). Tap "Update service worker".';
  reg.active?.postMessage('version');
});
