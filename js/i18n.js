// Hindi / English UI strings. Sweet names come from the database (name / name_hi).
import { store, local } from './state.js';

const STRINGS = {
  en: {
    search_label: 'Search sweets', search_ph: 'Rasgulla, kaju katli, baklava…',
    nav_home: 'Home', nav_catalog: 'Mithai', nav_search: 'Search', nav_cart: 'Cart', nav_profile: 'Profile',
    cart_title: 'Aapki Thaali',
    add: 'Add', added: 'Added', add_to_cart: 'Add to cart', out_of_stock: 'Out of stock', only_left: 'Only {n} left',
    view_all: 'View all', shop_now: 'Shop Now', explore: 'Explore',
    row_for_you: "Paaji's Sujhav for You", row_for_you_guest: 'Paaji ki pasand: festive bestsellers',
    row_new: 'Naya Aaya Hai ✨', row_diwali: 'Diwali Special 🪔', row_world: 'Mithai Around the World 🌍',
    row_best: 'Bestsellers', row_healthy: 'Sugar-free & Healthy Choices', row_region: 'Shop by Region',
    row_occasion: 'Shop by Occasion', row_usual: 'Your usual?',
    motd: 'Mithai of the Day', motd_next: 'Next mithai in',
    hero_kicker: 'Diwali Special Collection', hero_title: 'Is Diwali, har ghar mein mithaas',
    hero_text: '242 mithaiyan from every corner of India and the world, hand-picked by Paaji for your taste.',
    filters: 'Filters', sort: 'Sort', clear: 'Clear all', results: '{n} sweets',
    f_category: 'Type', f_region: 'Region', f_sweetness: 'Sweetness', f_diet: 'Diet', f_price: 'Price', f_occasion: 'Occasion',
    d_sugar_free: 'Sugar-free', d_vegan: 'Vegan', d_jain: 'Jain', d_eggless: 'Eggless', d_gluten_free: 'Gluten-free',
    s_popular: 'Most popular', s_rating: 'Top rated', s_price_asc: 'Price: low to high', s_price_desc: 'Price: high to low', s_new: 'Newest', s_name: 'A–Z',
    story: 'The story', ingredients: 'Ingredients', taste: 'Taste profile', allergens: 'Allergens',
    t_sweetness: 'Sweetness', t_richness: 'Richness', t_texture: 'Texture',
    more_like: 'More dishes like this', goes_with: 'Goes great with', also_bought: 'Customers also bought',
    choose_weight: 'Choose weight', login: 'Log in', logout: 'Log out', signup: 'Sign up',
    retake_quiz: 'Retake taste quiz', take_quiz: 'Take the taste quiz', orders: 'Your orders', favourites: 'Favourites',
    no_results: 'Ye wali toh nahi mili ji…', try_these: 'Par ye try karo!',
    loading: 'Paaji mithai saja rahe hain…', error_load: 'Dukaan tak pahunch nahi paaye.', retry: 'Try again',
    lang_switch: 'Switch language to Hindi', theme_night: 'Turn on Diwali Night theme', theme_day: 'Turn off Diwali Night theme',
    per: 'per',
  },
  hi: {
    search_label: 'मिठाई खोजें', search_ph: 'रसगुल्ला, काजू कतली, बकलावा…',
    nav_home: 'होम', nav_catalog: 'मिठाई', nav_search: 'खोजें', nav_cart: 'थाली', nav_profile: 'प्रोफ़ाइल',
    cart_title: 'आपकी थाली',
    add: 'डालें', added: 'डाल दी', add_to_cart: 'थाली में डालें', out_of_stock: 'ख़त्म हो गई', only_left: 'सिर्फ़ {n} बची',
    view_all: 'सब देखें', shop_now: 'अभी ख़रीदें', explore: 'देखें',
    row_for_you: 'पाजी के सुझाव आपके लिए', row_for_you_guest: 'पाजी की पसंद: त्योहार की बेस्टसेलर',
    row_new: 'नया आया है ✨', row_diwali: 'दीवाली स्पेशल 🪔', row_world: 'दुनिया की मिठाइयाँ 🌍',
    row_best: 'सबसे ज़्यादा बिकने वाली', row_healthy: 'शुगर-फ़्री और सेहतमंद', row_region: 'इलाक़े के हिसाब से',
    row_occasion: 'मौक़े के हिसाब से', row_usual: 'हमेशा वाली?',
    motd: 'आज की मिठाई', motd_next: 'अगली मिठाई',
    hero_kicker: 'दीवाली स्पेशल कलेक्शन', hero_title: 'इस दीवाली, हर घर में मिठास',
    hero_text: 'भारत और दुनिया के हर कोने की 242 मिठाइयाँ, पाजी ने आपके स्वाद के लिए चुनी हैं।',
    filters: 'फ़िल्टर', sort: 'क्रम', clear: 'सब हटाएँ', results: '{n} मिठाइयाँ',
    f_category: 'प्रकार', f_region: 'इलाक़ा', f_sweetness: 'मिठास', f_diet: 'परहेज़', f_price: 'दाम', f_occasion: 'मौक़ा',
    d_sugar_free: 'शुगर-फ़्री', d_vegan: 'वीगन', d_jain: 'जैन', d_eggless: 'बिना अंडा', d_gluten_free: 'ग्लूटेन-फ़्री',
    s_popular: 'सबसे लोकप्रिय', s_rating: 'सबसे पसंदीदा', s_price_asc: 'दाम: कम से ज़्यादा', s_price_desc: 'दाम: ज़्यादा से कम', s_new: 'सबसे नई', s_name: 'अ–ज्ञ',
    story: 'कहानी', ingredients: 'सामग्री', taste: 'स्वाद', allergens: 'एलर्जी',
    t_sweetness: 'मिठास', t_richness: 'रिचनेस', t_texture: 'बनावट',
    more_like: 'ऐसी और मिठाइयाँ', goes_with: 'इसके साथ जमेगी', also_bought: 'लोगों ने ये भी ली',
    choose_weight: 'वज़न चुनें', login: 'लॉग इन', logout: 'लॉग आउट', signup: 'साइन अप',
    retake_quiz: 'स्वाद क्विज़ दोबारा', take_quiz: 'स्वाद क्विज़ दें', orders: 'आपके ऑर्डर', favourites: 'पसंदीदा',
    no_results: 'ये वाली तो नहीं मिली जी…', try_these: 'पर ये ट्राई करो!',
    loading: 'पाजी मिठाई सजा रहे हैं…', error_load: 'दुकान तक पहुँच नहीं पाए।', retry: 'फिर से कोशिश करें',
    lang_switch: 'Switch language to English', theme_night: 'दीवाली नाइट थीम चालू करें', theme_day: 'दीवाली नाइट थीम बंद करें',
    per: 'प्रति',
  },
};

export function t(key, vars) {
  const lang = store.get('lang');
  let s = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

/** Name of a sweet in the current language. */
export const sweetName = (s) => (store.get('lang') === 'hi' && s?.name_hi ? s.name_hi : s?.name || '');

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.documentElement.lang = store.get('lang') === 'hi' ? 'hi' : 'en';
}

export function initLang() {
  const saved = local.get('ss:lang');
  store.set({ lang: saved === 'hi' ? 'hi' : 'en' });
}

export function toggleLang() {
  const lang = store.get('lang') === 'hi' ? 'en' : 'hi';
  local.set('ss:lang', lang);
  store.set({ lang });
}
