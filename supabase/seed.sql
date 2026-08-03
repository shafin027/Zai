-- 0002_seed.sql — only for local dev. Never auto-applied in prod.
-- Inserts demo profiles + a couple relations so you can boot the dev UI with content.

insert into profiles (telegram_id, telegram_username, first_name, role, locale, default_currency)
values
  (111111111, 'demo_owner', 'Demo', 'owner', 'en', 'BDT'),
  (222222222, 'sadia',      'Sadia', 'friend', 'bn', 'BDT'),
  (333333333, 'raihan',     'Raihan', 'friend', 'en', 'BDT')
on conflict (telegram_id) do nothing;
