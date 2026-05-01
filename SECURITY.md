# Security Policy — Vagabond-ollama

## API Keys

| Key | Exposure | Notes |
|-----|----------|-------|
| `ZHIPU_API_KEY` | Served via `GET /api/config` (Express/Vercel) AND Vite build-time `process.env.ZHIPU_API_KEY` | Browser-exposed by design — all AI calls happen in the browser via OpenAI SDK. The `/api/config` endpoint is the primary delivery; Vite injection is a fallback. |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Client-side (browser) | Public keys — safe in browser code. Permissions enforced by Row Level Security. |
| `GOOGLE_SAFE_BROWSING_API_KEY` | Server-side only | Used by `/api/check-url` endpoint to proxy Safe Browsing API requests. Never exposed to the browser. |
| `VITE_UNSPLASH_ACCESS_KEY` | Client-side (browser) | Unsplash Client-ID auth — public, rate-limited (50 req/hour free tier). |

## Supabase Security

- All tables have **Row Level Security (RLS)** enabled
- Users can only read/write their own `profiles`, `saved_trips`, and `saved_trips_v2` (policy suffix `_v2`)
- Auto-profile creation via database trigger on signup
- No service_role key in client code — anon key only
- Auth state: `onAuthStateChange` only clears user/session on explicit `SIGNED_OUT` event. Transient null sessions during `TOKEN_REFRESHED` are ignored.
- `persistSession: true` in supabase.ts (required for Vercel — session must survive across requests)
- **Profile operations bypass Supabase JS client**: `updateProfile` and `fetchProfile` in `auth.tsx` use REST API + JWT read directly from `localStorage` (`getAccessTokenFromLocalStorage()` helper) instead of Supabase JS client. This avoids `initializePromise` hangs that blocked the profile save button. Same pattern used by `storage-v2.ts` for trip CRUD.

## Data Privacy

- Profile data (age, interests, travel preferences) is stored per-user in Supabase
- Travel plans are stored per-user with RLS (both `saved_trips` and `saved_trips_v2`)
- No data is shared between users
- Guest mode uses localStorage only — no PII leaves the browser
- **Zhipu AI data policy**: User inputs are sent to Zhipu AI's API for itinerary generation. Check Zhipu's current data retention/training policy at https://open.bigmodel.cn for latest information.

## Input Validation

- All inputs validated with Zod schemas before processing
- `TravelInputsSchema` enforces: `budget >= 100`, `departureCity >= 2 chars`, etc.
- `ItineraryDraftSchema`, `AccommodationTransportSchema` (includes `selectedIndex` for user selection), `BudgetCalculationSchema` validate all AI output before rendering
- `cleanEmptyStrings()` converts AI empty strings (`""`) to `null` before Zod validation (applied in both step1Service and step2Service)
- Markdown code blocks (`\`\`\`json...\`\`\``) are stripped from GLM-5.1 responses before JSON extraction in step2Service — prevents silent parse failures

## Content Security

- User-generated content (notes, destination searches) is sanitized before inclusion in prompts
- Image URLs validated against hotlink-blacklisted domains
- Unsplash images fetched via official API — no scraping

## URL Safety System

Vagabond-ollama implements a 3-layer URL protection system to prevent users from being exposed to malicious, phishing, or inappropriate links:

### Layer 1: Prompt-level Filtering
- The AI prompt includes a "🔗 SICUREZZA DEI LINK" section with an explicit whitelist of 80+ trusted domains
- GLM-5.1 is instructed to only use URLs from these domains
- Rules: no URL shorteners, no IP addresses, no suspicious TLDs, no HTTP URLs, no redirect parameters
- `bookingUrl` must be Booking.com or official hotel site; `sourceUrl` must be a trusted domain

