# Technical Architecture — Vagabond-Ollama

## PPTX Export

`src/lib/pptx-export.ts` uses **pptxgenjs** to generate a complete .pptx presentation of a saved trip:
- **No DOM dependency** — generates slides programmatically (replaces failed html2pdf.js approach)
- **Image pre-fetch**: All image URLs (hero, activities, hotels, restaurants) are fetched via `fetch()` → blob → FileReader → base64 data URI before building slides (browser pptxgenjs can't load remote `path` URLs)
- **Slides**: Cover (hero), Overview+Weather+Safety, Attractions+Map, Itinerary (1 day/slide with images), Accommodations (hotel images), Restaurants, Transport, Budget (summary + full detail with multi-slide pagination), Tips, Sources (clickable hyperlinks)
- **Budget detail**: ALL items shown — no slicing. Pages across slides if overflow.
- **Sources**: clickable hyperlinks with URL tooltip, split every 10
- Export button "PPTX" appears in v2 header when all 3 steps complete

## Required
React SPA + Express server proxy + GLM-5.1 AI (Zhipu API) + Supabase (auth + persistence).

## Non-negotiables
- Input validation (Zod schemas with 3-step contracts)
- Row Level Security on all DB tables
- Strict JSON schema output + runtime validation per step
- Dev/Staging/Prod separation
- Client-side AI calls (`dangerouslyAllowBrowser: true`) via OpenAI SDK → Zhipu API

## Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vite + React 18 + TypeScript |
| **Styling** | Tailwind CSS v4 + Framer Motion |
| **AI** | GLM-5.1 via Zhipu API (OpenAI-compatible) with web_search tool |
| **Auth** | Supabase Auth (email/password + Google OAuth) |
| **Database** | Supabase PostgreSQL (profiles, saved_trips, saved_trips_v2) |
| **Server** | Express (dev proxy + prod static) |
| **Maps** | Leaflet + OpenStreetMap |
| **Deploy** | Vercel |
| **PPTX Export** | pptxgenjs (browser-side, image pre-fetch to base64) |

## Architecture Diagram (3-Step)

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────────┐  │
│  │ AuthForm  │  │ProfileForm│  │ TravelForm              │  │
│  │ (Supabase │  │ (Step 1)  │  │ (Step 2) + NoteSuggest  │  │
│  │  Auth)    │  │          │  │                         │  │
│  └─────┬─────┘  └─────┬────┘  └────────┬───────────────┘  │
│        │              │                │                    │
│  ┌─────▼──────────────▼────────────────▼───────────────┐   │
│  │              AuthContext                             │   │
│  │    (Supabase session + profile state)               │   │
│  └─────┬──────────────┬────────────────┬──────────────┘   │
│        │              │                │                    │
│  ┌─────▼─────┐  ┌─────▼────────────┐  ┌───────▼─────────┐ │
│  │ Supabase  │  │ 3-Step AI Layer  │  │  Storage Layer  │ │
│  │  Client   │  │ step1Service.ts  │  │ (storage-v2.ts) │ │
│  │           │  │ step2Service.ts  │  │ (Supabase+localStorage)│
│  │           │  │ step3Service.ts  │  │                 │ │
│  │           │  │ (GLM-5.1/Zhipu) │  │                 │ │
│  └───────────┘  └─────┬──────────┘  └─────────────────┘ │
│                       │                                      │
│  ┌────────────────────▼────────────────────────────┐      │
│  │           URL Safety Layer                       │      │
│  │  sanitizeTravelPlan() + Safe Browsing API check  │      │
│  └─────────────────────────────────────────────────┘      │
│                                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │           StepIndicator                            │    │
│  │  ① Itinerario → ② Alloggi & Trasporti → ③ Budget │    │
│  └────────────────────────────────────────────────────┘    │
└───────────────────────┼────────────────────────────────────┘
                        │
              ┌─────────▼─────────┐
              │  Express Server   │
              │  /api/config      │──▶ ZHIPU_API_KEY
              │  /api/check-url   │──▶ Google Safe Browsing API
              │  /api/health      │
              │  Vite middleware   │
              │  (dev mode)       │
              └───────────────────┘
```

## Data Flow (3-Step)

### Step 1 — Itinerary Generation
1. User fills profile + travel details → includes `travelerProfile` in payload
2. `step1Service.ts` builds focused prompt (itinerary only, NO flights/hotels/budget)
3. GLM-5.1 API returns JSON → validated by `ItineraryDraftSchema`
4. User reviews → **Conferma** (proceeds to Step 2) or **Modifica** (re-generates with modification request)
5. Modifying Step 1 → invalidates Steps 2-3 → user must re-confirm

### Step 2 — Accommodations + Transport Search
1. `step2Service.ts` extracts stops from itinerary (groups consecutive days by location)
2. For each stop: 1 AI call searching hotels + restaurants for that city
3. 1 AI call for flights/transport options
4. Results assembled into `AccommodationTransport` → validated by schema
5. User reviews → **Conferma** (proceeds to Step 3)
6. Cannot modify — to change, go back to Step 1 (invalidates 2-3)

### Step 3 — Budget Calculation
1. `step3Service.ts` calculates budget from Step 1 + Step 2 data
2. **Pure JS** — no AI call, instant
3. Sums: flights, accommodation, activities, food (estimated), transport, misc (10% buffer)
4. Generates `budgetWarning` if total > input budget
5. User reviews → **Salva Viaggio** (marks trip complete)

### Step Saving
Each step is saved to Supabase `saved_trips_v2` as soon as it completes (via `saveStep()`). Modification of Step 1 calls `invalidateStepsAfter(tripId, 1)` which clears Step 2 and Step 3 data.

### Legacy Flow (feature flag `useV2Flow = false`)
Monolithic `generateTravelPlan()` → `TravelPlanSchema` → ResultsView. Still functional.

### Auth Flow
1. Login/Signup via Supabase Auth
2. `AuthProvider` manages session, loads profile
3. On mount: check session → load profile → load saved trips (v2)
4. On first login after guest: migrate localStorage → Supabase

## Database

### profiles (RLS enabled)
- `id` UUID PK → auth.users
- `age_range`, `traveler_type`, `interests[]`, `pace`, `mobility`, `familiarity`
- Auto-created on signup via trigger

### saved_trips (v1, legacy — RLS enabled)
- `id` UUID PK
- `user_id` FK → profiles
- `trip_name`, `destination`
- `inputs` JSONB (TravelInputs)
- `plan` JSONB (TravelPlan)
- `is_favorite` boolean

### saved_trips_v2 (v2, 3-step — RLS enabled)
- `id` UUID PK
- `user_id` FK → profiles
- `trip_name`, `destination`
- `inputs` JSONB (TravelInputs)
- `step1_data` JSONB (ItineraryDraft) + `step1_completed` boolean
- `step2_data` JSONB (AccommodationTransport) + `step2_completed` boolean
- `step3_data` JSONB (BudgetCalculation) + `step3_completed` boolean
- `is_complete` boolean (true only when all 3 steps done)
- `is_favorite` boolean
- Index on `user_id`, `user_id+is_favorite`, incomplete trips

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `ZHIPU_API_KEY` | server + client | GLM-5.1 AI access via Zhipu API |
| `GOOGLE_SAFE_BROWSING_API_KEY` | server-side | Safe Browsing API (optional; without it, whitelist-only mode) |
| `VITE_SUPABASE_URL` | client-side | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | client-side | Supabase public key |
| `VITE_UNSPLASH_ACCESS_KEY` | client-side | Unsplash images (optional, free: 50 req/hr) |