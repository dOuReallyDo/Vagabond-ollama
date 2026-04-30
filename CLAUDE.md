# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (Express + Vite middleware) on http://localhost:3000
npm run build    # TypeScript check + Vite production build → dist/
npm run lint     # ESLint (zero warnings allowed)
npm run start    # Same as dev — runs tsx server.ts
npm test         # Run Vitest unit tests
npm run test:watch # Run Vitest in watch mode
```

## Environment Variables

Create `.env` in the project root:

```env
ZHIPU_API_KEY=your-z...here
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
GOOGLE_SAFE_BROWSING_API_KEY=***
VITE_UNSPLASH_ACCESS_KEY=your-unsplash-access-key
```

`ZHIPU_API_KEY` is served via `GET /api/config` (Express) and also injected at build time by Vite via `process.env.ZHIPU_API_KEY`. The client fetches the server endpoint first, falling back to the Vite-injected value.

`GOOGLE_SAFE_BROWSING_API_KEY` is optional. When set, the `/api/check-url` endpoint proxies requests to Google's Safe Browsing API to verify unknown URLs. Without it, the system operates in **whitelist-only mode** (URLs on trusted domains pass, all other unknown domains are replaced with safe alternatives).

`VITE_UNSPLASH_ACCESS_KEY` is optional. When set, the app searches Unsplash for destination-coherent images (hero, attractions, itinerary activities). Free tier: 50 requests/hour. Without it, falls back to picsum.photos. Get a key at https://unsplash.com/developers.

## Architecture

### Server + Client Split

`server.ts` is an Express server that:
- Exposes `/api/config` (serves the Zhipu API key to the browser)
- In dev, acts as a Vite middleware proxy (SPA hot-reload)
- In prod, serves `dist/` as static files

The entire app UI lives in `src/` and runs in the browser. **The OpenAI SDK is called directly from the browser** (`dangerouslyAllowBrowser: true`) via the Zhipu API (OpenAI-compatible), not from the server.

### ⭐ 3-Step Architecture (Apr 2026)

The app uses a **3-step sequential flow** instead of a monolithic AI call. This solves GLM-5.1 timeouts on complex trips (14+ days) by splitting the workload:

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   FORM      │────►│  STEP 1          │────►│  STEP 2          │────►│  STEP 3      │
│  (input)    │     │  ITINERARIO       │     │  ALLOGGI+TRASP   │     │  BUDGET       │
│             │     │  AI (1 call)      │     │  AI (1 call/stop)│     │  Pure JS      │
│             │     │                  │     │                  │     │              │
│             │     │  → Conferma ✏️    │     │  → Conferma ✔️   │     │  → Salva 💾   │
│             │     │  (modificabile)   │     │  (no modifica)   │     │              │
└─────────────┘     └──────────────────┘     └──────────────────┘     └──────────────┘
```

**Step 1 — Itinerary** (`src/services/step1Service.ts`):
- Single AI call generating: destinationOverview, weatherInfo, safetyAndHealth, itinerary, localTips, transportInfo, travelHighlights, mapPoints, sources
- NO flights, accommodations, restaurants, budget breakdown
- `max_tokens: 12000` (increased from 8000 for richer descriptions)
- Modifiable by user → invalidates Steps 2-3
- Descriptions: 2-3 sentences for overview/highlights, 1-2 for activities
- Sources: blog/guide/official URLs at the end
- `cleanEmptyStrings()` converts AI empty strings to null before Zod validation

**Step 2 — Accommodations + Transport** (`src/services/step2Service.ts`):
- 1 AI call per stop (city) for hotels + restaurants, 1 call for flights
- `max_tokens: 4000` per stop, `2000` for flights
- `extractStops()`: groups consecutive days by location, strips Italian prefixes, case-insensitive matching
- Each stop returns 2-3 hotel options with `bookingUrl` + `officialUrl`
- Retry with simpler prompt on failure (skip failed stops)
- Progress: "Ricerca alloggi a {{city}}... (n/total)"
- NOT modifiable — to change, go back to Step 1 (invalidates 2-3)

**Step 3 — Budget** (`src/services/step3Service.ts`):
- **Pure JS calculation** — NO AI call
- Sums costs from Step 1 (activities) + Step 2 (flights, hotels)
- Estimates food, local transport, misc
- Generates budgetWarning if total exceeds input budget
- `costTable` expanded by default

