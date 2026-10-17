// Paaji's dialogue bank — original Hinglish/Punjabi lines written for this shop.
// {name}, {sweet}, {added}, {a}, {b} are filled in at runtime.
// The shop owner can override/extend any trigger from the admin panel (paaji_lines table).

export const LINES = {
  welcome: [
    'Paaji, tussi padharo! Swaad Sujhav vich tuhada swagat hai!',
    'Aao ji aao, aaj kuch meetha ho jaaye!',
    'Jai Shree Ram ji! Muzaffarnagar di sabton mithi dukaan vich swagat hai.',
    'Jee aayan nu! Thaali saji hai, bas tuhadi pasand di kami si.',
    'Aao ji! Aaj diye vi jale ne te kadhai vi garam hai.',
  ],
  return: [
    'Oye {name} ji, phir aa gaye! Tuhadi pasand di mithai ready hai.',
    '{name} ji! Bade din baad... chalo, aaj kuch khaas dikhaanda haan.',
    'Wah {name} ji, tuhade bina dukaan suni si!',
    '{name} ji, tuhada swaad mainu yaad hai. Dekho ki laya haan!',
  ],
  add: [
    'Wah ji wah, kya choice hai!',
    'Ekdum sahi pasand ji!',
    'Bas, hun mooh mitha ho gaya samjho!',
    'Shabaash! Ye toh dil jeet legi.',
    'Kamaal di choice ji, ekdum kamaal!',
  ],
  upsell_new: [
    'Ye {sweet} bhi le jao, poore Muzaffarnagar mein nayi hai!',
    'Ye {sweet} bhi le jao ji, poore Muzaffarnagar mein nayi hai! Bilkul taazi.',
    'Ek baar {sweet} chakh ke dekho, dil khush ho jayega! Poore shehar mein nayi hai.',
    'Ye bhi le lo ji, {sweet} bilkul naya hai!',
  ],
  upsell_pair: [
    'Ye {sweet} bhi le jao ji, {added} de naal jodi kamaal di hai!',
    '{added} de naal {sweet}? Jodi number one ji!',
    'Sunno ji, {added} nu {sweet} da saath bada pasand hai.',
  ],
  upsell_similar: [
    '{added} pasand aayi? Toh {sweet} vi zaroor chakhna ji!',
    'Jinhaan nu {added} pasand aundi hai, oh {sweet} vi le jaande ne.',
  ],
  // Mix & Save nudges ({n} more sweets → {pct}% off)
  mix_nudge: [
    'Bas {n} mithai hor ji, te poori thaali te {pct}% bachat!',
    'Ek kaam karo ji — {n} hor daal lo, {pct}% off mil jauga!',
    'Suniye ji, {n} hor mithai te {pct}% di chhoot pakki!',
  ],
  mix_unlocked: [
    'Balle balle! {pct}% Mix & Save unlock ho gaya ji!',
    'Wah ji! Hun poori thaali te {pct}% off!',
  ],
  cart_idle: [
    'Cart vich mithai intezaar kar rahi hai ji!',
    'Thaali taiyaar hai ji, bas ek click di der hai!',
    'Mithai thandi ho jaugi ji... chalo order kar lo!',
  ],
  order: [
    'Wah ji wah! Order ho gaya. Mooh mitha karo te muskuraao!',
    'Shukriya ji! Tuhadi thaali pyaar naal saja rahe haan.',
    'Balle balle! Order pakka, mithai pakki!',
  ],
  no_result: [
    'Ye wali toh nahi mili ji, par ye try karo!',
    'Oho, ye mithai abhi dukaan vich nahi hai. Par ye dekho ji!',
    'Naam thoda alag hai shayad? Chalo, ye wali try karo!',
  ],
  login: [
    'Wapas aa gaye ji! Tuhada cart te pasand dono yaad ne.',
  ],
  signup: [
    'Wah ji wah! Parivaar vich swagat hai!',
  ],
  removed: [
    'Koi gal nahi ji, mann badal gaya? Undo da button haazir hai.',
  ],
  cart_open: [
    'Dekho ji, thaali kinni sohni lag rahi hai!',
    'Thaali vekh lo ji, kuch hor chahida?',
  ],
  // Fun facts for idle moments — keep these accurate.
  fact: [
    'Pata hai? Mysore Pak pehli baar Mysore Palace di rasoi vich bani si!',
    'Pata hai? Rasgulle nu Bengal te Odisha dono nu apna-apna GI tag mila hai.',
    'Pata hai? Gulab jamun da naam gulab-jal te jamun phal ton aaya hai.',
    'Pata hai? Kaju Bharat vich Portuguese lekar aaye si, solvi sadi vich, Goa de raaste.',
    'Pata hai? Dharwad peda te Tirupati laddu, dono nu GI tag mila hoya hai.',
    'Pata hai? Ghewar khaas taur te Teej te Raksha Bandhan te banda hai.',
    'Pata hai? Iran vich jalebi nu zulbia kehnde ne.',
    'Pata hai? Mishti doi mitti de kulhad vich jamaai jaandi hai, isliye itni gaadhi hundi hai.',
    'Pata hai? Muzaffarnagar di gur mandi Asia di sabton vaddiyan mandiyan vich gini jaandi hai!',
    'Pata hai? Istanbul de Topkapi Palace ton Ramzan vich baklava da juloos nikalda si.',
    'Pata hai? Lonavala di chikki da shuru 1880 de aas-paas Maganlal ne kitta si.',
    'Pata hai? Kalakand Alwar vich 1947 vich Baba Thakur Das ne banaaya si.',
  ],
  think: [
    'Hmm... soch raha haan tuhade layi ki best rahegi...',
    'Ek minute ji, thaali vich nazar maar reha haan...',
  ],
};

// Fixed pairings Paaji loves to mention.
export const PAIRS = [
  ['Rasgulla', 'Rasmalai', 'Rasgulle de naal rasmalai, jodi number one!'],
  ['Jalebi', 'Rabri', 'Garam jalebi te thandi rabri — swarg ji, swarg!'],
  ['Gajar Ka Halwa', 'Gulab Jamun', 'Gajar halwa te gulab jamun, sardiyan di shahi jodi!'],
  ['Baklava', 'Kunafa', 'Baklava de naal kunafa? Turkey te Arab dono ik thaali vich!'],
  ['Kaju Katli', 'Soan Papdi', 'Kaju katli te soan papdi — Diwali da asli dabba!'],
];

const lastUsed = new Map();

/** Pick a random line for a trigger, never the same one twice in a row. */
export function pickLine(trigger, vars = {}, override = null) {
  const pool = (override?.[trigger]?.length ? override[trigger] : LINES[trigger]) || [];
  if (!pool.length) return '';
  let options = pool.map((_, i) => i);
  if (pool.length > 1 && lastUsed.has(trigger)) options = options.filter((i) => i !== lastUsed.get(trigger));
  const idx = options[Math.floor(Math.random() * options.length)];
  lastUsed.set(trigger, idx);
  return fill(pool[idx], vars);
}

export function fill(text, vars = {}) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : ''));
}
