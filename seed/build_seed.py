"""Build supabase/seed.sql from the catalog, shayari and demo-customer definitions.

    python seed/build_seed.py            # uses cached photo lookups if present
    python seed/build_seed.py --refresh  # re-query Wikimedia for photos

Outputs
  supabase/seed.sql              — the whole seed, idempotent (safe to re-run)
  supabase/seed_parts/NN_*.sql   — the same seed split into smaller files
"""
from __future__ import annotations

import html
import json
import random
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import catalog_india  # noqa: E402
import catalog_world  # noqa: E402
import shayari  # noqa: E402

CACHE = HERE / ".image_cache.json"
UA = {"User-Agent": "SwaadSujhavSeed/1.0 (local development; mithai shop demo)"}
NOW = datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc)
rng = random.Random(2026)

# Demo accounts are test data for this app only. Password documented in README.
DEMO_PASSWORD = "SwaadDemo#2026"
NS = uuid.UUID("6f0f8a1e-5a3b-4c1e-9d55-7c1a2b3c4d5e")

# Sweets that are steamed or brittles, not fried/barfi.
CATEGORY_OVERRIDE = {
    "Modak": "steamed", "Kozhukattai": "steamed", "Mawa Modak": "milk-based",
    "Peanut Chikki": "brittle", "Til Chikki": "brittle", "Dry Fruit Chikki": "brittle",
    "Gur Gajak": "brittle", "Gur Revdi": "brittle", "Tilkut": "brittle",
}
OUT_OF_STOCK_DEMO = {"Kharvas"}        # every weight at 0 → shows auto "out of stock"
LOW_STOCK_DEMO = {"Ghewar", "Nolen Gurer Sandesh", "Mooncake", "Bebinca"}


# ---------------------------------------------------------------- parsing
def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def parse(block: str, default_country: str | None) -> list[dict]:
    rows = []
    for line in block.strip().splitlines():
        if not line.strip():
            continue
        f = [x.strip() for x in line.split("|")]
        if len(f) != 19:
            raise ValueError(f"Expected 19 fields, got {len(f)}: {line[:60]}")
        (_slug, name, name_hi, region, category, base, sweet, rich, texture, ingr, tags,
         occ, flags, allergens, price, unit, wiki, desc, origin) = f
        flags = flags.replace(" ", "")
        country = default_country or region
        rows.append({
            "slug": slugify(name),
            "name": name,
            "name_hi": name_hi,
            "region": region,
            "country": "India" if default_country else country,
            "category": CATEGORY_OVERRIDE.get(name, category),
            "base": base,
            "sweetness": int(sweet),
            "richness": int(rich),
            "texture": texture,
            "ingredients": [x.strip() for x in ingr.split(",") if x.strip()],
            "tags": [x.strip() for x in tags.split(",") if x.strip()],
            "occasions": [x.strip() for x in occ.split(",") if x.strip()],
            "is_vegan": "V" in flags,
            "is_jain": "J" in flags,
            "is_gluten_free": "G" in flags,
            "is_sugar_free": "F" in flags,
            "is_eggless": "E" not in flags,
            "is_new": "N" in flags,
            "is_festive": "D" in flags,
            "allergens": [x.strip() for x in allergens.split(",") if x.strip()],
            "base_price": float(price),
            "price_unit": unit,
            "wiki": wiki,
            "description": desc,
            "origin_story": origin,
        })
    return rows


def load_catalog() -> list[dict]:
    india = parse(catalog_india.DATA, "India")
    world = parse(catalog_world.DATA, None)
    for w in world:
        w["country"] = w["region"]
    sweets = india + world
    seen: dict[str, str] = {}
    for s in sweets:
        if s["slug"] in seen:
            raise ValueError(f"Duplicate slug {s['slug']} ({s['name']} / {seen[s['slug']]})")
        seen[s["slug"]] = s["name"]
    return sweets


# ---------------------------------------------------------------- photos
def api(params: dict, host: str = "en.wikipedia.org") -> dict:
    q = urllib.parse.urlencode({**params, "format": "json", "formatversion": 2})
    req = urllib.request.Request(f"https://{host}/w/api.php?{q}", headers=UA)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Wikimedia API failed for {params}")


def clean_url(u: str | None) -> str | None:
    return u.split("?")[0] if u else None


