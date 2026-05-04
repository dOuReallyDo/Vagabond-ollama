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

**Key dependencies**: `openai` (AI SDK, Zhipu-compatible), `pptxgenjs` (PPTX export — installed)

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
- `max_tokens: 16000` (increased from 12000 for long itineraries)
- **Stopover**: `inputs.stopover` is included in the Step 1 prompt's DETTAGLI VIAGGIO section (`Stopover richiesto: ${inputs.stopover || "Nessuno"}`), ensuring the AI considers stopovers in itinerary planning. Present in both `generateItinerary()` and `buildCompactPrompt()`.
- Auto-retry on truncation: if `finish_reason="length"` or JSON repair fails or `itinerary` is not an array, automatically retries with compact prompt (2 activities/day, shorter descriptions). Two attempts max.
- Modifiable by user → invalidates Steps 2-3
- Descriptions: 2-3 sentences for overview/highlights, 1-2 for activities
- Sources: blog/guide/official URLs at the end
- `cleanEmptyStrings()` converts AI empty strings to null before Zod validation
- **tripStyle** (Apr 2026): Enum `relax|balanced|adventure` in `TravelInputsSchema`. UI: 3 styled cards replacing +/- counter. Relax=1 city base+day-trip, Balanced=≥2 nights per stop, Adventure=1 night allowed. `preferredStops` hidden for Relax, visible for others. Prompt differentiated per style. Step2 `extractStops()` merges all stops into 1 for Relax mode (prevents AI fragmenting stay into multiple hotels).
- **Map**: TravelMap (Leaflet) rendered in Step1ItineraryView with mapPoints before day cards
- **Nominatim geocoding** (`src/lib/nominatim.ts`): After Zod validation in both `generateItinerary()` and `modifyItinerary()`, resolves `mapPoints`, `attractions`, and `activities` location names to accurate OSM coordinates via Nominatim API. Falls back to AI-generated coordinates if Nominatim fails. Free tier, 1 req/sec rate limiter, in-memory cache, no API key needed.
  - **`stripItalianPrefix()`**: 30+ regex patterns that remove Italian descriptive prefixes before geocoding — "Centro di Lisbona" → "Lisbona", "Escursione a Sintra" → "Sintra", "Arrivo a Faro" → "Faro", "Regione dell'Algarve" → "Algarve". Without this, Nominatim returns wrong locations or no results for Italian-prefixed names.
  - **`extractPlaceName()`**: Combined pipeline — strip Italian prefix → split on comma/paren/dash → resolve city name via `CITY_NAME_MAP`. Applied to mapPoints labels, attraction names, and activity locations.
  - **`CITY_NAME_MAP`**: 50+ Italian→local city name mappings for better Nominatim results. "lisbona"→"Lisbon", "marsiglia"→"Marseille", "monaco"→"Munich" (Monaco di Baviera, not Principato), "parigi"→"Paris", "siviglia"→"Seville", "atene"→"Athens", etc. Without this, ambiguous Italian names can geocode to wrong countries.
  - **Country code fallback**: `geocodeItinerary()` accepts `departureCity` parameter. If `detectCountryCode(destination)` fails (e.g., "Lisbona" without "Portogallo"), uses `detectCountryCode(departureCity)` as fallback. **Critical for ambiguous cities**: "Lagos" without `countrycodes=pt` geocodes to Lagos, Nigeria (6.45°, 3.39°) instead of Lagos, Portugal (37.10°, -8.67°).
  - **`geocodePlace()` fallback logic**: tries with `countryCode` first (most precise), then without (global search). Strips Italian prefixes and resolves city names before geocoding.
  - **Context-first geocoding** (May 2026): After destination geocode, all sub-locations try `"name, destination"` FIRST (e.g. "Marina Grande, Capri"), falling back to bare name only if context fails. Proximity check: results must be within 50km of main destination. Prevents "Marina Grande" geocoding to Sorrento instead of Capri.
  - **Cache-aware geocoding**: mapPoints geocode using cleaned place names. Activities geocode using only the `location` field (city name), not the activity name. Attractions try name alone first, then name+destination fallback. Duplicate city lookups are skipped (cache hit).
  - **Step 4 — City extraction**: After geocoding, extracts unique cities from itinerary day-by-day activity locations, skips generic locations, geocodes them, and **overrides mapPoints** with type "city" in visit order. Requires >= 2 valid geocoded cities.
