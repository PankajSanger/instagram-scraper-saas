-- PostgreSQL production schema for IG Scraper SaaS

create table if not exists users (
  id uuid primary key,
  email text not null unique,
  password_hash text not null,
  api_key_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  user_id uuid primary key references users(id) on delete cascade,
  plan text not null check (plan in ('free','pro','business')),
  status text not null check (status in ('active','canceled','past_due')),
  updated_at timestamptz not null default now()
);

create table if not exists usage_monthly (
  user_id uuid not null references users(id) on delete cascade,
  month_key text not null,
  jobs_used integer not null default 0,
  rows_used bigint not null default 0,
  primary key (user_id, month_key)
);

create table if not exists scrape_jobs (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  rows_count integer not null,
  metadata jsonb not null default '{}'::jsonb,
  sample jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_scrape_jobs_user_created on scrape_jobs(user_id, created_at desc);
