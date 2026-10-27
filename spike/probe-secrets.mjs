// A0 (D12): does `with: secrets: ${{ toJSON(secrets) }}` reach a composite action, and are the
// values masked? Prints names only, then deliberately echoes each QUEST_* value so the log shows
// whether it comes out as ***.
import { appendFileSync } from 'node:fs';

const raw = process.env.SECRETS_JSON ?? '';
let all = {};
try {
  all = raw.trim() ? JSON.parse(raw) : {};
} catch {
  console.log('::error::secrets input is not JSON');
  process.exit(1);
}
const names = Object.keys(all).sort();
const kept = names.filter((n) => n.startsWith('QUEST_') && all[n]);
for (const n of kept) console.log(`::add-mask::${all[n]}`);
console.log(`Received ${names.length} secret name(s): ${names.join(', ') || 'none'}`);
console.log(`Kept (QUEST_*): ${kept.join(', ') || 'none'}`);
for (const n of kept) console.log(`Echo test ${n} = ${all[n]}`);

const event = process.env.GITHUB_EVENT_NAME;
const fork = process.env.SPIKE_FORK === 'true';
const rows = [
  ['Event', `${event}${fork ? ' (fork PR)' : ''}`],
  ['Names received', names.map((n) => `\`${n}\``).join(', ') || 'none'],
  ['QUEST_* kept', kept.map((n) => `\`${n}\``).join(', ') || 'none'],
  ['QUEST_FOO arrived', names.includes('QUEST_FOO') ? '✅' : '❌'],
  ['OTHER_BAR arrived', names.includes('OTHER_BAR') ? '✅' : '❌'],
];
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Secrets (D12)\n\n| Check | Result |\n|---|---|\n${rows.map((r) => `| ${r[0]} | ${r[1]} |`).join('\n')}\n\nThe log echoes each kept value; it must read \`***\`.\n\n`);