- **Prompt updated**: mapPoints now type "city" only, MAX 10 points, representing main stops not individual attractions. JSON example: `{ "lat": 0, "lng": 0, "label": "Città tappa", "type": "city" }`
- **TravelMap city route view** (`src/components/TravelMap.tsx`): Shows only city-type mapPoints with numbered markers and directional arrows. **Markers**: 🛫 departure (green), numbered stops (purple), 🏠 return (red). **Polyline**: solid line connecting city points with ➤ arrow heads at midpoints. **Legend**: shows Partenza/Tappa/Ritorno/Percorso types. Zoom level 6 for route view. **Fallback**: if no city-type points exist, falls back to showing all valid points with dashed line.
- **estimatedLocalCost**: Must be per-person per-day (e.g. "€25 al giorno"), never total trip cost

**Step 2 — Accommodations + Transport** (`src/services/step2Service.ts`):
- **Parallel AI calls**: `Promise.allSettled` fires all stop searches + flight search concurrently (no more sequential for-loop). Car preference (`flightPreference` includes "auto") skips flight AI call entirely.
- `max_tokens: 4000` per stop, `4000` for flights (increased from 2000 — flight JSON with web_search results needs more tokens)
- `extractStops()`: groups consecutive days by location, strips Italian prefixes, case-insensitive matching. **tripStyle parameter**: when `relax`, merges all stops into 1 (prevents AI fragmenting stay into multiple hotels for sub-locations like "Anacapri" vs "Capri centro")
- Hotels MUST be within 5km of stop city (prompt rule). EXACTLY 3 options with best reviews/rating ≥4.0
- **Accommodation search** (`src/services/accommodationSearch.ts`): GLM-5.1 + web_search, verifies hotel exists at stop city, returns pros/cons/price. UI component `AccommodationReviewer` in Step2AccommodationView lets user search hotel by name, read reviews, add to stop's options.
- Each stop returns 2-3 hotel options with `bookingUrl` + `officialUrl`
- Each flight segment returns 2-3 transport options
- **Programmatic car segments**: When `flightPreference` includes "auto", `generateCarSegments()` (now `async`) creates one segment per route leg (departure→stop1→stop2→...→return) with estimated distance, fuel+tolls cost, duration, per-segment Google Maps URL — **no AI call for car transport**. **Single option per segment**: Autostrada (€0.15/km fuel + €0.07/km tolls) — 'senza pedaggi' option removed. `estimateRoadKmWithGeocode()` uses 80+ European route lookup table first, then Nominatim geocoding + haversine fallback (replaces fixed 400km fallback). `estimateDriveDurationMinutes()` uses realistic speed by distance (<100km: 60km/h, 100–400km: 90km/h, >400km: 100km/h). FlightCard uses `flight.bookingUrl` directly for Google Maps link.
- Retry with simpler prompt on failure (skip failed stops)
- Progress: "Ricerca alloggi a {{city}}... (n/total)"
- **Markdown code block stripping**: GLM-5.1 with `web_search` wraps JSON responses in `\`\`\`json...\`\`\`` markdown blocks. All 3 parse points (primary accommodations, retry accommodations, flights) strip these blocks before JSON extraction. Without this, `text.indexOf("{")` returns -1 → "Nessun JSON valido" error → `flights = []` → transports section hidden.
- **`cleanEmptyStrings()`**: Applied before Zod parse in all 3 parse points (was already in step1Service but was missing from step2Service). GLM-5.1 returns `""` for nullish fields (departureTime, arrivalTime, bookingUrl, duration) — Zod `.nullish()` rejects `""`, causing flight validation to fail silently.
- **Flight validation**: Uses `.safeParse()` (not `.parse()`) with error logging, so parse failures don't throw and can be diagnosed.
- **System message**: Flight search includes `"Sei un assistente che risponde SOLO in JSON. Nessun testo prima o dopo il JSON. Nessun markdown."` to reduce markdown wrapping.
- **Diagnostic logging**: `[Step2-Flights] Raw response length/first 300 chars` logged before parsing; errors logged on parse failure.
- **User selection**: `selectedIndex` field on AccommodationStop and FlightSegment — user clicks to select preferred option per stop/segment
- **Per-stop booking dates**: `stopDates` computed via `useMemo` in Step2AccommodationView, accumulating nights from `startDate` for Booking.com search URLs
- **Single-column layout**: content flows vertically (was 2-column with sticky map, now removed for cleaner UX)
- **TripTimeline**: horizontal stop flow at top of page (e.g. "Milano → Lisbona (3 notti) → Porto (2gg) → Milano")
- **RunningTotalBar**: live summary of selected accommodation + transport costs
- **Google Maps iframes for car routes**: Single-option car segments render full-width (max-w-2xl) instead of grid. Each car segment in FlightCard shows an embedded Google Maps iframe (`https://maps.google.com/maps?f=d&source=s_d&saddr={origin}&daddr={destination}&hl=it&output=embed`) at 400px height
- NOT modifiable — to change, go back to Step 1 (invalidates 2-3). However, going back from Step 3 sets `step2Confirmed=false`, allowing re-selection

