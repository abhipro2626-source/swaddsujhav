-- =====================================================================
-- Swaad Sujhav — database schema
-- Tables, indexes, Row Level Security, triggers and RPC functions.
-- Safe to run on a fresh Supabase project (SQL editor → Run).
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector  with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  name          text,
  phone         text,
  -- {sweetness:1-5, categories:[], bases:[], regions:[], prefers:'milky'|'dry_fruit'|'both',
  --  diet:{sugar_free:bool, vegan:bool, jain:bool, gluten_free:bool}, quiz_done:bool}
  taste_profile jsonb   not null default '{}'::jsonb,
  addresses     jsonb   not null default '[]'::jsonb,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Admin check used by policies. SECURITY DEFINER so it can read profiles
-- without recursing through profiles' own RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- Auto-create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. Catalog
-- ---------------------------------------------------------------------
create table if not exists public.sweets (
  id              bigint generated always as identity primary key,
  slug            text not null unique,
  name            text not null,
  name_hi         text,
  description     text,
  origin_story    text,
  region          text not null,          -- 'Bengal', 'Punjab', 'South India', 'Turkey', ...
  country         text not null default 'India',
  category        text not null check (category in (
                    'milk-based','dry-fruit','syrup-soaked','fried','halwa','laddoo',
                    'barfi','bengali','baked','world','steamed','brittle')),
  base            text not null,          -- milk, chhena, khoya, flour, besan, dry-fruit, rice, ...
  ingredients     text[] not null default '{}',
  sweetness       smallint not null default 3 check (sweetness between 1 and 5),
  richness        smallint not null default 3 check (richness between 1 and 5),
  texture         text,                   -- soft, spongy, crumbly, chewy, crisp, creamy, fudgy, flaky
  tags            text[] not null default '{}',
  occasions       text[] not null default '{}',  -- diwali, wedding, birthday, rakhi, guests, office, puja
  is_sugar_free   boolean not null default false,
  is_vegan        boolean not null default false,
  is_jain         boolean not null default false,
  is_eggless      boolean not null default true,
  is_gluten_free  boolean not null default false,
  allergens       text[] not null default '{}',
  price_unit      text not null default '250g',  -- label of the cheapest variant shown on cards
  base_price      numeric(10,2) not null check (base_price >= 0),
  rating          numeric(2,1) not null default 4.5 check (rating between 0 and 5),
  rating_count    integer not null default 0,
  popularity      integer not null default 0,    -- rough sales count, used for "Bestsellers"
  is_new          boolean not null default false,
  is_festive      boolean not null default false,
  in_stock        boolean not null default true,
  image_url       text,
  image_credit    text,                   -- attribution for Wikimedia/CC photos
  created_at      timestamptz not null default now()
);

create index if not exists sweets_category_idx   on public.sweets (category);
create index if not exists sweets_region_idx     on public.sweets (region);
create index if not exists sweets_popularity_idx on public.sweets (popularity desc);
create index if not exists sweets_flags_idx      on public.sweets (is_new, is_festive);
create index if not exists sweets_name_trgm_idx  on public.sweets using gin (name extensions.gin_trgm_ops);

create table if not exists public.sweet_variants (
  id            bigint generated always as identity primary key,
  sweet_id      bigint not null references public.sweets (id) on delete cascade,
  weight_label  text not null,             -- '1 pc', '250g', '500g', '1kg', 'box of 6'
  grams         integer,
  price         numeric(10,2) not null check (price >= 0),
  -- Units of this variant on the shelf. NULL = not tracked (unlimited).
  stock_qty     integer check (stock_qty is null or stock_qty >= 0),
  sort_order    smallint not null default 0,
  unique (sweet_id, weight_label)
);
create index if not exists sweet_variants_sweet_idx on public.sweet_variants (sweet_id);

-- Keep sweets.in_stock in sync with variant stock:
-- every tracked variant at 0 -> out of stock; any variant restocked -> back in stock.
create or replace function public.sync_sweet_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_sweet bigint := coalesce(new.sweet_id, old.sweet_id);
begin
  if tg_op = 'UPDATE' and old.stock_qty is not distinct from new.stock_qty then
    return null;
  end if;
  update public.sweets s
  set in_stock = exists (
    select 1 from public.sweet_variants v
    where v.sweet_id = v_sweet and (v.stock_qty is null or v.stock_qty > 0)
  )
  where s.id = v_sweet;
  return null;
end;
$$;

drop trigger if exists sweet_variants_stock_sync on public.sweet_variants;
create trigger sweet_variants_stock_sync
  after insert or update of stock_qty or delete on public.sweet_variants
  for each row execute function public.sync_sweet_stock();

create table if not exists public.shayari (
  id          bigint generated always as identity primary key,
  sweet_id    bigint references public.sweets (id) on delete cascade,
  category    text,
  occasion    text not null default 'purchase'
              check (occasion in ('purchase','thanks','welcome','diwali')),
  text_hi     text not null,
  text_roman  text not null,
  text_en     text not null
);
create index if not exists shayari_sweet_idx    on public.shayari (sweet_id);
create index if not exists shayari_category_idx on public.shayari (category, occasion);

-- Editable Paaji dialogue (the JS bank in lines.js is the fallback).
create table if not exists public.paaji_lines (
  id          bigint generated always as identity primary key,
  trigger     text not null,   -- welcome, return, add, upsell, pairing, cart_idle, order, no_result, fact
  text_roman  text not null,
  text_hi     text,
  active      boolean not null default true
);
create index if not exists paaji_lines_trigger_idx on public.paaji_lines (trigger) where active;

-- ---------------------------------------------------------------------
-- 3. Shopping
-- ---------------------------------------------------------------------
create table if not exists public.cart_items (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sweet_id    bigint not null references public.sweets (id) on delete cascade,
  variant_id  bigint not null references public.sweet_variants (id) on delete cascade,
  quantity    integer not null default 1 check (quantity between 1 and 99),
  created_at  timestamptz not null default now(),
  unique (user_id, variant_id)
);
create index if not exists cart_items_user_idx on public.cart_items (user_id);
create index if not exists cart_items_sweet_idx on public.cart_items (sweet_id);
create index if not exists cart_items_variant_idx on public.cart_items (variant_id);

create sequence if not exists public.order_number_seq start 1001;

create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    text not null unique
                  default ('SS-' || nextval('public.order_number_seq')::text),
  user_id         uuid not null references auth.users (id) on delete cascade,
  status          text not null default 'placed'
                  check (status in ('placed','packing','out_for_delivery','delivered','cancelled')),
  fulfilment      text not null default 'delivery' check (fulfilment in ('delivery','pickup')),
  -- Only offline methods for now. A gateway would add a value here + a payments table.
  payment_method  text not null check (payment_method in ('cod','pay_at_shop')),
  address         jsonb,
  delivery_slot   text,
  gift_message    text check (char_length(gift_message) <= 300),
  subtotal        numeric(10,2) not null default 0,
  discount        numeric(10,2) not null default 0,
  total           numeric(10,2) not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists orders_user_idx on public.orders (user_id, created_at desc);

create table if not exists public.order_items (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  sweet_id    bigint not null references public.sweets (id),
  variant_id  bigint references public.sweet_variants (id) on delete set null,
  quantity    integer not null check (quantity > 0),
  price       numeric(10,2) not null       -- unit price at the time of purchase
);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_sweet_idx on public.order_items (sweet_id);
create index if not exists order_items_variant_idx on public.order_items (variant_id);

