// D13: list the latest quest-status artifact through the API and try to download and unzip it
// from the browser. The zip redirects off api.github.com; record whether CORS and the app's CSP
// allow that, and which host it went to.
const REPO = 'lilmuckers/quest-log-spike';
const $ = (id) => document.getElementById(id);
const rows = [];
const violations = [];

document.addEventListener('securitypolicyviolation', (e) => violations.push(`${e.violatedDirective} blocked ${e.blockedURI}`));

function report(check, result, ok) {
  rows.push([check, result, ok]);
  $('out').replaceChildren(
    ...rows.map(([c, r, good]) => {
      const tr = document.createElement('tr');
      const td = Object.assign(document.createElement('td'), { textContent: r });
      if (good !== undefined) td.className = good ? 'ok' : 'bad';
      tr.append(Object.assign(document.createElement('td'), { textContent: c }), td);
      return tr;
    }),
  );
}

/** Reads one file out of a zip with the central directory and DecompressionStream (no library). */
async function unzipFirst(buf) {
  const v = new DataView(buf);
  let eocd = buf.byteLength - 22;
  while (eocd >= 0 && v.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip');
  const cd = v.getUint32(eocd + 16, true);
  const method = v.getUint16(cd + 10, true);
  const size = v.getUint32(cd + 20, true);
  const nameLen = v.getUint16(cd + 28, true);
  const name = new TextDecoder().decode(new Uint8Array(buf, cd + 46, nameLen));
  const local = v.getUint32(cd + 42, true);
  const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
  const data = new Uint8Array(buf, start, size);
  if (method === 0) return { name, text: new TextDecoder().decode(data) };
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return { name, text: await new Response(stream).text() };
}

async function run() {
  rows.length = 0;
  violations.length = 0;
  const token = $('token').value.trim();
  if (!token) return report('Token', 'Paste a token first.', false);
  try { sessionStorage.setItem('spike-token', token); } catch {}
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };

  const list = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts?name=quest-status&per_page=1`, { headers });
  if (!list.ok) return report('List artifacts', `HTTP ${list.status}`, false);
  const artifact = (await list.json()).artifacts?.[0];
  if (!artifact) return report('List artifacts', 'No quest-status artifact yet. Run the A0 probe workflow.', false);
  report('List artifacts', `✅ #${artifact.id} from run ${artifact.workflow_run?.id}, ${artifact.size_in_bytes} bytes, expired: ${artifact.expired}`, true);

  try {
    const manual = await fetch(artifact.archive_download_url, { headers, redirect: 'manual' });
    report('Download (redirect: manual)', `type ${manual.type}, status ${manual.status} (an opaque redirect hides the Location from JS)`);
  } catch (e) {
    report('Download (redirect: manual)', `threw: ${e.message}`, false);
  }

  const started = performance.now();
  try {
    const res = await fetch(artifact.archive_download_url, { headers });
    const buf = await res.arrayBuffer();
    report('Download (follow redirect)', `✅ HTTP ${res.status}, ${buf.byteLength} bytes in ${Math.round(performance.now() - started)} ms`, res.ok);
    report('Final URL host', new URL(res.url).host);
    const file = await unzipFirst(buf);
    report(`Unzipped ${file.name}`, file.text.slice(0, 300), true);
  } catch (e) {
    report('Download (follow redirect)', `❌ ${e.name}: ${e.message}. Usually CORS on the redirect target, or CSP (see below).`, false);
  }

  await new Promise((r) => setTimeout(r, 50));
  report('CSP violations', violations.length ? violations.join('; ') : 'none', violations.length === 0);
  const last = performance.getEntriesByType('resource').filter((e) => e.name.includes('/artifacts/')).pop();
  if (last) report('Resource timing', `${last.name.split('?')[0]} (${last.transferSize || 0} bytes transferred)`);
}

try { $('token').value = sessionStorage.getItem('spike-token') || ''; } catch {}
$('run').addEventListener('click', () => run().catch((e) => report('Unexpected', e.message, false)));