**Step 3 — Budget** (`src/services/step3Service.ts`):
- **Pure JS calculation** — NO AI call
- Sums costs using **user-selected** options (not always options[0]) via `selectedIndex` on AccommodationStop and FlightSegment
- **5 budget categories**: Trasporti (covers flights, trains, car, ferry), Alloggi, Attività, Cibo, Extra e Imprevisti
- Removed "Trasporti locali" category (fuoriviante — not always applicable). No more `estimatedLocalCost` parsing or transport cap logic.
- **Category-specific table layouts**: Trasporti (Data|Descrizione|Costo), Alloggi (Data arrivo|Luogo|Alloggio|Notti|Costo), Attività (Data|Luogo|Descrizione|Durata|Costo)
- **Extended item fields** in step3-contract: `date`, `location`, `description`, `duration`, `hotelName`, `nights`
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
| `generateItinerary()` | `step1Service.ts` | `glm-5.1` | 16000 | web_search + Nominatim geocoding post-validation |
| `modifyItinerary()` | `step1Service.ts` | `glm-5.1` | 16000 | web_search + Nominatim geocoding post-validation |
| `searchAccommodationsAndTransport()` | `step2Service.ts` | `glm-5.1` | 4000/stop, 4000/flights | web_search (parallel `Promise.allSettled`) |
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
- `AccommodationTransportSchema` / `AccommodationTransport` — Step 2 output (includes `officialUrl` on hotels, `selectedIndex` on stops and flight segments)
- `BudgetCalculationSchema` / `BudgetCalculation` — Step 3 output (costTable expanded by default)
- `TravelPlanV2Schema` / `TravelPlanV2` — composed type (inputs + 3 step data + completion flags)
- `ActiveStep` = `1 | 2 | 3`

### Frontend Components (3-Step Flow)

| Component | Purpose |
|-----------|---------|
| `StepIndicator.tsx` | Visual stepper: ① Itinerario → ② Alloggi & Trasporti → ③ Budget |
| `Step1ItineraryView.tsx` | Itinerary display + TravelMap (Leaflet) + Unsplash images + "Fonti e ispirazioni" + confirm/modify. **`readOnly` prop**: hides modify/conferma, shows "Avanti →" |
|| `Step2AccommodationView.tsx` | TripTimeline + selectable hotels (officialUrl + bookingUrl) + selectable flights/car segments with embedded Google Maps iframes + RunningTotalBar + restaurants per stop. Single-column layout (TravelMap removed from Step 2; still in Step 1). **`readOnly` prop**: only `viewingSavedTrip` makes Step 2 read-only, not `step2Confirmed` — going back from Step 3 allows re-selection |
| `Step3BudgetView.tsx` | Budget breakdown (uses user selections) + save with visual feedback (saving → saved ✅). **`readOnly` prop**: no save button, shows "Visualizzazione viaggio salvato" |
|| `SavedTripsV2.tsx` | v2 saved trips list with step completion badges (📋 Itinerario ✓/○, 🏨 Alloggi ✓/○, 💰 Budget ✓/○), "Completo" badge, favorites sorted first, delete with confirm/cancel. `onLoad` restores full v2 flow state |
|| App.tsx (header) | "PPTX" export button in v2 header, visible when all 3 steps complete |

### Unsplash Image Integration

Images load in the v2 flow via:
1. `useEffect` in App.tsx triggers when `step1Data` is available
2. Extracts keywords from destinationOverview, attractions, and itinerary activities
3. Searches Unsplash API (`searchUnsplashImage`) with 300ms stagger, max 15 queries
4. Passes `unsplashImages` Map to Step1ItineraryView as prop
5. Step1ItineraryView renders: hero image, attraction card images, activity thumbnails
6. Falls back to picsum.photos when Unsplash returns no results

### Storage (3-Step)

**SavedTripsV2 Component** (`src/components/SavedTripsV2.tsx`):
- Replaces legacy `SavedTrips` when `useV2Flow=true`
- Step completion badges: 📋 Itinerario ✓/○, 🏨 Alloggi ✓/○, 💰 Budget ✓/○
- "Completo" badge when all 3 steps done
- Favorites sorted first, delete with confirm/cancel
- `onLoadTripV2(trip)`: restores `lastInputs`, `currentTripId`, step1/2/3 data + completion flags, sets `activeStep` to 1 for viewing
- "I miei viaggi" button in v2 flow header + overlay
- App.tsx: `savedTripsV2` state, `loadTripsV2()` calls

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

