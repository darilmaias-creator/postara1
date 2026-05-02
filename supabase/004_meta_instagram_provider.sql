-- Postara · Permitir conta Meta separada para Instagram
-- Rode após:
-- 1) 001_initial_schema.sql
-- 2) 002_social_publishing.sql

alter table public.social_auth_accounts
    drop constraint if exists social_auth_accounts_provider_check;

alter table public.social_auth_accounts
    add constraint social_auth_accounts_provider_check
    check (provider in ('meta', 'meta_instagram'));
