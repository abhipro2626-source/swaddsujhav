"""Ask Paaji: understand a free-text wish (Hinglish or English) and suggest sweets.

    "kuch halka sa sugar free"  ·  "kaju wali barfi under 400"  ·  "shaadi ke liye bengali mithai"

Two steps, both free and local:
  1. Rule-based parser pulls out hard constraints (diet, price, sweetness, occasion,
     category, region, ingredients, budget/guests) and translates Hinglish words to English.
  2. Semantic search: the sentence-transformer used for the catalog embeds the
     (translated) wish and ranks sweets by meaning, blended with keyword hits,
     popularity and — for signed-in users — their taste.
"""
from __future__ import annotations

import re

import numpy as np

from . import ml

# Hinglish / Hindi words → English expansion (helps the English embedding model).
LEXICON = {
    r"\bhalk[aie]\b|\blight\b|\bkam meetha\b|\bkam mitha\b|\bless sweet\b": "light, not too sweet",
    r"\bzyada meetha\b|\bbahut meetha\b|\bextra sweet\b|\bchashni\b|\bchasni\b": "very sweet, syrupy",
    r"\bdoodh\b|\bdudh\b|\bmalai\b|\bmilky\b|\bcreamy\b": "milky, creamy",
    r"\bkurkur[aie]\b|\bcrunchy\b|\bcrispy\b|\bkhasta\b": "crunchy, crisp",
    r"\bnaram\b|\bnarm\b|\bsoft\b|\bspongy\b": "soft, spongy",
    r"\bkaju\b": "cashew", r"\bbadam\b": "almond", r"\bpista\b": "pistachio",
    r"\bnariyal\b|\bnaariyal\b": "coconut", r"\bgud\b|\bgur\b|\bjaggery\b": "jaggery",
    r"\bkhoya\b|\bmawa\b": "khoya", r"\bkesar\b|\bkesariya\b": "saffron", r"\baam\b|\bmango\b": "mango",
    r"\btil\b": "sesame", r"\bmoongphali\b|\bpeanut\b": "peanut", r"\bchocolate\b|\bchoco\b": "chocolate",
    r"\bkhajur\b": "dates", r"\banjeer\b": "fig", r"\bgajar\b": "carrot", r"\bchawal\b": "rice",
    r"\bghee\b|\bdesi ghee\b": "ghee", r"\bsardi\b|\bwinter\b|\bthand\b": "winter warming",
    r"\bgarmi\b|\bsummer\b|\bthanda\b|\bthandi\b": "summer, chilled",
    r"\bnaya\b|\bnayi\b|\bnew\b|\blatest\b": "new arrival",
    r"\bvideshi\b|\binternational\b|\bforeign\b|\bworld\b": "world dessert",
}
INGREDIENT_WORDS = {
    r"\bkaju\b|cashew|katli": "cashew", r"\bbadam\b|almond": "almond", r"\bpista\b|pistachio": "pistachio",
    r"nariyal|naariyal|coconut": "coconut", r"\bgud\b|\bgur\b|jaggery": "jaggery", r"khoya|mawa": "khoya",
    r"kesar|saffron": "saffron", r"\baam\b|mango": "mango", r"\btil\b|sesame": "sesame",
    r"moongphali|peanut": "peanuts", r"chocolate|choco|cocoa": "cocoa", r"khajur|dates": "dates",
    r"anjeer|\bfig\b": "fig", r"gajar|carrot": "carrot", r"chhena|chena|paneer": "chhena", r"besan|gram flour": "gram flour",
}
DIET = {
    "sugar_free": r"sugar[\s-]?free|bina (cheeni|chini|shakkar)|diabet|no sugar|without sugar|shugar",
    "vegan": r"\bvegan\b|bina doodh|dairy[\s-]?free|no milk",
    "jain": r"\bjain\b",
    "gluten_free": r"gluten[\s-]?free|bina maida",
    "eggless": r"eggless|bina ande|no egg|without egg",
}
OCCASIONS = {
    "wedding": r"shaadi|shadi|wedding|vivah|sagai|engagement",
    "diwali": r"diwali|deepawali|deepavali|dhanteras",
    "birthday": r"birthday|janamdin|janmdin|bday",
    "rakhi": r"rakhi|raksha ?bandhan",
    "guests": r"mehmaan|mehman|guest|ghar pe log|parivaar",
    "office": r"office|corporate|colleague|boss|client|team",
    "puja": r"puja|pooja|prasad|prashad|mandir|temple|bhog",
    "eid": r"\beid\b|ramzan|ramadan",
    "holi": r"\bholi\b",
}
CATEGORIES = {
    "laddoo": r"laddu|laddoo|ladoo|ladu", "barfi": r"barfi|burfi|katli", "halwa": r"halwa|halva",
    "bengali": r"bengali|bangali|chhena|chena|rasgulla|rosogolla",
    "dry-fruit": r"dry ?fruit|mewa|meva", "syrup-soaked": r"jamun|syrup|chashni wali",
    "fried": r"jalebi|imarti|fried|tali hui", "milk-based": r"kheer|rabri|kulfi|basundi|payasam",
    "baked": r"cake|bake|cookie|biscuit|pastry", "world": r"baklava|mochi|tiramisu|churro|macaron|kunafa|world",
    "brittle": r"chikki|gajak|revdi|brittle", "steamed": r"modak|steamed|kozhukattai",
}
REGIONS = {
    "Bengal": r"bengal|bengali|kolkata|calcutta", "Punjab": r"punjab|punjabi|amritsar",
    "Rajasthan": r"rajasthan|rajasthani|jaipur|jodhpur", "Gujarat": r"gujarat|gujarati",
    "Maharashtra": r"maharashtra|marathi|mumbai|pune", "South India": r"south indian|south india|dakshin|madras",
    "Tamil Nadu": r"tamil|chennai", "Kerala": r"kerala|malayali", "Karnataka": r"karnataka|mysore|bangalore",
    "Hyderabad": r"hyderabad|hyderabadi|nizami", "Odisha": r"odisha|orissa|odia", "Uttar Pradesh": r"\bup\b|uttar pradesh|lucknow|agra|mathura|muzaffarnagar|meerut",
    "Turkey": r"turkey|turkish", "Japan": r"japan|japanese", "Italy": r"italy|italian", "France": r"france|french",
}
WORDS_NUM = {"ek": 1, "do": 2, "teen": 3, "char": 4, "chaar": 4, "paanch": 5, "panch": 5, "das": 10, "bees": 20, "pachaas": 50}


