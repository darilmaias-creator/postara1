# Postara · O que fazer no Supabase

Este é o caminho mais simples para colocar o projeto de pé sem custo agora.

## 1. Criar ou abrir o projeto

- Entre no painel do Supabase
- Abra o projeto que você quer usar para o Postara

## 2. Rodar o SQL inicial

- Vá em `SQL Editor`
- Crie uma nova query
- Cole o conteúdo de `supabase/001_initial_schema.sql`
- Rode a query

Esse script cria:

- `public.profiles`
- `public.generation_history`
- trigger automática para criar perfil ao registrar usuário
- RLS para cada usuário enxergar apenas seus próprios dados

## 3. Conferir o Auth

- Vá em `Authentication` → `Providers`
- Deixe `Email` habilitado

## 4. Configurar URLs do app

Vá em `Authentication` → `URL Configuration` e ajuste:

- `Site URL`: URL principal do front na Vercel
- `Redirect URLs`: adicione a URL da Vercel e a local

Exemplo:

- `https://postara1.vercel.app`
- `http://localhost:3333`

## 5. Pegar as chaves do projeto

Vá em `Project Settings` → `API` e copie:

- `Project URL`
- `anon public key`

Depois vamos usar esses valores no frontend.

## 6. O que vem depois

Quando isso estiver pronto, o próximo passo no código é:

1. trocar a autenticação local por `Supabase Auth`
2. trocar o histórico local por `public.generation_history`
3. mover a geração para uma rota compatível com Vercel ou Supabase Functions

## 7. Login com Google

Se você quiser liberar login social com Google:

- Vá em `Authentication` → `Sign In / Providers`
- Abra o provedor `Google`
- Ative o provedor

Depois você vai precisar configurar credenciais do Google Cloud:

- `Client ID`
- `Client Secret`

O callback URL esperado pelo Supabase segue este formato:

- `https://SEU-PROJETO.supabase.co/auth/v1/callback`

No seu caso:

- `https://knktwfccotaudwhxpyma.supabase.co/auth/v1/callback`

O frontend já está preparado para chamar `signInWithOAuth` com Google.
