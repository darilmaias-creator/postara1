# Postara · Setup da conexão com Facebook e Instagram

## O que esta entrega cobre

- conectar contas Meta ao app
- listar páginas do Facebook e Instagram profissional vinculado
- publicar o texto escolhido no Facebook
- publicar no Instagram **quando houver uma URL pública de imagem**

## 1) Rodar a migração nova no Supabase

No `SQL Editor`, rode:

- `supabase/002_social_publishing.sql`

Ela cria:

- `social_auth_accounts`
- `social_connections`
- `social_publications`

## 2) Configurar variáveis na Vercel

Adicione estas variáveis no projeto:

- `SUPABASE_SERVICE_ROLE_KEY`
- `META_APP_ID`
- `META_APP_SECRET`
- `POSTARA_SOCIAL_SECRET`
- `POSTARA_PUBLIC_APP_URL=https://postara1.vercel.app`

Opcional:

- `META_API_VERSION=v24.0`
- `META_REDIRECT_URI=https://postara1.vercel.app/api/social/meta/callback`

## 3) Configurar o app da Meta

No app da Meta, configure:

- produto de login/OAuth
- `Valid OAuth Redirect URI`:
  - `https://postara1.vercel.app/api/social/meta/callback`

Permissões usadas pelo fluxo:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

## 4) Regras importantes do fluxo

- Facebook pode publicar só texto
- Instagram exige **imagem pública** no momento da publicação
- Para Instagram funcionar, a conta precisa ser **profissional** e estar vinculada a uma **Página do Facebook**

## 5) Onde isso aparece no app

- `Conta` → conectar/desconectar Meta
- `Gerar` ou `Histórico` → publicar a descrição selecionada em:
  - Facebook
  - Instagram
  - ambos

## Links oficiais úteis

- Facebook Login / Business: `https://developers.facebook.com/docs/facebook-login/facebook-login-for-business`
- Pages API: `https://developers.facebook.com/docs/pages-api/posts`
- Instagram Content Publishing: `https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing`