**Zod Schemas** (new v2 contracts):
- `src/shared/step1-contract.ts` — `ItineraryDraftSchema`
- `src/shared/step2-contract.ts` — `AccommodationTransportSchema`
- `src/shared/step3-contract.ts` — `BudgetCalculationSchema`
- `src/shared/contract-v2.ts` — `TravelPlanV2Schema` (composes all 3 + flags)

**Legacy monolithic flow** (`generateTravelPlan` in `travelService.ts`) is preserved as fallback via `useV2Flow` feature flag (defaults to `true`).

### AI Layer

| Function | File | Model | max_tokens | Tool |
|----------|------|-------|------------|------|
| `generateItinerary()` | `step1Service.ts` | `glm-5.1` | 12000 | web_search |
| `modifyItinerary()` | `step1Service.ts` | `glm-5.1` | 12000 | web_search |
| `searchAccommodationsAndTransport()` | `step2Service.ts` | `glm-5.1` | 4000/stop, 2000/flights | web_search |
| `calculateBudget()` | `step3Service.ts` | — (pure JS) | — | — |
| `getDestinationCountries()` | `travelService.ts` | — (Nominatim) | — | — |
| `summarizeAccommodationReviews()` | `travelService.ts` | `glm-5.1` | 1024 | web_search |
| `generateTravelPlan()` | `travelService.ts` | `glm-5.1` | 16000 | web_search (legacy) |

All AI calls use the OpenAI SDK with Zhipu API (`baseURL: https://open.bigmodel.cn/api/paas/v4`, model: `glm-5.1`, tool: `{ type: "web_search", web_search: { enable: true } }`).

### Data Contracts

**v1 (legacy)** — `src/shared/contract.ts`:
- `TravelInputsSchema` / `TravelInputs` — form inputs including optional `travelerProfile`
- `TravelPlanSchema` / `TravelPlan` — full monolithic AI response (still used by legacy flow)

**v2 (3-step)** — `src/shared/contract-v2.ts` + step contracts:
- `ItineraryDraftSchema` / `ItineraryDraft` — Step 1 output (includes `sources` array)
- `AccommodationTransportSchema` / `AccommodationTransport` — Step 2 output (includes `officialUrl` on hotels)
- `BudgetCalculationSchema` / `BudgetCalculation` — Step 3 output (costTable expanded by default)
- `TravelPlanV2Schema` / `TravelPlanV2` — composed type (inputs + 3 step data + completion flags)
- `ActiveStep` = `1 | 2 | 3`

### Frontend Components (3-Step Flow)

| Component | Purpose |
|-----------|---------|
| `StepIndicator.tsx` | Visual stepper: ① Itinerario → ② Alloggi & Trasporti → ③ Budget |
| `Step1ItineraryView.tsx` | Itinerary display + Unsplash images + "Fonti e ispirazioni" + confirm/modify |
| `Step2AccommodationView.tsx` | Hotels (with officialUrl + bookingUrl), restaurants, flights per stop |
| `Step3BudgetView.tsx` | Budget breakdown + save with visual feedback (saving → saved ✅) |

### Unsplash Image Integration

Images load in the v2 flow via:
1. `useEffect` in App.tsx triggers when `step1Data` is available
2. Extracts keywords from destinationOverview, attractions, and itinerary activities
3. Searches Unsplash API (`searchUnsplashImage`) with 300ms stagger, max 15 queries
4. Passes `unsplashImages` Map to Step1ItineraryView as prop
5. Step1ItineraryView renders: hero image, attraction card images, activity thumbnails
6. Falls back to picsum.photos when Unsplash returns no results

### Storage (3-Step)

**New table: `saved_trips_v2`** — stores trip data in 3 progressive JSONB columns + completion flags:
- `step1_data` (ItineraryDraft), `step1_completed` (boolean)
- `step2_data` (AccommodationTransport), `step2_completed` (boolean)
- `step3_data` (BudgetCalculation), `step3_completed` (boolean)
- `is_complete` (boolean) — true only when all 3 steps done
- `inputs` (TravelInputs) — original form inputs

