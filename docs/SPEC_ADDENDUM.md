# Swaad Sujhaav — Spec Addendum

Changes requested by the shop owner on top of the master prompt. Where this file and the
master prompt disagree, **this file wins**.

## A1. Stack
- Any language is allowed; goal is "super good". Chosen stack:
  - **Frontend:** HTML + CSS + vanilla JS modules (fast, no build step).
  - **Backend:** **Python (FastAPI)** in `backend/app.py`. Serves the site and `/api/*`.
  - **Data/Auth/Storage:** Supabase (project ref `jqcrswigpamwmzjxlowu`).
- The Supabase **service-role key lives only in `backend/.env`** (server). Never in the browser.

## A2. AI recommendations — local, free ML (no paid APIs)
- **Content similarity:** sentence-transformers embeddings (`all-MiniLM-L6-v2`) of each sweet's
  name + description + ingredients + attributes, stored in `sweet_embeddings` (pgvector).
  TF-IDF fallback if torch is unavailable.
- **Collaborative filtering:** implicit-feedback matrix factorisation (truncated SVD on the
  user × sweet matrix from orders, favourites, add-to-carts) + item-item cosine.
- **Basket lift:** "bought together" from `order_items`.
- The Python job trains offline and writes `sweet_similar` and `user_recos`, so recommendations
  keep working from Supabase even when the Python server is down. SQL RPCs remain the fallback.
- Final ranking keeps the master formula (taste / together / popularity / new / occasion) with the
  ML scores feeding the taste and together terms. Every pick carries a human reason.

## A3. Sweet photos
- Every sweet shows a **real photo**. Seed photos come from Wikimedia Commons (free licence),
  with `image_credit` stored and shown small on the detail view.
- Admin can upload/replace photos (Supabase Storage bucket `sweet-images`).
- Designed placeholder only when a photo is missing or fails to load.

## A4. Admin panel (expanded)
- **CSV import** of the catalog (upsert by `slug`, variants as `label:price:stock|…`), with a
  preview table, row-level validation, and an error report. Templates in `supabase/templates/`.
- **CSV stock update** (`slug, weight_label, stock_qty[, price]`).
- **Inventory:** see and change the **quantity available** for each sweet and weight; low-stock
  list; stock is checked and reduced when an order is placed; a sweet goes "out of stock"
  automatically when every weight hits 0.
- **Users & choices:** list customers (email, orders, spend, favourites), view and **edit each
  person's taste profile / diet choices**, toggle admin, plus shop-wide choice stats.
- Retrain the ML model from the admin panel and see the last run's metrics.

## A5. Sweet overview on click
- Clicking any sweet opens its **overview** (photo, story, ingredients, taste bars, allergens,
  weights, price, stock, shayari) **and "More dishes like this"**: similar sweets from the ML
  content model, plus "Goes great with" (bought together) and "Customers also bought".

## A6. Paaji's add-to-cart line (shop is in **Muzaffarnagar**)
- After the shayari for the added sweet, Paaji suggests another sweet (prefer a new item, else
  the top "goes with"/similar pick) and says, with that sweet's name filled in:
  - **"Ye {sweet} bhi le jao, poore Muzaffarnagar mein nayi hai!"** (when the pick is new)
  - Variations for non-new picks, e.g. "Ye {sweet} bhi le jao ji, {added} de naal jodi kamaal di hai!"
- He points at that sweet's card, and it gets a one-tap "Add" in the bubble.
