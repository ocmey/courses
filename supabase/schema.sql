-- Courses en famille : schéma Supabase
-- À coller une seule fois dans Supabase > SQL Editor > Run. Peut être relancé sans danger.

create extension if not exists pgcrypto;

-- Familles et membres
create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique default upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6)),
  created_at timestamptz not null default now()
);

create table if not exists members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create or replace function my_family() returns uuid
language sql stable security definer set search_path = public as $$
  select family_id from members where user_id = auth.uid()
$$;

create or replace function create_family(p_name text, p_display_name text) returns families
language plpgsql security definer set search_path = public as $$
declare f families;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'Déjà membre d''une famille'; end if;
  insert into families(name) values (p_name) returning * into f;
  insert into members(user_id, family_id, display_name) values (auth.uid(), f.id, p_display_name);
  return f;
end $$;

create or replace function join_family(p_code text, p_display_name text) returns families
language plpgsql security definer set search_path = public as $$
declare f families;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into f from families where code = upper(trim(p_code));
  if f.id is null then raise exception 'Code inconnu'; end if;
  insert into members(user_id, family_id, display_name) values (auth.uid(), f.id, p_display_name)
    on conflict (user_id) do update set family_id = excluded.family_id, display_name = excluded.display_name;
  return f;
end $$;

-- Liste
create table if not exists items (
  id uuid primary key,
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  qty text,
  category text,
  done boolean not null default false,
  added_by text,
  done_by text,
  done_at timestamptz,
  done_store text,
  image text,
  migros_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists items_family on items(family_id);

-- Ordre des rayons et position de chaque magasin
create table if not exists store_order (
  family_id uuid not null references families(id) on delete cascade,
  store text not null,
  categories jsonb not null,
  lat double precision,
  lng double precision,
  updated_at timestamptz not null default now(),
  primary key (family_id, store)
);

-- Corrections de rayon apprises par la famille
create table if not exists dictionary (
  family_id uuid not null references families(id) on delete cascade,
  term text not null,
  category text not null,
  primary key (family_id, term)
);

-- Journal des coches en magasin (apprentissage de l'ordre en V2)
create table if not exists check_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  store text not null,
  category text,
  item_name text,
  checked_by text,
  checked_at timestamptz not null default now()
);

-- Articles déjà achetés (suggestions)
create table if not exists known_items (
  family_id uuid not null references families(id) on delete cascade,
  term text not null,
  label text not null,
  category text,
  qty text,
  image text,
  migros_id text,
  uses integer not null default 1,
  last_used timestamptz not null default now(),
  primary key (family_id, term)
);

-- Cache des recherches migros.ch (seulement pour la fonction serveur)
create table if not exists migros_cache (
  query text primary key,
  results jsonb not null,
  fetched_at timestamptz not null default now()
);

-- Sécurité : chacun ne voit que sa famille
alter table families     enable row level security;
alter table members      enable row level security;
alter table items        enable row level security;
alter table store_order  enable row level security;
alter table dictionary   enable row level security;
alter table check_log    enable row level security;
alter table known_items  enable row level security;
alter table migros_cache enable row level security;

drop policy if exists fam_read on families;
create policy fam_read on families for select using (id = my_family());
drop policy if exists mem_read on members;
create policy mem_read on members for select using (family_id = my_family());
drop policy if exists items_all on items;
create policy items_all on items for all using (family_id = my_family()) with check (family_id = my_family());
drop policy if exists order_all on store_order;
create policy order_all on store_order for all using (family_id = my_family()) with check (family_id = my_family());
drop policy if exists dict_all on dictionary;
create policy dict_all on dictionary for all using (family_id = my_family()) with check (family_id = my_family());
drop policy if exists log_all on check_log;
create policy log_all on check_log for all using (family_id = my_family()) with check (family_id = my_family());
drop policy if exists known_all on known_items;
create policy known_all on known_items for all using (family_id = my_family()) with check (family_id = my_family());

-- Temps réel
alter table items replica identity full;
do $$ begin alter publication supabase_realtime add table items;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table store_order;
exception when duplicate_object then null; end $$;
