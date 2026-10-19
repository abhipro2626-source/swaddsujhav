-- =====================================================================
-- Swaad Sujhaav · Feature Pack 2 · migration 002
-- Part A: owner settings, new columns and every new table (+ RLS).
-- Idempotent: safe to run again.
-- =====================================================================

-- ---------------------------------------------------------------- owner settings
-- Every number and rule the new features use lives here, editable in Admin → Settings.
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  label       text not null default '',
  description text not null default '',
  updated_at  timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists "app_settings: public read" on public.app_settings;
create policy "app_settings: public read" on public.app_settings for select to anon, authenticated using (true);
drop policy if exists "app_settings: admin write" on public.app_settings;
create policy "app_settings: admin write" on public.app_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

insert into public.app_settings (key, value, label, description) values
  ('shop', '{"name":"Swaad Sujhaav","city":"Muzaffarnagar","lat":29.4727,"lon":77.7085,"timezone":"Asia/Kolkata","open":"09:00","close":"22:00"}',
   'Shop', 'City and coordinates (weather), opening and closing time.'),
  ('deals', '{"window_minutes":90,"preview_minutes":30,"steps":[10,20,30],"max_percent":30,"min_stock_kg":1,"max_shelf_days":2,"categories":["bengali","syrup-soaked","milk-based","fried","halwa"]}',
   'Last-hour deals', 'Deal window before closing, discount steps as closing approaches, the cap, minimum stock and which categories may be discounted.'),
  ('scratch', '{"start":"2026-10-10","end":"2026-11-20","daily_budget":3000,"coupon_days":30}',
   'Deepawali scratch card', 'Festival window for scratch cards, daily prize budget (₹) and how long won coupons stay valid.'),
  ('freshness', '{"fresh_hours":24}', 'Aaj ka Taaza', 'A batch counts as "fresh" for this many hours.'),
  ('reco_weights', '{"taste":0.35,"together":0.20,"popularity":0.10,"new":0.10,"occasion":0.08,"freshness":0.07,"context":0.06,"deal":0.04}',
   'Recommendation weights', 'score = Σ weight × signal. Keep the sum at 1.'),
  ('alerts', '{"max_per_day":3,"reserve_max_grams":500,"reserve_minutes":30}',
   'Garam Jalebi Alert', 'Max alerts per customer per day, how much one person can reserve and for how long.'),
  ('prediction', '{"safety_buffer_kg":0.5,"history_weeks":8}', 'Demand prediction', 'Extra kg to make on top of the prediction, and weeks of history used.'),
  ('combos', '{"jodi_discount_percent":8}', 'Mithai + Namkeen', 'Default discount for ready-made Jodi Boxes.'),
  ('preorder', '{"default_cutoff_hours":12}', 'Festival pre-orders', 'Default booking cutoff before a slot starts.'),
  ('demo', '{"context":null,"deal_window":false}', 'Demo switches', 'For judges: force a weather mode (cold / hot / rainy) or open the last-hour deal window now.')
on conflict (key) do nothing;

-- Read one setting (used by every function below).
create or replace function public.setting(p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.app_settings where key = p_key;
$$;

-- Recommendation weights now come from settings (one place, owner-editable).
create or replace function public.reco_weights()
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(public.setting('reco_weights'),
    '{"taste":0.35,"together":0.20,"popularity":0.10,"new":0.10,"occasion":0.08,"freshness":0.07,"context":0.06,"deal":0.04}'::jsonb);
$$;

-- Shop-local "now" helpers.
create or replace function public.shop_tz()
returns text language sql stable set search_path = '' as $$
  select coalesce(public.setting('shop') ->> 'timezone', 'Asia/Kolkata');
$$;
create or replace function public.shop_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone public.shop_tz())::date;
$$;

-- ---------------------------------------------------------------- catalog additions
alter table public.sweets drop constraint if exists sweets_category_check;
alter table public.sweets add constraint sweets_category_check check (category in (
  'milk-based','dry-fruit','syrup-soaked','fried','halwa','laddoo','barfi','bengali','baked','world','steamed','brittle','namkeen'));

alter table public.sweets add column if not exists product_type    text not null default 'mithai';
alter table public.sweets drop constraint if exists sweets_product_type_check;
alter table public.sweets add constraint sweets_product_type_check check (product_type in ('mithai','namkeen'));
alter table public.sweets add column if not exists shelf_life_days smallint not null default 7;
alter table public.sweets add column if not exists aliases        text[] not null default '{}';
-- Describable traits (Bhooli Hui Mithai) and namkeen taste.
alter table public.sweets add column if not exists shape          text;          -- round, square, diamond, long, flat, spiral, cup, roll, irregular
alter table public.sweets add column if not exists colours        text[] not null default '{}';
alter table public.sweets add column if not exists served_temp    text;          -- warm, cold, room
alter table public.sweets add column if not exists key_flavours   text[] not null default '{}';
alter table public.sweets add column if not exists has_syrup      boolean not null default false;
alter table public.sweets add column if not exists has_filling    boolean not null default false;
alter table public.sweets add column if not exists is_fried       boolean not null default false;
alter table public.sweets add column if not exists spice_level    smallint not null default 0;   -- 0 mild … 3 very spicy (namkeen)
alter table public.sweets add column if not exists taste_tags     text[] not null default '{}';  -- spicy, tangy, crunchy, mild …
create index if not exists sweets_product_type_idx on public.sweets (product_type);
create index if not exists sweets_aliases_idx on public.sweets using gin (aliases);

-- ---------------------------------------------------------------- order additions
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in
  ('placed','packing','ready','out_for_delivery','delivered','cancelled'));
alter table public.orders add column if not exists order_type       text not null default 'regular';
alter table public.orders drop constraint if exists orders_order_type_check;
alter table public.orders add constraint orders_order_type_check check (order_type in ('regular','preorder','gift_plan'));
alter table public.orders add column if not exists scheduled_for    timestamptz;
alter table public.orders add column if not exists coupon_id        bigint;
alter table public.orders add column if not exists gift_plan_id     bigint;
alter table public.orders add column if not exists festival_id      bigint;
alter table public.orders add column if not exists preorder_slot_id bigint;
alter table public.orders add column if not exists deal_discount    numeric(10,2) not null default 0;
alter table public.orders add column if not exists combo_discount   numeric(10,2) not null default 0;
alter table public.orders add column if not exists mix_discount     numeric(10,2) not null default 0;
alter table public.orders add column if not exists coupon_discount  numeric(10,2) not null default 0;
alter table public.orders add column if not exists is_demo          boolean not null default false;
create index if not exists orders_type_sched_idx on public.orders (order_type, scheduled_for);
create index if not exists orders_created_idx on public.orders (created_at);
create index if not exists orders_coupon_idx on public.orders (coupon_id);
create index if not exists orders_gift_plan_idx on public.orders (gift_plan_id);
create index if not exists orders_festival_idx on public.orders (festival_id);
create index if not exists orders_slot_idx on public.orders (preorder_slot_id);
alter table public.order_items add column if not exists list_price numeric(10,2);   -- before any deal
alter table public.order_items add column if not exists is_free boolean not null default false;

-- ---------------------------------------------------------------- coupons & scratch cards
create table if not exists public.scratch_prizes (
  id            bigint generated always as identity primary key,
  label         text not null,
  kind          text not null check (kind in ('percent','flat','free_item','free_wrap','none')),
  value         numeric(10,2) not null default 0,     -- % for percent, ₹ for flat
  sweet_id      bigint references public.sweets (id) on delete set null,   -- free_item
  grams         int,                                  -- free_item size
  min_order     numeric(10,2) not null default 0,
  weight        int not null default 1 check (weight >= 0),
  cost_estimate numeric(10,2) not null default 0,     -- counted against the daily budget
  shayari       text,                                 -- consolation line for "none"
  active        boolean not null default true
);
create index if not exists scratch_prizes_sweet_idx on public.scratch_prizes (sweet_id);