### Layer 2: Post-processing Sanitization (`src/lib/urlSafety.ts`)
- `sanitizeTravelPlanAsync()` processes every URL field in TravelPlan objects before display (legacy flow). Sync version `sanitizeTravelPlan()` (whitelist-only) kept for tests
- **v2 flow dedicated sanitizers** (all AI-generated URLs in the 3-step flow are now sanitized, not just legacy):
  - `sanitizeStep1Urls(data: ItineraryDraft, travelInputs: TravelInputs): Promise<ItineraryDraft>` — checks attractions `sourceUrl`, `heroImageUrl`, activities `sourceUrl`/`imageUrl`, sources `url`
  - `sanitizeStep2Urls(data: AccommodationTransport, travelInputs: TravelInputs): Promise<AccommodationTransport>` — checks accommodations `bookingUrl`/`officialUrl`/`imageUrl`, restaurants `sourceUrl`, flights `bookingUrl`
  - Shared helpers: `runAsyncSanitizer()` (eliminates duplicate logic from `sanitizeTravelPlanAsync`), `isSafeImageUrl()` for image CDN whitelist
  - Called in App.tsx after `generateItinerary()`, `modifyItinerary()`, `searchAccommodationsAndTransport()`
- **Whitelisted domains**: pass through unchanged (80+ entries including booking.com, tripadvisor.com, google.com, etc.)
- **Structurally invalid URLs**: immediately replaced with safe alternatives:
  - IP addresses as host → replaced
  - URL shorteners (bit.ly, tinyurl, etc.) → replaced
  - Suspicious TLDs (.xyz, .top, .click, etc.) → replaced
  - HTTP (non-HTTPS) URLs → replaced
  - URLs with redirect parameters (utm_, fbclid, etc.) → stripped or replaced
- **Unknown but structurally valid domains**: batch-verified via Google Safe Browsing API. If API says safe → **original URL kept** (e.g., hotel official sites). If unsafe → replaced.
- Console logs `[URL Safety]` for debugging which URLs are kept vs replaced.

**Replacement policy — unsafe URLs are REMOVED and REPLACED, never shown with warnings:**

| Category | Replacement |
|----------|------------|
| Hotel/Booking | Booking.com search URL with per-stop dates & guests (`getBookingSearchUrlWithDates`) |
| Restaurant | Google Search `${name} ${city} tripadvisor` (TripAdvisor Search blocks direct linking) |
| Attraction | Google Search via `getGoogleSearchUrl()` |
| Flight | Homepage-level whitelisted airline URLs only |
| Car route ("Auto privata") | Google Maps directions link |
| Travel Blog | Removed entirely |
| Images from non-whitelisted CDNs | Removed (falls back to picsum.photos) |

**⚠️ AI Deep Links**: GLM-5.1 fabricates fake deep links (e.g., `booking.com/hotel/it/fake.html`, `tripadvisor.it/Restaurant_Review-fake`) that 404. The frontend **never trusts AI deep links** — it generates real search URLs from structured data (hotel name + city + per-stop dates). Only AI search URLs (e.g., `booking.com/searchresults`, `tripadvisor.it/Search`, `google.com/search`) are trusted.

### Layer 3: Google Safe Browsing API (`src/lib/safeBrowsing.ts` + `api/check-url.ts`)
- Unknown domains (not in whitelist, not structurally invalid) are checked against Google's Safe Browsing database **in batch** before any replacement decision
- Client calls `POST /api/check-url` which proxies to Google's API
- Server endpoint reads `GOOGLE_SAFE_BROWSING_API_KEY` from env
- **If API says safe**: original URL is **kept** (e.g., hotel official sites verified as safe)
- **If API says unsafe or no API key**: system treats unknown domains as unsafe and replaces them
- **If API error occurs**: fails closed (assumes unsafe)
- In-memory cache with 1-hour TTL to minimize API calls

### Safe Alternative Generation
- `generateSafeAlternative()` creates contextually appropriate replacement URLs
- Booking.com search URLs include **per-stop** travel dates (computed via `stopDates` in `Step2AccommodationView` from itinerary nights), guest count, and destination from `TravelInputs`
- `getBookingSearchUrlWithDates(name, city, checkin, checkout, adults)` generates Booking.com search URLs with per-stop check-in/checkout
- `getGoogleSearchUrl(query)` generates safe Google Search URLs (fallback for activities, restaurants)
- Restaurant replacements use Google Search (`${name} ${city} tripadvisor`) since TripAdvisor blocks direct search links
- Car route ("Auto privata") replacements use Google Maps directions URLs
- All replacements are functional search URLs, not dead links