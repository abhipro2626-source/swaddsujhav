-- 10 extra demo customers (test accounts only). Password for all: SwaadDemo#2026
-- Run in Supabase → SQL editor. Safe to re-run (skips emails that already exist).
with people(email, name, taste, favs) as (values
  ('aarav.demo@swaadsujhav.test',  'Aarav Sharma',   '{"sweetness":5,"categories":["syrup-soaked","fried"],"bases":["khoya","flour"],"regions":["North India","Uttar Pradesh"],"prefers":"milky","diet":{},"quiz_done":true}', array['gulab-jamun','jalebi','imarti','malpua']),
  ('ananya.demo@swaadsujhav.test', 'Ananya Das',     '{"sweetness":4,"categories":["bengali","milk-based"],"bases":["chhena","milk"],"regions":["Bengal","Odisha"],"prefers":"milky","diet":{},"quiz_done":true}', array['sandesh','chhena-poda','mishti-doi','rasabali']),
  ('kabir.demo@swaadsujhav.test',  'Kabir Malhotra', '{"sweetness":3,"categories":["world","baked"],"bases":["flour","cheese"],"regions":["Italy","France","Spain"],"prefers":"both","diet":{},"quiz_done":true}', array['tiramisu','french-macarons','churros','cannoli']),
  ('ishita.demo@swaadsujhav.test', 'Ishita Jain',    '{"sweetness":3,"categories":["barfi","dry-fruit"],"bases":["dry-fruit","khoya"],"regions":["Rajasthan","Gujarat"],"prefers":"dry_fruit","diet":{"jain":true},"quiz_done":true}', array['kaju-katli','badam-barfi','mohanthal','pista-barfi']),
  ('rahul.demo@swaadsujhav.test',  'Rahul Verma',    '{"sweetness":2,"categories":["dry-fruit"],"bases":["dry-fruit"],"regions":["North India"],"prefers":"dry_fruit","diet":{"sugar_free":true},"quiz_done":true}', array['anjeer-barfi','khajur-roll','sugar-free-kaju-katli','dry-fruit-laddoo']),
  ('lakshmi.demo@swaadsujhav.test','Lakshmi Nair',   '{"sweetness":4,"categories":["milk-based","halwa"],"bases":["rice","milk"],"regions":["Kerala","Tamil Nadu","South India"],"prefers":"milky","diet":{},"quiz_done":true}', array['payasam','ada-pradhaman','palkova','unniyappam']),
  ('zoya.demo@swaadsujhav.test',   'Zoya Khan',      '{"sweetness":4,"categories":["world","milk-based"],"bases":["semolina","milk"],"regions":["Hyderabad","Awadh","Middle East"],"prefers":"both","diet":{},"quiz_done":true}', array['sheer-khurma','qubani-ka-meetha','kunafa','phirni']),
  ('vikram.demo@swaadsujhav.test', 'Vikram Patil',   '{"sweetness":4,"categories":["steamed","laddoo"],"bases":["rice","coconut"],"regions":["Maharashtra","Goa"],"prefers":"both","diet":{},"quiz_done":true}', array['modak','puran-poli','shrikhand','til-laddoo']),
  ('neha.demo@swaadsujhav.test',   'Neha Gupta',     '{"sweetness":3,"categories":["brittle","laddoo"],"bases":["jaggery","sesame"],"regions":["Uttar Pradesh","North India"],"prefers":"both","diet":{"vegan":true},"quiz_done":true}', array['gur-gajak','muzaffarnagar-gur-laddoo','peanut-chikki','agra-petha']),
  ('sameer.demo@swaadsujhav.test', 'Sameer Reddy',   '{"sweetness":5,"categories":["barfi","halwa"],"bases":["besan","dry-fruit"],"regions":["Karnataka","Andhra Pradesh","South India"],"prefers":"both","diet":{},"quiz_done":true}', array['mysore-pak','dharwad-peda','pootharekulu','badam-halwa'])
), ins as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', p.email,
    extensions.crypt('SwaadDemo#2026', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', p.name), now(), now(), '', '', '', ''
  from people p where not exists (select 1 from auth.users u where u.email = p.email)
  returning id, email
), idn as (
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), i.id, i.id::text, jsonb_build_object('sub', i.id::text, 'email', i.email, 'email_verified', true), 'email', now(), now(), now()
  from ins i returning user_id
)
select count(*) as created from ins;