**Profile operations use REST API + JWT from localStorage** (not Supabase JS client) to avoid `initializePromise` hangs. Local `getAccessTokenFromLocalStorage()` helper reads JWT from `sb-{ref}-auth-token` key. This follows the same pattern as `storage-v2.ts` for trip CRUD.

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
- `pdfExporting` state: loading indicator for PPTX export
- `handleExportPDF` → `handleExportPPTX`: generates .pptx file via `src/lib/pptx-export.ts`
- "PPTX" button in v2 header (visible when all 3 steps complete)
- User menu (top-right): profile editor modal, saved trips modal, change password modal, logout
- Hero image: prefers local JPEGs from `immagini/` (loaded via Vite glob import), falls back to Unsplash URLs
- Item images: uses Unsplash API for v2 flow, AI-provided URLs + picsum fallback for legacy
- **Saved trip load fix (May 2026)**: completed saved trips now start from Step 1 (itinerary), not Step 3 (budget)

### PPTX Export (`src/lib/pptx-export.ts`)

- Uses `pptxgenjs` to generate `.pptx` files directly (no DOM manipulation, no html2canvas)
- **Accepts `unsplashImages` Map parameter** for Unsplash image lookups alongside AI-provided URLs
- **`lookupUnsplash()` helper** matches keys using the same logic as App.tsx: destination + attraction name, destination + activity location+name
- **Pre-fetches all image URLs to base64 data URIs** before building slides — browser-side pptxgenjs cannot fetch remote URLs, so all images must be converted first. Prefetch collects both Unsplash URLs and AI URLs
- **All images rectangular**: `rounding: true` removed — all images rendered without rounded corners
- **Slides**:
  - Cover (hero image — Unsplash fallback when no AI `heroImageUrl`)
  - Overview + Weather + Safety
  - Attractions + Map (attraction cards: Unsplash image above, text below; `cardH` 0.9 with image, 1.7 without)
  - Map points: label pill at top + Unsplash image below (0.95h)
  - Itinerary (1 day per slide with activity images — Unsplash fallback when no AI `imageUrl`; skips generic activities like pernottamento/check-in)
  - Accommodations (hotel images)
  - Restaurants (restaurant images)
  - Transport
  - Budget summary + detail (full cost tables, multi-slide pagination when items overflow)
  - Tips & Highlights
  - Sources (clickable hyperlinks)
- **Images**: hero (Unsplash fallback), activity `imageUrl` (Unsplash fallback, skips generic), attraction images (Unsplash), accommodation `imageUrl`, restaurant `imageUrl` — all via `safeImage()` with base64 fallback
- **Budget detail**: NO item limit per category — all items shown; multi-slide overflow pagination when a category's items exceed slide capacity
- **Sources**: clickable hyperlinks with URL displayed, split across slides if >10 sources

### URL Safety Layer (`src/lib/urlSafety.ts` + `src/lib/safeBrowsing.ts` + `api/check-url.ts`)

3-layer protection for all URLs generated by AI:

1. **Prompt-level**: Service prompts inject a "🔗 SICUREZZA DEI LINK" section listing trusted domains and rules.
2. **Post-processing (client)**: `sanitizeTravelPlanAsync()` checks every URL — whitelist pass, structural validation, Safe Browsing API verification (legacy flow). **v2 flow** uses dedicated sanitizers:
   - `sanitizeStep1Urls(data: ItineraryDraft, travelInputs: TravelInputs): Promise<ItineraryDraft>` — checks attractions sourceUrl, heroImageUrl, activities sourceUrl/imageUrl, sources url
   - `sanitizeStep2Urls(data: AccommodationTransport, travelInputs: TravelInputs): Promise<AccommodationTransport>` — checks accommodations bookingUrl/officialUrl/imageUrl, restaurants sourceUrl, flights bookingUrl
   - Shared helpers: `runAsyncSanitizer()` (eliminates duplicate from `sanitizeTravelPlanAsync`), `isSafeImageUrl()` for image CDN whitelist
   - Called in App.tsx after `generateItinerary()`, `modifyItinerary()`, `searchAccommodationsAndTransport()`
3. **Google Safe Browsing API (server)**: `POST /api/check-url` proxies requests.

### ⚠️ AI Deep Link Pitfall — NEVER Trust AI-Generated Deep Links