def parse(q: str) -> dict:
    t = " " + q.lower().replace("₹", " rs ").replace(",", " ") + " "
    f: dict = {"diet": [], "occasion": None, "categories": [], "regions": [], "sweetness": None, "ingredients": [], "summer": False,
               "max_price": None, "min_price": None, "guests": None, "budget": None, "intent": "suggest",
               "expanded": []}
    for k, rx in DIET.items():
        if re.search(rx, t):
            f["diet"].append(k)
    for k, rx in OCCASIONS.items():
        if re.search(rx, t):
            f["occasion"] = k
            break
    for k, rx in CATEGORIES.items():
        if re.search(rx, t):
            f["categories"].append(k)
    for k, rx in REGIONS.items():
        if re.search(rx, t):
            f["regions"].append(k)
    if re.search(r"\bhalk[aie]\b|\blight\b|kam meetha|kam mitha|less sweet", t) or "sugar_free" in f["diet"]:
        f["sweetness"] = "low"
    elif re.search(r"zyada meetha|bahut meetha|extra sweet|chashni|chasni|very sweet", t):
        f["sweetness"] = "high"
    for rx, en in LEXICON.items():
        if re.search(rx, t):
            f["expanded"].append(en)
    # Ingredients the customer named ("kaju wali", "gud wala") — matched against real ingredient lists.
    f["ingredients"] = [en for rx, en in INGREDIENT_WORDS.items() if re.search(rx, t)]
    f["summer"] = bool(re.search(r"garmi|summer|thanda|thandi|chilled|cold", t))

    # Money & guests: "under 400", "400 se kam", "₹500 mein 10 log", "budget 1000"
    m = re.search(r"(?:under|below|less than|tak|max|upto|up to|andar)\s*(?:rs\.?\s*)?(\d{2,5})|(\d{2,5})\s*(?:rs\.?)?\s*(?:se kam|tak|ke andar|ke neeche|or less)", t)
    if m:
        f["max_price"] = int(m.group(1) or m.group(2))
    g = re.search(r"(\d{1,3}|\b(?:" + "|".join(WORDS_NUM) + r")\b)\s*(?:log|logon|logo|guests?|people|mehmaan|mehman|persons?|bande)", t)
    if g:
        v = g.group(1)
        f["guests"] = int(v) if v.isdigit() else WORDS_NUM.get(v)
    b = re.search(r"(?:rs\.?\s*|budget\s*(?:rs\.?)?\s*)(\d{3,6})|(\d{3,6})\s*(?:rs|rupaye|rupees|ka budget)", t)
    if b and f["guests"]:
        f["budget"] = int(b.group(1) or b.group(2))
        f["intent"] = "budget"
    if re.search(r"gift ?box|dabba|hamper|apna box", t):
        f["intent"] = "giftbox"
    if re.search(r"\b(cart|thaali|thali)\b.*\b(dikha|khol|open|show)|\bmy cart\b", t):
        f["intent"] = "cart"
    if re.search(r"order (status|kahan|kidhar)|mera order|track", t):
        f["intent"] = "orders"
    return f


