-- Postara · Conexões sociais e publicações
-- Rode após o 001_initial_schema.sql

create table if not exists public.social_auth_accounts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    provider text not null,
    provider_user_id text not null,
    provider_user_name text,
    encrypted_access_token text not null,
    token_expires_at timestamptz,
    granted_scopes text[] not null default '{}',
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint social_auth_accounts_provider_check
        check (provider in ('meta')),
    constraint social_auth_accounts_user_provider_unique
        unique (user_id, provider)
);

create table if not exists public.social_connections (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    auth_account_id uuid not null references public.social_auth_accounts (id) on delete cascade,
    provider text not null,
    facebook_page_id text not null,
    facebook_page_name text not null,
    encrypted_page_access_token text not null,
    instagram_business_id text,
    instagram_username text,
    supports_facebook boolean not null default true,
    supports_instagram boolean not null default false,
    last_synced_at timestamptz not null default timezone('utc', now()),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint social_connections_provider_check
        check (provider in ('meta')),
    constraint social_connections_user_page_unique
        unique (user_id, facebook_page_id)
);

create table if not exists public.social_publications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    connection_id uuid references public.social_connections (id) on delete set null,
    generation_history_id uuid references public.generation_history (id) on delete set null,
    destination_network text not null,
    status text not null,
    caption_text text not null,
    media_url text,
    response_json jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    constraint social_publications_destination_network_check
        check (destination_network in ('facebook', 'instagram')),
    constraint social_publications_status_check
        check (status in ('success', 'error'))
);

create index if not exists idx_social_auth_accounts_user_id
    on public.social_auth_accounts (user_id);
create index if not exists idx_social_connections_user_id
    on public.social_connections (user_id, provider);
create index if not exists idx_social_publications_user_id_created_at
    on public.social_publications (user_id, created_at desc);

drop trigger if exists social_auth_accounts_set_updated_at on public.social_auth_accounts;
create trigger social_auth_accounts_set_updated_at
before update on public.social_auth_accounts
for each row
execute function public.set_updated_at();

drop trigger if exists social_connections_set_updated_at on public.social_connections;
create trigger social_connections_set_updated_at
before update on public.social_connections
for each row
execute function public.set_updated_at();

alter table public.social_auth_accounts enable row level security;
alter table public.social_connections enable row level security;
alter table public.social_publications enable row level security;

drop policy if exists "social_connections_select_own" on public.social_connections;
create policy "social_connections_select_own"
on public.social_connections
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "social_publications_select_own" on public.social_publications;
create policy "social_publications_select_own"
on public.social_publications
for select
to authenticated
using (auth.uid() = user_id);