GLM-5.1 fabricates fake deep links that look real but 404 (e.g., `booking.com/hotel/it/fake.html`, `tripadvisor.it/Restaurant_Review-fake`). **The frontend NEVER uses AI deep links.** Instead, it generates search URLs from real data (hotel name, city, dates):

- **HotelCard**: Uses `getBookingSearchUrlWithDates(name, city, checkin, checkout, adults)` with per-stop dates — never uses AI `bookingUrl` directly
- **RestaurantCard**: Uses Google Search `${name} ${city} tripadvisor` (TripAdvisor Search blocks direct linking)
- **FlightCard**: For flights, only homepage-level whitelisted URLs (airline.com). For car routes, uses `flight.bookingUrl` directly (correct per-segment Google Maps URL from `generateCarSegments()`)
- **Step1 activities**: "Scopri di più" link on tourist activities (not on pernottamento/relax), fallback to Google Search via `getGoogleSearchUrl()`
- **Only AI search URLs are trusted**: `booking.com/searchresults`, `tripadvisor.it/Search`, `google.com/search`
- **`getGoogleSearchUrl(query)`**: Added to `urlSafety.ts` as a safe fallback URL generator

### Per-Stop Booking Dates

Booking.com search URLs use check-in/checkout dates calculated **per stop** from the itinerary, not whole-trip dates. `stopDates` is computed via `useMemo` in `Step2AccommodationView`, accumulating nights from `startDate`. Each stop gets its own `(checkIn, checkOut)` pair based on how many nights the itinerary spends there.

### Car Route — Programmatic Generation (FlightCard)

When `flightPreference` includes "auto" (e.g. "Auto privata"), car segments are **generated programmatically** — no AI call needed:
- `generateCarSegments()`: creates one segment per route leg (departure→stop1, stop1→stop2, ..., lastStop→departure)
- `estimateRoadKm()`: 80+ European route lookup table with real distances, fallback 400km for unknown routes
- **Programmatic car segments**: When `flightPreference` includes "auto", `generateCarSegments()` (now `async`) creates one segment per route leg (departure→stop1→stop2→...→return) with estimated distance, fuel+tolls cost, duration, per-segment Google Maps URL — **no AI call for car transport**. **Single option per segment**: Autostrada (€0.15/km fuel + €0.07/km tolls) — 'senza pedaggi' option removed. `estimateRoadKmWithGeocode()` uses 80+ European route lookup table first, then Nominatim geocoding + haversine fallback (replaces fixed 400km fallback). `estimateDriveDurationMinutes()` uses realistic speed by distance (<100km: 60km/h, 100–400km: 90km/h, >400km: 100km/h). FlightCard uses `flight.bookingUrl` directly for Google Maps link.
- **Car route segments no longer show km/duration** (commit 5bac49d): Car segments display only estimated cost (fuel + tolls) and a note "Distanza e durata: consulta Google Maps per il percorso reale". The `estimateDriveDurationMinutes` function has been removed. `generateCarSegments` now passes `duration: null` and `distance: null` instead of computed values.
- Each segment has a correct Google Maps URL (`google.com/maps/dir/CityA/CityB`) stored in `bookingUrl`
- **Embedded Google Maps iframe**: Each car segment in FlightCard shows an inline Google Maps iframe (`https://maps.google.com/maps?f=d&source=s_d&saddr={origin}&daddr={destination}&hl=it&output=embed`) with a 2-column grid layout (left: trip info, right: route map)
- FlightCard renders dedicated layout for car routes: fuel+tolls cost + Google Maps note (no distance/duration displayed) — no flight times, no "Prenota"
- FlightCard uses `isCarRoute` check via `includes()` (not `===`) and `flight.bookingUrl` directly for Google Maps link
- Schema: `distance: z.string().nullish()` added to `FlightSegmentSchema` in `step2-contract.ts`

### Country Lookup (`getDestinationCountries`)

Uses **Nominatim (OpenStreetMap) API** — free, no API key, instant (~100ms), zero token cost. In-memory cache with 30-min TTL. Debounced 900ms in App.tsx.

### Nominatim Geocoding for Step 1 TravelMap (`src/lib/nominatim.ts`)

**Implemented.** After Step 1 AI generation + Zod validation, `geocodeStep1()` resolves location names from `mapPoints`, `attractions`, and `activities` to accurate OSM coordinates via Nominatim. Called in both `generateItinerary()` and `modifyItinerary()` in `step1Service.ts`. Falls back to AI-generated coordinates if Nominatim lookup fails. Also used by `estimateRoadKmWithGeocode()` in `step2Service.ts` as a fallback for distance estimation when the route lookup table has no match. Free tier: 1 req/sec, no API key, rate limiter + in-memory cache.