def strip_tags(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def page_images(titles: list[str]) -> dict[str, dict]:
    """title → {file, thumb} using each article's lead image."""
    out: dict[str, dict] = {}
    for i in range(0, len(titles), 40):
        chunk = titles[i:i + 40]
        d = api({"action": "query", "prop": "pageimages", "piprop": "thumbnail|name",
                 "pithumbsize": 720, "redirects": 1, "titles": "|".join(chunk)})
        q = d.get("query", {})
        back = {}
        for m in q.get("normalized", []) + q.get("redirects", []):
            back[m["to"]] = back.get(m["from"], m["from"])
        for p in q.get("pages", []):
            src = back.get(p["title"], p["title"])
            src = back.get(src, src)
            if p.get("pageimage") and p.get("thumbnail"):
                out[src] = {"file": p["pageimage"], "thumb": clean_url(p["thumbnail"]["source"])}
    return out


def commons_search(name: str) -> dict | None:
    """Best Commons photo whose filename mentions the sweet's main word."""
    d = api({"action": "query", "generator": "search", "gsrnamespace": 6, "gsrlimit": 8,
             "gsrsearch": f'"{name}" filetype:bitmap', "prop": "imageinfo",
             "iiprop": "url|mime", "iiurlwidth": 720}, host="commons.wikimedia.org")
    key = [w for w in re.findall(r"[a-z]+", slugify(name)) if len(w) > 3]
    for p in sorted(d.get("query", {}).get("pages", []), key=lambda p: p.get("index", 99)):
        title = p["title"].removeprefix("File:")
        info = (p.get("imageinfo") or [{}])[0]
        if info.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
            continue
        low = slugify(title)
        if key and not any(k in low for k in key):
            continue
        return {"file": title.replace(" ", "_"), "thumb": clean_url(info.get("thumburl"))}
    return None


def credits(files: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for i in range(0, len(files), 40):
        chunk = files[i:i + 40]
        d = api({"action": "query", "prop": "imageinfo", "iiprop": "extmetadata",
                 "titles": "|".join("File:" + f for f in chunk)}, host="commons.wikimedia.org")
        for p in d.get("query", {}).get("pages", []):
            meta = ((p.get("imageinfo") or [{}])[0]).get("extmetadata", {})
            artist = strip_tags(meta.get("Artist", {}).get("value", "")) or "Unknown author"
            lic = strip_tags(meta.get("LicenseShortName", {}).get("value", "")) or "see Commons"
            fname = p["title"].removeprefix("File:").replace(" ", "_")
            out[fname] = f"Photo: {artist[:80]} · {lic} · Wikimedia Commons"
    return out


def resolve_photos(sweets: list[dict], refresh: bool) -> None:
    cache = {} if refresh or not CACHE.exists() else json.loads(CACHE.read_text("utf-8"))
    todo = sorted({s["wiki"] for s in sweets} - set(cache.get("pages", {})))
    pages = cache.setdefault("pages", {})
    if todo:
        print(f"Looking up {len(todo)} Wikipedia articles…")
        found = page_images(todo)
        for t in todo:
            pages[t] = found.get(t)

    # Use the article photo for the sweet that best matches it; give the others
    # a specific Commons search so every card doesn't show the same picture.
    usage: dict[str, int] = {}
    for s in sweets:
        p = pages.get(s["wiki"])
        if p:
            usage[p["file"]] = usage.get(p["file"], 0) + 1
    searched = cache.setdefault("search", {})
    claimed: set[str] = set()
    def about_this_sweet(s: dict) -> bool:
        """Is the linked article actually about this sweet (not a city or an ingredient)?"""
        words = [w for w in slugify(s["name"]).split("-") if len(w) > 3]
        wiki = slugify(s["wiki"])
        return slugify(s["wiki"]) == s["slug"] or any(w in wiki for w in words) or wiki in s["slug"]

    for s in sorted(sweets, key=lambda s: slugify(s["wiki"]) != s["slug"]):
        p = pages.get(s["wiki"]) if about_this_sweet(s) else None
        exact = p and (slugify(s["wiki"]) == s["slug"] or usage.get(p["file"], 0) == 1)
        if p and exact and p["file"] not in claimed:
            s["_photo"] = p
            claimed.add(p["file"])
            continue
        if s["name"] not in searched:
            try:
                searched[s["name"]] = commons_search(s["name"])
            except RuntimeError:
                print(f"  (search skipped for {s['name']}, will retry next run)")
                searched.pop(s["name"], None)
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), "utf-8")
            time.sleep(0.6)
        hit = searched.get(s["name"])
        if hit and hit["file"] not in claimed:
            s["_photo"] = hit
            claimed.add(hit["file"])
        elif p:
            s["_photo"] = p          # fall back to the shared article photo
        else:
            s["_photo"] = None

    files = sorted({s["_photo"]["file"] for s in sweets if s["_photo"]})
    cred = cache.setdefault("credits", {})
    missing = [f for f in files if f not in cred]
    if missing:
        print(f"Fetching credits for {len(missing)} photos…")
        cred.update(credits(missing))
    for s in sweets:
        ph = s.pop("_photo")
        s["image_url"] = ph["thumb"] if ph else None
        s["image_credit"] = cred.get(ph["file"]) if ph else None
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), "utf-8")