**`src/lib/storage-v2.ts`** — 3-step save/load/invalidation:
- `createTripV2(inputs, userId)` — creates trip with inputs
- `saveStep(tripId, stepNumber, data)` — saves data for a specific step
- `invalidateStepsAfter(tripId, afterStep)` — clears subsequent steps (e.g., modifying Step 1 clears 2-3)
- `loadTripsV2(userId)` / `loadTripV2(tripId)` — loads v2 trips
- `deleteTripV2(tripId)` / `toggleFavoriteV2(tripId)` — CRUD
- `markComplete(tripId)` — marks trip as complete
- `migrateLocalTripsV2ToSupabase(userId)` — localStorage → Supabase migration after login

**Old table: `saved_trips`** — untouched, still used by legacy flow.

### Auth & Profile (`src/lib/auth.tsx`)

React context (`AuthProvider`) wrapping Supabase auth. Exposes:
- `user`, `session`, `loading`, `profile` (traveler profile from Supabase `profiles` table)
- `signIn`, `signUp`, `signInWithGoogle`, `signOut`
- `updateProfile`, `refreshProfile`

`TravelerProfile` type is defined here (fields: `age_range`, `traveler_type`, `interests[]`, `pace`, `mobility`, `familiarity`, `display_name`).

### Storage (Legacy) (`src/lib/storage.ts`)

All persistence functions use Supabase REST API when authenticated, with localStorage as fallback for guests:
- `loadProfile` / `saveProfile` — traveler profile CRUD
- `loadTrips` / `saveTrip` / `deleteTrip` / `toggleFavorite` — saved trips CRUD (v1 table)
- `migrateLocalTripsToSupabase(userId)` — called after login to migrate guest data
- `getAccessTokenFromLocalStorage()` — shared helper that reads JWT directly from localStorage key `sb-{ref}-auth-token`

### Supabase Save/Load Trip (CRITICAL — read if saving or loading breaks)

Both `saveTrip()` and `loadTrips()` bypass the Supabase JS client entirely, using REST API via `fetch()`:

**Root cause of hangs & disappearing trips**: The Supabase JS client has an `initializePromise` that blocks ALL API calls while refreshing auth tokens. On Vercel free tier, this can hang forever.

