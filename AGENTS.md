# AI Agent Instructions for Postara

## Project Overview
Postara is an AI-powered social media content generator that transforms product information into polished marketing posts. It features content generation (via Google Gemini), user authentication, generation history tracking, and Meta social publishing capabilities.

- **Primary Language**: Portuguese (UI, documentation, comments)
- **Tech Stack**: TypeScript/Express backend + static frontend + serverless API routes
- **Deployment**: Render backend + Vercel frontend/APIs

## Build and Run Commands
- Backend development: `cd postara-backend && npm run dev`
- Build backend: `cd postara-backend && npm run build`
- Start compiled backend: `cd postara-backend && npm start`
- Type check: `cd postara-backend && npm run check`
- Build frontend/preview: `npm run build` (from root)

Requires Node.js 22.x with CommonJS modules.

## Architecture
- **Three-layer module pattern**: Each feature (auth, ai, ai-history) has Controller (HTTP), Service (logic), Repository (data), Types.
- **Routes**: /api/health, /api/auth/*, /api/ai/*, /api/social/meta/*
- **Error handling**: Custom AppError class with structured codes; global handler separates public/private details.
- **Configuration**: All env vars validated at startup in [src/config/env.ts](postara-backend/src/config/env.ts).

## Key Conventions
- **Generation modes**: short (free), medium/premium (paid). Free users auto-downgraded from premium modes.
- **Response structure**: JSON with title, caption, cta, hashtags.
- **AI resilience**: Gemini 2.5 Flash primary, with fallbacks to Lite or local templates; max 3 retries.
- **Database**: SQLite for local (users, auth, history); optional Supabase for remote sync.

## Common Pitfalls
- **SQLite persistence**: Render must have persistent disk at `/opt/render/project/src/data` or data lost on restart.
- **Environment validation**: App crashes if GEMINI_API_KEY missing/invalid.
- **CORS**: Must match deployment URLs (comma-separated).
- **Two servers**: Use `postara-backend/src/server.ts` (recommended) over root `/server.ts`.
- **Mode downgrades**: Free users requesting premium modes are transparently downgraded.

## Key Files
- [postara-backend/src/config/env.ts](postara-backend/src/config/env.ts) - Env validation pattern
- [postara-backend/src/errors/app-error.ts](postara-backend/src/errors/app-error.ts) - Error handling
- [postara-backend/src/modules/auth/](postara-backend/src/modules/auth) - Feature module example
- [postara-backend/src/modules/ai/ai.service.ts](postara-backend/src/modules/ai/ai.service.ts) - AI orchestration

For detailed setup: [META_SETUP.md](META_SETUP.md), [SUPABASE_SETUP.md](SUPABASE_SETUP.md), [postara-backend/DEPLOY_RENDER.md](postara-backend/DEPLOY_RENDER.md).</content>
<parameter name="filePath">c:\Users\user\postara\AGENTS.md