# ---------------------------------------------------------------- variants & stock
def r5(x: float) -> int:
    return int(round(x / 5.0) * 5)


def variants_for(s: dict) -> list[dict]:
    p = s["base_price"]
    if s["price_unit"] == "1 pc":
        spec = [("1 pc", None, p), ("box of 6", None, r5(p * 5.6)), ("box of 12", None, r5(p * 10.8))]
    else:
        spec = [("250g", 250, p), ("500g", 500, r5(p * 1.95)), ("1kg", 1000, r5(p * 3.8))]
    out = []
    for i, (label, grams, price) in enumerate(spec):
        if s["name"] in OUT_OF_STOCK_DEMO:
            stock = 0
        elif s["name"] in LOW_STOCK_DEMO and i == 0:
            stock = rng.randint(2, 4)
        elif rng.random() < 0.12:
            stock = None                                  # not tracked
        else:
            stock = rng.randint(8, 90) if i == 0 else rng.randint(4, 45)
        out.append({"weight_label": label, "grams": grams, "price": float(price),
                    "stock_qty": stock, "sort_order": i})
    return out


# ---------------------------------------------------------------- demo customers
PERSONAS = [
    {"key": "priya", "name": "Priya Sen", "email": "priya.demo@swaadsujhav.test",
     "taste": {"sweetness": 4, "categories": ["bengali", "milk-based"], "bases": ["chhena", "milk"],
               "regions": ["Bengal", "Odisha"], "prefers": "milky", "diet": {}},
     "pool": ["Rasgulla", "Rasmalai", "Sandesh", "Mishti Doi", "Chamcham", "Nolen Gurer Sandesh",
              "Rajbhog", "Chhena Poda", "Mango Rasmalai", "Kheer Kadam", "Pantua", "Rabri"]},
    {"key": "rohan", "name": "Rohan Agarwal", "email": "rohan.demo@swaadsujhav.test",
     "taste": {"sweetness": 4, "categories": ["dry-fruit", "barfi"], "bases": ["dry-fruit"],
               "regions": ["North India"], "prefers": "dry_fruit", "diet": {}},
     "pool": ["Kaju Katli", "Kaju Pista Roll", "Badam Barfi", "Pista Barfi", "Soan Papdi",
              "Gulkand Kaju Roll", "Chocolate Kaju Katli", "Motichoor Laddoo", "Badam Pista Laddoo",
              "Dry Fruit Chikki", "Kaju Anjeer Roll"]},
    {"key": "meera", "name": "Meera Iyer", "email": "meera.demo@swaadsujhav.test",
     "taste": {"sweetness": 2, "categories": ["dry-fruit"], "bases": ["dry-fruit"],
               "regions": ["North India", "South India"], "prefers": "dry_fruit",
               "diet": {"sugar_free": True}},
     "pool": ["Sugar-free Kaju Katli", "Anjeer Barfi", "Khajur Roll", "Sugar-free Anjeer Roll",
              "Dry Fruit Laddoo", "Sugar-free Besan Laddoo", "Sugar-free Rasgulla",
              "Sugar-free Gulab Jamun"]},
    {"key": "arjun", "name": "Arjun Mehta", "email": "arjun.demo@swaadsujhav.test",
     "taste": {"sweetness": 4, "categories": ["world", "baked"], "bases": ["flour", "cheese"],
               "regions": ["Turkey", "Italy", "France"], "prefers": "both", "diet": {}},
     "pool": ["Baklava", "Kunafa", "Tiramisu", "French Macarons", "Churros", "New York Cheesecake",
              "Pastel de Nata", "Turkish Delight", "Fudge Brownie", "Black Forest Cake", "Mochi",
              "Alfajores"]},
    {"key": "simran", "name": "Simran Kaur", "email": "simran.demo@swaadsujhav.test",
     "taste": {"sweetness": 5, "categories": ["halwa", "laddoo", "fried"], "bases": ["flour", "besan", "carrot"],
               "regions": ["Punjab", "North India"], "prefers": "both", "diet": {}},
     "pool": ["Pinni", "Gajar Ka Halwa", "Dodha Barfi", "Gur Gajak", "Besan Laddoo", "Jalebi",
              "Rabri", "Gulab Jamun", "Atta Ladoo", "Sohan Halwa", "Muzaffarnagar Gur Laddoo",
              "Jalebi with Rabri"]},
    {"key": "kavya", "name": "Kavya Reddy", "email": "kavya.demo@swaadsujhav.test",
     "taste": {"sweetness": 4, "categories": ["halwa", "milk-based", "barfi"], "bases": ["besan", "rice", "milk"],
               "regions": ["South India", "Tamil Nadu", "Kerala", "Karnataka"], "prefers": "both",
               "diet": {"vegetarian": True}},
     "pool": ["Mysore Pak", "Payasam", "Adhirasam", "Badam Halwa", "Kesari Bath", "Rava Laddoo",
              "Ghee Mysore Pak", "Ada Pradhaman", "Palkova", "Pootharekulu", "Dharwad Peda",
              "Double Ka Meetha"]},
]
ADMIN = {"key": "admin", "name": "Shop Admin", "email": "admin@swaadsujhav.test"}

