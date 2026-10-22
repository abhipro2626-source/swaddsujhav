// Paaji's dialogue bank — original Hindi lines written for Mithai Mitra.
// {name}, {sweet}, {added}, {a}, {b} are filled in at runtime.
// The shop owner can override/extend any trigger from the admin panel (paaji_lines table).

export const LINES = {
  welcome: [
    'Aaiye, aaiye! Mithai Mitra mein aapka swagat hai!',
    'Aaiye ji, aaj kuch meetha ho jaaye!',
    'Jai Shree Ram ji! Muzaffarnagar ki sabse meethi dukaan mein aapka swagat hai.',
    'Padhariye ji! Thaali saji hai, bas aapki pasand ki kami thi.',
    'Aaiye ji! Aaj diye bhi jale hain aur kadhai bhi garam hai.',
  ],
  return: [
    'Arre {name} ji, phir aa gaye! Aapki pasand ki mithai taiyaar hai.',
    '{name} ji! Bade dinon baad... chaliye, aaj kuch khaas dikhata hoon.',
    'Wah {name} ji, aapke bina dukaan sooni thi!',
    '{name} ji, aapka swaad mujhe yaad hai. Dekhiye kya laaya hoon!',
  ],
  add: [
    'Wah ji wah, kya pasand hai!',
    'Ekdum sahi chunaav ji!',
    'Bas, ab mooh meetha ho gaya samjhiye!',
    'Shabaash! Ye toh dil jeet legi.',
    'Kamaal ki pasand ji, ekdum kamaal!',
  ],
  upsell_new: [
    'Ye {sweet} bhi le jaiye, poore Muzaffarnagar mein nayi hai!',
    'Ye {sweet} bhi le jaiye ji, poore Muzaffarnagar mein nayi hai! Bilkul taazi.',
    'Ek baar {sweet} chakh ke dekhiye, dil khush ho jaayega! Poore shehar mein nayi hai.',
    'Ye bhi le lijiye ji, {sweet} bilkul nayi hai!',
  ],
  upsell_pair: [
    'Ye {sweet} bhi le jaiye ji, {added} ke saath iski jodi kamaal ki hai!',
    '{added} ke saath {sweet}? Jodi number one ji!',
    'Suniye ji, {added} ke saath {sweet} ka saath sabko bahut pasand aata hai.',
  ],
  upsell_similar: [
    '{added} pasand aayi? Toh {sweet} bhi zaroor chakhiye ji!',
    'Jinhe {added} pasand aati hai, woh {sweet} bhi le jaate hain.',
  ],
  // Mix & Save nudges ({n} more sweets → {pct}% off)
  mix_nudge: [
    'Bas {n} mithai aur ji, aur poori thaali par {pct}% bachat!',
    'Ek kaam kijiye ji — {n} aur daal lijiye, {pct}% off mil jaayega!',
    'Suniye ji, {n} aur mithai par {pct}% ki chhoot pakki!',
  ],
  mix_unlocked: [
    'Waah! {pct}% Mix & Save khul gaya ji!',
    'Wah ji! Ab poori thaali par {pct}% off!',
  ],
  cart_idle: [
    'Cart mein mithai aapka intezaar kar rahi hai ji!',
    'Thaali taiyaar hai ji, bas ek click ki der hai!',
    'Mithai thandi ho jaayegi ji... chaliye order kar lijiye!',
  ],
  order: [
    'Wah ji wah! Order ho gaya. Mooh meetha kijiye aur muskuraiye!',
    'Shukriya ji! Aapki thaali pyaar se saja rahe hain.',
    'Waah! Order pakka, mithai pakki!',
  ],
  no_result: [
    'Ye wali toh nahi mili ji, par ye try kijiye!',
    'Oho, ye mithai abhi dukaan mein nahi hai. Par ye dekhiye ji!',
    'Naam thoda alag hai shayad? Chaliye, ye wali try kijiye!',
  ],
  login: [
    'Wapas aa gaye ji! Aapka cart aur pasand dono yaad hain.',
  ],
  signup: [
    'Wah ji wah! Parivaar mein aapka swagat hai!',
  ],
  quiz_done: [
    'Bas ji! Ab meri har sujhaav aapke swaad ke hisaab se hogi.',
  ],
  removed: [
    'Koi baat nahi ji, mann badal gaya? Undo ka button haazir hai.',
  ],
  cart_open: [
    'Dekhiye ji, thaali kitni sundar lag rahi hai!',
    'Thaali dekh lijiye ji, kuch aur chahiye?',
  ],
  // Fun facts for idle moments — keep these accurate.
  fact: [
    'Pata hai? Mysore Pak pehli baar Mysore Palace ki rasoi mein bani thi!',
    'Pata hai? Rasgulle ko Bengal aur Odisha dono ko apna-apna GI tag mila hai.',
    'Pata hai? Gulab jamun ka naam gulab-jal aur jamun phal se aaya hai.',
    'Pata hai? Kaju Bharat mein Portuguese lekar aaye the, solahvi sadi mein, Goa ke raaste.',
    'Pata hai? Dharwad peda aur Tirupati laddu, dono ko GI tag mila hua hai.',
    'Pata hai? Ghewar khaas taur par Teej aur Raksha Bandhan par banta hai.',
    'Pata hai? Iran mein jalebi ko zulbia kehte hain.',
    'Pata hai? Mishti doi mitti ke kulhad mein jamaayi jaati hai, isliye itni gaadhi hoti hai.',
    'Pata hai? Muzaffarnagar ki gur mandi Asia ki sabse badi mandiyon mein gini jaati hai!',
    'Pata hai? Istanbul ke Topkapi Palace se Ramzan mein baklava ka juloos nikalta tha.',
    'Pata hai? Lonavala ki chikki ki shuruaat 1880 ke aas-paas Maganlal ne ki thi.',
    'Pata hai? Kalakand Alwar mein 1947 mein Baba Thakur Das ne banaaya tha.',
  ],
  think: [
    'Hmm... soch raha hoon aapke liye kya sabse achha rahega...',
    'Ek minute ji, thaali mein nazar daal raha hoon...',
  ],

  // ---------------------------------------------------------------- Feature Pack 2
  taaza: [
    'Abhi abhi taaza {sweet} aaya hai ji, garam garam!',
    'Bhatti se seedha — {sweet} bilkul taaza bani hai!',
    '{sweet} abhi abhi bani hai ji, khushboo hi kaafi hai!',
  ],
  combo: [
    'Meetha ho gaya, ab thoda namkeen bhi ho jaaye? {sweet} ke saath {added}, kya baat hai!',
    'Meethe ke baad {added} — santulan bhi, swaad bhi!',
    '{sweet} aur {added} ki jodi — mehmaan bhi khush, aap bhi!',
  ],
  deal_soon: [
    'Thodi der mein last-hour deals shuru hone wali hain ji — nazar rakhiye!',
  ],
  deal_live: [
    'Dukaan band hone wali hai ji, taaza mithai {pct}% kam daam mein... jaldi kijiye!',
    'Last-hour deal chal rahi hai — {pct}% off, bas kuch der ke liye!',
  ],
  scratch_win: [
    'Wah ji wah! Aap jeet gaye — {prize}!',
    'Lijiye ji, kismat chamak gayi — {prize}! Agli baar mooh meetha sasta!',
  ],
  scratch_lose: [
    'Koi baat nahi ji, agli baar pakka!',
    'Is baar na sahi — mithaas toh har baar milegi ji!',
  ],
  festival_book: [
    '{fest} aa raha hai ji! Pehle hi book kar lijiye, line mein nahi lagna padega.',
    '{fest} ki mithai abhi book kijiye — slot bharne se pehle!',
  ],
  preorder_done: [
    'Booking pakki ji! {fest} wale din taaza bana ke rakhenge.',
  ],
  hot_alert: [
    'Kadhai se seedhi garam {sweet} nikal rahi hai ji! Jaldi aaiye!',
    'Garma-garam {sweet} — {mins} minute mein taiyaar! Aapke liye rakh doon?',
  ],
  hot_reserved: [
    'Rakh di ji! {grams} gram garam {sweet} aapke naam — 30 minute mein aa jaaiye.',
  ],
  gift_plan: [
    '{name} ke liye {sweet} — pyaar bhi, sehat bhi!',
    'Saare rishtedaaron ke dabbe taiyaar ji — budget mein, sabki pasand ke saath!',
  ],
  gift_over: [
    'Budget thoda upar chala gaya ji — ek dabba chhota kar dein?',
  ],
  bhooli_found: [
    'Mil gayi ji! Yeh thi... {sweet}!',
    'Pehchaan liya! Aap {sweet} ki baat kar rahe the!',
  ],
  bhooli_ask: [
    'Ek sawaal ji — {q}',
  ],
  bhooli_none: [
    'Hmm, thodi mushkil hai ji. Ye teen sabse kareeb hain — ya dukaan ko bhej dijiye, hum dhoondh ke batayenge!',
  ],
  fresh_batch_owner: [
    'Taaza batch darj ho gaya ji — sabke phone par dikh gaya!',
  ],
};

// Fixed pairings Paaji loves to mention.
export const PAIRS = [
  ['Rasgulla', 'Rasmalai', 'Rasgulle ke saath rasmalai, jodi number one!'],
  ['Jalebi', 'Rabri', 'Garam jalebi aur thandi rabri — swarg ji, swarg!'],
  ['Gajar Ka Halwa', 'Gulab Jamun', 'Gajar halwa aur gulab jamun, sardiyon ki shahi jodi!'],
  ['Baklava', 'Kunafa', 'Baklava ke saath kunafa? Turkey aur Arab dono ek thaali mein!'],
  ['Kaju Katli', 'Soan Papdi', 'Kaju katli aur soan papdi — Deepawali ka asli dabba!'],
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

/** Paaji says a line from the bank (caption always shown; voice respects mute). */
export function paajiSay(trigger, vars = {}, opts = {}) {
  const text = pickLine(trigger, vars);
  if (text) document.dispatchEvent(new CustomEvent('ss:say', { detail: { text, mood: opts.mood || 'talk', priority: opts.priority, group: opts.group } }));
  return text;
}
