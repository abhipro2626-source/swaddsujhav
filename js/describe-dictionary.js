// Bhooli Hui Mithai: everyday words (Hindi, Hinglish, English, common misspellings)
// → describable traits. The database (identify_sweet) does the scoring.
// Add words here to make Paaji smarter; owner can review real searches in Admin.

const W = (words, trait) => words.map((w) => [w, trait]);

const ENTRIES = [
  // shape
  ...W(['gol', 'goal', 'round', 'ball', 'goli', 'gola', 'lattu', 'laddu jaisi', 'sphere', 'globe'], { shape: 'round' }),
  ...W(['chakor', 'chaukor', 'square', 'squar', 'tukde', 'cube', 'cubes', 'barfi jaisi'], { shape: 'square' }),
  ...W(['diamond', 'heera', 'hira', 'katli'], { shape: 'diamond' }),
  ...W(['lambi', 'lamba', 'long', 'oval', 'cylinder', 'lambooti', 'ungli jaisi'], { shape: 'long' }),
  ...W(['chapti', 'chapta', 'flat', 'patli', 'patla', 'thin', 'sheet', 'patti'], { shape: 'flat' }),
  ...W(['jalebi jaisi', 'spiral', 'goal goal', 'ghumavdar', 'chakkar', 'ghumaon', 'coil', 'loops'], { shape: 'spiral' }),
  ...W(['roll', 'lipti', 'lapeta', 'rolled'], { shape: 'roll' }),
  ...W(['katori', 'bowl', 'kulhad', 'matka', 'pudding', 'kheer jaisi'], { shape: 'bowl' }),
  ...W(['parat', 'layer', 'layers', 'parton', 'parat wali', 'tah'], { shape: 'layered' }),
  // colours
  ...W(['safed', 'safaid', 'white', 'sufed', 'doodhiya', 'chitti'], { colours: ['white', 'cream'] }),
  ...W(['peeli', 'peela', 'peele', 'pili', 'pile', 'yellow', 'kesariya'], { colours: ['yellow', 'golden'] }),
  ...W(['narangi', 'orange', 'santri'], { colours: ['orange'] }),
  ...W(['bhuri', 'bhura', 'brown', 'bhoori', 'chocolate rang'], { colours: ['brown'] }),
  ...W(['kaali', 'kala', 'kaala', 'black', 'dark', 'gehri'], { colours: ['dark-brown', 'black'] }),
  ...W(['hari', 'hara', 'green', 'pista rang'], { colours: ['green'] }),
  ...W(['gulabi', 'pink', 'rose colour'], { colours: ['pink'] }),
  ...W(['laal', 'lal', 'red'], { colours: ['red'] }),
  ...W(['sunehri', 'golden', 'sona', 'sunehra'], { colours: ['golden'] }),
  ...W(['chandi', 'silver', 'vark', 'varq', 'chaandi ka vark'], { colours: ['silver'] }),
  // texture
  ...W(['naram', 'narm', 'soft', 'mulayam', 'komal', 'tender'], { texture: ['soft'] }),
  ...W(['spongy', 'sponge', 'rasila spongy', 'phoola', 'fluffy', 'dabane par ras'], { texture: ['spongy', 'soft'] }),
  ...W(['crunchy', 'kurkuri', 'kurkura', 'karari', 'kadak', 'crispy', 'crisp', 'khasta'], { texture: ['crunchy', 'crisp'] }),
  ...W(['chewy', 'rubbery', 'chabane', 'resha', 'reshedar', 'khinchti'], { texture: ['chewy'] }),
  ...W(['daanedaar', 'danedar', 'grainy', 'dane', 'daane', 'bhurbhuri', 'bhurbhura'], { texture: ['grainy', 'crumbly'] }),
  ...W(['creamy', 'malaidar', 'malai jaisi', 'gaadhi', 'thick'], { texture: ['creamy'] }),
  ...W(['fudgy', 'peda jaisi', 'chikni'], { texture: ['fudgy'] }),
  ...W(['flaky', 'parat dar', 'tukde tukde', 'resha resha', 'reshe'], { texture: ['flaky'] }),
  ...W(['juicy', 'rasili', 'rasila', 'ras bhari', 'ras wali'], { texture: ['juicy', 'spongy'], has_syrup: true }),
  // syrup / dry
  ...W(['chashni', 'chasni', 'chashani', 'sheera', 'shira', 'syrup', 'ras', 'rus', 'doobi', 'dubi', 'dooby', 'bhigi', 'sugar syrup', 'meetha paani'], { has_syrup: true }),
  ...W(['sukhi', 'sookhi', 'dry', 'bina ras', 'bina chashni', 'chashni nahi', 'chasni nahi', 'chashni nahi thi', 'ras nahi', 'no syrup',
    'without syrup', 'syrup nahi', 'chashni ke bina'], { has_syrup: false }),
  // fried / filled
  ...W(['tali', 'tali hui', 'talee', 'fried', 'deep fried', 'ghee mein tali', 'tala'], { is_fried: true }),
  ...W(['bhari', 'bhara', 'bharwa', 'stuffed', 'filling', 'andar kuch', 'andar se bhari', 'bharawan'], { has_filling: true }),
  // served
  ...W(['garam', 'garm', 'hot', 'warm', 'taazi garam', 'garma garam'], { served: 'warm' }),
  ...W(['thanda', 'thandi', 'cold', 'chilled', 'fridge', 'barf', 'ice'], { served: 'cold' }),
  // sweetness
  ...W(['bahut meetha', 'bahut meethi', 'very sweet', 'zyada meetha', 'khoob meethi'], { sweetness: 5 }),
  ...W(['kam meetha', 'kam meethi', 'halki meethi', 'less sweet', 'mild sweet'], { sweetness: 2 }),
  // flavours
  ...W(['kesar', 'kesari', 'saffron', 'zafran'], { flavours: ['saffron', 'kesar'] }),
  ...W(['elaichi', 'ilaichi', 'cardamom', 'elachi'], { flavours: ['cardamom', 'elaichi'] }),
  ...W(['gulab', 'rose', 'gulkand', 'rose water'], { flavours: ['rose', 'gulkand'] }),
  ...W(['nariyal', 'coconut', 'naariyal', 'khopra'], { flavours: ['coconut'], base: ['coconut'] }),
  ...W(['gur', 'gud', 'jaggery', 'gurr'], { flavours: ['gur', 'jaggery'], base: ['jaggery'] }),
  ...W(['til', 'sesame', 'gajak', 'rewri'], { flavours: ['sesame', 'til'], base: ['sesame'] }),
  ...W(['chocolate', 'choco', 'cocoa'], { flavours: ['chocolate', 'cocoa'] }),
  ...W(['pista', 'pistachio'], { flavours: ['pistachio'] }),
  ...W(['badam', 'almond'], { flavours: ['almond'] }),
  ...W(['kaju', 'cashew', 'kaaju'], { flavours: ['cashew'], base: ['dry-fruit'] }),
  ...W(['anjeer', 'fig', 'khajur', 'dates', 'khajoor'], { flavours: ['fig', 'dates'], base: ['dry-fruit'] }),
  ...W(['dry fruit', 'dryfruit', 'mewa', 'meva'], { base: ['dry-fruit'] }),
  ...W(['gajar', 'carrot'], { flavours: ['carrot'], base: ['carrot'] }),
  ...W(['aam', 'mango'], { flavours: ['mango'] }),
  ...W(['ghee', 'desi ghee'], { flavours: ['ghee'] }),
  ...W(['saunf', 'fennel'], { flavours: ['fennel'] }),
  ...W(['paan', 'betel'], { flavours: ['betel leaf', 'gulkand'] }),
  // base
  ...W(['chhena', 'chena', 'chenna', 'paneer', 'chhena wali', 'cottage cheese'], { base: ['chhena'] }),
  ...W(['khoya', 'khoa', 'mawa', 'maava', 'mava'], { base: ['khoya'] }),
  ...W(['besan', 'gram flour', 'chane ka aata'], { base: ['besan', 'gram flour'] }),
  ...W(['boondi', 'bundi', 'motichoor', 'motichur', 'moti choor'], { base: ['besan'], categories: ['laddoo'], keep: true }),
  ...W(['dane dane', 'chhote chhote daane', 'daane wale', 'dane wale'], { texture: ['grainy', 'soft'] }),
  ...W(['doodh', 'milk', 'dudh', 'rabdi', 'rabri', 'malai'], { base: ['milk'] }),
  ...W(['chawal', 'rice', 'chaawal'], { base: ['rice'] }),
  ...W(['sooji', 'suji', 'rava', 'semolina'], { base: ['semolina'] }),
  ...W(['aata', 'atta', 'gehu', 'wheat', 'maida', 'flour'], { base: ['flour', 'wheat'] }),
  ...W(['dal', 'daal', 'urad', 'moong'], { base: ['lentil'] }),
  ...W(['petha', 'kaddu', 'ash gourd', 'safed petha'], { base: ['ash gourd'] }),
  ...W(['lauki', 'ghiya', 'doodhi'], { base: ['gourd'] }),
  ...W(['bread', 'double roti', 'pav'], { base: ['bread'] }),
  // categories
  ...W(['laddoo', 'ladoo', 'laddu', 'ladu'], { categories: ['laddoo'], shape: 'round' }),
  ...W(['barfi', 'burfi', 'barfee'], { categories: ['barfi'], shape: 'square' }),
  ...W(['halwa', 'halva', 'halua'], { categories: ['halwa'] }),
  ...W(['peda', 'pera', 'pedha'], { categories: ['milk-based'], base: ['khoya'], shape: 'round' }),
  ...W(['kheer', 'payasam', 'phirni', 'firni'], { categories: ['milk-based'], shape: 'bowl' }),
  ...W(['chikki', 'gajak', 'patti'], { categories: ['brittle'] }),
  // regions & cities
  ...W(['bengal', 'bengali', 'kolkata', 'calcutta', 'kolkatta', 'bangla', 'bangali'], { regions: ['Bengal'] }),
  ...W(['odisha', 'orissa', 'oriya', 'puri', 'cuttack', 'bhubaneswar'], { regions: ['Odisha'] }),
  ...W(['lucknow', 'awadh', 'awadhi', 'nawabi'], { regions: ['Awadh', 'North India', 'Uttar Pradesh'] }),
  ...W(['mathura', 'agra'], { regions: ['North India', 'Uttar Pradesh'], keep: true }),
  ...W(['vrindavan', 'up wali', 'uttar pradesh'], { regions: ['North India', 'Uttar Pradesh'] }),
  ...W(['punjab', 'punjabi', 'amritsar', 'ludhiana'], { regions: ['Punjab'] }),
  ...W(['rajasthan', 'jaipur', 'jodhpur', 'bikaner', 'marwari', 'alwar'], { regions: ['Rajasthan'] }),
  ...W(['petha'], { base: ['ash gourd'], keep: true }),
  ...W(['gujarat', 'gujarati', 'surat', 'ahmedabad'], { regions: ['Gujarat'] }),
  ...W(['maharashtra', 'marathi', 'mumbai', 'bombay', 'pune'], { regions: ['Maharashtra'] }),
  ...W(['mysore', 'dharwad'], { regions: ['Karnataka', 'South India'], keep: true }),
  ...W(['karnataka', 'bangalore', 'bengaluru'], { regions: ['Karnataka', 'South India'] }),
  ...W(['tirunelveli'], { regions: ['Tamil Nadu', 'South India'], keep: true }),
  ...W(['tamil', 'chennai', 'madras'], { regions: ['Tamil Nadu', 'South India'] }),
  ...W(['kerala', 'malayali', 'onam'], { regions: ['Kerala', 'South India'] }),
  ...W(['kakinada', 'bandar'], { regions: ['Andhra Pradesh', 'South India'], keep: true }),
  ...W(['andhra', 'hyderabad', 'hyderabadi', 'telangana'], { regions: ['Hyderabad', 'Andhra Pradesh', 'South India'] }),
  ...W(['bihar', 'bihari', 'patna', 'gaya'], { regions: ['Bihar'] }),
  ...W(['assam', 'assamese', 'guwahati'], { regions: ['Assam'] }),
  ...W(['goa', 'goan'], { regions: ['Goa'] }),
  ...W(['turkey', 'turkish', 'istanbul'], { regions: ['Turkey'] }),
  ...W(['japan', 'japanese'], { regions: ['Japan'] }),
  // occasions
  ...W(['shaadi', 'shadi', 'wedding', 'byah', 'baraat'], { occasions: ['wedding'] }),
  ...W(['diwali', 'deepawali', 'dipawali'], { occasions: ['diwali'] }),
  ...W(['holi'], { occasions: ['holi'] }),
  ...W(['rakhi', 'raksha bandhan'], { occasions: ['rakhi'] }),
  ...W(['prasad', 'mandir', 'temple', 'puja', 'bhog'], { occasions: ['puja'] }),
  ...W(['ganpati', 'ganesh', 'chaturthi'], { occasions: ['puja'], categories: ['steamed'] }),
  ...W(['sardi', 'sardiyon', 'winter', 'jaade'], { occasions: [] }),
];