# Pairs people commonly buy together — these teach "bought together".
PAIRS = [
    ("Rasgulla", "Rasmalai"), ("Jalebi", "Rabri"), ("Kaju Katli", "Soan Papdi"),
    ("Gulab Jamun", "Rasgulla"), ("Baklava", "Kunafa"), ("Gajar Ka Halwa", "Gulab Jamun"),
    ("Motichoor Laddoo", "Kaju Katli"), ("Tiramisu", "Fudge Brownie"), ("Mysore Pak", "Badam Halwa"),
    ("Anjeer Barfi", "Khajur Roll"), ("Pinni", "Gur Gajak"), ("Sandesh", "Mishti Doi"),
]
SLOTS = ["10am–12pm", "12pm–3pm", "3pm–6pm", "6pm–9pm"]
ADDRESSES = ["12 Civil Lines", "45 Patel Nagar", "7 Gandhi Colony", "88 Bhopa Road",
             "3 Nai Mandi", "21 Ansari Road"]


def uid(key: str) -> str:
    return str(uuid.uuid5(NS, key))


def build_demo(sweets: dict[str, dict]) -> dict:
    users, orders, favs, events = [], [], [], []
    for n, p in enumerate(PERSONAS):
        users.append({"id": uid(p["key"]), "email": p["email"], "name": p["name"],
                      "taste": {**p["taste"], "quiz_done": True}, "is_admin": False})
        pool = [x for x in p["pool"] if x in sweets]
        for o in range(rng.randint(8, 12)):
            picks = set(rng.sample(pool, rng.randint(2, 3)))
            for a, b in PAIRS:
                if a in picks and b in sweets and rng.random() < 0.75:
                    picks.add(b)
            # Meera only ever buys sugar-free.
            if p["key"] == "meera":
                picks = {x for x in picks if sweets[x]["is_sugar_free"]}
            days_ago = rng.randint(3, 150)
            items = []
            for name in picks:
                s = sweets[name]
                v = rng.choice([0, 0, 1, 1, 2]) if s["price_unit"] == "250g" else rng.choice([0, 1, 1, 2])
                items.append({"slug": s["slug"], "variant": s["variants"][v]["weight_label"],
                              "qty": rng.choice([1, 1, 1, 2, 3])})
            orders.append({
                "id": str(uuid.uuid5(NS, f"{p['key']}-order-{o}")),
                "user_id": uid(p["key"]),
                "status": "delivered" if days_ago > 2 else "placed",
                "fulfilment": rng.choice(["delivery", "delivery", "pickup"]),
                "payment_method": rng.choice(["cod", "cod", "pay_at_shop"]),
                "address": {"name": p["name"], "line1": ADDRESSES[n], "city": "Muzaffarnagar",
                            "pincode": "251001", "phone": "9000000000"},
                "slot": rng.choice(SLOTS),
                "created_at": (NOW - timedelta(days=days_ago, hours=rng.randint(0, 10))).isoformat(),
                "items": items,
            })
        for name in rng.sample(pool, min(4, len(pool))):
            favs.append({"user_id": uid(p["key"]), "slug": sweets[name]["slug"]})
        for name in rng.sample(pool, min(5, len(pool))):
            events.append({"user_id": uid(p["key"]), "slug": sweets[name]["slug"],
                           "action": "add_to_cart",
                           "created_at": (NOW - timedelta(days=rng.randint(0, 20))).isoformat()})
    # Newest order of two customers is still in progress, to show the tracker.
    orders[0]["status"] = "packing"
    orders[-1]["status"] = "out_for_delivery"
    users.append({"id": uid("admin"), "email": ADMIN["email"], "name": ADMIN["name"],
                  "taste": {}, "is_admin": True})
    return {"users": users, "orders": orders, "favorites": favs, "events": events}