**Cache-aware geocoding logic (commit 70df59e)**:
- **mapPoints**: Geocode using only city/place names, stripping descriptive Italian prefixes like "Escursione a", "Visita a", "Tour a", "Giornata a", etc. Only the actual place name is sent to Nominatim.
- **Activities**: Geocode using only the `location` field (city name), not the activity name — activity names like "Escursione in barca" are not searchable geographic locations.
- **Attractions**: Try geocoding with `name` alone first; if that fails, fall back to `name + destination` (e.g. "Colosseo, Roma").
- **Cache**: Duplicate city lookups are skipped — once a city is geocoded, subsequent lookups return cached coordinates instantly.

**Step 4 — City extraction override**:
After geocoding AI-provided points, step 4 extracts unique cities from itinerary day-by-day activity locations, skips generic locations (hotel, aeroporto, pernottamento, check-in, arrivo, partenza, etc.), geocodes them, and **overrides mapPoints** with type "city" in visit order. Requires >= 2 valid geocoded cities. This ensures TravelMap always shows the actual route (city stops), not random AI points. Falls back to all valid geocoded points with dashed line if fewer than 2 city-type points are found.

**TravelMap city route view** (`src/components/TravelMap.tsx`):
- Shows only city-type mapPoints with numbered markers and directional arrows
- **Markers**: 🛫 departure (green), numbered stops (purple), 🏠 return (red)
- **Polyline**: solid line connecting city points with ➤ arrow heads at midpoints
- **Legend**: shows Partenza/Tappa/Ritorno/Percorso route types
- Zoom level 6 for route view
- Falls back to all valid points with dashed line if no city-type points

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
│   ├── step2-contract.ts            # AccommodationTransport schema (officialUrl + selectedIndex + nullish)
│   └── step3-contract.ts            # BudgetCalculation schema (with nullish)
├── services/
│   ├── step1Service.ts              # generateItinerary() + modifyItinerary() + stop distribution rules + cleanEmptyStrings() + buildCompactPrompt() + stopover in prompt + auto-retry + Nominatim geocoding post-validation (cache-aware + Step 4 city extraction override: extracts unique cities from activity locations, skips generic, overrides mapPoints with type "city")
│   ├── step2Service.ts              # searchAccommodationsAndTransport() (parallel Promise.allSettled + async generateCarSegments() + estimateRoadKmWithGeocode() + extractStops + markdown stripping + cleanEmptyStrings + safeParse + system message) — car segments now pass duration: null, distance: null (no km/duration display)
│   ├── step3Service.ts              # calculateBudget() (pure JS, uses selectedIndex, 5 categories: Trasporti/Alloggi/Attività/Cibo/Extra e Imprevisti, category-specific tables)
│   ├── travelService.ts             # Legacy: generateTravelPlan(), getDestinationCountries()
│   └── unsplashService.ts           # Unsplash image search
├── components/
│   ├── StepIndicator.tsx            # 3-step visual stepper
│   ├── Step1ItineraryView.tsx       # Step 1: itinerary + TravelMap + Unsplash images + sources + confirm/modify
│   ├── Step2AccommodationView.tsx   # Step 2: selectable hotels/flights/car + embedded Google Maps iframes + RunningTotalBar (single-column, no TravelMap)
│   ├── Step3BudgetView.tsx          # Step 3: budget breakdown + save feedback
│   ├── AuthForm.tsx                 # Login/Signup UI
│   ├── ProfileForm.tsx              # Traveler profile
│   ├── SavedTrips.tsx              # Saved trips list (legacy)
│   ├── SavedTripsV2.tsx            # v2 saved trips list with step badges + favorites + delete confirm + onLoadTripV2
│   ├── TravelMap.tsx               # Leaflet map — city route view: numbered markers (🛫 departure, numbered stops, 🏠 return), solid polyline with ➤ arrows, legend; fallback dashed line for non-city points
│   └── NoteSuggestions.tsx         # Clickable note suggestions
├── lib/
│   ├── auth.tsx                     # AuthProvider + useAuth hook
│   ├── storage.ts                   # v1: Supabase REST + localStorage fallback
│   ├── storage-v2.ts               # v2: 3-step save/load/invalidation
│   ├── supabase.ts                  # Supabase client
│   ├── urlSafety.ts                 # URL whitelist, validation, sanitization
│   ├── safeBrowsing.ts             # Google Safe Browsing API client
│   ├── nominatim.ts                # Nominatim geocoding — stripItalianPrefix() (30+ regex), CITY_NAME_MAP (50+ Italian→local), extractPlaceName() pipeline, country code fallback from departureCity, Step 4 city extraction override, rate limiter + cache
│   └── pptx-export.ts              # PPTX export (pptxgenjs, accepts unsplashImages Map, lookupUnsplash() helper, image pre-fetch to base64, all images rectangular, Unsplash fallback for hero/attractions/activities/map points, full budget detail, clickable source links)
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