-- Taste profiles (the sign-up trigger already created the profile rows) and favourites.
with people(email, taste, favs) as (values
  ('aarav.demo@swaadsujhav.test',  '{"sweetness":5,"categories":["syrup-soaked","fried"],"bases":["khoya","flour"],"regions":["North India","Uttar Pradesh"],"prefers":"milky","diet":{},"quiz_done":true}', array['gulab-jamun','jalebi','imarti','malpua']),
  ('ananya.demo@swaadsujhav.test', '{"sweetness":4,"categories":["bengali","milk-based"],"bases":["chhena","milk"],"regions":["Bengal","Odisha"],"prefers":"milky","diet":{},"quiz_done":true}', array['sandesh','chhena-poda','mishti-doi','rasabali']),
  ('kabir.demo@swaadsujhav.test',  '{"sweetness":3,"categories":["world","baked"],"bases":["flour","cheese"],"regions":["Italy","France","Spain"],"prefers":"both","diet":{},"quiz_done":true}', array['tiramisu','french-macarons','churros','cannoli']),
  ('ishita.demo@swaadsujhav.test', '{"sweetness":3,"categories":["barfi","dry-fruit"],"bases":["dry-fruit","khoya"],"regions":["Rajasthan","Gujarat"],"prefers":"dry_fruit","diet":{"jain":true},"quiz_done":true}', array['kaju-katli','badam-barfi','mohanthal','pista-barfi']),
  ('rahul.demo@swaadsujhav.test',  '{"sweetness":2,"categories":["dry-fruit"],"bases":["dry-fruit"],"regions":["North India"],"prefers":"dry_fruit","diet":{"sugar_free":true},"quiz_done":true}', array['anjeer-barfi','khajur-roll','sugar-free-kaju-katli','dry-fruit-laddoo']),
  ('lakshmi.demo@swaadsujhav.test','{"sweetness":4,"categories":["milk-based","halwa"],"bases":["rice","milk"],"regions":["Kerala","Tamil Nadu","South India"],"prefers":"milky","diet":{},"quiz_done":true}', array['payasam','ada-pradhaman','palkova','unniyappam']),
  ('zoya.demo@swaadsujhav.test',   '{"sweetness":4,"categories":["world","milk-based"],"bases":["semolina","milk"],"regions":["Hyderabad","Awadh","Middle East"],"prefers":"both","diet":{},"quiz_done":true}', array['sheer-khurma','qubani-ka-meetha','kunafa','phirni']),
  ('vikram.demo@swaadsujhav.test', '{"sweetness":4,"categories":["steamed","laddoo"],"bases":["rice","coconut"],"regions":["Maharashtra","Goa"],"prefers":"both","diet":{},"quiz_done":true}', array['modak','puran-poli','shrikhand','til-laddoo']),
  ('neha.demo@swaadsujhav.test',   '{"sweetness":3,"categories":["brittle","laddoo"],"bases":["jaggery","sesame"],"regions":["Uttar Pradesh","North India"],"prefers":"both","diet":{"vegan":true},"quiz_done":true}', array['gur-gajak','muzaffarnagar-gur-laddoo','peanut-chikki','agra-petha']),
  ('sameer.demo@swaadsujhav.test', '{"sweetness":5,"categories":["barfi","halwa"],"bases":["besan","dry-fruit"],"regions":["Karnataka","Andhra Pradesh","South India"],"prefers":"both","diet":{},"quiz_done":true}', array['mysore-pak','dharwad-peda','pootharekulu','badam-halwa'])
), upd as (
  update public.profiles pr set taste_profile = p.taste::jsonb
  from people p join auth.users u on u.email = p.email
  where pr.id = u.id
  returning pr.id
)
insert into public.favorites (user_id, sweet_id)
select u.id, s.id
from people p join auth.users u on u.email = p.email
cross join lateral unnest(p.favs) as f(slug)
join public.sweets s on s.slug = f.slug
on conflict do nothing;