# ---------------------------------------------------------------- SQL output
def jdump(obj) -> str:
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    assert "$seed$" not in s
    return s


def sql_sweets(sweets: list[dict]) -> str:
    rows = []
    for s in sweets:
        rows.append({k: s[k] for k in (
            "slug", "name", "name_hi", "description", "origin_story", "region", "country",
            "category", "base", "ingredients", "sweetness", "richness", "texture", "tags",
            "occasions", "is_sugar_free", "is_vegan", "is_jain", "is_eggless", "is_gluten_free",
            "allergens", "price_unit", "base_price", "rating", "rating_count", "popularity",
            "is_new", "is_festive", "image_url", "image_credit", "created_at", "variants")})
    return f"""-- Sweets catalog ({len(rows)} sweets) + weight variants with stock
with data as (
  select * from jsonb_to_recordset($seed${jdump(rows)}$seed$::jsonb) as x(
    slug text, name text, name_hi text, description text, origin_story text, region text,
    country text, category text, base text, ingredients text[], sweetness smallint,
    richness smallint, texture text, tags text[], occasions text[], is_sugar_free boolean,
    is_vegan boolean, is_jain boolean, is_eggless boolean, is_gluten_free boolean,
    allergens text[], price_unit text, base_price numeric, rating numeric, rating_count int,
    popularity int, is_new boolean, is_festive boolean, image_url text, image_credit text,
    created_at timestamptz, variants jsonb)
), up as (
  insert into public.sweets as s (slug, name, name_hi, description, origin_story, region, country,
    category, base, ingredients, sweetness, richness, texture, tags, occasions, is_sugar_free,
    is_vegan, is_jain, is_eggless, is_gluten_free, allergens, price_unit, base_price, rating,
    rating_count, popularity, is_new, is_festive, image_url, image_credit, created_at)
  select slug, name, name_hi, description, origin_story, region, country, category, base,
    ingredients, sweetness, richness, texture, tags, occasions, is_sugar_free, is_vegan, is_jain,
    is_eggless, is_gluten_free, allergens, price_unit, base_price, rating, rating_count,
    popularity, is_new, is_festive, image_url, image_credit, created_at
  from data
  on conflict (slug) do update set
    name = excluded.name, name_hi = excluded.name_hi, description = excluded.description,
    origin_story = excluded.origin_story, region = excluded.region, country = excluded.country,
    category = excluded.category, base = excluded.base, ingredients = excluded.ingredients,
    sweetness = excluded.sweetness, richness = excluded.richness, texture = excluded.texture,
    tags = excluded.tags, occasions = excluded.occasions, is_sugar_free = excluded.is_sugar_free,
    is_vegan = excluded.is_vegan, is_jain = excluded.is_jain, is_eggless = excluded.is_eggless,
    is_gluten_free = excluded.is_gluten_free, allergens = excluded.allergens,
    price_unit = excluded.price_unit, base_price = excluded.base_price, rating = excluded.rating,
    rating_count = excluded.rating_count, is_new = excluded.is_new, is_festive = excluded.is_festive,
    image_url = coalesce(s.image_url, excluded.image_url),
    image_credit = coalesce(s.image_credit, excluded.image_credit)
  returning s.id, s.slug
)
insert into public.sweet_variants as v (sweet_id, weight_label, grams, price, stock_qty, sort_order)
select up.id, vv.weight_label, vv.grams, vv.price, vv.stock_qty, vv.sort_order
from up
join data d on d.slug = up.slug
cross join lateral jsonb_to_recordset(d.variants) as vv(weight_label text, grams int, price numeric,
                                                        stock_qty int, sort_order smallint)
on conflict (sweet_id, weight_label) do update set
  grams = excluded.grams, price = excluded.price, stock_qty = excluded.stock_qty,
  sort_order = excluded.sort_order;
"""