def _embed_query(text: str) -> np.ndarray | None:
    st = ml.get_text_model()
    if st is None:
        return None
    return np.asarray(st.encode([text], normalize_embeddings=True)[0], dtype=np.float32)


def ask(m: ml.Model, q: str, user_id: str | None = None, limit: int = 6) -> dict:
    q = (q or "").strip()[:300]
    f = parse(q)
    if not m.ready or not q:
        return {"filters": f, "items": [], "reply": "", "go": None}

    n = len(m.sweets)
    text = q + (". " + ", ".join(f["expanded"]) if f["expanded"] else "")
    score = np.zeros(n, dtype=np.float32)

    # Meaning (semantic similarity to each sweet's description)
    qv = _embed_query(text)
    if qv is not None and m.embeddings is not None and m.embeddings.shape[1] == qv.shape[0]:
        score += 0.55 * ml._minmax(m.embeddings @ qv)

    # Keywords in name / ingredients / tags
    words = [w for w in re.findall(r"[a-z]+", (q + " " + " ".join(f["expanded"])).lower()) if len(w) > 2]
    for i, s in enumerate(m.sweets):
        hay = " ".join([s["name"], " ".join(s.get("ingredients") or []), " ".join(s.get("tags") or []), s["region"], s["category"]]).lower()
        hits = sum(1 for w in words if w in hay)
        if s["name"].lower() in q.lower():
            hits += 4
        score[i] += 0.12 * min(hits, 5)
        # A word you typed that is in the sweet's NAME counts extra ("kaju" → Kaju Katli).
        name_words = set(re.findall(r"[a-z]+", s["name"].lower()))
        score[i] += 0.3 * sum(1 for w in set(words) if w in name_words and w not in ("wala", "wali", "mithai", "sweet"))

    # Soft preferences
    for i, s in enumerate(m.sweets):
        if f["categories"] and s["category"] in f["categories"]:
            score[i] += 0.35
        if f["regions"] and (s["region"] in f["regions"] or s["country"] in f["regions"]):
            score[i] += 0.3
        if f["occasion"] and f["occasion"] in (s.get("occasions") or []):
            score[i] += 0.2
        if f["sweetness"] == "low":
            score[i] += 0.25 if s["sweetness"] <= 2 else (0.05 if s["sweetness"] == 3 else -0.25)
        elif f["sweetness"] == "high":
            score[i] += 0.2 if s["sweetness"] >= 5 else (0.05 if s["sweetness"] == 4 else -0.15)
        if "new arrival" in f["expanded"] and s["is_new"]:
            score[i] += 0.3
        if f["ingredients"]:
            ings = " ".join(s.get("ingredients") or []).lower()
            score[i] += 0.45 * sum(1 for x in f["ingredients"] if x in ings)
        if f["summer"]:
            score[i] += 0.4 if ("summer" in (s.get("tags") or []) or s.get("texture") == "icy") else 0
    score += 0.08 * m.pop
    row = m.user_rows.get(user_id) if user_id else None
    if row:
        score += 0.1 * row["taste"]

    # Hard constraints: stock, diet, price
    min_price = {s["id"]: s.get("min_price") for s in m.sweets}
    out = []
    for i in np.argsort(-score):
        s = m.sweets[i]
        if not m.in_stock[i] or not ml.passes_diet(s, {d: True for d in f["diet"]}):
            continue
        price = min_price.get(s["id"])
        if f["max_price"] and price is not None and price > f["max_price"]:
            continue
        out.append({"sweet_id": s["id"], "score": round(float(score[i]), 4), "reason": _why(s, f), "reason_kind": "taste"})
        if len(out) >= limit:
            break

    go = None
    if f["intent"] == "budget":
        go = {"type": "route", "hash": f"#/budget?budget={f['budget']}&guests={f['guests']}" + (f"&diet={','.join(f['diet'])}" if f["diet"] else "")}
    elif f["intent"] == "giftbox":
        go = {"type": "route", "hash": "#/gift-box"}
    elif f["intent"] == "orders":
        go = {"type": "route", "hash": "#/profile"}
    elif f["intent"] == "cart":
        go = {"type": "cart"}
    elif out:
        top = m.sweets[m.idx[out[0]["sweet_id"]]]
        go = {"type": "sweet", "slug": _slug(top["name"])}
    return {"filters": f, "items": out, "reply": _reply(f, out, m), "go": go}