create table if not exists public.coupons (
  id             bigint generated always as identity primary key,
  code           text not null unique,
  user_id        uuid not null references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('percent','flat','free_item','free_wrap')),
  value          numeric(10,2) not null default 0,
  sweet_id       bigint references public.sweets (id) on delete set null,
  grams          int,
  min_order      numeric(10,2) not null default 0,
  label          text not null,
  source         text not null default 'scratch',
  expires_at     timestamptz not null,
  used_at        timestamptz,
  used_order_id  uuid references public.orders (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists coupons_user_idx on public.coupons (user_id, used_at);
create index if not exists coupons_sweet_idx on public.coupons (sweet_id);
create index if not exists coupons_order_idx on public.coupons (used_order_id);

create table if not exists public.scratch_cards (
  id            bigint generated always as identity primary key,
  order_id      uuid not null unique references public.orders (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  prize_id      bigint references public.scratch_prizes (id) on delete set null,
  label         text not null,
  kind          text not null,
  cost_estimate numeric(10,2) not null default 0,
  coupon_id     bigint references public.coupons (id) on delete set null,
  expires_at    timestamptz not null,
  scratched_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists scratch_cards_user_idx on public.scratch_cards (user_id);
create index if not exists scratch_cards_prize_idx on public.scratch_cards (prize_id);
create index if not exists scratch_cards_coupon_idx on public.scratch_cards (coupon_id);
create index if not exists scratch_cards_created_idx on public.scratch_cards (created_at);

-- ---------------------------------------------------------------- combos
create table if not exists public.combo_rules (
  id               bigint generated always as identity primary key,
  mithai_id        bigint references public.sweets (id) on delete cascade,
  mithai_category  text,
  namkeen_id       bigint not null references public.sweets (id) on delete cascade,
  reason           text not null,
  weight           numeric(4,2) not null default 1,
  active           boolean not null default true,
  check (mithai_id is not null or mithai_category is not null)
);
create index if not exists combo_rules_mithai_idx on public.combo_rules (mithai_id);
create index if not exists combo_rules_namkeen_idx on public.combo_rules (namkeen_id);

create table if not exists public.jodi_boxes (
  id                bigint generated always as identity primary key,
  name              text not null,
  description       text not null default '',
  items             jsonb not null,               -- [{ "variant_id": 1, "qty": 1 }]
  discount_percent  numeric(4,1) not null default 8 check (discount_percent between 0 and 50),
  emoji             text not null default '🎁',
  active            boolean not null default true,
  sort_order        int not null default 0
);

-- ---------------------------------------------------------------- festivals & pre-orders
create table if not exists public.festivals (
  id                  bigint generated always as identity primary key,
  slug                text not null unique,
  name                text not null,
  name_hi             text,
  starts_on           date not null,
  lead_days           int not null default 14,
  cutoff_hours        int not null default 12,
  featured_tags       text[] not null default '{}',
  featured_categories text[] not null default '{}',
  demand_multiplier   numeric(4,2) not null default 1.3,
  accent              text not null default '#FFB800',
  emoji               text not null default '🪔',
  greeting            text not null default '',
  needs_confirmation  boolean not null default false,
  active              boolean not null default true
);
create index if not exists festivals_date_idx on public.festivals (starts_on);

create table if not exists public.festival_reminders (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  festival_id bigint not null references public.festivals (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, festival_id)
);
create index if not exists festival_reminders_festival_idx on public.festival_reminders (festival_id);

create table if not exists public.preorder_slots (
  id             bigint generated always as identity primary key,
  festival_id    bigint references public.festivals (id) on delete cascade,
  slot_date      date not null,
  start_time     time not null,
  end_time       time not null,
  max_orders     int not null default 20,
  max_kg         numeric(8,2) not null default 40,
  booked_orders  int not null default 0,
  booked_kg      numeric(8,2) not null default 0,
  unique (festival_id, slot_date, start_time)
);
create index if not exists preorder_slots_date_idx on public.preorder_slots (slot_date);
create index if not exists preorder_slots_festival_idx on public.preorder_slots (festival_id);

-- ---------------------------------------------------------------- fresh batches & hot alerts
create table if not exists public.batches (
  id           bigint generated always as identity primary key,
  sweet_id     bigint not null references public.sweets (id) on delete cascade,
  made_at      timestamptz not null default now(),
  quantity_kg  numeric(8,2) not null check (quantity_kg > 0),
  best_before  timestamptz not null,
  notes        text,
  source       text not null default 'manual' check (source in ('manual','hot','seed')),
  created_by   uuid default auth.uid() references auth.users (id) on delete set null
);
create index if not exists batches_sweet_idx on public.batches (sweet_id, made_at desc);
create index if not exists batches_made_idx on public.batches (made_at desc);
create index if not exists batches_creator_idx on public.batches (created_by);

create table if not exists public.hot_batches (
  id          bigint generated always as identity primary key,
  sweet_id    bigint not null references public.sweets (id) on delete cascade,
  ready_at    timestamptz not null,
  quantity_g  int not null check (quantity_g > 0),
  reserved_g  int not null default 0 check (reserved_g >= 0),
  notified    int not null default 0,
  opened      int not null default 0,
  batch_id    bigint references public.batches (id) on delete set null,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (reserved_g <= quantity_g)
);
create index if not exists hot_batches_ready_idx on public.hot_batches (ready_at desc);
create index if not exists hot_batches_sweet_idx on public.hot_batches (sweet_id);
create index if not exists hot_batches_batch_idx on public.hot_batches (batch_id);
create index if not exists hot_batches_creator_idx on public.hot_batches (created_by);

create table if not exists public.hot_reservations (
  id            bigint generated always as identity primary key,
  hot_batch_id  bigint not null references public.hot_batches (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  grams         int not null check (grams > 0),
  status        text not null default 'reserved' check (status in ('reserved','collected','expired','cancelled')),
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  unique (hot_batch_id, user_id)
);
create index if not exists hot_reservations_user_idx on public.hot_reservations (user_id);

create table if not exists public.alert_preferences (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled      boolean not null default true,
  sweet_ids    bigint[] not null default '{}',     -- empty = every hot item
  quiet_start  time not null default '22:00',
  quiet_end    time not null default '08:00',
  push         boolean not null default false,
  updated_at   timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.hot_alert_log (
  id            bigint generated always as identity primary key,
  hot_batch_id  bigint not null references public.hot_batches (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('shown','opened','pushed')),
  created_at    timestamptz not null default now(),
  unique (hot_batch_id, user_id, kind)
);
create index if not exists hot_alert_log_user_idx on public.hot_alert_log (user_id, created_at);

-- ---------------------------------------------------------------- weather & context
create table if not exists public.weather_cache (
  city        text primary key,
  data        jsonb not null,
  fetched_at  timestamptz not null default now()
);

create table if not exists public.context_rules (
  id            bigint generated always as identity primary key,
  condition     text not null,               -- weather=cold | time=morning | day=weekend | day=festival
  tags          text[] not null default '{}',
  categories    text[] not null default '{}',
  sweet_ids     bigint[] not null default '{}',
  boost         numeric(4,2) not null default 1,
  banner_title  text not null,
  paaji_line    text not null,
  icon          text not null default '✨',
  priority      int not null default 0,
  active        boolean not null default true
);

-- ---------------------------------------------------------------- last-hour deals (manual)
create table if not exists public.deals (
  id            bigint generated always as identity primary key,
  sweet_id      bigint not null references public.sweets (id) on delete cascade,
  percent       numeric(4,1) not null check (percent between 1 and 70),
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz not null,
  qty_limit_kg  numeric(8,2),
  sold_kg       numeric(8,2) not null default 0,
  active        boolean not null default true,
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists deals_sweet_idx on public.deals (sweet_id);
create index if not exists deals_time_idx on public.deals (starts_at, ends_at);
create index if not exists deals_creator_idx on public.deals (created_by);

-- ---------------------------------------------------------------- Rishtedaar Gift Planner
create table if not exists public.gift_plans (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null default 'Deepawali gifts',
  occasion     text not null default 'diwali',
  budget_mode  text not null default 'total' check (budget_mode in ('total','per_person')),
  budget       numeric(10,2) not null default 0 check (budget >= 0),
  sender_name  text,
  status       text not null default 'draft' check (status in ('draft','ordered')),
  order_id     uuid references public.orders (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists gift_plans_user_idx on public.gift_plans (user_id, updated_at desc);
create index if not exists gift_plans_order_idx on public.gift_plans (order_id);

create table if not exists public.gift_recipients (
  id            bigint generated always as identity primary key,
  plan_id       bigint not null references public.gift_plans (id) on delete cascade,
  name          text not null,
  relation      text not null default '',
  household     int not null default 2 check (household between 1 and 50),
  prefs         jsonb not null default '{}'::jsonb,   -- {sugar_free, no_nuts, jain, no_milk, loves_dry_fruit, loves_bengali, wants_namkeen, kids}
  importance    text not null default 'normal' check (importance in ('very','normal','token')),
  deliver_self  boolean not null default false,
  address       jsonb,
  deliver_on    date,
  message       text check (char_length(message) <= 200),
  sort_order    int not null default 0
);
create index if not exists gift_recipients_plan_idx on public.gift_recipients (plan_id);

create table if not exists public.gift_boxes (
  id            bigint generated always as identity primary key,
  plan_id       bigint not null references public.gift_plans (id) on delete cascade,
  recipient_id  bigint not null unique references public.gift_recipients (id) on delete cascade,
  size_label    text not null default '500g',
  price         numeric(10,2) not null default 0,
  reasons       text[] not null default '{}',
  shayari       text,
  status        text not null default 'planned' check (status in ('planned','packed','out_for_delivery','delivered'))
);
create index if not exists gift_boxes_plan_idx on public.gift_boxes (plan_id);

create table if not exists public.gift_box_items (
  id          bigint generated always as identity primary key,
  box_id      bigint not null references public.gift_boxes (id) on delete cascade,
  sweet_id    bigint not null references public.sweets (id) on delete cascade,
  variant_id  bigint not null references public.sweet_variants (id) on delete cascade,
  qty         int not null default 1 check (qty between 1 and 20),
  reason      text
);
create index if not exists gift_box_items_box_idx on public.gift_box_items (box_id);
create index if not exists gift_box_items_sweet_idx on public.gift_box_items (sweet_id);
create index if not exists gift_box_items_variant_idx on public.gift_box_items (variant_id);

create table if not exists public.saved_relatives (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  relation    text not null default '',
  household   int not null default 2,
  prefs       jsonb not null default '{}'::jsonb,
  importance  text not null default 'normal',
  address     jsonb,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------- Bhooli Hui Mithai
create table if not exists public.identify_logs (
  id           bigint generated always as identity primary key,
  user_id      uuid default auth.uid() references auth.users (id) on delete set null,
  description  text not null check (char_length(description) <= 500),
  chips        jsonb not null default '{}'::jsonb,
  top_ids      bigint[] not null default '{}',
  chosen_id    bigint references public.sweets (id) on delete set null,
  success      boolean,
  created_at   timestamptz not null default now()
);
create index if not exists identify_logs_user_idx on public.identify_logs (user_id);
create index if not exists identify_logs_chosen_idx on public.identify_logs (chosen_id);

create table if not exists public.sweet_requests (
  id           bigint generated always as identity primary key,
  user_id      uuid default auth.uid() references auth.users (id) on delete set null,
  description  text not null check (char_length(description) <= 500),
  contact      text check (char_length(contact) <= 80),
  status       text not null default 'new' check (status in ('new','found','closed')),
  created_at   timestamptz not null default now()
);
create index if not exists sweet_requests_user_idx on public.sweet_requests (user_id);

-- ---------------------------------------------------------------- waste tracker
create table if not exists public.waste_logs (
  id          bigint generated always as identity primary key,
  log_date    date not null default (now() at time zone 'Asia/Kolkata')::date,
  sweet_id    bigint references public.sweets (id) on delete set null,
  kg          numeric(8,2) not null check (kg >= 0),
  value       numeric(10,2) not null default 0,
  note        text,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists waste_logs_date_idx on public.waste_logs (log_date);
create index if not exists waste_logs_sweet_idx on public.waste_logs (sweet_id);
create index if not exists waste_logs_creator_idx on public.waste_logs (created_by);

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array['scratch_prizes','coupons','scratch_cards','combo_rules','jodi_boxes','festivals',
    'festival_reminders','preorder_slots','batches','hot_batches','hot_reservations','alert_preferences',
    'push_subscriptions','hot_alert_log','weather_cache','context_rules','deals','gift_plans','gift_recipients',
    'gift_boxes','gift_box_items','saved_relatives','identify_logs','sweet_requests','waste_logs'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  -- Catalog-like tables: everyone reads, only the owner writes.
  foreach t in array array['scratch_prizes','combo_rules','jodi_boxes','festivals','preorder_slots','batches',
    'hot_batches','weather_cache','context_rules','deals'] loop
    execute format('drop policy if exists "%s: public read" on public.%I', t, t);
    execute format('create policy "%s: public read" on public.%I for select to anon, authenticated using (true)', t, t);
    execute format('drop policy if exists "%s: admin write" on public.%I', t, t);
    execute format('create policy "%s: admin write" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t, t);
  end loop;
  -- Owner-only tables.
  foreach t in array array['waste_logs'] loop
    execute format('drop policy if exists "%s: admin all" on public.%I', t, t);
    execute format('create policy "%s: admin all" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t, t);
  end loop;
  -- Customer's own rows (owner can read everything).
  foreach t in array array['festival_reminders','alert_preferences','push_subscriptions','saved_relatives','gift_plans'] loop
    execute format('drop policy if exists "%s: own rows" on public.%I', t, t);
    execute format('create policy "%s: own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
    execute format('drop policy if exists "%s: admin read" on public.%I', t, t);
    execute format('create policy "%s: admin read" on public.%I for select to authenticated using ((select public.is_admin()))', t, t);
  end loop;
end $$;

-- Coupons: read your own; created and used only by functions.
drop policy if exists "coupons: read own" on public.coupons;
create policy "coupons: read own" on public.coupons for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
-- Scratch cards: no direct read for customers (the prize stays hidden until scratched, via RPC).
drop policy if exists "scratch_cards: admin read" on public.scratch_cards;
create policy "scratch_cards: admin read" on public.scratch_cards for select to authenticated using ((select public.is_admin()));
-- Hot reservations: read own; created only via reserve_hot_batch().
drop policy if exists "hot_reservations: read own" on public.hot_reservations;
create policy "hot_reservations: read own" on public.hot_reservations for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "hot_reservations: admin update" on public.hot_reservations;
create policy "hot_reservations: admin update" on public.hot_reservations for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Alert log: customers write their own "shown/opened" rows; owner reads all.
drop policy if exists "hot_alert_log: insert own" on public.hot_alert_log;
create policy "hot_alert_log: insert own" on public.hot_alert_log for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "hot_alert_log: read" on public.hot_alert_log;
create policy "hot_alert_log: read" on public.hot_alert_log for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
-- Gift plan children follow the plan's owner.
drop policy if exists "gift_recipients: via plan" on public.gift_recipients;
create policy "gift_recipients: via plan" on public.gift_recipients for all to authenticated
  using (exists (select 1 from public.gift_plans p where p.id = plan_id and (p.user_id = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from public.gift_plans p where p.id = plan_id and p.user_id = (select auth.uid()) and p.status = 'draft'));
drop policy if exists "gift_boxes: via plan" on public.gift_boxes;
create policy "gift_boxes: via plan" on public.gift_boxes for all to authenticated
  using (exists (select 1 from public.gift_plans p where p.id = plan_id and (p.user_id = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from public.gift_plans p where p.id = plan_id and ((p.user_id = (select auth.uid()) and p.status = 'draft') or (select public.is_admin()))));
drop policy if exists "gift_box_items: via plan" on public.gift_box_items;
create policy "gift_box_items: via plan" on public.gift_box_items for all to authenticated
  using (exists (select 1 from public.gift_boxes b join public.gift_plans p on p.id = b.plan_id
                 where b.id = box_id and (p.user_id = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from public.gift_boxes b join public.gift_plans p on p.id = b.plan_id
                 where b.id = box_id and p.user_id = (select auth.uid()) and p.status = 'draft'));
-- Bhooli Hui Mithai logs & requests: anyone may write; only the owner reads.
drop policy if exists "identify_logs: admin read" on public.identify_logs;
create policy "identify_logs: admin read" on public.identify_logs for select to authenticated using ((select public.is_admin()));
drop policy if exists "sweet_requests: anyone insert" on public.sweet_requests;
create policy "sweet_requests: anyone insert" on public.sweet_requests for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
drop policy if exists "sweet_requests: admin all" on public.sweet_requests;
create policy "sweet_requests: admin all" on public.sweet_requests for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Customers may cancel their own pre-orders only through cancel_preorder().

-- ---------------------------------------------------------------- Realtime
do $$
declare t text;
begin
  foreach t in array array['batches','hot_batches','deals','sweet_variants','preorder_slots'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- =====================================================================
-- Part B: money. One pricing function (price_cart) is the single source of
-- truth for deals, Jodi combos, Mix & Save and coupons. place_order uses it,
-- books pre-order slots safely and hands out the Deepawali scratch card.
-- =====================================================================

-- Approximate weight of any variant (pieces/boxes have no grams column).
create or replace function public.variant_grams(p_label text, p_grams int)
returns int language sql immutable set search_path = '' as $$
  select coalesce(p_grams, case p_label when '1 pc' then 40 when 'box of 6' then 240 when 'box of 12' then 480 else 250 end);
$$;

-- Tracked shelf stock of a sweet in kg (NULL when no variant is tracked).
create or replace function public.stock_kg(p_sweet_id bigint)
returns numeric language sql stable set search_path = '' as $$
  select round(sum(v.stock_qty * public.variant_grams(v.weight_label, v.grams)) / 1000.0, 2)
  from public.sweet_variants v where v.sweet_id = p_sweet_id and v.stock_qty is not null;
$$;

-- ---------------------------------------------------------------- last-hour deal clock
create or replace function public.deal_clock()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s jsonb := public.setting('deals'); shop jsonb := public.setting('shop'); tz text := public.shop_tz();
  v_close timestamptz; v_start timestamptz; v_preview timestamptz; v_now timestamptz := now(); v_demo boolean;
begin
  v_close := (public.shop_today() + coalesce(shop ->> 'close', '22:00')::time) at time zone tz;
  v_start := v_close - make_interval(mins => coalesce((s ->> 'window_minutes')::int, 90));
  v_preview := v_start - make_interval(mins => coalesce((s ->> 'preview_minutes')::int, 30));
  v_demo := coalesce((public.setting('demo') ->> 'deal_window')::boolean, false);
  if v_demo then v_now := v_close - interval '50 minutes'; end if;      -- judges: open the window right now
  return jsonb_build_object(
    'now', v_now, 'close_at', case when v_demo then now() + interval '50 minutes' else v_close end,
    'window_start', v_start, 'preview_start', v_preview, 'demo', v_demo,
    'phase', case when v_now >= v_start and v_now < v_close then 'live'
                  when v_now >= v_preview and v_now < v_start then 'soon' else 'closed' end,
    'progress', greatest(0, least(1, extract(epoch from (v_now - v_start)) / nullif(extract(epoch from (v_close - v_start)), 0))));
end;
$$;

-- Live deals: automatic (short shelf life, enough stock, discount grows towards closing)
-- plus the owner's manual deals. One row per sweet, best discount wins.
create or replace function public.current_deals()
returns table (sweet_id bigint, percent int, kg_left numeric, ends_at timestamptz, kind text, deal_id bigint, phase text)
language plpgsql stable security definer set search_path = '' as $$
declare
  s jsonb := public.setting('deals'); c jsonb := public.deal_clock();
  v_steps int[]; v_idx int; v_pct int; v_phase text := c ->> 'phase';
begin
  select array_agg(x::int) into v_steps from jsonb_array_elements_text(coalesce(s -> 'steps', '[10,20,30]')) x;
  v_idx := least(cardinality(v_steps), greatest(1, floor((c ->> 'progress')::numeric * cardinality(v_steps))::int + 1));
  v_pct := least(v_steps[case when v_phase = 'live' then v_idx else 1 end], coalesce((s ->> 'max_percent')::int, 30));
  return query
  with auto as (
    select sw.id as sid, v_pct as pct, public.stock_kg(sw.id) as kg, (c ->> 'close_at')::timestamptz as ends,
           'auto'::text as k, null::bigint as did, v_phase as ph
    from public.sweets sw
    where v_phase in ('live', 'soon') and sw.product_type = 'mithai' and sw.in_stock
      and sw.category in (select jsonb_array_elements_text(coalesce(s -> 'categories', '[]')))
      and (sw.shelf_life_days <= coalesce((s ->> 'max_shelf_days')::int, 2)
           or exists (select 1 from public.batches b where b.sweet_id = sw.id
                      and b.made_at >= now() - interval '24 hours' and b.best_before < (public.shop_today() + 2)::timestamp))
      and coalesce(public.stock_kg(sw.id), 0) >= coalesce((s ->> 'min_stock_kg')::numeric, 1)
  ), manual as (
    select d.sweet_id as sid, d.percent::int as pct,
           coalesce(d.qty_limit_kg - d.sold_kg, public.stock_kg(d.sweet_id)) as kg, d.ends_at as ends,
           'manual'::text as k, d.id as did, 'live'::text as ph
    from public.deals d join public.sweets sw on sw.id = d.sweet_id
    where d.active and sw.in_stock and now() >= d.starts_at and now() < d.ends_at
      and (d.qty_limit_kg is null or d.sold_kg < d.qty_limit_kg)
  )
  select distinct on (x.sid) x.sid, x.pct, x.kg, x.ends, x.k, x.did, x.ph
  from (select * from manual union all select * from auto) x
  order by x.sid, (x.ph = 'live') desc, x.pct desc;
end;
$$;

-- ---------------------------------------------------------------- price_cart
-- Prices the signed-in user's cart (or p_items for guests) exactly as place_order will.
--   p_items:      [{ "variant_id": 12, "quantity": 2 }]  (guests / previews)
--   p_order_type: 'regular' | 'preorder' (pre-orders are made fresh: no last-hour deals)
create or replace function public.price_cart(p_coupon_code text default null, p_items jsonb default null, p_order_type text default 'regular')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_lines jsonb; v_list numeric := 0; v_deal numeric := 0; v_boxes numeric := 0; v_box_fees numeric := 0;
  v_combo numeric := 0; v_combos jsonb := '[]'; v_distinct int := 0; v_mix_pct int := 0; v_mix numeric := 0;
  v_coupon public.coupons; v_cdisc numeric := 0; v_cmsg text; v_cvalid boolean := false; v_free jsonb;
  v_base numeric; j record; v_times int; v_value numeric; v_src jsonb;
begin
  if p_items is not null or v_uid is null then
    select jsonb_agg(jsonb_build_object('variant_id', (x ->> 'variant_id')::bigint,
             'quantity', least(greatest(coalesce((x ->> 'quantity')::int, 1), 1), 99)))
      into v_src from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x where (x ->> 'variant_id') ~ '^[0-9]+$';
  else
    select jsonb_agg(jsonb_build_object('variant_id', c.variant_id, 'quantity', c.quantity)) into v_src
    from public.cart_items c where c.user_id = v_uid;
    select coalesce(sum(public.gift_box_price(b.size, b.items)), 0), coalesce(sum(public.gift_box_fee(b.size)), 0)
      into v_boxes, v_box_fees from public.cart_gift_boxes b where b.user_id = v_uid;
  end if;
  v_src := coalesce(v_src, '[]'::jsonb);

  with d as (select * from public.current_deals() where phase = 'live' and p_order_type = 'regular'),
  l as (
    select v.id as variant_id, v.sweet_id, s.name, v.weight_label, src.quantity as qty, v.price as unit,
           public.variant_grams(v.weight_label, v.grams) as grams, coalesce(d.percent, 0) as deal_pct, d.deal_id, d.kg_left
    from (select variant_id, sum(quantity)::int as quantity from jsonb_to_recordset(v_src) as r(variant_id bigint, quantity int) group by variant_id) src
    join public.sweet_variants v on v.id = src.variant_id join public.sweets s on s.id = v.sweet_id
    left join d on d.sweet_id = v.sweet_id
  ), l2 as (
    select l.*, round(l.unit * l.deal_pct / 100.0) as off_each,
           case when l.deal_pct = 0 then 0
                when l.kg_left is null then l.qty
                else least(l.qty, greatest(0, floor(l.kg_left * 1000 / l.grams))::int) end as deal_qty
    from l
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', variant_id, 'sweet_id', sweet_id, 'name', name, 'weight_label', weight_label, 'qty', qty,
           'unit', unit, 'deal_pct', case when deal_qty > 0 then deal_pct else 0 end, 'deal_qty', deal_qty, 'deal_id', deal_id,
           'deal_unit', unit - off_each, 'line_total', qty * unit - deal_qty * off_each, 'grams', grams) order by name), '[]'),
         coalesce(sum(qty * unit), 0), coalesce(sum(deal_qty * off_each), 0)
    into v_lines, v_list, v_deal from l2;
  v_list := v_list + v_boxes;

  -- Jodi Boxes: every complete set of a box's items in the cart earns its combo discount.
  for j in select * from public.jodi_boxes where active loop
    select min(floor(coalesce(src.q, 0) / greatest((it ->> 'qty')::int, 1)))::int,
           sum(v.price * greatest((it ->> 'qty')::int, 1))
      into v_times, v_value
    from jsonb_array_elements(j.items) it
    join public.sweet_variants v on v.id = (it ->> 'variant_id')::bigint
    left join (select variant_id, sum(quantity) as q from jsonb_to_recordset(v_src) as r(variant_id bigint, quantity int) group by variant_id) src on src.variant_id = v.id;
    if coalesce(v_times, 0) > 0 then
      v_combo := v_combo + round(v_times * v_value * j.discount_percent / 100.0);
      v_combos := v_combos || jsonb_build_object('id', j.id, 'name', j.name, 'times', v_times, 'percent', j.discount_percent);
    end if;
  end loop;

  select count(distinct x) into v_distinct from (
    select (e ->> 'sweet_id')::bigint as x from jsonb_array_elements(v_lines) e
    union select unnest(b.items) from public.cart_gift_boxes b where b.user_id = v_uid and p_items is null) q;
  v_mix_pct := public.mix_save_percent(v_distinct);
  v_mix := round(greatest(v_list - v_deal - v_combo, 0) * v_mix_pct / 100.0);
  v_base := greatest(v_list - v_deal - v_combo - v_mix, 0);

  if nullif(trim(p_coupon_code), '') is not null then
    select * into v_coupon from public.coupons where upper(code) = upper(trim(p_coupon_code)) and user_id = v_uid;
    if v_uid is null then v_cmsg := 'Log in to use a coupon';
    elsif v_coupon.id is null then v_cmsg := 'Coupon not found';
    elsif v_coupon.used_at is not null then v_cmsg := 'This coupon is already used';
    elsif v_coupon.expires_at < now() then v_cmsg := 'This coupon has expired';
    elsif v_list < v_coupon.min_order then v_cmsg := format('Add ₹%s more to use this coupon', ceil(v_coupon.min_order - v_list));
    else
      v_cvalid := true;
      v_cdisc := case v_coupon.kind
        when 'percent' then round(v_base * v_coupon.value / 100.0)
        when 'flat' then least(v_coupon.value, v_base)
        when 'free_wrap' then least(v_box_fees, v_base)
        else 0 end;
      if v_coupon.kind = 'free_item' then
        select jsonb_build_object('sweet_id', s.id, 'name', s.name, 'variant_id', v.id, 'weight_label', v.weight_label, 'value', v.price)
          into v_free
        from public.sweets s join public.sweet_variants v on v.sweet_id = s.id
        where s.id = v_coupon.sweet_id
        order by abs(public.variant_grams(v.weight_label, v.grams) - coalesce(v_coupon.grams, 250)), v.price limit 1;
      end if;
      v_cmsg := v_coupon.label;
    end if;
  end if;

  return jsonb_build_object(
    'lines', v_lines, 'boxes_total', v_boxes, 'subtotal', v_list, 'deal_discount', v_deal,
    'combo_discount', v_combo, 'combos', v_combos, 'distinct', v_distinct,
    'mix_percent', v_mix_pct, 'mix_discount', v_mix,
    'coupon', case when p_coupon_code is null then null else jsonb_build_object(
       'code', upper(trim(p_coupon_code)), 'valid', v_cvalid, 'message', v_cmsg, 'discount', v_cdisc,
       'kind', v_coupon.kind, 'id', case when v_cvalid then v_coupon.id end, 'free_item', v_free) end,
    'discount', v_deal + v_combo + v_mix + v_cdisc,
    'total', greatest(v_list - v_deal - v_combo - v_mix - v_cdisc, 0),
    'deal_clock', public.deal_clock() -> 'phase');
end;
$$;

-- ---------------------------------------------------------------- scratch cards
create or replace function public.assign_scratch_reward(p_order_id uuid)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare
  s jsonb := public.setting('scratch'); v_order public.orders; v_prize public.scratch_prizes; v_spent numeric; v_id bigint;
  v_expires timestamptz;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null or exists (select 1 from public.scratch_cards where order_id = p_order_id) then return null; end if;
  if public.shop_today() not between (s ->> 'start')::date and (s ->> 'end')::date then return null; end if;
  select coalesce(sum(cost_estimate), 0) into v_spent from public.scratch_cards
  where (created_at at time zone public.shop_tz())::date = public.shop_today();
  select * into v_prize from public.scratch_prizes p
  where p.active and p.weight > 0 and (p.cost_estimate = 0 or v_spent + p.cost_estimate <= coalesce((s ->> 'daily_budget')::numeric, 0))
  order by -ln(greatest(random(), 1e-9)) / p.weight limit 1;
  v_expires := ((s ->> 'end')::date + 1)::timestamp at time zone public.shop_tz();
  insert into public.scratch_cards (order_id, user_id, prize_id, label, kind, cost_estimate, expires_at)
  values (p_order_id, v_order.user_id, v_prize.id, coalesce(v_prize.label, 'Better luck next time'), coalesce(v_prize.kind, 'none'),
          coalesce(v_prize.cost_estimate, 0), v_expires)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.assign_scratch_reward(uuid) from public, anon, authenticated;

-- The card for one of my orders. The prize stays hidden until it is scratched.
create or replace function public.my_scratch_card(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'scratched', c.scratched_at is not null, 'expires_at', c.expires_at,
           'expired', c.expires_at < now(),
           'prize', case when c.scratched_at is not null then jsonb_build_object('label', c.label, 'kind', c.kind,
              'code', cp.code, 'expires_at', cp.expires_at, 'min_order', cp.min_order, 'shayari', p.shayari) end)
  from public.scratch_cards c
  left join public.coupons cp on cp.id = c.coupon_id
  left join public.scratch_prizes p on p.id = c.prize_id
  where c.order_id = p_order_id and c.user_id = (select auth.uid());
$$;

-- Scratch once: reveals the prize and turns it into a coupon.
create or replace function public.reveal_scratch_card(p_card_id bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_card public.scratch_cards; v_prize public.scratch_prizes; v_coupon public.coupons; v_code text;
  v_days int := coalesce((public.setting('scratch') ->> 'coupon_days')::int, 30);
begin
  select * into v_card from public.scratch_cards where id = p_card_id and user_id = (select auth.uid()) for update;
  if v_card.id is null then raise exception 'Scratch card not found' using errcode = '22023'; end if;
  if v_card.scratched_at is null then
    if v_card.expires_at < now() then raise exception 'This scratch card has expired' using errcode = '22023'; end if;
    select * into v_prize from public.scratch_prizes where id = v_card.prize_id;
    if v_card.kind <> 'none' and v_prize.id is not null then
      loop
        v_code := 'SS' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
        exit when not exists (select 1 from public.coupons where code = v_code);
      end loop;
      insert into public.coupons (code, user_id, kind, value, sweet_id, grams, min_order, label, source, expires_at)
      values (v_code, v_card.user_id, v_prize.kind, v_prize.value, v_prize.sweet_id, v_prize.grams, v_prize.min_order,
              v_prize.label, 'scratch', now() + make_interval(days => v_days))
      returning * into v_coupon;
    end if;
    update public.scratch_cards set scratched_at = now(), coupon_id = v_coupon.id where id = v_card.id;
  end if;
  return public.my_scratch_card(v_card.order_id);
end;
$$;

-- ---------------------------------------------------------------- place_order (v3)
drop function if exists public.place_order(text, text, jsonb, text, text);
create or replace function public.place_order(
  p_payment_method   text,
  p_fulfilment       text   default 'delivery',
  p_address          jsonb  default null,
  p_delivery_slot    text   default null,
  p_gift_message     text   default null,
  p_coupon_code      text   default null,
  p_preorder_slot_id bigint default null,
  p_expected_total   numeric default null     -- what the customer saw; if prices changed we stop and show the new total
)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_pre boolean := p_preorder_slot_id is not null; v_price jsonb; v_short text;
  v_sample bigint; v_order public.orders; v_slot public.preorder_slots; v_fest public.festivals; v_sched timestamptz;
  v_kg numeric; v_cutoff int; v_coupon_id bigint; v_free jsonb; v_label text := p_delivery_slot;
begin
  if v_uid is null then raise exception 'Please log in to place an order' using errcode = '28000'; end if;
  if p_payment_method not in ('cod', 'pay_at_shop') then raise exception 'Unsupported payment method' using errcode = '22023'; end if;
  if p_fulfilment not in ('delivery', 'pickup') then raise exception 'Unsupported fulfilment' using errcode = '22023'; end if;
  if p_fulfilment = 'delivery' and (p_address is null or coalesce(p_address ->> 'line1', '') = '') then
    raise exception 'Delivery address is required' using errcode = '22023';
  end if;

  perform 1 from public.cart_items where user_id = v_uid for update;
  perform 1 from public.cart_gift_boxes where user_id = v_uid for update;
  if nullif(trim(p_coupon_code), '') is not null then
    perform 1 from public.coupons where upper(code) = upper(trim(p_coupon_code)) and user_id = v_uid for update;
  end if;

  if exists (select 1 from public.cart_items c join public.sweets s on s.id = c.sweet_id where c.user_id = v_uid and not s.in_stock)
     or exists (select 1 from public.cart_gift_boxes b, unnest(b.items) i join public.sweets s on s.id = i where b.user_id = v_uid and not s.in_stock) then
    raise exception 'Some items in your cart are out of stock' using errcode = '22023';
  end if;
  if not v_pre then     -- pre-orders are made fresh for the slot, so shelf stock does not limit them
    perform 1 from public.sweet_variants v where v.id in (select c.variant_id from public.cart_items c where c.user_id = v_uid) for update;
    select s.name || ' (' || v.weight_label || ')' into v_short
    from public.cart_items c join public.sweet_variants v on v.id = c.variant_id join public.sweets s on s.id = c.sweet_id
    where c.user_id = v_uid and v.stock_qty is not null and v.stock_qty < c.quantity limit 1;
    if v_short is not null then raise exception 'Only limited stock left for %', v_short using errcode = '22023'; end if;
  end if;

  v_price := public.price_cart(nullif(trim(p_coupon_code), ''), null, case when v_pre then 'preorder' else 'regular' end);
  if (v_price ->> 'subtotal')::numeric = 0 then raise exception 'Your cart is empty' using errcode = '22023'; end if;
  if v_price -> 'coupon' is not null and jsonb_typeof(v_price -> 'coupon') = 'object' and not (v_price -> 'coupon' ->> 'valid')::boolean then
    raise exception 'Coupon: %', v_price -> 'coupon' ->> 'message' using errcode = '22023';
  end if;
  if p_expected_total is not null and abs((v_price ->> 'total')::numeric - p_expected_total) >= 1 then
    raise exception 'PRICE_CHANGED:%', (v_price ->> 'total')::numeric using errcode = '22023',
      hint = 'A last-hour deal ended or prices changed. Please check the new total.';
  end if;
  v_coupon_id := (v_price -> 'coupon' ->> 'id')::bigint;
  v_free := case when jsonb_typeof(v_price -> 'coupon' -> 'free_item') = 'object' then v_price -> 'coupon' -> 'free_item' end;

  if v_pre then
    select * into v_slot from public.preorder_slots where id = p_preorder_slot_id for update;
    if v_slot.id is null then raise exception 'That pre-order slot does not exist' using errcode = '22023'; end if;
    select * into v_fest from public.festivals where id = v_slot.festival_id;
    v_sched := (v_slot.slot_date + v_slot.start_time) at time zone public.shop_tz();
    v_cutoff := coalesce(v_fest.cutoff_hours, (public.setting('preorder') ->> 'default_cutoff_hours')::int, 12);
    if now() > v_sched - make_interval(hours => v_cutoff) then
      raise exception 'Booking for this slot has closed' using errcode = '22023';
    end if;
    select coalesce(sum((e ->> 'qty')::int * (e ->> 'grams')::int), 0) / 1000.0 into v_kg from jsonb_array_elements(v_price -> 'lines') e;
    v_kg := v_kg + coalesce((select sum(b.size) * 0.03 from public.cart_gift_boxes b where b.user_id = v_uid), 0);
    if v_slot.booked_orders + 1 > v_slot.max_orders or v_slot.booked_kg + v_kg > v_slot.max_kg then
      raise exception 'Sorry ji, this slot just got full. Please pick another one.' using errcode = '22023';
    end if;
    update public.preorder_slots set booked_orders = booked_orders + 1, booked_kg = booked_kg + v_kg where id = v_slot.id;
    v_label := format('%s · %s, %s–%s', coalesce(v_fest.name, 'Pre-order'), to_char(v_slot.slot_date, 'Dy DD Mon'),
                      to_char(v_slot.start_time, 'HH12:MIam'), to_char(v_slot.end_time, 'HH12:MIam'));
  end if;

  if (v_price ->> 'distinct')::int >= (public.mix_save_rules() ->> 'free_sample_min_distinct')::int then
    select s.id into v_sample from public.sweets s
    where s.is_new and s.in_stock and s.product_type = 'mithai' and s.id not in (select c.sweet_id from public.cart_items c where c.user_id = v_uid)
    order by s.popularity desc, s.id limit 1;
  end if;

  insert into public.orders (user_id, fulfilment, payment_method, address, delivery_slot, gift_message, subtotal, discount, total,
                             free_sample_sweet_id, order_type, scheduled_for, festival_id, preorder_slot_id, coupon_id,
                             deal_discount, combo_discount, mix_discount, coupon_discount)
  values (v_uid, p_fulfilment, p_payment_method, case when p_fulfilment = 'delivery' then p_address end,
          v_label, nullif(left(trim(p_gift_message), 300), ''), (v_price ->> 'subtotal')::numeric,
          (v_price ->> 'discount')::numeric, (v_price ->> 'total')::numeric, v_sample,
          case when v_pre then 'preorder' else 'regular' end, v_sched, v_fest.id, v_slot.id, v_coupon_id,
          (v_price ->> 'deal_discount')::numeric, (v_price ->> 'combo_discount')::numeric,
          (v_price ->> 'mix_discount')::numeric, coalesce((v_price -> 'coupon' ->> 'discount')::numeric, 0))
  returning * into v_order;

  insert into public.order_items (order_id, sweet_id, variant_id, quantity, price, list_price)
  select v_order.id, (e ->> 'sweet_id')::bigint, (e ->> 'variant_id')::bigint, (e ->> 'qty')::int,
         round((e ->> 'line_total')::numeric / (e ->> 'qty')::int, 2), (e ->> 'unit')::numeric
  from jsonb_array_elements(v_price -> 'lines') e;
  if v_free is not null then
    insert into public.order_items (order_id, sweet_id, variant_id, quantity, price, list_price, is_free)
    values (v_order.id, (v_free ->> 'sweet_id')::bigint, (v_free ->> 'variant_id')::bigint, 1, 0, (v_free ->> 'value')::numeric, true);
  end if;

  insert into public.order_gift_boxes (order_id, size, ribbon, message, items, price)
  select v_order.id, b.size, b.ribbon, b.message, b.items, public.gift_box_price(b.size, b.items)
  from public.cart_gift_boxes b where b.user_id = v_uid;

  if v_coupon_id is not null then
    update public.coupons set used_at = now(), used_order_id = v_order.id where id = v_coupon_id and used_at is null;
    if not found then raise exception 'This coupon was just used' using errcode = '22023'; end if;
  end if;

  -- Manual deals: count kg sold so the "kitna bacha" counter stays honest.
  update public.deals d set sold_kg = d.sold_kg + x.kg
  from (select (e ->> 'deal_id')::bigint as did, sum((e ->> 'deal_qty')::int * (e ->> 'grams')::int) / 1000.0 as kg
        from jsonb_array_elements(v_price -> 'lines') e where (e ->> 'deal_id') is not null and (e ->> 'deal_qty')::int > 0 group by 1) x
  where d.id = x.did;

  update public.sweets s set popularity = s.popularity + agg.q
  from (select x as sweet_id, count(*) as q from (
          select c.sweet_id as x from public.cart_items c, generate_series(1, c.quantity) where c.user_id = v_uid
          union all select unnest(b.items) from public.cart_gift_boxes b where b.user_id = v_uid) t group by x) agg
  where s.id = agg.sweet_id;

  if not v_pre then
    update public.sweet_variants v set stock_qty = v.stock_qty - c.quantity
    from public.cart_items c where c.user_id = v_uid and c.variant_id = v.id and v.stock_qty is not null;
  end if;

  delete from public.cart_items where user_id = v_uid;
  delete from public.cart_gift_boxes where user_id = v_uid;
  perform public.assign_scratch_reward(v_order.id);
  return v_order;
end;
$$;

-- ---------------------------------------------------------------- pre-orders: customer cancel
create or replace function public.cancel_preorder(p_order_id uuid)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare v_order public.orders; v_cutoff int; v_kg numeric;
begin
  select * into v_order from public.orders where id = p_order_id and user_id = (select auth.uid()) for update;
  if v_order.id is null or v_order.order_type <> 'preorder' then raise exception 'Pre-order not found' using errcode = '22023'; end if;
  if v_order.status not in ('placed', 'packing') then raise exception 'This pre-order can no longer be cancelled' using errcode = '22023'; end if;
  select coalesce(f.cutoff_hours, 12) into v_cutoff from public.festivals f where f.id = v_order.festival_id;
  if now() > v_order.scheduled_for - make_interval(hours => coalesce(v_cutoff, 12)) then
    raise exception 'The cancellation cutoff for this slot has passed' using errcode = '22023';
  end if;
  select coalesce(sum(oi.quantity * public.variant_grams(v.weight_label, v.grams)), 0) / 1000.0 into v_kg
  from public.order_items oi join public.sweet_variants v on v.id = oi.variant_id where oi.order_id = v_order.id;
  update public.preorder_slots set booked_orders = greatest(booked_orders - 1, 0), booked_kg = greatest(booked_kg - v_kg, 0)
  where id = v_order.preorder_slot_id;
  update public.orders set status = 'cancelled' where id = v_order.id returning * into v_order;
  update public.coupons set used_at = null, used_order_id = null where used_order_id = v_order.id;   -- give the coupon back
  return v_order;
end;
$$;

-- My coupons that can still be used.
create or replace function public.my_coupons()
returns setof public.coupons language sql stable security definer set search_path = '' as $$
  select * from public.coupons where user_id = (select auth.uid()) order by (used_at is null and expires_at > now()) desc, expires_at;
$$;


-- =====================================================================
-- Part C: feature functions — combos, fresh & hot batches, weather cache,
-- Bhooli Hui Mithai matching, gift plan checkout, demand prediction and
-- owner analytics.
-- =====================================================================

-- ---------------------------------------------------------------- Mithai + Namkeen
-- Score namkeen for a set of mithai: owner rules + bought-together history + spice taste.
create or replace function public.suggest_combos(p_sweet_ids bigint[], p_limit int default 3)
returns table (namkeen_id bigint, score numeric, reason text)
language sql stable security definer set search_path = '' as $$
  with picked as (select s.id, s.category from public.sweets s where s.id = any(p_sweet_ids) and s.product_type = 'mithai'),
  pref as (select coalesce(p.taste_profile ->> 'spice', 'medium') as spice from public.profiles p where p.id = (select auth.uid())
           union all select 'medium' where (select auth.uid()) is null),
  rules as (
    select r.namkeen_id, sum(r.weight) as w, (array_agg(r.reason order by r.weight desc, (r.mithai_id is not null) desc))[1] as why
    from public.combo_rules r
    where r.active and (r.mithai_id in (select id from picked) or r.mithai_category in (select category from picked))
    group by r.namkeen_id
  ),
  together as (
    select oi2.sweet_id as namkeen_id, count(distinct oi2.order_id) as n
    from public.order_items oi join public.order_items oi2 on oi2.order_id = oi.order_id and oi2.sweet_id <> oi.sweet_id
    join public.sweets n on n.id = oi2.sweet_id and n.product_type = 'namkeen'
    where oi.sweet_id in (select id from picked)
    group by oi2.sweet_id
  )
  select n.id,
         round(coalesce(r.w, 0) + 0.6 * ln(1 + coalesce(t.n, 0))::numeric
           + case (select spice from pref limit 1)
               when 'mild' then case when n.spice_level <= 1 then 0.5 else -0.4 end
               when 'spicy' then case when n.spice_level >= 2 then 0.5 else -0.2 end
               else case when n.spice_level between 1 and 2 then 0.3 else 0 end end
           + least(n.popularity, 500) / 1000.0, 3) as score,
         coalesce(r.why, case when t.n > 0 then 'Customers often take these together' else 'Meethe ke baad namkeen — perfect balance' end)
  from public.sweets n
  left join rules r on r.namkeen_id = n.id
  left join together t on t.namkeen_id = n.id
  where n.product_type = 'namkeen' and n.in_stock and not (n.id = any(p_sweet_ids))
    and exists (select 1 from picked)
  order by 2 desc, n.popularity desc
  limit least(greatest(p_limit, 1), 12);
$$;

-- ---------------------------------------------------------------- Aaj ka Taaza
-- Owner: log a fresh batch in one call (also tops up shelf stock of the 250 g pack).
create or replace function public.mark_fresh_batch(p_sweet_id bigint, p_kg numeric, p_made_at timestamptz default now(), p_notes text default null)
returns public.batches language plpgsql security definer set search_path = '' as $$
declare v_s public.sweets; v_b public.batches;
begin
  if not public.is_admin() then raise exception 'Owner only' using errcode = '42501'; end if;
  if p_kg is null or p_kg <= 0 or p_kg > 500 then raise exception 'Enter a quantity between 0 and 500 kg' using errcode = '22023'; end if;
  select * into v_s from public.sweets where id = p_sweet_id;
  if v_s.id is null then raise exception 'Sweet not found' using errcode = '22023'; end if;
  insert into public.batches (sweet_id, made_at, quantity_kg, best_before, notes, source)
  values (p_sweet_id, least(coalesce(p_made_at, now()), now()), p_kg,
          least(coalesce(p_made_at, now()), now()) + make_interval(days => greatest(v_s.shelf_life_days, 1)), left(p_notes, 200), 'manual')
  returning * into v_b;
  update public.sweet_variants set stock_qty = stock_qty + floor(p_kg * 4)::int
  where sweet_id = p_sweet_id and weight_label = '250g' and stock_qty is not null;
  update public.sweets set in_stock = true where id = p_sweet_id;
  return v_b;
end;
$$;

-- Latest fresh batch per sweet (made within the freshness window, not past best-before).
create or replace function public.fresh_today()
returns table (sweet_id bigint, made_at timestamptz, best_before timestamptz, quantity_kg numeric, batch_id bigint)
language sql stable security definer set search_path = '' as $$
  select distinct on (b.sweet_id) b.sweet_id, b.made_at, b.best_before, b.quantity_kg, b.id
  from public.batches b
  where b.made_at > now() - make_interval(hours => coalesce((public.setting('freshness') ->> 'fresh_hours')::int, 24))
    and b.made_at <= now() and b.best_before > now()
  order by b.sweet_id, b.made_at desc;
$$;

-- ---------------------------------------------------------------- Garam Jalebi Alert
create or replace function public.create_hot_batch(p_sweet_id bigint, p_ready_in_minutes int, p_quantity_g int)
returns public.hot_batches language plpgsql security definer set search_path = '' as $$
declare v_s public.sweets; v_b public.batches; v_h public.hot_batches; v_ready timestamptz;
begin
  if not public.is_admin() then raise exception 'Owner only' using errcode = '42501'; end if;
  if p_quantity_g is null or p_quantity_g < 250 or p_quantity_g > 100000 then raise exception 'Quantity must be 250 g – 100 kg' using errcode = '22023'; end if;
  select * into v_s from public.sweets where id = p_sweet_id;
  if v_s.id is null then raise exception 'Sweet not found' using errcode = '22023'; end if;
  v_ready := now() + make_interval(mins => least(greatest(coalesce(p_ready_in_minutes, 0), 0), 120));
  insert into public.batches (sweet_id, made_at, quantity_kg, best_before, notes, source)
  values (p_sweet_id, v_ready, round(p_quantity_g / 1000.0, 2), v_ready + make_interval(days => greatest(v_s.shelf_life_days, 1)), 'Garam batch', 'hot')
  returning * into v_b;
  insert into public.hot_batches (sweet_id, ready_at, quantity_g, batch_id)
  values (p_sweet_id, v_ready, p_quantity_g, v_b.id) returning * into v_h;
  update public.sweets set in_stock = true where id = p_sweet_id;
  return v_h;
end;
$$;

-- "Mere liye rakh lo": reserve up to the configured grams for 30 minutes. Never oversells.
create or replace function public.reserve_hot_batch(p_hot_batch_id bigint, p_grams int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a jsonb := public.setting('alerts'); v_h public.hot_batches; v_left int; v_r public.hot_reservations;
  v_max int := coalesce((a ->> 'reserve_max_grams')::int, 500);
begin
  if (select auth.uid()) is null then raise exception 'Please log in to reserve' using errcode = '28000'; end if;
  if p_grams is null or p_grams < 100 or p_grams > v_max then raise exception 'You can reserve 100 g to % g', v_max using errcode = '22023'; end if;
  select * into v_h from public.hot_batches where id = p_hot_batch_id for update;
  if v_h.id is null then raise exception 'This batch is not available' using errcode = '22023'; end if;
  if v_h.ready_at < now() - interval '3 hours' then raise exception 'This garam batch is over, ji' using errcode = '22023'; end if;
  if exists (select 1 from public.hot_reservations where hot_batch_id = v_h.id and user_id = (select auth.uid()) and status = 'reserved') then
    raise exception 'You already reserved from this batch' using errcode = '22023';
  end if;
  v_left := v_h.quantity_g - v_h.reserved_g;
  if p_grams > v_left then raise exception 'Sirf % g bacha hai ji', v_left using errcode = '22023'; end if;
  update public.hot_batches set reserved_g = reserved_g + p_grams where id = v_h.id;
  insert into public.hot_reservations (hot_batch_id, user_id, grams, expires_at)
  values (v_h.id, (select auth.uid()), p_grams,
          greatest(v_h.ready_at, now()) + make_interval(mins => coalesce((a ->> 'reserve_minutes')::int, 30)))
  on conflict (hot_batch_id, user_id) do update set grams = excluded.grams, status = 'reserved', expires_at = excluded.expires_at
  returning * into v_r;
  insert into public.hot_alert_log (hot_batch_id, user_id, kind) values (v_h.id, (select auth.uid()), 'opened') on conflict do nothing;
  return jsonb_build_object('reservation_id', v_r.id, 'grams', v_r.grams, 'expires_at', v_r.expires_at, 'left_g', v_left - p_grams);
end;
$$;

-- Count an in-app alert as shown / opened (owner sees the reach).
create or replace function public.log_hot_alert(p_hot_batch_id bigint, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or p_kind not in ('shown', 'opened') then return; end if;
  insert into public.hot_alert_log (hot_batch_id, user_id, kind) values (p_hot_batch_id, (select auth.uid()), p_kind)
  on conflict do nothing;
  if found then
    update public.hot_batches set notified = notified + (p_kind = 'shown')::int, opened = opened + (p_kind = 'opened')::int
    where id = p_hot_batch_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------- weather cache (shop city)
-- Browsers refresh the shop city's Open-Meteo forecast at most every 3 hours.
create or replace function public.save_weather(p_city text, p_data jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_city is distinct from (public.setting('shop') ->> 'city') then return false; end if;
  if jsonb_typeof(p_data -> 'daily' -> 'temperature_2m_max') <> 'array' then return false; end if;
  if exists (select 1 from public.weather_cache where city = p_city and fetched_at > now() - interval '3 hours') then return false; end if;
  insert into public.weather_cache (city, data, fetched_at)
  values (p_city, jsonb_build_object('daily', p_data -> 'daily', 'current', p_data -> 'current'), now())
  on conflict (city) do update set data = excluded.data, fetched_at = excluded.fetched_at;
  return true;
end;
$$;

-- ---------------------------------------------------------------- Bhooli Hui Mithai
-- p_traits comes from js/describe-dictionary.js, e.g.
-- {"has_syrup":true,"base":["chhena"],"shape":["round"],"texture":["soft"],"colours":["white"],
--  "served":"cold","flavours":["kesar"],"regions":["Bengal"],"categories":["bengali"],"words":["chum"]}
create or replace function public.identify_sweet(p_description text, p_traits jsonb default '{}'::jsonb, p_exclude bigint[] default '{}')
returns table (sweet_id bigint, confidence int, score numeric, clues text[])
language plpgsql stable security definer set search_path = '' as $$
declare
  t jsonb := coalesce(p_traits, '{}'::jsonb);
  q text := left(coalesce(p_description, ''), 500);
  v_words text[];
begin
  -- Name matching uses only the words the dictionary did not explain (e.g. "woh chum wali"),
  -- so a described ingredient like "besan" doesn't look like the name "Besan Barfi".
  select coalesce(array_agg(w), '{}') into v_words
  from (select distinct lower(x) as w from regexp_split_to_table(
          case when t ? 'words' then coalesce((select string_agg(value, ' ') from jsonb_array_elements_text(t -> 'words')), '') else q end,
          '[^[:alnum:]]+') x
        where length(x) >= 3) z;
  return query
  with s as (
    select sw.*, lower(sw.name) as lname,
           (select coalesce(max(extensions.word_similarity(w, lower(sw.name || ' ' || array_to_string(sw.aliases, ' ')))), 0)
              from unnest(v_words) w where length(w) >= 4) as namesim
    from public.sweets sw where sw.product_type = 'mithai' and not (sw.id = any(coalesce(p_exclude, '{}')))
  ), scored as (
    select s.id,
      -- each clue: (points, label)
      array_remove(array[
        case when (t ->> 'has_syrup')::boolean is true and s.has_syrup then '3|chashni wali'
             when (t ->> 'has_syrup')::boolean is true and not s.has_syrup then '-2.5|'
             when (t ->> 'has_syrup')::boolean is false and s.has_syrup then '-2|' end,
        case when t ? 'base' and (s.base in (select jsonb_array_elements_text(t -> 'base'))
                                  or s.ingredients && array(select jsonb_array_elements_text(t -> 'base'))) then '3|' || s.base || ' se bani' end,
        case when (t ->> 'is_fried')::boolean is true and s.is_fried then '2|tali hui'
             when (t ->> 'is_fried')::boolean is true and not s.is_fried then '-1.5|'
             when (t ->> 'is_fried')::boolean is false and s.is_fried then '-1|' end,
        case when (t ->> 'has_filling')::boolean is true and s.has_filling then '2|andar bharawan'
             when (t ->> 'has_filling')::boolean is true and not s.has_filling then '-1|' end,
        case when t ? 'shape' and s.shape in (select jsonb_array_elements_text(t -> 'shape')) then '2|' || s.shape || ' shape'
             when t ? 'shape' and s.shape is not null then '-0.6|' end,
        case when t ? 'colours' and s.colours && array(select jsonb_array_elements_text(t -> 'colours'))
             then (1.5 * least(2, cardinality(array(select unnest(s.colours) intersect select jsonb_array_elements_text(t -> 'colours')))))::text
                  || '|' || array_to_string(array(select unnest(s.colours) intersect select jsonb_array_elements_text(t -> 'colours')), '/') || ' rang' end,
        case when t ? 'texture' and s.texture in (select jsonb_array_elements_text(t -> 'texture')) then '2|' || s.texture
             when t ? 'texture' and (t -> 'texture') ?| array['crunchy','crisp'] and s.texture in ('soft','spongy','creamy','silky','juicy') then '-2|'
             when t ? 'texture' and (t -> 'texture') ?| array['soft','spongy','juicy'] and s.texture in ('crunchy','crisp','flaky') then '-2|' end,
        case when t ? 'served' and s.served_temp = t ->> 'served' then '1.5|' || case s.served_temp when 'warm' then 'garam serve' when 'cold' then 'thandi serve' else 'room temp' end
             when t ? 'served' and s.served_temp is not null and s.served_temp <> 'room' and s.served_temp <> t ->> 'served' then '-1|' end,
        case when t ? 'flavours' and (s.key_flavours || s.ingredients) && array(select jsonb_array_elements_text(t -> 'flavours'))
             then '1.5|' || array_to_string(array(select unnest(s.key_flavours || s.ingredients) intersect select jsonb_array_elements_text(t -> 'flavours')), '/') end,
        case when t ? 'regions' and (s.region in (select jsonb_array_elements_text(t -> 'regions'))) then '2.5|' || s.region || ' se' end,
        case when t ? 'categories' and s.category in (select jsonb_array_elements_text(t -> 'categories')) then '2.5|' || s.category end,
        case when t ? 'occasions' and s.occasions && array(select jsonb_array_elements_text(t -> 'occasions')) then '1|' ||
             array_to_string(array(select unnest(s.occasions) intersect select jsonb_array_elements_text(t -> 'occasions')), '/') || ' mein khayi jaati' end,
        case when t ? 'sweetness' and abs(s.sweetness - (t ->> 'sweetness')::int) <= 1 then '1|' || case when s.sweetness >= 4 then 'khoob meethi' else 'kam meethi' end
             when t ? 'sweetness' and abs(s.sweetness - (t ->> 'sweetness')::int) >= 3 then '-1|' end,
        case when s.namesim >= 0.5 then (round(7 * s.namesim::numeric, 2))::text || '|naam se milta-julta' end
      ], null) as clue_arr,
      ts_rank(to_tsvector('simple', coalesce(s.description, '') || ' ' || coalesce(s.origin_story, '') || ' ' || array_to_string(s.tags, ' ')),
              plainto_tsquery('simple', q)) as fts
    from s
  ), totals as (
    select sc.id,
           coalesce((select sum(split_part(c, '|', 1)::numeric) from unnest(sc.clue_arr) c), 0) + least(sc.fts * 8, 2)::numeric as total,
           array(select split_part(c, '|', 2) from unnest(sc.clue_arr) c where split_part(c, '|', 2) <> '' and split_part(c, '|', 1)::numeric > 0) as clue_list
    from scored sc
  ), top as (
    select * from totals order by total desc, id limit 5
  )
  select top.id, round(100 * exp(top.total / 1.6) / sum(exp(top.total / 1.6)) over ())::int, round(top.total, 2), top.clue_list
  from top order by top.total desc;
end;
$$;

-- Akinator-style: the yes/no question that best splits the candidates.
create or replace function public.next_question(p_ids bigint[], p_asked text[] default '{}')
returns jsonb language sql stable security definer set search_path = '' as $$
  with c as (select s.*, array_position(p_ids, s.id) as rank from public.sweets s where s.id = any(p_ids)),
  q(key, question, yes_traits, no_traits) as (values
    ('has_syrup',  'Kya woh chashni (syrup) mein doobi hui thi?', '{"has_syrup":true}'::jsonb, '{"has_syrup":false}'::jsonb),
    ('chhena',     'Kya andar se chhena (paneer) wali thi — spongy si?', '{"base":["chhena"]}', '{}'),
    ('fried',      'Kya woh tali hui (fried) thi?', '{"is_fried":true}', '{"is_fried":false}'),
    ('warm',       'Kya woh garam serve hui thi?', '{"served":"warm"}', '{"served":"cold"}'),
    ('filling',    'Kya andar kuch bhara hua tha — khoya ya dry fruit?', '{"has_filling":true}', '{"has_filling":false}'),
    ('round',      'Kya woh gol (round) thi?', '{"shape":["round"]}', '{}'),
    ('khoya',      'Kya woh khoya / mawa se bani lagti thi?', '{"base":["khoya"]}', '{}'),
    ('dryfruit',   'Kya usmein kaju-badam jaise dry fruits the?', '{"base":["dry-fruit"]}', '{}'),
    ('crunchy',    'Kya woh kurkuri (crunchy) thi?', '{"texture":["crunchy","crisp"]}', '{"texture":["soft"]}'),
    ('bengal',     'Kya woh Bengal / Kolkata wali mithai thi?', '{"regions":["Bengal"]}', '{}')
  ),
  f as (
    select q.key, q.question, q.yes_traits, q.no_traits,
      array_agg(c.id order by c.rank) filter (where case q.key
        when 'has_syrup' then c.has_syrup when 'chhena' then c.base = 'chhena' when 'fried' then c.is_fried
        when 'warm' then c.served_temp = 'warm' when 'filling' then c.has_filling when 'round' then c.shape = 'round'
        when 'khoya' then c.base = 'khoya' when 'dryfruit' then c.base = 'dry-fruit' or c.category = 'dry-fruit'
        when 'crunchy' then c.texture in ('crunchy','crisp') when 'bengal' then c.region = 'Bengal' end) as yes_ids,
      count(*) as n
    from q cross join c where not (q.key = any(p_asked)) group by 1,2,3,4
  )
  select jsonb_build_object('key', key, 'question', question, 'yes', yes_traits, 'no', no_traits, 'yes_ids', yes_ids)
  from f
  -- must separate the top two, and split the group as evenly as possible
  where coalesce(cardinality(yes_ids), 0) between 1 and n - 1
    and ((p_ids[1] = any(coalesce(yes_ids, '{}'))) <> (p_ids[2] = any(coalesce(yes_ids, '{}'))))
  order by abs(coalesce(cardinality(yes_ids), 0) - n / 2.0), key limit 1;
$$;

create or replace function public.log_identify(p_description text, p_chips jsonb, p_top bigint[])
returns bigint language sql volatile security definer set search_path = '' as $$
  insert into public.identify_logs (user_id, description, chips, top_ids)
  values ((select auth.uid()), left(coalesce(p_description, ''), 500), coalesce(p_chips, '{}'::jsonb), coalesce(p_top, '{}'))
  returning id;
$$;

create or replace function public.set_identify_result(p_log_id bigint, p_chosen bigint, p_success boolean)
returns void language sql volatile security definer set search_path = '' as $$
  update public.identify_logs set chosen_id = p_chosen, success = p_success
  where id = p_log_id and (user_id is null or user_id = (select auth.uid())) and created_at > now() - interval '1 day';
$$;

-- ---------------------------------------------------------------- Rishtedaar Gift Planner
-- Server-side price of one planned box (never trusted from the browser).
create or replace function public.gift_box_total(p_box_id bigint)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(v.price * i.qty), 0) + case when b.size_label like '%pc%' then coalesce(public.gift_box_fee(split_part(b.size_label, ' ', 1)::int), 49) else 49 end
  from public.gift_boxes b left join public.gift_box_items i on i.box_id = b.id left join public.sweet_variants v on v.id = i.variant_id
  where b.id = p_box_id group by b.id, b.size_label;
$$;

-- Re-price every box of a plan and return the plan totals.
create or replace function public.price_gift_plan(p_plan_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_plan public.gift_plans; v_total numeric; v_boxes jsonb;
begin
  select * into v_plan from public.gift_plans where id = p_plan_id and (user_id = (select auth.uid()) or public.is_admin());
  if v_plan.id is null then raise exception 'Gift plan not found' using errcode = '22023'; end if;
  if v_plan.status = 'draft' then
    update public.gift_boxes b set price = public.gift_box_total(b.id) where b.plan_id = v_plan.id;
  end if;
  select coalesce(sum(price), 0), coalesce(jsonb_agg(jsonb_build_object('id', id, 'recipient_id', recipient_id, 'price', price)), '[]')
    into v_total, v_boxes from public.gift_boxes where plan_id = v_plan.id;
  return jsonb_build_object('total', v_total, 'boxes', v_boxes,
    'budget', case when v_plan.budget_mode = 'total' then v_plan.budget
                   else v_plan.budget * (select count(*) from public.gift_recipients where plan_id = v_plan.id) end);
end;
$$;

-- Does a sweet respect one recipient's preferences? (the planner's hard rules, re-checked here)
create or replace function public.fits_prefs(s public.sweets, p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select (not coalesce((p ->> 'sugar_free')::boolean, false) or s.is_sugar_free
          or (s.product_type = 'namkeen' and not ('sweet' = any(s.taste_tags))))
     and (not coalesce((p ->> 'no_nuts')::boolean, false)
          or (s.category <> 'dry-fruit' and not (s.allergens && array['nuts','tree nuts','cashew','almond','pistachio','peanut','peanuts'])
              and not (s.ingredients && array['cashew','almond','pistachio','kaju','badam','pista','peanut','peanuts','walnut'])))
     and (not coalesce((p ->> 'jain')::boolean, false) or s.is_jain)
     and (not coalesce((p ->> 'no_milk')::boolean, false) or s.is_vegan);
$$;

-- One order for the whole plan: every box with its own address and date. Prices from the database.
create or replace function public.place_gift_plan_order(p_plan_id bigint, p_payment_method text default 'cod', p_coupon_code text default null)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_plan public.gift_plans; v_order public.orders; v_total numeric; v_bad text;
  v_coupon public.coupons; v_cdisc numeric := 0;
begin
  if v_uid is null then raise exception 'Please log in' using errcode = '28000'; end if;
  if p_payment_method not in ('cod', 'pay_at_shop') then raise exception 'Unsupported payment method' using errcode = '22023'; end if;
  select * into v_plan from public.gift_plans where id = p_plan_id and user_id = v_uid for update;
  if v_plan.id is null then raise exception 'Gift plan not found' using errcode = '22023'; end if;
  if v_plan.status <> 'draft' then raise exception 'This plan is already ordered' using errcode = '22023'; end if;
  if not exists (select 1 from public.gift_box_items i join public.gift_boxes b on b.id = i.box_id where b.plan_id = v_plan.id) then
    raise exception 'The plan has no boxes yet' using errcode = '22023';
  end if;
  select r.name || ': ' || s.name into v_bad
  from public.gift_box_items i join public.gift_boxes b on b.id = i.box_id join public.gift_recipients r on r.id = b.recipient_id
  join public.sweets s on s.id = i.sweet_id
  where b.plan_id = v_plan.id and (not public.fits_prefs(s, r.prefs) or not s.in_stock) limit 1;
  if v_bad is not null then raise exception 'A box breaks a preference or is out of stock (%)', v_bad using errcode = '22023'; end if;
  if exists (select 1 from public.gift_recipients r where r.plan_id = v_plan.id and not r.deliver_self
             and coalesce(r.address ->> 'line1', '') = '') then
    raise exception 'Add an address for every box (or choose "I''ll deliver myself")' using errcode = '22023';
  end if;

  update public.gift_boxes b set price = public.gift_box_total(b.id) where b.plan_id = v_plan.id;
  select sum(price) into v_total from public.gift_boxes where plan_id = v_plan.id;

  if nullif(trim(p_coupon_code), '') is not null then
    select * into v_coupon from public.coupons where upper(code) = upper(trim(p_coupon_code)) and user_id = v_uid for update;
    if v_coupon.id is null or v_coupon.used_at is not null or v_coupon.expires_at < now() or v_total < v_coupon.min_order then
      raise exception 'Coupon cannot be used on this plan' using errcode = '22023';
    end if;
    v_cdisc := case v_coupon.kind when 'percent' then round(v_total * v_coupon.value / 100.0)
                                  when 'flat' then least(v_coupon.value, v_total) else 0 end;
  end if;

  insert into public.orders (user_id, fulfilment, payment_method, address, delivery_slot, subtotal, discount, total,
                             order_type, gift_plan_id, coupon_id, coupon_discount, scheduled_for)
  values (v_uid, 'delivery', p_payment_method, null,
          format('%s gift boxes · %s', (select count(*) from public.gift_boxes where plan_id = v_plan.id), v_plan.title),
          v_total, v_cdisc, v_total - v_cdisc, 'gift_plan', v_plan.id, v_coupon.id, v_cdisc,
          (select min(deliver_on)::timestamp at time zone public.shop_tz() from public.gift_recipients where plan_id = v_plan.id))
  returning * into v_order;

  insert into public.order_items (order_id, sweet_id, variant_id, quantity, price, list_price)
  select v_order.id, i.sweet_id, i.variant_id, sum(i.qty), v.price, v.price
  from public.gift_box_items i join public.gift_boxes b on b.id = i.box_id join public.sweet_variants v on v.id = i.variant_id
  where b.plan_id = v_plan.id group by i.sweet_id, i.variant_id, v.price;

  if v_coupon.id is not null then update public.coupons set used_at = now(), used_order_id = v_order.id where id = v_coupon.id; end if;
  update public.gift_plans set status = 'ordered', order_id = v_order.id, updated_at = now() where id = v_plan.id;
  update public.sweets s set popularity = s.popularity + x.q
  from (select i.sweet_id, sum(i.qty) as q from public.gift_box_items i join public.gift_boxes b on b.id = i.box_id
        where b.plan_id = v_plan.id group by 1) x where s.id = x.sweet_id;
  perform public.assign_scratch_reward(v_order.id);
  return v_order;
end;
$$;

-- ---------------------------------------------------------------- demand prediction
-- Daily kg sold per sweet (regular sales by order date; pre-orders by their slot date).
create or replace function public.daily_sales_kg(p_from date, p_to date)
returns table (day date, sweet_id bigint, kg numeric, revenue numeric)
language sql stable security definer set search_path = '' as $$
  select (coalesce(case when o.order_type = 'preorder' then o.scheduled_for end, o.created_at) at time zone public.shop_tz())::date,
         oi.sweet_id,
         sum(oi.quantity * public.variant_grams(v.weight_label, v.grams)) / 1000.0,
         sum(oi.quantity * oi.price)
  from public.orders o join public.order_items oi on oi.order_id = o.id
  left join public.sweet_variants v on v.id = oi.variant_id
  where o.status <> 'cancelled'
    and (coalesce(case when o.order_type = 'preorder' then o.scheduled_for end, o.created_at) at time zone public.shop_tz())::date between p_from and p_to
  group by 1, 2;
$$;
revoke execute on function public.daily_sales_kg(date, date) from anon, authenticated;

create or replace function public.predict_demand(target_date date default null)
returns table (sweet_id bigint, name text, category text, predicted_kg numeric, low_kg numeric, high_kg numeric,
               stock_kg numeric, make_kg numeric, reasons text[], base_kg numeric, trend numeric,
               festival_mult numeric, weather_mult numeric, preorder_kg numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_target date := coalesce(target_date, public.shop_today() + 1);
  v_weeks int := coalesce((public.setting('prediction') ->> 'history_weeks')::int, 8);
  v_buffer numeric := coalesce((public.setting('prediction') ->> 'safety_buffer_kg')::numeric, 0.5);
  v_from date; v_w jsonb; v_idx int; v_tmax numeric; v_tmin numeric; v_rain numeric; v_wx text := 'pleasant';
begin
  if not public.is_admin() then raise exception 'Owner only' using errcode = '42501'; end if;
  v_from := v_target - v_weeks * 7;
  -- Tomorrow's weather from the cached Open-Meteo forecast.
  select data into v_w from public.weather_cache where city = public.setting('shop') ->> 'city';
  if v_w is not null then
    select i - 1 into v_idx from jsonb_array_elements_text(v_w -> 'daily' -> 'time') with ordinality as d(x, i) where x::date = v_target;
    if v_idx is not null then
      v_tmax := (v_w -> 'daily' -> 'temperature_2m_max' ->> v_idx)::numeric;
      v_tmin := (v_w -> 'daily' -> 'temperature_2m_min' ->> v_idx)::numeric;
      v_rain := coalesce((v_w -> 'daily' -> 'precipitation_sum' ->> v_idx)::numeric, 0);
      v_wx := case when v_rain >= 5 then 'rainy' when v_tmax < 20 or v_tmin < 10 then 'cold' when v_tmax > 32 then 'hot' else 'pleasant' end;
    end if;
  end if;
  if public.setting('demo') ->> 'context' in ('cold', 'hot', 'rainy') then v_wx := public.setting('demo') ->> 'context'; end if;

  return query
  with hist as (select * from public.daily_sales_kg(v_from, v_target - 1)),
  days as (select generate_series(v_from, v_target - 1, interval '1 day')::date as day),
  cand as (
    select s.id, s.name, s.category, s.tags, s.served_temp, s.is_fried, s.product_type from public.sweets s
    where s.in_stock and (exists (select 1 from hist h where h.sweet_id = s.id)
       or exists (select 1 from public.orders o join public.order_items oi on oi.order_id = o.id
                  where o.order_type = 'preorder' and o.status <> 'cancelled' and oi.sweet_id = s.id
                    and (o.scheduled_for at time zone public.shop_tz())::date = v_target))
  ),
  grid as (select c.id, d.day, coalesce(h.kg, 0) as kg from cand c cross join days d left join hist h on h.sweet_id = c.id and h.day = d.day),
  stats as (
    select g.id,
      avg(g.kg) filter (where extract(dow from g.day) = extract(dow from v_target)) as dow_avg,
      stddev_samp(g.kg) filter (where extract(dow from g.day) = extract(dow from v_target)) as dow_sd,
      avg(g.kg) as all_avg,
      avg(g.kg) filter (where g.day >= v_target - 7) as last7,
      avg(g.kg) filter (where g.day >= v_target - 14 and g.day < v_target - 7) as prev7
    from grid g group by g.id
  ),
  cat as (select c.category, avg(st.all_avg) as cat_avg from cand c join stats st on st.id = c.id group by c.category),
  pre as (
    select oi.sweet_id, sum(oi.quantity * public.variant_grams(v.weight_label, v.grams)) / 1000.0 as kg
    from public.orders o join public.order_items oi on oi.order_id = o.id left join public.sweet_variants v on v.id = oi.variant_id
    where o.order_type = 'preorder' and o.status <> 'cancelled' and (o.scheduled_for at time zone public.shop_tz())::date = v_target
    group by 1
  ),
  fest_raw as (
    select c.id, f.name, f.starts_on,
           case when f.starts_on - v_target between 0 and 2 then f.demand_multiplier else 1 + (f.demand_multiplier - 1) * 0.5 end
           * case when c.category = any(f.featured_categories) or c.tags && f.featured_tags then 1 else 0.55 end
           + case when c.category = any(f.featured_categories) or c.tags && f.featured_tags then 0 else 0.45 end as m
    from cand c join public.festivals f on f.active and f.starts_on - v_target between 0 and f.lead_days
  ),
  -- The festival that moves this sweet the most explains it ("Dussehra is tomorrow").
  fest as (
    select distinct on (fr.id) fr.id, fr.m as mult,
           fr.name || case when fr.starts_on = v_target then ' is tomorrow' else ' in ' || (fr.starts_on - v_target) || ' days' end as why
    from fest_raw fr order by fr.id, fr.m desc, fr.starts_on
  ),
  calc as (
    select c.id, c.name, c.category,
      round(coalesce(nullif(st.dow_avg, 0), nullif(st.all_avg, 0), ct.cat_avg, 0.3)::numeric, 2) as base,
      round(least(1.3, greatest(0.7, coalesce(st.last7 / nullif(st.prev7, 0), 1)))::numeric, 2) as trend,
      round(coalesce(fe.mult, 1)::numeric, 2) as fmult, fe.why as fwhy,
      round(case v_wx
        when 'cold' then case when c.category = 'halwa' or c.tags && array['winter'] or c.served_temp = 'warm' then 1.15
                              when c.served_temp = 'cold' then 0.88 else 1 end
        when 'hot' then case when c.served_temp = 'cold' or c.tags && array['summer'] then 1.15
                             when c.category = 'halwa' then 0.88 else 1 end
        when 'rainy' then case when c.is_fried then 1.12 else 1 end
        else 1 end, 2) as wmult,
      coalesce(pr.kg, 0) as prekg,
      coalesce(st.dow_sd, st.all_avg * 0.4, 0.2) as sd,
      st.dow_avg, st.all_avg
    from cand c left join stats st on st.id = c.id left join cat ct on ct.category = c.category
    left join fest fe on fe.id = c.id left join pre pr on pr.sweet_id = c.id
  ),
  out as (
    select k.*, round(k.base * k.trend * k.fmult * k.wmult + k.prekg, 2) as pred, coalesce(public.stock_kg(k.id), 0) as stk
    from calc k
  )
  select o.id, o.name, o.category, o.pred,
         round(greatest(o.prekg, o.pred - o.sd), 2), round(o.pred + o.sd, 2), o.stk,
         (ceil(greatest(0, o.pred - o.stk + v_buffer) * 2) / 2.0)::numeric(8,1),
         array_remove(array[
           case when o.all_avg >= 0.4 and o.dow_avg / nullif(o.all_avg, 0) >= 1.15
                then to_char(v_target, 'FMDay') || ' is usually ' || round((o.dow_avg / o.all_avg - 1) * 100) || '% busier' end,
           case when o.all_avg >= 0.4 and o.dow_avg / nullif(o.all_avg, 0) <= 0.85
                then to_char(v_target, 'FMDay') || 's are usually ' || round((1 - o.dow_avg / o.all_avg) * 100) || '% quieter' end,
           case when o.trend >= 1.08 then 'Selling ' || round((o.trend - 1) * 100) || '% more this week'
                when o.trend <= 0.92 then 'Selling ' || round((1 - o.trend) * 100) || '% less this week' end,
           case when o.fmult >= 1.05 then o.fwhy end,
           case when o.prekg > 0 then o.prekg || ' kg pre-ordered' end,
           case when o.wmult > 1 then case v_wx when 'cold' then 'Cold weather boosts warm sweets' when 'hot' then 'Hot day: cold sweets sell more'
                                                when 'rainy' then 'Rain means garam fried snacks' end
                when o.wmult < 1 then case v_wx when 'cold' then 'Cold day: fewer cold desserts' else 'Hot day: less halwa' end end
         ], null),
         o.base, o.trend, o.fmult, o.wmult, o.prekg
  from out o
  order by ceil(greatest(0, o.pred - o.stk + v_buffer) * 2) desc, o.pred desc;
end;
$$;

-- Actual vs predicted for the chart: prediction for each past day uses only the 4 weeks before it.
create or replace function public.demand_backtest(p_days int default 30, p_sweet_ids bigint[] default null)
returns table (day date, sweet_id bigint, actual_kg numeric, predicted_kg numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_to date := public.shop_today() - 1; v_from date := public.shop_today() - least(greatest(p_days, 7), 60);
begin
  if not public.is_admin() then raise exception 'Owner only' using errcode = '42501'; end if;
  return query
  with ids as (
    select x.sweet_id from (
      select h.sweet_id, sum(h.kg) as k from public.daily_sales_kg(v_from, v_to) h group by 1 order by 2 desc limit 5) x
    where p_sweet_ids is null
    union select unnest(p_sweet_ids) where p_sweet_ids is not null
  ),
  hist as (select * from public.daily_sales_kg(v_from - 28, v_to)),
  days as (select generate_series(v_from, v_to, interval '1 day')::date as d)
  select d.d, i.sweet_id,
         round(coalesce((select h.kg from hist h where h.sweet_id = i.sweet_id and h.day = d.d), 0), 2),
         round(((select coalesce(sum(h.kg), 0) from hist h where h.sweet_id = i.sweet_id and h.day in (d.d - 7, d.d - 14, d.d - 21, d.d - 28)) / 4.0
           * coalesce((select max(f.demand_multiplier) from public.festivals f where f.starts_on - d.d between 0 and 2), 1))::numeric, 2)
  from days d cross join ids i order by 2, 1;
end;
$$;

-- ---------------------------------------------------------------- owner dashboard
create or replace function public.owner_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := public.shop_today(); tz text := public.shop_tz(); r jsonb;
begin
  if not public.is_admin() then raise exception 'Owner only' using errcode = '42501'; end if;
  with o as (
    select o.*, (o.created_at at time zone tz)::date as d from public.orders o where o.status <> 'cancelled'
  ), day_stats as (
    select d, count(*) as orders, coalesce(sum(total), 0) as revenue
    from o where d in (v_today, v_today - 7) and order_type <> 'preorder' group by d
  ), kg as (
    select (o.created_at at time zone tz)::date as d, sum(oi.quantity * public.variant_grams(v.weight_label, v.grams)) / 1000.0 as kg
    from o join public.order_items oi on oi.order_id = o.id left join public.sweet_variants v on v.id = oi.variant_id
    where o.d in (v_today, v_today - 7) and o.order_type <> 'preorder' group by 1
  )
  select jsonb_build_object(
    'today', jsonb_build_object(
      'orders', coalesce((select orders from day_stats where d = v_today), 0),
      'revenue', coalesce((select revenue from day_stats where d = v_today), 0),
      'kg', round(coalesce((select kg from kg where d = v_today), 0), 1)),
    'last_week', jsonb_build_object(
      'orders', coalesce((select orders from day_stats where d = v_today - 7), 0),
      'revenue', coalesce((select revenue from day_stats where d = v_today - 7), 0),
      'kg', round(coalesce((select kg from kg where d = v_today - 7), 0), 1)),
    'top', coalesce((select jsonb_agg(x) from (
        select s.id, s.name, round(sum(h.kg), 1) as kg, round(sum(h.revenue)) as revenue
        from public.daily_sales_kg(v_today - 30, v_today) h join public.sweets s on s.id = h.sweet_id
        group by s.id, s.name order by 3 desc limit 8) x), '[]'),
    'slow', coalesce((select jsonb_agg(x) from (
        select s.id, s.name, coalesce(public.stock_kg(s.id), 0) as stock_kg,
               round(coalesce((select sum(h.kg) from public.daily_sales_kg(v_today - 14, v_today) h where h.sweet_id = s.id), 0), 1) as kg14
        from public.sweets s where s.in_stock and s.product_type = 'mithai' and coalesce(public.stock_kg(s.id), 0) >= 2
        order by 4, 3 desc limit 8) x), '[]'),
    'preorders', coalesce((select jsonb_agg(x order by x.day) from (
        select f.name as festival, (o.scheduled_for at time zone tz)::date as day, count(*) as orders, round(sum(o.total)) as revenue,
               round(sum((select sum(oi.quantity * public.variant_grams(v.weight_label, v.grams)) / 1000.0
                          from public.order_items oi left join public.sweet_variants v on v.id = oi.variant_id where oi.order_id = o.id)), 1) as kg
        from public.orders o left join public.festivals f on f.id = o.festival_id
        where o.order_type = 'preorder' and o.status <> 'cancelled' and o.scheduled_for >= now() - interval '1 day'
        group by 1, 2) x), '[]'),
    'scratch', jsonb_build_object(
      'issued', (select count(*) from public.scratch_cards),
      'scratched', (select count(*) from public.scratch_cards where scratched_at is not null),
      'redeemed', (select count(*) from public.coupons where source = 'scratch' and used_at is not null),
      'discount_cost', (select coalesce(sum(o.coupon_discount), 0) + coalesce(sum((select sum(oi.list_price) from public.order_items oi where oi.order_id = o.id and oi.is_free)), 0)
                        from public.orders o where o.coupon_id is not null and o.status <> 'cancelled')),
    'deals', jsonb_build_object(
      'kg_saved', round(coalesce((select sum(oi.quantity * public.variant_grams(v.weight_label, v.grams)) / 1000.0
                  from public.order_items oi join public.orders o on o.id = oi.order_id left join public.sweet_variants v on v.id = oi.variant_id
                  where o.status <> 'cancelled' and oi.list_price is not null and oi.price < oi.list_price and not oi.is_free), 0), 1),
      'revenue', round(coalesce((select sum(oi.quantity * oi.price) from public.order_items oi join public.orders o on o.id = oi.order_id
                  where o.status <> 'cancelled' and oi.list_price is not null and oi.price < oi.list_price and not oi.is_free), 0)),
      'discount', coalesce((select sum(deal_discount) from public.orders where status <> 'cancelled'), 0)),
    'waste', coalesce((select jsonb_agg(x order by x.week) from (
        select w.week, round(sum(w.kg), 1) as kg, round(sum(w.value)) as value,
               round(100 * sum(w.kg) / nullif(sum(w.kg) + coalesce((select sum(h.kg) from public.daily_sales_kg(w.week, w.week + 6) h), 0), 0), 1) as pct
        from (select date_trunc('week', l.log_date)::date as week, l.kg, l.value from public.waste_logs l where l.log_date > v_today - 56) w
        group by w.week) x), '[]'),
    'hot', coalesce((select jsonb_agg(x) from (
        select h.id, s.name, h.ready_at, h.quantity_g, h.reserved_g, h.notified, h.opened,
               (select count(*) from public.hot_reservations r where r.hot_batch_id = h.id) as reservations
        from public.hot_batches h join public.sweets s on s.id = h.sweet_id order by h.ready_at desc limit 5) x), '[]'),
    'identify', jsonb_build_object(
      'searches', (select count(*) from public.identify_logs),
      'found', (select count(*) from public.identify_logs where success),
      'recent', coalesce((select jsonb_agg(x) from (select l.description, s.name as chosen, l.success, l.created_at
                 from public.identify_logs l left join public.sweets s on s.id = l.chosen_id order by l.id desc limit 8) x), '[]'),
      'requests', (select count(*) from public.sweet_requests where status = 'new'))
  ) into r;
  return r;
end;
$$;

-- ---------------------------------------------------------------- grants
revoke execute on function public.mark_fresh_batch(bigint, numeric, timestamptz, text) from anon;
revoke execute on function public.create_hot_batch(bigint, int, int) from anon;
revoke execute on function public.predict_demand(date) from anon;
revoke execute on function public.demand_backtest(int, bigint[]) from anon;
revoke execute on function public.owner_dashboard() from anon;
revoke execute on function public.place_gift_plan_order(bigint, text, text) from anon;



-- =====================================================================
-- Part E: Web Push key store (Garam Jalebi Alert). The private VAPID key is
-- inserted once by the owner (see README) and readable only by the service role
-- (the hot-alert-push Edge Function). Never by the browser.
-- =====================================================================
create schema if not exists private;
create table if not exists private.push_keys (name text primary key, value text not null, updated_at timestamptz not null default now());
revoke all on private.push_keys from public, anon, authenticated;
create or replace function public.vapid_private_key()
returns text language sql stable security definer set search_path = '' as $$
  select value from private.push_keys where name = 'vapid_private';
$$;
revoke execute on function public.vapid_private_key() from public, anon, authenticated;
grant execute on function public.vapid_private_key() to service_role;
-- insert into private.push_keys (name, value) values ('vapid_private', '<your VAPID private key>')
--   on conflict (name) do update set value = excluded.value, updated_at = now();