def sql_shayari(slug_by_name: dict[str, str]) -> str:
    rows = []
    for name, hi, roman, en in shayari.SWEET:
        if name not in slug_by_name:
            raise ValueError(f"Shayari for unknown sweet: {name}")
        rows.append({"slug": slug_by_name[name], "category": None, "occasion": "purchase",
                     "text_hi": hi, "text_roman": roman, "text_en": en})
    for cat, hi, roman, en in shayari.CATEGORY:
        rows.append({"slug": None, "category": cat, "occasion": "purchase",
                     "text_hi": hi, "text_roman": roman, "text_en": en})
    for occ, hi, roman, en in shayari.GENERAL:
        rows.append({"slug": None, "category": None, "occasion": occ,
                     "text_hi": hi, "text_roman": roman, "text_en": en})
    return f"""-- Shayari ({len(rows)} original lines). Replaces the whole table.
delete from public.shayari;
insert into public.shayari (sweet_id, category, occasion, text_hi, text_roman, text_en)
select s.id, x.category, x.occasion, x.text_hi, x.text_roman, x.text_en
from jsonb_to_recordset($seed${jdump(rows)}$seed$::jsonb)
  as x(slug text, category text, occasion text, text_hi text, text_roman text, text_en text)
left join public.sweets s on s.slug = x.slug;
"""


def sql_demo(demo: dict) -> str:
    return f"""-- Demo customers (test accounts for this app only; password in README) + history
with u as (
  select * from jsonb_to_recordset($seed${jdump(demo['users'])}$seed$::jsonb)
    as x(id uuid, email text, name text, taste jsonb, is_admin boolean)
)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('{DEMO_PASSWORD}', extensions.gen_salt('bf')), now(),
  '{{"provider":"email","providers":["email"]}}'::jsonb, jsonb_build_object('name', u.name),
  now() - interval '200 days', now(), '', '', '', ''
from u
where not exists (select 1 from auth.users au where au.id = u.id or au.email = u.email);

with u as (
  select * from jsonb_to_recordset($seed${jdump(demo['users'])}$seed$::jsonb)
    as x(id uuid, email text, name text, taste jsonb, is_admin boolean)
)
insert into auth.identities (id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from u
where not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

with u as (
  select * from jsonb_to_recordset($seed${jdump(demo['users'])}$seed$::jsonb)
    as x(id uuid, email text, name text, taste jsonb, is_admin boolean)
)
insert into public.profiles (id, name, taste_profile, is_admin)
select id, name, taste, is_admin from u
on conflict (id) do update set name = excluded.name, taste_profile = excluded.taste_profile,
  is_admin = excluded.is_admin;

-- Re-create demo orders from scratch so re-running the seed stays consistent.
delete from public.orders where user_id in (
  select (x->>'id')::uuid from jsonb_array_elements($seed${jdump(demo['users'])}$seed$::jsonb) x);

with o as (
  select * from jsonb_to_recordset($seed${jdump(demo['orders'])}$seed$::jsonb)
    as x(id uuid, user_id uuid, status text, fulfilment text, payment_method text,
         address jsonb, slot text, created_at timestamptz, items jsonb)
), ins as (
  insert into public.orders (id, user_id, status, fulfilment, payment_method, address,
    delivery_slot, created_at)
  select id, user_id, status, fulfilment, payment_method,
    case when fulfilment = 'delivery' then address end, slot, created_at
  from o
  returning id
)
insert into public.order_items (order_id, sweet_id, variant_id, quantity, price)
select o.id, s.id, v.id, it.qty, v.price
from o
cross join lateral jsonb_to_recordset(o.items) as it(slug text, variant text, qty int)
join public.sweets s on s.slug = it.slug
join public.sweet_variants v on v.sweet_id = s.id and v.weight_label = it.variant;

update public.orders o
set subtotal = t.sub, total = t.sub
from (select order_id, sum(price * quantity) as sub from public.order_items group by order_id) t
where t.order_id = o.id and o.user_id in (
  select (x->>'id')::uuid from jsonb_array_elements($seed${jdump(demo['users'])}$seed$::jsonb) x);

-- Favourites and recent add-to-cart events
insert into public.favorites (user_id, sweet_id)
select f.user_id, s.id
from jsonb_to_recordset($seed${jdump(demo['favorites'])}$seed$::jsonb) as f(user_id uuid, slug text)
join public.sweets s on s.slug = f.slug
on conflict do nothing;

delete from public.events where user_id in (
  select (x->>'id')::uuid from jsonb_array_elements($seed${jdump(demo['users'])}$seed$::jsonb) x);
insert into public.events (user_id, sweet_id, action, created_at)
select e.user_id, s.id, e.action, e.created_at
from jsonb_to_recordset($seed${jdump(demo['events'])}$seed$::jsonb)
  as e(user_id uuid, slug text, action text, created_at timestamptz)
join public.sweets s on s.slug = e.slug;

-- Popularity = a base level + real units sold in demo orders.
update public.sweets s
set popularity = s.popularity + coalesce(t.q, 0) * 10
from (select sweet_id, sum(quantity) as q from public.order_items group by sweet_id) t
where t.sweet_id = s.id;
"""