def _slug(name: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _why(s: dict, f: dict) -> str:
    bits = []
    if "sugar_free" in f["diet"] and s["is_sugar_free"]:
        bits.append("sugar-free")
    if f["sweetness"] == "low" and s["sweetness"] <= 2:
        bits.append("halka meetha")
    if f["categories"] and s["category"] in f["categories"]:
        bits.append(s["category"].replace("-", " "))
    if f["regions"] and s["region"] in f["regions"]:
        bits.append(s["region"])
    if f["occasion"] and f["occasion"] in (s.get("occasions") or []):
        bits.append(f"for {f['occasion']}")
    return "Matches: " + ", ".join(bits[:3]) if bits else "Best match for your wish"


def _reply(f: dict, items: list, m: ml.Model) -> str:
    if f["intent"] == "budget":
        return f"Rs {f['budget']} vich {f['guests']} mehmaan? Chalo ji, Budget Mode vich poora mix bana dinda haan!"
    if f["intent"] == "giftbox":
        return "Apna dabba sajaana hai? Chalo ji, Gift Box Builder kholda haan!"
    if f["intent"] == "orders":
        return "Tuhada order dekhde haan ji, profile vich chalo."
    if f["intent"] == "cart":
        return "Lo ji, thaali haazir hai!"
    if not items:
        return "Hmm, aisi mithai abhi nahi mili ji. Thoda alag tarike naal dasso?"
    top = m.sweets[m.idx[items[0]["sweet_id"]]]["name"]
    wish = []
    if "sugar_free" in f["diet"]:
        wish.append("bina cheeni")
    if f["sweetness"] == "low" and "sugar_free" not in f["diet"]:
        wish.append("halki")
    if f["occasion"]:
        wish.append({"wedding": "shaadi layi", "diwali": "Diwali layi", "birthday": "birthday layi", "guests": "mehmaanan layi",
                     "office": "office gift layi", "puja": "prasad layi", "rakhi": "Rakhi layi", "eid": "Eid layi", "holi": "Holi layi"}[f["occasion"]])
    if f["max_price"]:
        wish.append(f"Rs {f['max_price']} tak")
    lead = f"{' '.join(wish).capitalize()} mithai? " if wish else ""
    return f"{lead}Mera sujhav hai {top}! Chalo ji, dikhaunda haan."