create table if not exists public.favorites (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sweet_id    bigint not null references public.sweets (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, sweet_id)
);
create index if not exists favorites_sweet_idx on public.favorites (sweet_id);

create table if not exists public.events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sweet_id    bigint references public.sweets (id) on delete cascade,
  action      text not null check (action in ('view','add_to_cart','remove','favorite','search')),
  query       text,
  created_at  timestamptz not null default now()
);
create index if not exists events_user_idx  on public.events (user_id, created_at desc);
create index if not exists events_sweet_idx on public.events (sweet_id, action);

-- ---------------------------------------------------------------------
-- 3b. Machine-learning outputs (written by the Python service, backend/)
-- The ML job trains offline and stores its results here, so the shop keeps
-- giving smart suggestions even when the Python server is not running.
-- ---------------------------------------------------------------------
create table if not exists public.sweet_embeddings (
  sweet_id    bigint primary key references public.sweets (id) on delete cascade,
  embedding   extensions.vector(384) not null,
  model       text not null,
  updated_at  timestamptz not null default now()
);

-- Nearest neighbours per sweet. kind: 'content' (text/attribute embeddings),
-- 'collab' (learned from who-bought-what), 'together' (same-basket lift).
create table if not exists public.sweet_similar (
  sweet_id    bigint not null references public.sweets (id) on delete cascade,
  similar_id  bigint not null references public.sweets (id) on delete cascade,
  kind        text   not null check (kind in ('content','collab','together')),
  score       real   not null,
  primary key (sweet_id, kind, similar_id)
);
create index if not exists sweet_similar_lookup_idx on public.sweet_similar (sweet_id, kind, score desc);
create index if not exists sweet_similar_similar_idx on public.sweet_similar (similar_id);

-- Precomputed personal picks with an explanation for each.
create table if not exists public.user_recos (
  user_id      uuid   not null references auth.users (id) on delete cascade,
  sweet_id     bigint not null references public.sweets (id) on delete cascade,
  score        real   not null,
  reason       text   not null,
  reason_kind  text   not null,
  model_run    bigint,
  created_at   timestamptz not null default now(),
  primary key (user_id, sweet_id)
);
create index if not exists user_recos_user_idx on public.user_recos (user_id, score desc);
create index if not exists user_recos_sweet_idx on public.user_recos (sweet_id);

create table if not exists public.ml_runs (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running','ok','failed')),
  trigger      text,                -- 'manual', 'schedule', 'import'
  metrics      jsonb not null default '{}'::jsonb,
  error        text
);

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
alter table public.sweet_embeddings enable row level security;  -- service role only
alter table public.sweet_similar    enable row level security;
alter table public.user_recos       enable row level security;
alter table public.ml_runs          enable row level security;

drop policy if exists "sweet_similar: public read" on public.sweet_similar;
create policy "sweet_similar: public read" on public.sweet_similar
  for select to anon, authenticated using (true);

drop policy if exists "user_recos: read own" on public.user_recos;
create policy "user_recos: read own" on public.user_recos
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "ml_runs: admin read" on public.ml_runs;
create policy "ml_runs: admin read" on public.ml_runs
  for select to authenticated using ((select public.is_admin()));

alter table public.profiles       enable row level security;
alter table public.sweets         enable row level security;
alter table public.sweet_variants enable row level security;
alter table public.shayari        enable row level security;
alter table public.paaji_lines    enable row level security;
alter table public.cart_items     enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.favorites      enable row level security;
alter table public.events         enable row level security;

-- Profiles: own row (admins can read all for the orders screen).
drop policy if exists "profiles: read own"   on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));
-- Users must never be able to promote themselves: only these columns are writable.
revoke update on public.profiles from anon, authenticated;
grant update (name, phone, taste_profile, addresses) on public.profiles to authenticated;