def sql_photos(sweets: list[dict]) -> str:
    rows = [{"slug": s["slug"], "image_url": s["image_url"], "image_credit": s["image_credit"]} for s in sweets]
    return f"""-- Refresh seed photos. Leaves photos the admin uploaded (Supabase Storage) untouched.
update public.sweets s
set image_url = x.image_url, image_credit = x.image_credit
from jsonb_to_recordset($seed${jdump(rows)}$seed$::jsonb) as x(slug text, image_url text, image_credit text)
where s.slug = x.slug
  and (s.image_url is null or s.image_url like '%wikimedia.org%');
"""


def main() -> None:
    refresh = "--refresh" in sys.argv
    sweets = load_catalog()
    print(f"Catalog: {len(sweets)} sweets "
          f"({sum(s['country'] == 'India' for s in sweets)} Indian, "
          f"{sum(s['country'] != 'India' for s in sweets)} world), "
          f"{sum(s['is_new'] for s in sweets)} new, {sum(s['is_sugar_free'] for s in sweets)} sugar-free")

    resolve_photos(sweets, refresh)
    with_photo = sum(1 for s in sweets if s["image_url"])
    print(f"Photos: {with_photo}/{len(sweets)} sweets have a real photo")

    for s in sweets:
        best = "bestseller" in s["tags"]
        s["popularity"] = rng.randint(250, 450) if best else rng.randint(10, 180)
        s["rating"] = round(rng.uniform(4.5, 4.9) if best else rng.uniform(4.0, 4.8), 1)
        s["rating_count"] = rng.randint(120, 900) if best else rng.randint(8, 240)
        s["created_at"] = (NOW - timedelta(days=rng.randint(2, 25) if s["is_new"]
                                           else rng.randint(120, 700))).isoformat()
        s["variants"] = variants_for(s)

    by_name = {s["name"]: s for s in sweets}
    demo = build_demo(by_name)
    print(f"Demo: {len(demo['users'])} accounts, {len(demo['orders'])} orders, "
          f"{sum(len(o['items']) for o in demo['orders'])} order lines")

    parts = {
        "01_catalog.sql": sql_sweets(sweets),
        "02_shayari.sql": sql_shayari({n: s["slug"] for n, s in by_name.items()}),
        "03_demo_customers.sql": sql_demo(demo),
        "04_photos.sql": sql_photos(sweets),
    }
    out_dir = ROOT / "supabase" / "seed_parts"
    out_dir.mkdir(parents=True, exist_ok=True)
    header = ("-- Swaad Sujhav seed — generated by seed/build_seed.py. Do not edit by hand.\n"
              "-- Run AFTER schema.sql. Safe to re-run.\n\n")
    for name, sql in parts.items():
        (out_dir / name).write_text(header + sql, "utf-8")
    (ROOT / "supabase" / "seed.sql").write_text(header + "\n".join(parts.values()), "utf-8")
    for name in parts:
        print(f"  wrote supabase/seed_parts/{name} ({(out_dir / name).stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