### Auth REST API (Profile Operations)
`updateProfile` and `fetchProfile` in `auth.tsx` now use REST API + JWT from `localStorage` instead of Supabase JS client. This fixes the `initializePromise` hang that caused the profile save button to freeze. A local `getAccessTokenFromLocalStorage()` helper reads JWT from `sb-{ref}-auth-token` in localStorage. This follows the same pattern used in `storage-v2.ts` for trip CRUD.

### AI Deep Links — NEVER Trust Them
GLM-5.1 generates fake deep links (`booking.com/hotel/it/fake.html`, `tripadvisor.it/Restaurant_Review-fake`) that 404. The frontend generates search URLs from real data instead:
- HotelCard → `getBookingSearchUrlWithDates(name, city, checkin, checkout, adults)` with per-stop dates
- RestaurantCard → Google Search `${name} ${city} tripadvisor`
- FlightCard flights → homepage-level whitelisted URLs only; car routes → `flight.bookingUrl` directly (Google Maps from `generateCarSegments()`)
- Step1 activities → "Scopri di più" on tourist activities, `getGoogleSearchUrl()` fallback
- Only search URLs are trusted: `booking.com/searchresults`, `tripadvisor.it/Search`, `google.com/search`

### Per-Stop Booking Dates
Booking.com URLs use per-stop check-in/checkout dates (computed via `useMemo` in `Step2AccommodationView`, accumulating nights from `startDate`), not whole-trip dates.

### Car Route — Programmatic Generation
When `flightPreference` includes "auto" (e.g. "Auto privata"), `generateCarSegments()` (now `async`) creates segments programmatically — no AI call. `estimateRoadKmWithGeocode()` uses route lookup table first, then Nominatim+haversine fallback (replaces fixed 400km). **Single option per segment**: Autostrada (€0.15/km fuel + €0.07/km tolls) — 'senza pedaggi' option removed. **Car segments no longer show distance or duration** (commit 5bac49d): `generateCarSegments` passes `duration: null` and `distance: null`. The `estimateDriveDurationMinutes` function has been removed. Car routes display only estimated cost + note "Distanza e durata: consulta Google Maps per il percorso reale". Single-option car routes render full-width (max-w-2xl) in FlightCard with Google Maps iframe at 400px height. FlightCard uses `isCarRoute` via `includes()` and `flight.bookingUrl` directly for Google Maps. `distance` field on `FlightSegmentSchema`.

### Step Navigation — Read-Only Mode & Resuming Trips

**Read-only mode** only applies when viewing a fully completed saved trip (`viewingSavedTrip=true`).

**Navigation behavior:**
- **"Nuova ricerca" button**: Always visible in v2 top bar (replaces old "Nuovo viaggio" link at bottom)
- **Step 2 readOnly**: Changed from `step2Confirmed || viewingSavedTrip` to `viewingSavedTrip` only. Going back from Step 3 sets `step2Confirmed=false`, allowing the user to re-select accommodations without going back to Step 1.
- **Incomplete saved trips**: Only fully completed trips (`is_complete=true`) are view-only. Incomplete trips resume from the first unfinished step: `step1Confirmed = !!trip.step1_data` (not `trip.step1_completed`), `viewingSavedTrip=false` for incomplete trips.
- **"Avanti →" auto-starts**: When pressing "Avanti →" on Step 1, if `step2Data` is null, it auto-calls `confirmItinerary()`. Same for Step 2 → Step 3: auto-calculates budget if `step3Data` is null.

Steps 1 and 2 are always rendered when navigating back from Step 3. "Itinerario confermato!" / "Alloggi confermati!" placeholders only show when next step data hasn't loaded yet.

- **Bug fix (May 2026)**: Completed saved trips now load starting from Step 1 (itinerary) instead of Step 3 (budget). The bug was in the `onLoadTripV2` handler where the else branch set `activeStep=3` for trips with step1+step2 completed (which included fully completed trips). Now: incomplete trips go to first unfinished step, completed trips go to Step 1.

### 3-Step Flow
- Modification is ONLY allowed in Step 1. Modifying Step 1 invalidates Steps 2-3.
- Steps 2 and 3 are confirmed, not modified.
- Step 3 is pure JS (no AI call) — instant calculation.
- The feature flag `useV2Flow` (default: `true`) switches between 3-step and legacy monolithic flow.

