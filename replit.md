# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Python**: 3.11 (for ClipIO video processing)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── clipio/             # ClipIO frontend (React + Vite)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Applications

### ClipIO (`/clipio/`)

An AI-powered viral short clips generator (like OpusClip). Users paste a YouTube URL and the app:
1. Downloads the video (yt-dlp)
2. Transcribes the audio (AssemblyAI)
3. Analyzes viral moments (Gemini AI)
4. Generates vertical 9:16 clips with animated subtitles (FFmpeg)
5. Serves downloadable MP4 clips

**Frontend**: React + Vite at `/clipio/`
**Backend API routes**: `/api/clipio/*` in `artifacts/api-server/src/routes/clipio.ts`
**Python processor**: `artifacts/api-server/src/clipio/processor.py`

**API Keys**:
- `GEMINI_API_KEY` - Google Gemini 2.5 Pro for viral moment analysis
- `ASSEMBLYAI_API_KEY` - AssemblyAI for audio transcription with word timestamps

**Caption styles**: tiktok, hormozi, mrbeast, minimal, neon, podcast

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers
  - `health.ts` — GET /api/healthz
  - `clipio.ts` — ClipIO video processing routes
- Python processor: `src/clipio/processor.py` — runs as spawned child process

### `artifacts/clipio` (`@workspace/clipio`)

ClipIO frontend — mobile-first dark UI for generating viral short clips from YouTube videos.

Pages:
- `/` — Home: URL input, caption style, max clips selector
- `/process/:jobId` — Processing: real-time progress polling
- `/results/:jobId` — Results: clip gallery with download buttons

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI spec (`openapi.yaml`) and Orval config. Run codegen:
`pnpm --filter @workspace/api-spec run codegen`