-- Public catalog: anyone reads, only admins write (separate policies per action,
-- so reads never evaluate the admin check).
do $$
declare t text;
begin
  foreach t in array array['sweets','sweet_variants','shayari','paaji_lines'] loop
    execute format('drop policy if exists "%1$s: public read" on public.%1$I', t);
    execute format('drop policy if exists "%1$s: admin insert" on public.%1$I', t);
    execute format('drop policy if exists "%1$s: admin update" on public.%1$I', t);
    execute format('drop policy if exists "%1$s: admin delete" on public.%1$I', t);
    execute format(
      'create policy "%1$s: public read" on public.%1$I for select to anon, authenticated using (true)', t);
    execute format(
      'create policy "%1$s: admin insert" on public.%1$I for insert to authenticated
         with check ((select public.is_admin()))', t);
    execute format(
      'create policy "%1$s: admin update" on public.%1$I for update to authenticated
         using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format(
      'create policy "%1$s: admin delete" on public.%1$I for delete to authenticated
         using ((select public.is_admin()))', t);
  end loop;
end $$;

-- Cart, favorites, events: strictly own rows.
do $$
declare t text;
begin
  foreach t in array array['cart_items','favorites','events'] loop
    execute format('drop policy if exists "%1$s: own rows" on public.%1$I', t);
    execute format(
      'create policy "%1$s: own rows" on public.%1$I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Orders: users read their own; inserts only happen through place_order().
-- Admins can read all and update status.
drop policy if exists "orders: read own"      on public.orders;
drop policy if exists "orders: admin update"  on public.orders;
create policy "orders: read own" on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "orders: admin update" on public.orders
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "order_items: read own" on public.order_items;
create policy "order_items: read own" on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (o.user_id = (select auth.uid()) or (select public.is_admin()))
  ));

-- ---------------------------------------------------------------------
-- 5. Storage bucket for sweet photos (public read, admin write)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('sweet-images', 'sweet-images', true)
on conflict (id) do nothing;

drop policy if exists "sweet-images: admin insert" on storage.objects;
drop policy if exists "sweet-images: admin update" on storage.objects;
drop policy if exists "sweet-images: admin delete" on storage.objects;
create policy "sweet-images: admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sweet-images' and (select public.is_admin()));
create policy "sweet-images: admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'sweet-images' and (select public.is_admin()));
create policy "sweet-images: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'sweet-images' and (select public.is_admin()));

-- =====================================================================
-- 6. RPC functions
-- Recommendation functions are SECURITY DEFINER because "bought together"
-- must aggregate everyone's order_items. They only ever return sweet ids,
-- scores and reasons — never another user's rows. The caller's identity
-- always comes from auth.uid(), never from a parameter.
-- =====================================================================

-- Weights live here, in one place, so they are easy to explain and tweak.
create or replace function public.reco_weights()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"taste":0.40,"together":0.25,"popularity":0.15,"new":0.10,"occasion":0.10}'::jsonb;
$$;

-- Is "now" festival season? (roughly Dussehra → Bhai Dooj, plus wedding season)
create or replace function public.is_festive_season()
returns boolean
language sql
stable
set search_path = ''
as $$
  select extract(month from now()) in (10, 11);
$$;

-- Does a sweet pass the user's diet choices?
create or replace function public.passes_diet(s public.sweets, diet jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
        (coalesce((diet ->> 'sugar_free')::boolean, false)  = false or s.is_sugar_free)
    and (coalesce((diet ->> 'vegan')::boolean, false)       = false or s.is_vegan)
    and (coalesce((diet ->> 'jain')::boolean, false)        = false or s.is_jain)
    and (coalesce((diet ->> 'gluten_free')::boolean, false) = false or s.is_gluten_free)
    and (coalesce((diet ->> 'eggless')::boolean, false)     = false or s.is_eggless);
$$;

-- ---------------------------------------------------------------------
-- bought_together: sweets that appear in the same orders as p_sweet_id
-- ---------------------------------------------------------------------
create or replace function public.bought_together(p_sweet_id bigint, p_limit int default 6)
returns table (sweet_id bigint, together_count bigint, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  select oi2.sweet_id,
         count(distinct oi2.order_id) as together_count,
         'Goes with ' || src.name as reason
  from public.order_items oi1
  join public.order_items oi2
    on oi2.order_id = oi1.order_id and oi2.sweet_id <> oi1.sweet_id
  join public.sweets s   on s.id = oi2.sweet_id and s.in_stock
  join public.sweets src on src.id = p_sweet_id
  where oi1.sweet_id = p_sweet_id
  group by oi2.sweet_id, src.name
  order by together_count desc, oi2.sweet_id
  limit least(greatest(p_limit, 1), 24);
$$;

-- ---------------------------------------------------------------------
-- customers_also_bought: people who bought X (in any order) also bought Y.
-- Score = shared buyers / sqrt(buyers(X) * buyers(Y))   (cosine similarity)
-- ---------------------------------------------------------------------
create or replace function public.customers_also_bought(p_sweet_id bigint, p_limit int default 6)
returns table (sweet_id bigint, similarity numeric, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  with buyers as (
    select distinct o.user_id, oi.sweet_id
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status <> 'cancelled'
  ),
  x_buyers as (select user_id from buyers where sweet_id = p_sweet_id),
  counts as (select b.sweet_id, count(*) as n from buyers b group by b.sweet_id),
  shared as (
    select b.sweet_id, count(*) as n_shared
    from buyers b
    join x_buyers xb on xb.user_id = b.user_id
    where b.sweet_id <> p_sweet_id
    group by b.sweet_id
  )
  select sh.sweet_id,
         round(sh.n_shared / sqrt(cx.n::numeric * cy.n::numeric), 4) as similarity,
         'Customers also loved this'::text as reason
  from shared sh
  join counts cy on cy.sweet_id = sh.sweet_id
  join counts cx on cx.sweet_id = p_sweet_id
  join public.sweets s on s.id = sh.sweet_id and s.in_stock
  order by similarity desc, sh.n_shared desc
  limit least(greatest(p_limit, 1), 24);
$$;

-- ---------------------------------------------------------------------
-- recommend_for_user: the main "Paaji's Sujhav for You" row.
--   score = 0.40*taste + 0.25*together + 0.15*popularity + 0.10*new + 0.10*occasion
-- Works for guests too (no taste/history → popularity + new + festive).
-- p_exclude: sweet ids to skip (e.g. a guest's localStorage cart).
-- p_occasion: optional occasion filter boost ('diwali','wedding',...).
-- ---------------------------------------------------------------------
create or replace function public.recommend_for_user(
  p_limit     int      default 12,
  p_occasion  text     default null,
  p_exclude   bigint[] default '{}'
)
returns table (sweet_id bigint, score numeric, reason text, reason_kind text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid     uuid  := auth.uid();
  v_taste   jsonb := '{}'::jsonb;
  v_w       jsonb := public.reco_weights();
  v_festive boolean := public.is_festive_season();
  v_limit   int := least(greatest(coalesce(p_limit, 12), 1), 48);
  v_per_cat int;
begin
  v_per_cat := greatest(2, ceil(v_limit / 3.0)::int);

  if v_uid is not null then
    select coalesce(p.taste_profile, '{}'::jsonb) into v_taste
    from public.profiles p where p.id = v_uid;
    v_taste := coalesce(v_taste, '{}'::jsonb);
  end if;

  return query
  with
  -- Sweets the user has shown love for: favorites (weight 3), orders (2), add-to-cart (1).
  history as (
    select f.sweet_id, 3 as w from public.favorites f where f.user_id = v_uid
    union all
    select oi.sweet_id, 2 from public.order_items oi
      join public.orders o on o.id = oi.order_id where o.user_id = v_uid
    union all
    select e.sweet_id, 1 from public.events e
      where e.user_id = v_uid and e.action = 'add_to_cart' and e.sweet_id is not null
  ),
  liked as (
    select h.sweet_id, sum(h.w) as w from history h group by h.sweet_id
  ),
  liked_attrs as (
    select s.category, s.base, s.region, sum(l.w) as w
    from liked l join public.sweets s on s.id = l.sweet_id
    group by s.category, s.base, s.region
  ),
  pref as (
    select
      coalesce((v_taste ->> 'sweetness')::numeric,
               (select avg(s.sweetness) from liked l join public.sweets s on s.id = l.sweet_id),
               3) as sweetness,
      array(select jsonb_array_elements_text(coalesce(v_taste -> 'categories', '[]'::jsonb)))
        || array(select distinct la.category from liked_attrs la) as cats,
      array(select jsonb_array_elements_text(coalesce(v_taste -> 'bases', '[]'::jsonb)))
        || array(select distinct la.base from liked_attrs la) as bases,
      array(select jsonb_array_elements_text(coalesce(v_taste -> 'regions', '[]'::jsonb)))
        || array(select distinct la.region from liked_attrs la) as regions,
      coalesce(v_taste ->> 'prefers', 'both') as prefers,
      coalesce(v_taste -> 'diet', '{}'::jsonb) as diet,
      (v_taste <> '{}'::jsonb or exists (select 1 from liked)) as has_signal
  ),
  in_cart as (
    select c.sweet_id from public.cart_items c where c.user_id = v_uid
    union select unnest(coalesce(p_exclude, '{}'))
  ),
  -- Co-occurrence of each candidate with anything the user liked.
  together as (
    select oi2.sweet_id, sum(l.w) as n, max(l.sweet_id) as via
    from liked l
    join public.order_items oi1 on oi1.sweet_id = l.sweet_id
    join public.order_items oi2 on oi2.order_id = oi1.order_id and oi2.sweet_id <> oi1.sweet_id
    group by oi2.sweet_id
  ),
  max_pop as (select greatest(max(s.popularity), 1)::numeric as m from public.sweets s),
  max_tog as (select greatest(max(t.n), 1)::numeric as m from together t),
  scored as (
    select
      s.id, s.category, s.name,
      -- Taste similarity in [0,1]
      case when pf.has_signal then
          0.35 * (1 - abs(s.sweetness - pf.sweetness) / 4.0)
        + 0.25 * (s.category = any(pf.cats))::int
        + 0.15 * (s.base = any(pf.bases))::int
        + 0.15 * (s.region = any(pf.regions))::int
        + 0.10 * (case
                    when pf.prefers = 'milky'     then (s.base in ('milk','khoya','chhena') or s.category in ('milk-based','bengali'))::int
                    when pf.prefers = 'dry_fruit' then (s.base = 'dry-fruit' or s.category = 'dry-fruit')::int
                    else 1 end)
      else 0 end                                                        as taste,
      coalesce(t.n, 0) / mt.m                                           as tog,
      t.via                                                             as tog_via,
      s.popularity / mp.m                                               as pop,
      (s.is_new or s.created_at > now() - interval '30 days')::int      as is_new,
      (case
         when p_occasion is not null then (p_occasion = any(s.occasions))::int
         when v_festive then (s.is_festive or 'diwali' = any(s.occasions))::int
         else 0 end)                                                    as occ
    from public.sweets s
    cross join pref pf
    cross join max_pop mp
    cross join max_tog mt
    left join together t on t.sweet_id = s.id
    where s.in_stock
      and public.passes_diet(s, pf.diet)
      and s.id not in (select ic.sweet_id from in_cart ic where ic.sweet_id is not null)
  ),
  ranked as (
    select sc.*,
      ( (v_w ->> 'taste')::numeric      * sc.taste
      + (v_w ->> 'together')::numeric   * sc.tog
      + (v_w ->> 'popularity')::numeric * sc.pop
      + (v_w ->> 'new')::numeric        * sc.is_new
      + (v_w ->> 'occasion')::numeric   * sc.occ ) as total
    from scored sc
  ),
  varied as (
    select r.*,
           row_number() over (partition by r.category order by r.total desc) as cat_rank,
           (v_w ->> 'taste')::numeric      * r.taste  as c_taste,
           (v_w ->> 'together')::numeric   * r.tog    as c_tog,
           (v_w ->> 'new')::numeric        * r.is_new as c_new,
           (v_w ->> 'occasion')::numeric   * r.occ    as c_occ,
           (v_w ->> 'popularity')::numeric * r.pop    as c_pop
    from ranked r
  ),
  explained as (
    select v.*, greatest(v.c_taste, v.c_tog, v.c_new, v.c_occ, v.c_pop) as best
    from varied v
    where v.cat_rank <= v_per_cat
  )
  -- Explain each pick with its single strongest contributor.
  select e.id,
         round(e.total, 4),
         case
           when e.c_tog > 0 and e.c_tog = e.best
             then 'Goes with ' || (select s2.name from public.sweets s2 where s2.id = e.tog_via)
           when e.c_taste > 0 and e.c_taste = e.best
             then coalesce(
                    'Because you loved ' || (
                      select s3.name from liked l3 join public.sweets s3 on s3.id = l3.sweet_id
                      where s3.category = e.category and s3.id <> e.id
                      order by l3.w desc limit 1),
                    'Matches your taste')
           when e.c_new > 0 and e.c_new = e.best then 'Naya hai!'
           when e.c_occ > 0 and e.c_occ = e.best
             then 'Perfect for ' || initcap(coalesce(p_occasion, 'Diwali'))
           else 'Bestseller'
         end,
         case
           when e.c_tog > 0 and e.c_tog = e.best     then 'together'
           when e.c_taste > 0 and e.c_taste = e.best then 'taste'
           when e.c_new > 0 and e.c_new = e.best     then 'new'
           when e.c_occ > 0 and e.c_occ = e.best     then 'occasion'
           else 'popular'
         end
  from explained e
  order by e.total desc, e.id
  limit v_limit;
end;
$$;

-- ---------------------------------------------------------------------
-- upsell_for_cart: "Paaji kehte hain: ye bhi le lo!"
-- Uses the signed-in user's cart, or p_cart (sweet ids) for guests.
-- Favors items bought together with the cart, then new items.
-- ---------------------------------------------------------------------
create or replace function public.upsell_for_cart(
  p_limit int      default 3,
  p_cart  bigint[] default null
)
returns table (sweet_id bigint, score numeric, reason text, reason_kind text)
language sql
stable
security definer
set search_path = ''
as $$
  with cart as (
    select unnest(p_cart) as sweet_id where p_cart is not null
    union
    select c.sweet_id from public.cart_items c
    where p_cart is null and c.user_id = (select auth.uid())
  ),
  diet as (
    select coalesce(
      (select p.taste_profile -> 'diet' from public.profiles p where p.id = (select auth.uid())),
      '{}'::jsonb) as d
  ),
  together as (
    select oi2.sweet_id, count(distinct oi2.order_id) as n, min(oi1.sweet_id) as via
    from cart c
    join public.order_items oi1 on oi1.sweet_id = c.sweet_id
    join public.order_items oi2 on oi2.order_id = oi1.order_id and oi2.sweet_id <> oi1.sweet_id
    group by oi2.sweet_id
  ),
  max_tog as (select greatest(max(n), 1)::numeric as m from together),
  max_pop as (select greatest(max(popularity), 1)::numeric as m from public.sweets),
  scored as (
    select s.id,
           0.55 * coalesce(t.n, 0) / mt.m
         + 0.30 * s.is_new::int
         + 0.15 * s.popularity / mp.m as score,
           t.n as tog_n, t.via, s.is_new
    from public.sweets s
    cross join diet
    cross join max_tog mt
    cross join max_pop mp
    left join together t on t.sweet_id = s.id
    where s.in_stock
      and public.passes_diet(s, diet.d)
      and s.id not in (select sweet_id from cart)
  )
  select sc.id,
         round(sc.score, 4),
         case when sc.tog_n is not null
                then 'Goes with ' || (select name from public.sweets where id = sc.via)
              when sc.is_new then 'Naya hai!'
              else 'Bestseller' end,
         case when sc.tog_n is not null then 'together'
              when sc.is_new then 'new' else 'popular' end
  from scored sc
  order by sc.score desc, sc.id
  limit least(greatest(coalesce(p_limit, 3), 1), 12);
$$;

-- ---------------------------------------------------------------------
-- place_order: creates the order + items from the user's cart and empties
-- the cart, all in one transaction. Prices are read from the database,
-- never trusted from the client.
-- ---------------------------------------------------------------------
create or replace function public.place_order(
  p_payment_method text,
  p_fulfilment     text  default 'delivery',
  p_address        jsonb default null,
  p_delivery_slot  text  default null,
  p_gift_message   text  default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_subtotal numeric(10,2);
  v_short    text;
  v_order    public.orders;
begin
  if v_uid is null then
    raise exception 'Please log in to place an order' using errcode = '28000';
  end if;
  if p_payment_method not in ('cod', 'pay_at_shop') then
    raise exception 'Unsupported payment method' using errcode = '22023';
  end if;
  if p_fulfilment not in ('delivery', 'pickup') then
    raise exception 'Unsupported fulfilment' using errcode = '22023';
  end if;
  if p_fulfilment = 'delivery' and (p_address is null or coalesce(p_address ->> 'line1', '') = '') then
    raise exception 'Delivery address is required' using errcode = '22023';
  end if;

  -- Lock the cart so a double-click can't create two orders.
  perform 1 from public.cart_items where user_id = v_uid for update;

  if exists (
    select 1 from public.cart_items c join public.sweets s on s.id = c.sweet_id
    where c.user_id = v_uid and not s.in_stock
  ) then
    raise exception 'Some items in your cart are out of stock' using errcode = '22023';
  end if;

  -- Lock the variants being bought and make sure there is enough on the shelf.
  perform 1 from public.sweet_variants v
  where v.id in (select c.variant_id from public.cart_items c where c.user_id = v_uid)
  for update;

  select s.name || ' (' || v.weight_label || ')' into v_short
  from public.cart_items c
  join public.sweet_variants v on v.id = c.variant_id
  join public.sweets s on s.id = c.sweet_id
  where c.user_id = v_uid and v.stock_qty is not null and v.stock_qty < c.quantity
  limit 1;
  if v_short is not null then
    raise exception 'Only limited stock left for %', v_short using errcode = '22023';
  end if;

  select coalesce(sum(v.price * c.quantity), 0) into v_subtotal
  from public.cart_items c
  join public.sweet_variants v on v.id = c.variant_id and v.sweet_id = c.sweet_id
  where c.user_id = v_uid;

  if v_subtotal = 0 then
    raise exception 'Your cart is empty' using errcode = '22023';
  end if;

  insert into public.orders (user_id, fulfilment, payment_method, address, delivery_slot,
                             gift_message, subtotal, discount, total)
  values (v_uid, p_fulfilment, p_payment_method,
          case when p_fulfilment = 'delivery' then p_address end,
          p_delivery_slot, nullif(left(trim(p_gift_message), 300), ''),
          v_subtotal, 0, v_subtotal)
  returning * into v_order;

  insert into public.order_items (order_id, sweet_id, variant_id, quantity, price)
  select v_order.id, c.sweet_id, c.variant_id, c.quantity, v.price
  from public.cart_items c
  join public.sweet_variants v on v.id = c.variant_id
  where c.user_id = v_uid;

  update public.sweets s
  set popularity = s.popularity + agg.q
  from (select sweet_id, sum(quantity) as q from public.cart_items
        where user_id = v_uid group by sweet_id) agg
  where s.id = agg.sweet_id;

  update public.sweet_variants v
  set stock_qty = v.stock_qty - c.quantity
  from public.cart_items c
  where c.user_id = v_uid and c.variant_id = v.id and v.stock_qty is not null;

  delete from public.cart_items where user_id = v_uid;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------
-- merge_guest_cart: called right after login with the localStorage cart.
-- p_items: [{"variant_id": 12, "quantity": 2}, ...]
-- ---------------------------------------------------------------------
create or replace function public.merge_guest_cart(p_items jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.cart_items (user_id, sweet_id, variant_id, quantity)
  select (select auth.uid()), v.id, v.id_variant, least(greatest(i.quantity, 1), 99)
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(variant_id bigint, quantity int)
  join lateral (
    select sv.sweet_id as id, sv.id as id_variant
    from public.sweet_variants sv where sv.id = i.variant_id
  ) v on true
  on conflict (user_id, variant_id)
  do update set quantity = least(public.cart_items.quantity + excluded.quantity, 99);
$$;

-- ---------------------------------------------------------------------
-- admin_stats: simple dashboard numbers (admins only).
-- ---------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'orders_today', (select count(*) from public.orders where created_at::date = current_date),
    'revenue_today', (select coalesce(sum(total), 0) from public.orders
                      where created_at::date = current_date and status <> 'cancelled'),
    'top_sweets', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select s.id, s.name, sum(oi.quantity) as qty
        from public.order_items oi join public.sweets s on s.id = oi.sweet_id
        group by s.id, s.name order by qty desc limit 5) t),
    'low_stock', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select s.id, s.name, v.id as variant_id, v.weight_label, v.stock_qty
        from public.sweet_variants v join public.sweets s on s.id = v.sweet_id
        where v.stock_qty is not null and v.stock_qty <= 5
        order by v.stock_qty, s.name limit 20) t),
    'most_added', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select s.id, s.name, count(*) as adds
        from public.events e join public.sweets s on s.id = e.sweet_id
        where e.action = 'add_to_cart'
        group by s.id, s.name order by adds desc limit 5) t)
  );
end;
$$;


-- ---------------------------------------------------------------------
-- Admin: users and their choices
-- ---------------------------------------------------------------------
create or replace function public.admin_list_users(p_search text default null)
returns table (
  id uuid, email text, name text, phone text, taste_profile jsonb, is_admin boolean,
  created_at timestamptz, order_count bigint, total_spent numeric, favorite_count bigint,
  last_order_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
  select p.id, u.email::text, p.name, p.phone, p.taste_profile, p.is_admin, p.created_at,
         (select count(*) from public.orders o where o.user_id = p.id),
         (select coalesce(sum(o.total), 0) from public.orders o
           where o.user_id = p.id and o.status <> 'cancelled'),
         (select count(*) from public.favorites f where f.user_id = p.id),
         (select max(o.created_at) from public.orders o where o.user_id = p.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  where coalesce(p_search, '') = ''
     or p.name ilike '%' || p_search || '%'
     or u.email ilike '%' || p_search || '%'
  order by p.created_at desc
  limit 500;
end;
$$;

-- Edit a customer's taste profile and/or admin flag. An admin cannot
-- remove their own admin rights, so the shop is never locked out.
create or replace function public.admin_update_user(
  p_user_id       uuid,
  p_taste_profile jsonb   default null,
  p_is_admin      boolean default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and p_is_admin = false then
    raise exception 'You cannot remove your own admin access' using errcode = '22023';
  end if;
  update public.profiles
  set taste_profile = coalesce(p_taste_profile, taste_profile),
      is_admin      = coalesce(p_is_admin, is_admin)
  where id = p_user_id
  returning * into v_row;
  if v_row.id is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- What customers are choosing, shop-wide (admin "Choices" tab).
create or replace function public.admin_choice_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'quiz_done', (select count(*) from public.profiles
                  where coalesce((taste_profile ->> 'quiz_done')::boolean, false)),
    'avg_sweetness', (select round(avg((taste_profile ->> 'sweetness')::numeric), 1)
                      from public.profiles where taste_profile ? 'sweetness'),
    'categories', (select coalesce(jsonb_object_agg(c, n), '{}'::jsonb) from (
        select c, count(*) as n from public.profiles,
               jsonb_array_elements_text(coalesce(taste_profile -> 'categories', '[]'::jsonb)) as c
        group by c) t),
    'regions', (select coalesce(jsonb_object_agg(r, n), '{}'::jsonb) from (
        select r, count(*) as n from public.profiles,
               jsonb_array_elements_text(coalesce(taste_profile -> 'regions', '[]'::jsonb)) as r
        group by r) t),
    'diet', jsonb_build_object(
        'sugar_free',  (select count(*) from public.profiles where coalesce((taste_profile #>> '{diet,sugar_free}')::boolean, false)),
        'vegan',       (select count(*) from public.profiles where coalesce((taste_profile #>> '{diet,vegan}')::boolean, false)),
        'jain',        (select count(*) from public.profiles where coalesce((taste_profile #>> '{diet,jain}')::boolean, false)),
        'gluten_free', (select count(*) from public.profiles where coalesce((taste_profile #>> '{diet,gluten_free}')::boolean, false))),
    'top_favorites', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select s.id, s.name, count(*) as n
        from public.favorites f join public.sweets s on s.id = f.sweet_id
        group by s.id, s.name order by n desc limit 10) t)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Admin: CSV import. The browser parses the CSV and sends rows as JSON.
--
-- p_mode = 'catalog': each row is a sweet, upserted by slug. Variants come
--   as "label:price:stock|label:price:stock" in the `variants` column
--   (stock blank = untracked). List columns use "|" as the separator.
-- p_mode = 'stock': each row is {slug, weight_label, stock_qty[, price]}
--   and only updates that variant's stock (and price if given).
-- Each row runs in its own savepoint: bad rows are reported, good rows stay.
-- ---------------------------------------------------------------------
create or replace function public.admin_import_sweets(p_rows jsonb, p_mode text default 'catalog')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r          jsonb;
  i          int := 0;
  v_id       bigint;
  v_inserted int := 0;
  v_updated  int := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_part     text;
  v_bits     text[];
  v_label    text;
  v_grams    int;
  v_existed  boolean;
  v_count    int;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Expected an array of rows' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'Import at most 2000 rows at a time' using errcode = '22023';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      if p_mode = 'stock' then
        update public.sweet_variants v
        set stock_qty = nullif(trim(r ->> 'stock_qty'), '')::int,
            price     = coalesce(nullif(trim(r ->> 'price'), '')::numeric, v.price)
        from public.sweets s
        where s.id = v.sweet_id
          and s.slug = lower(trim(r ->> 'slug'))
          and lower(v.weight_label) = lower(trim(r ->> 'weight_label'));
        get diagnostics v_count = row_count;
        if v_count = 0 then
          raise exception 'No variant "%" for sweet "%"', r ->> 'weight_label', r ->> 'slug';
        end if;
        v_updated := v_updated + 1;

      elsif p_mode = 'catalog' then
        if coalesce(trim(r ->> 'slug'), '') = '' or coalesce(trim(r ->> 'name'), '') = '' then
          raise exception 'slug and name are required';
        end if;
        select exists (select 1 from public.sweets where slug = lower(trim(r ->> 'slug')))
          into v_existed;

        insert into public.sweets as s (
          slug, name, name_hi, description, origin_story, region, country, category, base,
          ingredients, sweetness, richness, texture, tags, occasions,
          is_sugar_free, is_vegan, is_jain, is_eggless, is_gluten_free, allergens,
          price_unit, base_price, is_new, is_festive, in_stock, image_url, image_credit)
        values (
          lower(trim(r ->> 'slug')),
          trim(r ->> 'name'),
          nullif(trim(r ->> 'name_hi'), ''),
          nullif(trim(r ->> 'description'), ''),
          nullif(trim(r ->> 'origin_story'), ''),
          coalesce(nullif(trim(r ->> 'region'), ''), 'India'),
          coalesce(nullif(trim(r ->> 'country'), ''), 'India'),
          coalesce(nullif(trim(r ->> 'category'), ''), 'milk-based'),
          coalesce(nullif(trim(r ->> 'base'), ''), 'milk'),
          coalesce(string_to_array(nullif(trim(r ->> 'ingredients'), ''), '|'), '{}'),
          coalesce(nullif(trim(r ->> 'sweetness'), '')::smallint, 3),
          coalesce(nullif(trim(r ->> 'richness'), '')::smallint, 3),
          nullif(trim(r ->> 'texture'), ''),
          coalesce(string_to_array(nullif(trim(r ->> 'tags'), ''), '|'), '{}'),
          coalesce(string_to_array(nullif(trim(r ->> 'occasions'), ''), '|'), '{}'),
          coalesce(nullif(trim(r ->> 'is_sugar_free'), '')::boolean, false),
          coalesce(nullif(trim(r ->> 'is_vegan'), '')::boolean, false),
          coalesce(nullif(trim(r ->> 'is_jain'), '')::boolean, false),
          coalesce(nullif(trim(r ->> 'is_eggless'), '')::boolean, true),
          coalesce(nullif(trim(r ->> 'is_gluten_free'), '')::boolean, false),
          coalesce(string_to_array(nullif(trim(r ->> 'allergens'), ''), '|'), '{}'),
          coalesce(nullif(trim(r ->> 'price_unit'), ''), '250g'),
          coalesce(nullif(trim(r ->> 'base_price'), '')::numeric, 0),
          coalesce(nullif(trim(r ->> 'is_new'), '')::boolean, false),
          coalesce(nullif(trim(r ->> 'is_festive'), '')::boolean, false),
          coalesce(nullif(trim(r ->> 'in_stock'), '')::boolean, true),
          nullif(trim(r ->> 'image_url'), ''),
          nullif(trim(r ->> 'image_credit'), ''))
        on conflict (slug) do update set
          name = excluded.name,
          name_hi = coalesce(excluded.name_hi, s.name_hi),
          description = coalesce(excluded.description, s.description),
          origin_story = coalesce(excluded.origin_story, s.origin_story),
          region = excluded.region, country = excluded.country,
          category = excluded.category, base = excluded.base,
          ingredients = excluded.ingredients, sweetness = excluded.sweetness,
          richness = excluded.richness, texture = coalesce(excluded.texture, s.texture),
          tags = excluded.tags, occasions = excluded.occasions,
          is_sugar_free = excluded.is_sugar_free, is_vegan = excluded.is_vegan,
          is_jain = excluded.is_jain, is_eggless = excluded.is_eggless,
          is_gluten_free = excluded.is_gluten_free, allergens = excluded.allergens,
          price_unit = excluded.price_unit, base_price = excluded.base_price,
          is_new = excluded.is_new, is_festive = excluded.is_festive,
          in_stock = excluded.in_stock,
          image_url = coalesce(excluded.image_url, s.image_url),
          image_credit = coalesce(excluded.image_credit, s.image_credit)
        returning s.id into v_id;

        -- Variants: "250g:180:40|500g:350:|1kg:680:10"
        if coalesce(trim(r ->> 'variants'), '') <> '' then
          foreach v_part in array string_to_array(r ->> 'variants', '|') loop
            v_bits := string_to_array(trim(v_part), ':');
            if coalesce(array_length(v_bits, 1), 0) < 2 then
              raise exception 'Bad variant "%" (use label:price:stock)', v_part;
            end if;
            v_label := trim(v_bits[1]);
            v_grams := case
              when lower(v_label) ~ '^\d+(\.\d+)?\s*kg$'
                then (substring(lower(v_label) from '^(\d+(?:\.\d+)?)')::numeric * 1000)::int
              when lower(v_label) ~ '^\d+\s*g$'
                then substring(lower(v_label) from '^(\d+)')::int
              else null end;
            insert into public.sweet_variants as sv (sweet_id, weight_label, grams, price, stock_qty, sort_order)
            values (
              v_id, v_label, v_grams,
              trim(v_bits[2])::numeric,
              nullif(trim(coalesce(v_bits[3], '')), '')::int,
              (select coalesce(max(x.sort_order), -1) + 1 from public.sweet_variants x where x.sweet_id = v_id))
            on conflict (sweet_id, weight_label) do update set
              price = excluded.price, stock_qty = excluded.stock_qty, grams = excluded.grams;
          end loop;
        end if;

        if v_existed then v_updated := v_updated + 1; else v_inserted := v_inserted + 1; end if;
      else
        raise exception 'Unknown import mode %', p_mode;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', i, 'slug', r ->> 'slug', 'message', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'errors', v_errors);
end;
$$;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke execute on function public.place_order(text, text, jsonb, text, text) from public, anon;
revoke execute on function public.merge_guest_cart(jsonb)                   from public, anon;
revoke execute on function public.admin_stats()                             from public, anon;
revoke execute on function public.handle_new_user()                         from public, anon, authenticated;
revoke execute on function public.sync_sweet_stock()                        from public, anon, authenticated;
revoke execute on function public.admin_list_users(text)                    from public, anon;
revoke execute on function public.admin_update_user(uuid, jsonb, boolean)   from public, anon;
revoke execute on function public.admin_choice_stats()                      from public, anon;
revoke execute on function public.admin_import_sweets(jsonb, text)          from public, anon;
grant  execute on function public.admin_list_users(text)                    to authenticated;
grant  execute on function public.admin_update_user(uuid, jsonb, boolean)   to authenticated;
grant  execute on function public.admin_choice_stats()                      to authenticated;
grant  execute on function public.admin_import_sweets(jsonb, text)          to authenticated;
grant  execute on function public.place_order(text, text, jsonb, text, text) to authenticated;
grant  execute on function public.merge_guest_cart(jsonb)                   to authenticated;
grant  execute on function public.admin_stats()                             to authenticated;
grant  execute on function public.recommend_for_user(int, text, bigint[])   to anon, authenticated;
grant  execute on function public.upsell_for_cart(int, bigint[])            to anon, authenticated;
grant  execute on function public.bought_together(bigint, int)              to anon, authenticated;
grant  execute on function public.customers_also_bought(bigint, int)        to anon, authenticated;


-- =====================================================================
-- Swaad Sujhav — feature additions (part of schema.sql;
-- later definitions replace the earlier ones above). Final versions.
--   • Mix & Save, free taste, honest social proof
--   • Custom gift boxes (server-priced)
--   • ML engine access (token-protected, no service-role key needed)
--   • Realtime order tracking
-- =====================================================================

-- ---------------------------------------------------------------- Mix & Save
create or replace function public.mix_save_rules()
returns jsonb language sql immutable set search_path = '' as $$
  select '{"tiers":[{"distinct":3,"percent":5},{"distinct":5,"percent":10}],
           "gift_box_threshold":999, "free_sample_min_distinct":3}'::jsonb;
$$;

create or replace function public.mix_save_percent(p_distinct int)
returns int language sql immutable set search_path = '' as $$
  select coalesce(max((t ->> 'percent')::int), 0)
  from jsonb_array_elements(public.mix_save_rules() -> 'tiers') t
  where p_distinct >= (t ->> 'distinct')::int;
$$;

alter table public.orders add column if not exists free_sample_sweet_id bigint references public.sweets (id);
create index if not exists orders_free_sample_idx on public.orders (free_sample_sweet_id);

-- Real orders that included each sweet in the last N days (aggregates only).
create or replace function public.sweet_order_counts(p_days int default 7)
returns table (sweet_id bigint, orders bigint)
language sql stable security definer set search_path = '' as $$
  select oi.sweet_id, count(distinct oi.order_id)
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.created_at > now() - make_interval(days => least(greatest(p_days, 1), 90)) and o.status <> 'cancelled'
  group by oi.sweet_id;
$$;

-- ---------------------------------------------------------------- Gift boxes
create or replace function public.piece_price(p_sweet_id bigint)
returns numeric language sql stable set search_path = '' as $$
  select coalesce(
    (select v.price from public.sweet_variants v where v.sweet_id = p_sweet_id and v.weight_label = '1 pc'),
    (select ceil(v.price / 12.0) from public.sweet_variants v where v.sweet_id = p_sweet_id and v.weight_label = '250g'),
    (select ceil(min(v.price) / 6.0) from public.sweet_variants v where v.sweet_id = p_sweet_id));
$$;

create or replace function public.gift_box_fee(p_size int)
returns numeric language sql immutable set search_path = '' as $$
  select case p_size when 4 then 49 when 9 then 79 when 16 then 119 end::numeric;
$$;

create or replace function public.gift_box_price(p_size int, p_items bigint[])
returns numeric language sql stable set search_path = '' as $$
  select public.gift_box_fee(p_size) + coalesce(sum(public.piece_price(i)), 0) from unnest(p_items) as i;
$$;

create table if not exists public.cart_gift_boxes (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  size        int not null check (size in (4, 9, 16)),
  ribbon      text not null default 'gold' check (ribbon in ('gold','rani','maroon','pista')),
  message     text check (char_length(message) <= 200),
  items       bigint[] not null,
  created_at  timestamptz not null default now(),
  check (cardinality(items) = size)
);
create index if not exists cart_gift_boxes_user_idx on public.cart_gift_boxes (user_id);
alter table public.cart_gift_boxes enable row level security;
drop policy if exists "cart_gift_boxes: own rows" on public.cart_gift_boxes;
create policy "cart_gift_boxes: own rows" on public.cart_gift_boxes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.order_gift_boxes (
  id        bigint generated always as identity primary key,
  order_id  uuid not null references public.orders (id) on delete cascade,
  size      int not null,
  ribbon    text not null,
  message   text,
  items     bigint[] not null,
  price     numeric(10,2) not null
);
create index if not exists order_gift_boxes_order_idx on public.order_gift_boxes (order_id);
alter table public.order_gift_boxes enable row level security;
drop policy if exists "order_gift_boxes: read own" on public.order_gift_boxes;
create policy "order_gift_boxes: read own" on public.order_gift_boxes for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_gift_boxes.order_id
                 and (o.user_id = (select auth.uid()) or (select public.is_admin()))));

create or replace function public.merge_guest_gift_boxes(p_boxes jsonb)
returns void language sql security invoker set search_path = '' as $$
  insert into public.cart_gift_boxes (user_id, size, ribbon, message, items)
  select (select auth.uid()), b.size, coalesce(b.ribbon, 'gold'), left(b.message, 200), b.items
  from jsonb_to_recordset(coalesce(p_boxes, '[]'::jsonb)) as b(size int, ribbon text, message text, items bigint[])
  where b.size in (4, 9, 16) and cardinality(b.items) = b.size;
$$;

-- ---------------------------------------------------------------- place_order (final)
-- Regular lines + gift boxes, stock checks, Mix & Save discount and a free taste.
create or replace function public.place_order(
  p_payment_method text,
  p_fulfilment     text  default 'delivery',
  p_address        jsonb default null,
  p_delivery_slot  text  default null,
  p_gift_message   text  default null
)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_lines numeric(10,2); v_boxes numeric(10,2); v_subtotal numeric(10,2);
  v_distinct int; v_pct int; v_discount numeric(10,2); v_sample bigint; v_short text; v_order public.orders;
begin
  if v_uid is null then raise exception 'Please log in to place an order' using errcode = '28000'; end if;
  if p_payment_method not in ('cod', 'pay_at_shop') then raise exception 'Unsupported payment method' using errcode = '22023'; end if;
  if p_fulfilment not in ('delivery', 'pickup') then raise exception 'Unsupported fulfilment' using errcode = '22023'; end if;
  if p_fulfilment = 'delivery' and (p_address is null or coalesce(p_address ->> 'line1', '') = '') then
    raise exception 'Delivery address is required' using errcode = '22023';
  end if;

  perform 1 from public.cart_items where user_id = v_uid for update;
  perform 1 from public.cart_gift_boxes where user_id = v_uid for update;

  if exists (select 1 from public.cart_items c join public.sweets s on s.id = c.sweet_id where c.user_id = v_uid and not s.in_stock)
     or exists (select 1 from public.cart_gift_boxes b, unnest(b.items) i join public.sweets s on s.id = i where b.user_id = v_uid and not s.in_stock) then
    raise exception 'Some items in your cart are out of stock' using errcode = '22023';
  end if;

  perform 1 from public.sweet_variants v where v.id in (select c.variant_id from public.cart_items c where c.user_id = v_uid) for update;
  select s.name || ' (' || v.weight_label || ')' into v_short
  from public.cart_items c join public.sweet_variants v on v.id = c.variant_id join public.sweets s on s.id = c.sweet_id
  where c.user_id = v_uid and v.stock_qty is not null and v.stock_qty < c.quantity limit 1;
  if v_short is not null then raise exception 'Only limited stock left for %', v_short using errcode = '22023'; end if;

  select coalesce(sum(v.price * c.quantity), 0) into v_lines
  from public.cart_items c join public.sweet_variants v on v.id = c.variant_id and v.sweet_id = c.sweet_id where c.user_id = v_uid;
  select coalesce(sum(public.gift_box_price(b.size, b.items)), 0) into v_boxes from public.cart_gift_boxes b where b.user_id = v_uid;
  v_subtotal := v_lines + v_boxes;
  if v_subtotal = 0 then raise exception 'Your cart is empty' using errcode = '22023'; end if;

  select count(distinct x) into v_distinct from (
    select c.sweet_id as x from public.cart_items c where c.user_id = v_uid
    union select unnest(b.items) from public.cart_gift_boxes b where b.user_id = v_uid) d;
  v_pct := public.mix_save_percent(v_distinct);
  v_discount := round(v_subtotal * v_pct / 100.0, 0);

  if v_distinct >= (public.mix_save_rules() ->> 'free_sample_min_distinct')::int then
    select s.id into v_sample from public.sweets s
    where s.is_new and s.in_stock and s.id not in (select c.sweet_id from public.cart_items c where c.user_id = v_uid)
    order by s.popularity desc, s.id limit 1;
  end if;

  insert into public.orders (user_id, fulfilment, payment_method, address, delivery_slot, gift_message, subtotal, discount, total, free_sample_sweet_id)
  values (v_uid, p_fulfilment, p_payment_method, case when p_fulfilment = 'delivery' then p_address end,
          p_delivery_slot, nullif(left(trim(p_gift_message), 300), ''), v_subtotal, v_discount, v_subtotal - v_discount, v_sample)
  returning * into v_order;

  insert into public.order_items (order_id, sweet_id, variant_id, quantity, price)
  select v_order.id, c.sweet_id, c.variant_id, c.quantity, v.price
  from public.cart_items c join public.sweet_variants v on v.id = c.variant_id where c.user_id = v_uid;

  insert into public.order_gift_boxes (order_id, size, ribbon, message, items, price)
  select v_order.id, b.size, b.ribbon, b.message, b.items, public.gift_box_price(b.size, b.items)
  from public.cart_gift_boxes b where b.user_id = v_uid;

  update public.sweets s set popularity = s.popularity + agg.q
  from (select x as sweet_id, count(*) as q from (
          select c.sweet_id as x from public.cart_items c, generate_series(1, c.quantity) where c.user_id = v_uid
          union all select unnest(b.items) from public.cart_gift_boxes b where b.user_id = v_uid) t group by x) agg
  where s.id = agg.sweet_id;

  update public.sweet_variants v set stock_qty = v.stock_qty - c.quantity
  from public.cart_items c where c.user_id = v_uid and c.variant_id = v.id and v.stock_qty is not null;

  delete from public.cart_items where user_id = v_uid;
  delete from public.cart_gift_boxes where user_id = v_uid;
  return v_order;
end;
$$;

-- ---------------------------------------------------------------- ML engine access
-- The Python engine authenticates with ML_TOKEN (backend/.env). Only its SHA-256
-- hash is stored, in a schema the Data API does not expose. To (re)set it:
--   insert into private.app_secrets (name, sha256_hex)
--   values ('ml_token', encode(extensions.digest('<your ML_TOKEN>', 'sha256'), 'hex'))
--   on conflict (name) do update set sha256_hex = excluded.sha256_hex, updated_at = now();
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.app_secrets (
  name text primary key, sha256_hex text not null, updated_at timestamptz not null default now());
revoke all on private.app_secrets from public, anon, authenticated;

create or replace function private.check_ml_token(p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.app_secrets where name = 'ml_token'
                 and sha256_hex = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'));
$$;

create or replace function public.ml_training_data(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.check_ml_token(p_token) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'sweets', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description, 'origin', s.origin_story,
        'region', s.region, 'country', s.country, 'category', s.category, 'base', s.base,
        'ingredients', s.ingredients, 'sweetness', s.sweetness, 'richness', s.richness,
        'texture', s.texture, 'tags', s.tags, 'occasions', s.occasions,
        'is_sugar_free', s.is_sugar_free, 'is_vegan', s.is_vegan, 'is_jain', s.is_jain,
        'is_eggless', s.is_eggless, 'is_gluten_free', s.is_gluten_free,
        'is_new', s.is_new, 'is_festive', s.is_festive, 'in_stock', s.in_stock,
        'popularity', s.popularity, 'min_price', (select min(v.price) from public.sweet_variants v where v.sweet_id = s.id),
        'created_at', s.created_at)), '[]'::jsonb) from public.sweets s),
    'baskets', (select coalesce(jsonb_agg(jsonb_build_object('order_id', b.order_id, 'user_id', b.user_id, 'items', b.items)), '[]'::jsonb)
                from (select o.id as order_id, o.user_id, jsonb_agg(distinct oi.sweet_id) as items
                      from public.orders o join public.order_items oi on oi.order_id = o.id
                      where o.status <> 'cancelled' group by o.id, o.user_id) b),
    'favorites', (select coalesce(jsonb_agg(jsonb_build_object('user_id', f.user_id, 'sweet_id', f.sweet_id)), '[]'::jsonb) from public.favorites f),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('user_id', e.user_id, 'sweet_id', e.sweet_id, 'action', e.action)), '[]'::jsonb)
               from public.events e where e.sweet_id is not null and e.created_at > now() - interval '120 days'),
    'profiles', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'taste', p.taste_profile)), '[]'::jsonb) from public.profiles p));
end;
$$;

create or replace function public.ml_store_results(
  p_token text, p_similar jsonb, p_user_recos jsonb,
  p_embeddings jsonb default '[]'::jsonb, p_metrics jsonb default '{}'::jsonb, p_trigger text default 'schedule')
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_run bigint;
begin
  if not private.check_ml_token(p_token) then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.ml_runs (status, trigger, metrics) values ('running', p_trigger, coalesce(p_metrics, '{}'::jsonb)) returning id into v_run;
  -- Explicit WHERE: the Data API rejects unqualified DELETEs.
  delete from public.sweet_similar where sweet_id is not null;
  insert into public.sweet_similar (sweet_id, similar_id, kind, score)
  select x.sweet_id, x.similar_id, x.kind, x.score
  from jsonb_to_recordset(coalesce(p_similar, '[]'::jsonb)) as x(sweet_id bigint, similar_id bigint, kind text, score real)
  join public.sweets a on a.id = x.sweet_id join public.sweets b on b.id = x.similar_id
  on conflict do nothing;
  delete from public.user_recos where user_id is not null;
  insert into public.user_recos (user_id, sweet_id, score, reason, reason_kind, model_run)
  select x.user_id, x.sweet_id, x.score, x.reason, x.reason_kind, v_run
  from jsonb_to_recordset(coalesce(p_user_recos, '[]'::jsonb)) as x(user_id uuid, sweet_id bigint, score real, reason text, reason_kind text)
  join public.profiles p on p.id = x.user_id join public.sweets s on s.id = x.sweet_id
  on conflict do nothing;
  if jsonb_array_length(coalesce(p_embeddings, '[]'::jsonb)) > 0 then
    insert into public.sweet_embeddings (sweet_id, embedding, model, updated_at)
    select x.sweet_id, x.embedding::extensions.vector, x.model, now()
    from jsonb_to_recordset(p_embeddings) as x(sweet_id bigint, embedding text, model text)
    join public.sweets s on s.id = x.sweet_id
    on conflict (sweet_id) do update set embedding = excluded.embedding, model = excluded.model, updated_at = now();
  end if;
  update public.ml_runs set status = 'ok', finished_at = now() where id = v_run;
  return v_run;
end;
$$;

-- ---------------------------------------------------------------- privileges & realtime
grant execute on function public.mix_save_rules() to anon, authenticated;
grant execute on function public.mix_save_percent(int) to anon, authenticated;
grant execute on function public.sweet_order_counts(int) to anon, authenticated;
grant execute on function public.gift_box_price(int, bigint[]) to anon, authenticated;
grant execute on function public.piece_price(bigint) to anon, authenticated;
revoke execute on function public.merge_guest_gift_boxes(jsonb) from public, anon;
grant execute on function public.merge_guest_gift_boxes(jsonb) to authenticated;
revoke execute on function public.ml_training_data(text) from public;
revoke execute on function public.ml_store_results(text, jsonb, jsonb, jsonb, jsonb, text) from public;
grant execute on function public.ml_training_data(text) to anon, authenticated;            -- token-checked inside
grant execute on function public.ml_store_results(text, jsonb, jsonb, jsonb, jsonb, text) to anon, authenticated;
revoke execute on function private.check_ml_token(text) from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