**Fixes applied**:
- `saveTrip()`: POST to `{SUPABASE_URL}/rest/v1/saved_trips` with `Authorization: Bearer *** and `apikey: {anonKey}`. Falls back to `saveTripToLocal()` (localStorage) on failure.
- `loadTrips()`: GET to `{SUPABASE_URL}/rest/v1/saved_trips?user_id=eq.{userId}` with same auth. Falls back to Supabase client only if no REST credentials, then to localStorage.
- `loadTrips()` merges Supabase + localStorage trips, deduplicating by trip_name+destination.
- `onAuthStateChange`: Only clears user/session on explicit `SIGNED_OUT` event. Ignores transient null sessions during `TOKEN_REFRESHED`.
- `signOut()` clears `vagabond_saved_trips_local` and `vagabond_traveler_profile` from localStorage before Supabase signOut.
- **`persistSession: true`** in supabase.ts (was `false`, caused session loss on Vercel → RLS blocks saves).

### Main App (`src/App.tsx`)

Large single-file component (~3600+ lines) managing:
- 2-step travel form (destination/dates → preferences)
- **3-step plan flow** (Itinerary → Accommodations → Budget) via `useV2Flow` feature flag
- Legacy monolithic plan results display (when `useV2Flow = false`)
- `StepIndicator` + `Step1ItineraryView` + `Step2AccommodationView` + `Step3BudgetView`
- `unsplashImages` state: Maps keywords → Unsplash URLs for v2 flow
- `step3SaveStatus`: 'idle' | 'saving' | 'saved' | 'error' — visual feedback on save
- User menu (top-right): profile editor modal, saved trips modal, change password modal, logout
- Hero image: prefers local JPEGs from `immagini/` (loaded via Vite glob import), falls back to Unsplash URLs
- Item images: uses Unsplash API for v2 flow, AI-provided URLs + picsum fallback for legacy

### URL Safety Layer (`src/lib/urlSafety.ts` + `src/lib/safeBrowsing.ts` + `api/check-url.ts`)

3-layer protection for all URLs generated by AI:

1. **Prompt-level**: Service prompts inject a "🔗 SICUREZZA DEI LINK" section listing trusted domains and rules.
2. **Post-processing (client)**: `sanitizeTravelPlanAsync()` checks every URL — whitelist pass, structural validation, Safe Browsing API verification.
3. **Google Safe Browsing API (server)**: `POST /api/check-url` proxies requests.

### Country Lookup (`getDestinationCountries`)

Uses **Nominatim (OpenStreetMap) API** — free, no API key, instant (~100ms), zero token cost. In-memory cache with 30-min TTL. Debounced 900ms in App.tsx.

### Deployment

Deployed to Vercel. `vercel.json` configures:
- Build: `npm run build` → `dist/`
- All routes rewrite to `/index.html` (SPA)
- `/api/*` routes pass through to Express handlers (via `@vercel/node`)

### Key Files Map

```
src/
├── App.tsx                          # Main app (3-step flow + legacy fallback)
├── shared/
│   ├── contract.ts                  # v1 schemas (TravelPlan, TravelInputs)
│   ├── contract-v2.ts               # v2 composed schema (TravelPlanV2)
│   ├── step1-contract.ts            # ItineraryDraft schema (with sources + nullish)
│   ├── step2-contract.ts            # AccommodationTransport schema (with officialUrl + nullish)
│   └── step3-contract.ts            # BudgetCalculation schema (with nullish)
├── services/
│   ├── step1Service.ts              # generateItinerary() + modifyItinerary() + cleanEmptyStrings()
│   ├── step2Service.ts              # searchAccommodationsAndTransport() (per-stop + extractStops)
│   ├── step3Service.ts              # calculateBudget() (pure JS)
│   ├── travelService.ts             # Legacy: generateTravelPlan(), getDestinationCountries()
│   └── unsplashService.ts           # Unsplash image search
├── components/
│   ├── StepIndicator.tsx            # 3-step visual stepper
│   ├── Step1ItineraryView.tsx       # Step 1: itinerary + images + sources + confirm/modify
│   ├── Step2AccommodationView.tsx   # Step 2: hotels (officialUrl + bookingUrl) + flights
│   ├── Step3BudgetView.tsx          # Step 3: budget breakdown + save feedback
│   ├── AuthForm.tsx                 # Login/Signup UI
│   ├── ProfileForm.tsx              # Traveler profile
│   ├── SavedTrips.tsx              # Saved trips list
│   ├── TravelMap.tsx               # Leaflet map
│   └── NoteSuggestions.tsx         # Clickable note suggestions
├── lib/
│   ├── auth.tsx                     # AuthProvider + useAuth hook
│   ├── storage.ts                   # v1: Supabase REST + localStorage fallback
│   ├── storage-v2.ts               # v2: 3-step save/load/invalidation
│   ├── supabase.ts                  # Supabase client
│   ├── urlSafety.ts                 # URL whitelist, validation, sanitization
│   └── safeBrowsing.ts             # Google Safe Browsing API client
supabase/
├── schema.sql                       # DB schema (profiles, saved_trips, saved_trips_v2)
└── migrations/
    └── add_saved_trips_v2.sql       # Migration: saved_trips_v2 table
```

## ⚠️ Critical Rules

### ALWAYS PULL BEFORE WORKING
Trinity works locally on a separate copy. Her version may be AHEAD. `git pull --rebase` before touching code.

### Vercel Pitfall
Routes defined ONLY in `server.ts` return 405 on Vercel. Must add corresponding `api/*.ts` serverless function for each endpoint.

### Supabase JS Client Hangs
Never use `supabase.from().insert()` or `.select()` directly for saves — the JS client blocks during token refresh. Always use REST API via `fetch()` with JWT from localStorage (see `storage-v2.ts` pattern).

### 3-Step Flow
- Modification is ONLY allowed in Step 1. Modifying Step 1 invalidates Steps 2-3.
- Steps 2 and 3 are confirmed, not modified.
- Step 3 is pure JS (no AI call) — instant calculation.
- The feature flag `useV2Flow` (default: `true`) switches between 3-step and legacy monolithic flow.

### Zod Pitfalls with AI APIs
- **`.optional()` vs `.nullish()`**: GLM-5.1 returns `null` for missing fields, not `undefined`. Use `.nullish()` for all `z.string()` and `z.number()` fields. Keep `.optional()` only for `z.array()` and `z.object()`.
- **Empty strings**: GLM-5.1 returns `""` for URLs it can't find. Use `cleanEmptyStrings()` before Zod validation to convert `""` → `null`.
- **max_tokens**: When using richer prompts (2-3 sentence descriptions), `max_tokens: 8000` is insufficient. Use `12000` for Step 1.

### Git Conflict Rule
When rebasing causes conflicts, read both sides carefully. Trinity's fixes may overlap with ours; merge intelligently.