// Longest phrases first so "kam meetha" wins over "meetha".
const DICT = ENTRIES.sort((a, b) => b[0].length - a[0].length);

const fold = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ');

function merge(out, trait) {
  for (const [k, v] of Object.entries(trait)) {
    if (k === 'keep') continue;
    if (Array.isArray(v)) out[k] = [...new Set([...(out[k] || []), ...v])];
    else if (k === 'shape') out.shape = [...new Set([...(out.shape || []), v])];
    else out[k] = v;
  }
}

/** Description + chip choices → traits for identify_sweet(). */
export function describeToTraits(text, chips = {}) {
  let s = ` ${fold(text)} `;
  const out = {};
  const matched = [];
  const kept = [];
  for (const [phrase, trait] of DICT) {
    const p = ` ${phrase} `;
    if (s.includes(p)) {
      merge(out, trait);
      matched.push(phrase);
      if (trait.keep) kept.push(phrase.replace(/\s+/g, ''));     // also a name clue ("Mathura Peda")
      s = s.split(p).join(' · ');          // consume so shorter words don't double count
    }
  }
  // Leftover words go to fuzzy name matching ("woh chum wali").
  out.words = [...s.split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)), ...kept];
  for (const [k, v] of Object.entries(chips || {})) if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) merge(out, { [k]: v });
  // A described "no syrup" must not fight a described "rasila"
  return { traits: out, matched };
}

