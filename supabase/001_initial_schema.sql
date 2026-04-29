-- Postara · Schema inicial no Supabase
-- Este arquivo cria:
-- 1) perfis de usuário ligados ao auth.users
-- 2) histórico de gerações
-- 3) políticas de segurança para cada usuário acessar apenas seus próprios dados

create extension if not exists pgcrypto;

-- Guardamos apenas os dados complementares ao Supabase Auth.
create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    name text,
    email text not null unique,
    subscription_plan text not null default 'free',
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint profiles_subscription_plan_check
        check (subscription_plan in ('free', 'premium'))
);

comment on table public.profiles is 'Perfil complementar ao auth.users do Supabase.';
comment on column public.profiles.subscription_plan is 'Plano atual do usuário no app.';

-- Histórico de gerações com request/response preservados em JSONB.
create table if not exists public.generation_history (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default timezone('utc', now()),
    user_id uuid not null references auth.users (id) on delete cascade,
    session_id text,
    subscription_plan text not null,
    requested_generation_mode text,
    applied_generation_mode text not null,
    mode_adjusted boolean not null default false,
    product_name text not null,
    product_features text,
    target_audience text,
    tone text,
    response_source text not null,
    response_provider text not null,
    response_model text not null,
    fallback_used boolean not null default false,
    request_json jsonb not null,
    response_json jsonb not null,
    constraint generation_history_subscription_plan_check
        check (subscription_plan in ('free', 'premium')),
    constraint generation_history_requested_generation_mode_check
        check (requested_generation_mode is null or requested_generation_mode in ('short', 'medium', 'premium')),
    constraint generation_history_applied_generation_mode_check
        check (applied_generation_mode in ('short', 'medium', 'premium'))
);

comment on table public.generation_history is 'Histórico persistido de gerações de conteúdo do Postara.';
comment on column public.generation_history.request_json is 'Snapshot completo do input aplicado na geração.';
comment on column public.generation_history.response_json is 'Resposta estruturada pronta para reuso na UI.';

create index if not exists idx_profiles_email on public.profiles (email);
create index if not exists idx_generation_history_user_id_created_at
    on public.generation_history (user_id, created_at desc);
create index if not exists idx_generation_history_session_id
    on public.generation_history (session_id);

-- Atualiza updated_at automaticamente sempre que o perfil mudar.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- Cria automaticamente o profile quando um usuário se cadastra no Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (
        id,
        name,
        email,
        subscription_plan
    ) values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'name', ''),
        new.email,
        'free'
    )
    on conflict (id) do update
    set
        email = excluded.email,
        name = case
            when excluded.name = '' then public.profiles.name
            else excluded.name
        end;

    return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.generation_history enable row level security;

-- Cada usuário vê e edita apenas o próprio perfil.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Cada usuário vê e grava apenas o próprio histórico.
drop policy if exists "generation_history_select_own" on public.generation_history;
create policy "generation_history_select_own"
on public.generation_history
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "generation_history_insert_own" on public.generation_history;
create policy "generation_history_insert_own"
on public.generation_history
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "generation_history_update_own" on public.generation_history;
create policy "generation_history_update_own"
on public.generation_history
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "generation_history_delete_own" on public.generation_history;
create policy "generation_history_delete_own"
on public.generation_history
for delete
to authenticated
using (auth.uid() = user_id);
