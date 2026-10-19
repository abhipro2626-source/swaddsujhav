// Bhooli Hui Mithai test run: 20 vague descriptions (Hindi/Hinglish/English, with
// spelling mistakes) → is the right sweet in the top 3?
//   node tests/bhooli-tests.mjs            (uses the live Supabase project, anon key)
import { readFileSync, writeFileSync } from 'node:fs';
import { describeToTraits } from '../js/describe-dictionary.js';

const cfg = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
const URL_ = cfg.match(/SUPABASE_URL = '([^']+)'/)[1];
const KEY = cfg.match(/SUPABASE_ANON_KEY =\s*'([^']+)'/)[1];

export const TESTS = [
  ['Gol si thi, chashni mein doobi, andar se naram, Lucknow mein shaadi mein khaayi thi', ['Gulab Jamun', 'Rasgulla', 'Kala Jamun']],
  ['safed spongy gol mithai jisme bahut ras hota hai, kolkata wali', ['Rasgulla']],
  ['peeli lambi si, chashni wali, bengali, upar khoya laga tha — woh chum wali', ['Chamcham', 'Kesar Chamcham', 'Chomchom (Tangail)']],
  ['orange colour ki goal goal ghumavdar, garam garam kurkuri, chashni se bhari', ['Jalebi', 'Imarti', 'Jangiri']],
  ['diamond shape white with silver vark, kaju wali, diwali pe sab dete hai', ['Kaju Katli', 'Sugar-free Kaju Katli']],
  ['bhuri si gol, mathura ki, khoya se bani, chashni nahi', ['Mathura Peda', 'Peda', 'Dharwad Peda']],
  ['thandi katori mein, gaadhi malai wali doodh ki, pista upar', ['Rabri', 'Basundi', 'Phirni']],
  ['gajar wali laal garam halwa sardiyon mein', ['Gajar Ka Halwa']],
  ['chhote chhote peele daane wale laddoo, motichoor jaise, shaadi mein milte', ['Motichoor Laddoo', 'Boondi Laddoo']],
  ['patli parat dar flaky sweet, square, besan ki, muh mein ghul jaati hai', ['Soan Papdi', 'Patisa']],
  ['brown crunchy flat til aur gur wali sardi wali chikki type', ['Gur Gajak', 'Til Chikki', 'Tilkut']],
  ['dudh me pakaye chhena ke flat gol tukde, kesar wala thanda doodh, bengali', ['Rasmalai', 'Mango Rasmalai']],
  ['modak jaisa ganpati ka prasad, andar nariyal gur bhara, chawal ka', ['Modak', 'Kozhukattai']],
  ['safed chakor tukde, safed petha jaisi, agra ki, chewy', ['Agra Petha']],
  ['kala sa gol jamun, gulab jamun se dark, chashni mein', ['Kala Jamun', 'Gulab Jamun']],
  ['mysore ki peeli ghee wali besan barfi, porous', ['Mysore Pak', 'Ghee Mysore Pak']],
  ['turkish sweet with pistachio layers and syrup, diamond pieces', ['Baklava']],
  ['japani chawal ki gol naram mithai, andar meetha bhara hua, chewy', ['Mochi', 'Strawberry Daifuku', 'Tangyuan']],
  ['gur aur moongfali ki crunchy patti, sardi mein', ['Peanut Chikki', 'Til Chikki', 'Gur Gajak']],
  ['garam peeli sooji wali ghee mein, mandir ka prasad', ['Sooji Halwa', 'Kesari Bath', 'Atta Halwa (Kada Prasad)']],
];

async function identify(desc) {
  const { traits } = describeToTraits(desc);
  const res = await fetch(`${URL_}/rest/v1/rpc/identify_sweet`, {
    method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_description: desc, p_traits: traits }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

const names = new Map((await (await fetch(`${URL_}/rest/v1/sweets?select=id,name`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json()).map((s) => [s.id, s.name]));
let pass = 0;
const rows = [];
for (const [desc, expected] of TESTS) {
  const top = (await identify(desc)).map((r) => ({ name: names.get(r.sweet_id), confidence: r.confidence }));
  const rank = top.slice(0, 3).findIndex((t) => expected.includes(t.name));
  const ok = rank >= 0;
  if (ok) pass++;
  rows.push({ desc, expected: expected[0], top3: top.slice(0, 3).map((t) => `${t.name} (${t.confidence}%)`).join(', '), ok, rank: rank + 1 });
  console.log(`${ok ? 'PASS' : 'FAIL'} #${rank + 1 || '-'} | ${desc}\n      → ${rows.at(-1).top3}`);
}
console.log(`\nScore: ${pass}/${TESTS.length} with the right sweet in the top 3`);
if (process.argv.includes('--write')) {
  const md = `# Bhooli Hui Mithai — test descriptions\n\nRun: \`node tests/bhooli-tests.mjs --write\` (queries the live database through the public \`identify_sweet\` function).\n\n`
    + `**Score: ${pass}/${TESTS.length}** descriptions have the right sweet in Paaji's top 3 (target: 13 of 15).\n\n`
    + `| # | Description (as a customer typed it) | Expected | Paaji's top 3 | Result |\n|---|---|---|---|---|\n`
    + rows.map((r, i) => `| ${i + 1} | ${r.desc} | ${r.expected} | ${r.top3} | ${r.ok ? `✅ #${r.rank}` : '❌'} |`).join('\n')
    + `\n\nMixed Hindi, Hinglish and English with real-world spellings ("goal goal", "dudh me", "kurkuri", "chum wali").\n`;
  writeFileSync(new URL('../docs/bhooli-mithai-tests.md', import.meta.url), md);
  console.log('wrote docs/bhooli-mithai-tests.md');
}
