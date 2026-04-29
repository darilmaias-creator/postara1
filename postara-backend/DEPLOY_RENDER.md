# Deploy do backend no Render

Este backend já está preparado para subir no Render como `Web Service` com disco persistente para o SQLite.

## O que já ficou pronto no repositório

- Blueprint em `render.yaml`
- Backend definido com `rootDir: postara-backend`
- Health check em `/api/health`
- SQLite apontado para um caminho persistente no Render
- Node travado para uma faixa compatível com `node:sqlite`

## Opção recomendada

Importar o repositório no Render usando o arquivo `render.yaml`.

## Configuração esperada

- Serviço: `Web Service`
- Runtime: `Node`
- Plano: `starter`
- Root Directory: `postara-backend`
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Health Check Path: `/api/health`

## Variáveis importantes

Preencha no Render:

- `GEMINI_API_KEY`
- `CORS_ORIGIN`

O restante já pode seguir os valores do `render.yaml`.

## Valor recomendado para CORS

Use algo neste formato:

`https://postara1.vercel.app,http://localhost:3333`

Se a URL da Vercel mudar, atualize este valor depois.

## Disco persistente

O projeto usa SQLite, então o serviço precisa de disco persistente.

- Mount Path: `/opt/render/project/src/data`
- Banco: `/opt/render/project/src/data/postara.sqlite`

## Observação importante

Sem o disco persistente, o histórico e os dados de autenticação serão perdidos a cada novo deploy ou reinício.