### Stop Distribution (AI Prompt)
- The Step 1 prompt enforces "REGOLE PER LA DISTRIBUZIONE DELLE TAPPE": max N/2 stops for N days, 2-3 nights in major cities, base + day-trip pattern, `location` field must match overnight city.
- The compact prompt includes: "TAPPE: MAX N/2 tappe per viaggio di N giorni. Città principali: 2-3 notti."

### Budget Step 3 Categories
- **5 categories**: Trasporti (covers flights, trains, car, ferry), Alloggi, Attività, Cibo, Extra e Imprevisti
- Removed "Trasporti locali" — fuoriviante, not always applicable. No more `estimatedLocalCost` parsing or transport cap logic.
- Category-specific table layouts: Trasporti (Data|Descrizione|Costo), Alloggi (Data arrivo|Luogo|Alloggio|Notti|Costo), Attività (Data|Luogo|Descrizione|Durata|Costo)
- Extended item fields in step3-contract: `date`, `location`, `description`, `duration`, `hotelName`, `nights`

### Zod Pitfalls with AI APIs
- **`.optional()` vs `.nullish()`**: GLM-5.1 returns `null` for missing fields, not `undefined`. Use `.nullish()` for all `z.string()` and `z.number()` fields. Keep `.optional()` only for `z.array()` and `z.object()`.
- **Empty strings**: GLM-5.1 returns `""` for URLs it can't find. Use `cleanEmptyStrings()` before Zod validation to convert `""` → `null`.
- **Markdown code blocks**: GLM-5.1 with `web_search` wraps JSON in `\`\`\`json...\`\`\`` blocks instead of raw JSON. Always strip these blocks before JSON extraction (`text.replace(/^```json\s*|^```\s*|```$/gm, "")`). Without this, `indexOf("{")` returns -1 and parsing fails silently.
- **max_tokens**: Step 1 uses `max_tokens: 16000` (increased from 12000 for longer itineraries). Step 2 flights uses `max_tokens: 4000` (increased from 2000). If still truncated, auto-retry with compact prompt kicks in (Step 1 only).
- **JSON truncation**: GLM-5.1 may truncate JSON on long trips (7+ days). The code auto-retries with `buildCompactPrompt()` (fewer activities, shorter descriptions). Check `finish_reason` in logs — if "length", the response was cut off.
- **`safeParse(j)` vs `safeParse(json)`**: Always validate the cleaned data (`j` after `cleanEmptyStrings`), not the raw parsed JSON.
- **`.safeParse()` over `.parse()`**: Use `.safeParse()` for flight/accommodation validation so failures log errors instead of throwing. Step 2 flights uses `.safeParse()` with error logging.

### Git Conflict Rule
When rebasing causes conflicts, read both sides carefully. Trinity's fixes may overlap with ours; merge intelligently.

### Read-Only Mode for Saved Trips
- All 3 step components accept `readOnly?: boolean` prop
- `viewingSavedTrip` state in App.tsx — set to `true` only for **fully completed** saved trips
- **Incomplete trips**: resume from first unfinished step, `viewingSavedTrip=false`, `step1Confirmed=!!trip.step1_data`
- **Steps 1 and 2 are always rendered** when navigating back from Step 3 (not hidden behind conditional). Step 2 readOnly is `viewingSavedTrip` only (not `step2Confirmed || viewingSavedTrip`). Going back from Step 3 sets `step2Confirmed=false`
- "Itinerario confermato!" / "Alloggi confermati!" placeholders only show when next step data hasn't loaded yet
- When `readOnly=true`: no edit/confirm/save buttons, only "← Indietro" / "Avanti →" navigation between steps
- Step1: hides modify/conferma, shows "Avanti →"
- Step2: hotel/flight selection disabled, no conferma, shows "← Indietro" + "Avanti →"
- Step3: no save, shows "Visualizzazione viaggio salvato"
- Step indicator is clickable for navigation in readOnly mode
- **"Nuova ricerca" button** in v2 top bar resets state (replaces old "Nuovo viaggio" link at bottom)
- **"Avanti →" auto-starts**: pressing "Avanti →" on Step 1 auto-calls `confirmItinerary()` if step2Data is null; pressing "Avanti →" on Step 2 auto-calculates budget if step3Data is null
- **Bug fix (May 2026)**: Completed saved trips now load starting from Step 1 (itinerary) instead of Step 3 (budget). The bug was in the `onLoadTripV2` handler where the else branch set `activeStep=3` for trips with step1+step2 completed (which included fully completed trips). Now: incomplete trips go to first unfinished step, completed trips go to Step 1.