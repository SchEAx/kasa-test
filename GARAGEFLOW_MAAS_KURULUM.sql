-- KasaFlow V1.1.1 - Avans & Maaş modülü kurulumu
-- Bu dosyayı Avans-Maaş uygulamasının bağlı olduğu Supabase projesinde
-- SQL Editor ekranından bir kez çalıştırın.

create extension if not exists pgcrypto;

alter table public.avans_personel
  add column if not exists salary_tracking_start date,
  add column if not exists is_active boolean default true;

update public.avans_personel
set salary_tracking_start = date_trunc('month', current_date)::date
where salary_tracking_start is null;

alter table public.avans_personel
  alter column salary_tracking_start set default current_date;

update public.avans_personel
set is_active = true
where is_active is null;

create table if not exists public.maas_odemeleri (
  id uuid primary key default gen_random_uuid(),
  person_id text not null,
  pay_period date not null,
  gross_salary numeric(14,2) not null default 0 check (gross_salary >= 0),
  advance_deduction numeric(14,2) not null default 0 check (advance_deduction >= 0),
  net_paid numeric(14,2) not null default 0 check (net_paid >= 0),
  paid_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  unique (person_id, pay_period)
);

create index if not exists maas_odemeleri_person_period_idx
  on public.maas_odemeleri (person_id, pay_period desc);

alter table public.maas_odemeleri enable row level security;

drop policy if exists "garageflow_maas_select" on public.maas_odemeleri;
create policy "garageflow_maas_select"
  on public.maas_odemeleri for select
  to anon, authenticated
  using (true);

drop policy if exists "garageflow_maas_insert" on public.maas_odemeleri;
create policy "garageflow_maas_insert"
  on public.maas_odemeleri for insert
  to anon, authenticated
  with check (true);

drop policy if exists "garageflow_maas_update" on public.maas_odemeleri;
create policy "garageflow_maas_update"
  on public.maas_odemeleri for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "garageflow_maas_delete" on public.maas_odemeleri;
create policy "garageflow_maas_delete"
  on public.maas_odemeleri for delete
  to anon, authenticated
  using (true);

grant select, insert, update, delete on public.maas_odemeleri to anon, authenticated;

-- Kontrol sorguları
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'avans_personel'
  and column_name in ('salary_tracking_start', 'is_active')
order by column_name;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'maas_odemeleri';