const STOP = new Set(('thi tha the hai hain ki ka ke ko se me mein aur bhi par wali wala wale jo woh wo yeh ye ek kuch bahut sa si jaisi jaisa '
  + 'khayi khaya khai khaayi khaate milti mili hui hua tha ji the is us and the was with that from had ate eaten sweet mithai mithaai name naam '
  + 'yaad nahi bhool gaya gayi andar bahar upar niche lagti lagta').split(' '));

// Quick chips for the form (each maps to the same traits as above).
export const CHIP_GROUPS = [
  { key: 'shape', label: 'Shape', options: [['round', 'Gol'], ['square', 'Chakor'], ['long', 'Lambi'], ['flat', 'Chapti'], ['spiral', 'Jalebi jaisi'], ['bowl', 'Katori mein']] },
  { key: 'colours', label: 'Colour', options: [['white', 'Safed'], ['yellow', 'Peeli'], ['brown', 'Bhuri'], ['green', 'Hari'], ['pink', 'Gulabi'], ['orange', 'Narangi']] },
  { key: 'texture', label: 'Texture', options: [['soft', 'Naram'], ['spongy', 'Spongy'], ['crunchy', 'Crunchy'], ['chewy', 'Chewy'], ['grainy', 'Daanedaar']] },
  { key: 'flavours', label: 'Taste', options: [['saffron', 'Kesar'], ['cardamom', 'Elaichi'], ['rose', 'Gulab'], ['coconut', 'Nariyal'], ['jaggery', 'Gur']] },
  { key: 'served', label: 'Served', options: [['warm', 'Garam'], ['cold', 'Thanda']] },
  { key: 'has_syrup', label: 'Chashni?', options: [[true, 'Chashni wali'], [false, 'Sukhi']] },
];
