# Vagabond-Ollama — Travel Planner AI (3-Step Architecture)

Fork di [Vagabond AI](https://github.com/dOuReallyDo/Vagabond) migrato da Claude a **GLM-5.1 via Zhipu API** con architettura a 3 step e auto-retry su troncamento.

## 🆕 Novità Aprile 2026 — Architettura 3-Step

L'app usa ora un **flusso a 3 step** invece di una singola chiamata AI monolitica. Questo risolve i timeout di GLM-5.1 su viaggi complessi (14+ giorni):

1. **Step 1 — Itinerario** (AI, 1 chiamata, max 16k token): destinazione, meteo, sicurezza, programma giorno per giorno, fonti, mappa
2. **Step 2 — Alloggi & Trasporti** (AI parallela, Promise.allSettled, 1 chiamata/tappa + voli in parallelo; segmenti auto programmatici, zero AI): hotel con bookingUrl + officialUrl, ristoranti, voli/treni/auto — **l'utente seleziona** alloggio e trasporto per ogni tappa
3. **Step 3 — Budget** (JS puro, nessuna AI): 5 categorie (Trasporti, Alloggi, Attività, Cibo, Extra e Imprevisti), tabelle strutturate per categoria, calcolo basato sulle **selezioni utente**

**Vantaggi:**
- Ogni step ha un prompt più piccolo → meno timeout
- L'utente può **modificare l'itinerario** (Step 1) prima di cercare alloggi
- Modifica Step 1 → Steps 2-3 invalidati e ricalcolati
- Viaggi lunghi (14+ giorni) non si bloccano più
- **Auto-retry**: se l'AI tronca il JSON, ritenta automaticamente con prompt compatto
- **Distribuzione tappe**: Ogni tappa ALMENO 2 notti. L'utente può scegliere quante tappe (`preferredStops`, 1-10) — l'AI usa esattamente quel numero, distribuendo le notti. Senza preferenza: max N/2 tappe per viaggio di N giorni
- **Selezione utente**: solo gli alloggi e trasporti scelti vanno nel budget
- **Costi realistici**: 5 categorie budget (Trasporti, Alloggi, Attività, Cibo, Extra e Imprevisti), tabelle strutturate per categoria

Il flusso legacy (monolitico) è ancora disponibile tramite feature flag `useV2Flow = false`.

## ✨ Caratteristiche Principali

- **Itinerari Dinamici**: Generazione di piani giornalieri dettagliati con distribuzione tappe intelligente — l'utente sceglie quante tappe (`preferredStops`), l'AI distribuisce le notti di conseguenza (sempre ≥2 notti per tappa)
- **3-Step Flow**: Itinerario → Alloggi (selezionabili) → Budget con conferma progressiva
- **Auto-retry su troncamento**: Se il JSON è troncato, ritenta con prompt più conciso
- **Mappe Interattive**: Integrazione con Leaflet/OpenStreetMap
- **Nominatim Geocoding**: Coordinate precise per le mappe tramite Nominatim (OpenStreetMap) — free tier, nessuna API key necessaria. **Cache-aware**: mapPoints stripped di prefissi descrittivi italiani, activities usano campo `location`, attractions provano nome poi nome+destinazione
- **Ricerca Real-Time**: GLM-5.1 AI con web search per prezzi reali
- **Budget Intelligence**: Calcolo automatico basato sulle selezioni utente, 5 categorie con tabelle strutturate per categoria
- **Profilo Viaggiatore**: Età, interessi, ritmo, mobilità — itinerari personalizzati
- **Immagini Unsplash**: Foto reali per destinazione, attrazioni e attività
- **Fonti verificabili**: Blog, guide e siti ufficiali per ogni itinerario
- **Autenticazione**: Supabase Auth (email + Google OAuth)
- **Viaggi Salvati**: Persistenza in 3 fasi (itinerario, alloggi, budget) su `saved_trips_v2`
- **SavedTripsV2**: Lista viaggi salvati con badge step (📋 ✓/○, 🏨 ✓/○, 💰 ✓/○), preferiti primi, elimina con conferma
- **Read-Only Trip Viewing**: Visualizza viaggi salvati completati navigando tra step senza modificare (solo "← Indietro" / "Avanti →"). Viaggi incompleti riprendono dal primo step incompiuto.
- **"Nuova ricerca" button**: Sempre visibile nella top bar v2 per resettare e ricominciare
- **URL Safety**: 3-layer protection per tutti i link (whitelist + structural + Google Safe Browsing)
- **v2 URL Safety**: `sanitizeStep1Urls()` / `sanitizeStep2Urls()` — sanificazione dedicata per il flusso 3-step
- **Search URL reali, niente deep link AI**: Il frontend genera SEMPRE search URL (Booking.com search, Google, TripAdvisor Search) dai dati reali. I deep link AI (booking.com/hotel/fake, tripadvisor/Restaurant_Review-fake) sono ignorati — causano 404
- **Car Route Programmatically**: `generateCarSegments()` crea segmenti auto in JS puro (zero AI) — costo carburante+pedaggi, link Google Maps per tratta. **Niente km/durata** (commit 5bac49d): mostra solo costo stimato e nota "Distanza e durata: consulta Google Maps per il percorso reale". Singola opzione con stima autostrada. Distanze per rotte non note calcolate via Nominatim geocoding. Google Maps iframe embedded per ogni segmento auto
- **Per-Stop Booking Date**: Booking.com URL con check-in/checkout per ogni tappa (non date intero viaggio)
- **Step Navigation UX**: "Nuova ricerca" sempre visibile nella top bar, "Avanti →" auto-inizia lo step successivo se i dati mancano, Step 2 editabile quando si torna da Step 3
- **localStorage Fallback**: Funziona anche senza login

## 🏗️ Architettura 3-Step

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   FORM      │────►│  STEP 1          │────►│  STEP 2          │────►│  STEP 3      │
│  (input)    │     │  ITINERARIO       │     │  ALLOGGI+TRASP   │     │  BUDGET       │
│             │     │  AI (1 call)      │     │  AI (parallel)   │     │  Pure JS      │
│             │     │  max 16k tokens   │     │  auto: no AI     │     │  5 categorie  │
│             │     │  → Conferma ✏️    │     │  → Conferma ✔️   │     │  → Salva 💾   │
│             │     │  (modificabile)   │     │  (no modifica)   │     │              │
└─────────────┘     └──────────────────┘     └──────────────────┘     └──────────────┘
```

### Resilienza: Auto-retry su troncamento
Se `finish_reason="length"` (JSON troncato), il sistema:
1. Verifica `finish_reason` dalla risposta AI
2. Controlla che `itinerary` sia un array valido
3. Se fallisce, ritenta automaticamente con `buildCompactPrompt()` (2 attività/giorno, descrizioni brevissime)

## 🛠️ Tech Stack

| Layer | Tecnologia |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Tailwind CSS v4 |
| **Animazioni** | Framer Motion |
| **Icone** | Lucide React |
| **AI** | GLM-5.1 via Zhipu API (OpenAI-compatible) con web_search |
| **Auth & DB** | Supabase (PostgreSQL + RLS + Auth) — REST API per CRUD, JS client solo per auth |
| **Maps** | Leaflet + OpenStreetMap |
| **Geocoding** | Nominatim (OpenStreetMap) — free, no API key |
| **Images** | Unsplash API (fallback picsum.photos) |
| **Build** | Vite |
| **Deploy** | Vercel (serverless functions per API) |

## 📦 Struttura del Progetto

```
src/
├── App.tsx                          # Main app (3-step flow + legacy fallback, ~3600 lines)
├── shared/
│   ├── contract.ts                  # v1 schemas (TravelPlan, TravelInputs)
│   ├── contract-v2.ts               # v2 composed schema (TravelPlanV2)
│   ├── step1-contract.ts            # ItineraryDraft schema (nullish + sources + mapPoints)
│   ├── step2-contract.ts            # AccommodationTransport schema (selectedIndex + officialUrl + nullish)
│   └── step3-contract.ts            # BudgetCalculation schema (nullish)
├── services/
│   ├── step1Service.ts              # generateItinerary() + modifyItinerary() + stop distribution rules + buildCompactPrompt() + auto-retry
│   ├── step2Service.ts              # searchAccommodationsAndTransport() (parallel Promise.allSettled, generateCarSegments() — car segments now pass duration: null, distance: null, no km/duration display, Nominatim geocoding for distances)
│   ├── step3Service.ts              # calculateBudget() (pure JS, 5 categorie, tabelle strutturate, no trasporti locali)
│   ├── travelService.ts             # Legacy: generateTravelPlan(), getDestinationCountries()
│   └── unsplashService.ts           # Unsplash image search
├── components/
│   ├── StepIndicator.tsx            # 3-step visual stepper
│   ├── Step1ItineraryView.tsx       # Step 1: itinerary + TravelMap + Unsplash images + sources + confirm/modify
│   ├── Step2AccommodationView.tsx   # Step 2: selectable hotels/flights/car + embedded Google Maps iframes + RunningTotalBar (single-column, no TravelMap)
│   ├── Step3BudgetView.tsx          # Step 3: 5 categorie budget + structured tables + save feedback
│   ├── AuthForm.tsx                 # Login/Signup UI
│   ├── ProfileForm.tsx              # Profilo viaggiatore
│   ├── SavedTrips.tsx              # Lista viaggi salvati (legacy)
│   ├── SavedTripsV2.tsx            # Lista viaggi salvati v2 con badge step + preferiti + elimina conferma
│   ├── TravelMap.tsx               # Leaflet map (supports types: city, beach, nature, port, museum, monument + fallback 📍; dynamic legend)
│   └── NoteSuggestions.tsx         # Clickable note suggestions
├── lib/
│   ├── auth.tsx                     # Auth context + hooks (Supabase)
│   ├── storage.ts                   # v1: Supabase REST + localStorage fallback
│   ├── storage-v2.ts               # v2: 3-step save/load/invalidation (REST API + JWT)
│   ├── supabase.ts                  # Supabase client (persistSession: true)
│   ├── urlSafety.ts                 # URL whitelist, validation, sanitization
│   ├── safeBrowsing.ts             # Google Safe Browsing API client + cache
│   └── nominatim.ts                # Nominatim geocoding (free, no API key) — cache-aware: strip prefixes, use location field, name+dest fallback; no estimateDriveDurationMinutes (removed)
api/
├── config.ts                        # Vercel serverless: serves ZHIPU_API_KEY
└── check-url.ts                     # Vercel serverless: Google Safe Browsing proxy
supabase/
├── schema.sql                       # DB schema (profiles, saved_trips, saved_trips_v2)
└── migrations/
    └── add_saved_trips_v2.sql       # Migration: saved_trips_v2 table
```

## 🔧 Setup

### 1. Installazione

```bash
git clone https://github.com/dOuReallyDo/Vagabond-ollama.git
cd Vagabond-ollama
npm install --legacy-peer-deps
```

### 2. Variabili d'ambiente

Crea un file `.env` nella root:

```env
ZHIPU_API_KEY=your-z...here
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
GOOGLE_SAFE_BROWSING_API_KEY=***
VITE_UNSPLASH_ACCESS_KEY=your-unsplash-access-key
```

| Variabile | Obbligatoria | Note |
|-----------|-------------|------|
| `ZHIPU_API_KEY` | ✅ | Servita via `/api/config` + fallback Vite build-time |
| `VITE_SUPABASE_URL` | ✅ | URL progetto Supabase |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Chiave pubblica (RLS protegge i dati) |
| `GOOGLE_SAFE_BROWSING_API_KEY` | ❌ | Senza: URL safety opera in whitelist-only mode |
| `VITE_UNSPLASH_ACCESS_KEY` | ❌ | Senza: fallback a picsum.photos |

> **Nota**: Nominatim geocoding non richiede variabili d'ambiente — è gratuito e senza API key.

### 3. Supabase Setup

1. Crea un progetto su [supabase.com](https://supabase.com)
2. Vai in **SQL Editor** ed esegui `supabase/schema.sql` (crea profiles + saved_trips + saved_trips_v2)
3. Copia **Project URL** e **anon public key** in `.env`

### 4. Deploy su Vercel

1. Connect repository su [vercel.com](https://vercel.com)
2. Aggiungi tutte le env vars nel dashboard Vercel
3. Push su `main` → deploy automatico

### 5. Avvia in locale

```bash
npm run dev
```

## 📊 Database Schema

### `profiles` (RLS enabled)
Collegata a `auth.users` tramite `id`. Contiene: `age_range`, `traveler_type`, `interests[]`, `pace`, `mobility`, `familiarity`, `display_name`.

### `saved_trips` (v1, legacy — RLS enabled)
Tabella originale. `id`, `user_id`, `trip_name`, `destination`, `inputs` (JSONB), `plan` (JSONB), `is_favorite`.

### `saved_trips_v2` (v2, 3-step — RLS enabled)
Nuova tabella per l'architettura 3-step:
- `id`, `user_id`, `trip_name`, `destination`, `inputs` (JSONB)
- `step1_data` (JSONB) + `step1_completed` (boolean)
- `step2_data` (JSONB) + `step2_completed` (boolean)
- `step3_data` (JSONB) + `step3_completed` (boolean)
- `is_complete`, `is_favorite`, `created_at`, `updated_at`

**Nota**: CRUD su `saved_trips_v2` usa Supabase REST API diretta con JWT (non il JS client), vedi `storage-v2.ts`.

## 🔒 Sicurezza degli URL

3-layer protection:
1. **Prompt-level**: istruzioni esplicite per domini fidati (80+ whitelist)
2. **Post-processing**: `sanitizeTravelPlanAsync()` verifica ogni URL (structural + whitelist) per il flusso legacy. Il **flusso v2** usa sanitizzatori dedicati:
   - `sanitizeStep1Urls()` — verifica sourceUrl, heroImageUrl, activities imageUrl per l'itinerario
   - `sanitizeStep2Urls()` — verifica bookingUrl, officialUrl, imageUrl per alloggi e voli
   - Helper condivisi: `runAsyncSanitizer()`, `isSafeImageUrl()` (whitelist CDN immagini)
3. **Google Safe Browsing API**: verifica batch per domini sconosciuti (fail-closed)

### ⚠️ Real Search URLs, No AI Deep Links
GLM-5.1 fabbrica deep link finti che 404. Il frontend **non li usa mai**:
- **HotelCard** → `getBookingSearchUrlWithDates(name, city, checkin, checkout, adults)` con date per-stop
- **RestaurantCard** → Google Search `${name} ${city} tripadvisor`
- **FlightCard (voli)** → solo URL homepage airline; **(auto)** → Google Maps direzioni
- **Attività Step1** → "Scopri di più" con `getGoogleSearchUrl()` per attività turistiche
- Solo search URL AI sono trusted: `booking.com/searchresults`, `tripadvisor.it/Search`, `google.com/search`

## ⚠️ Note di Sviluppo

- **Zod**: Usa `.nullish()` (non `.optional()`) per `z.string()` e `z.number()` — GLM-5.1 ritorna `null`
- **cleanEmptyStrings()**: Sempre prima di `safeParse()` — GLM-5.1 ritorna `""` per campi vuoti. Applicare in tutti i parse point di Step 1 e Step 2
- **Markdown code blocks**: GLM-5.1 con `web_search` wrappa JSON in `\`\`\`json...\`\`\``. Sempre strippare prima del parsing JSON (`text.replace(/^```json\s*|^```\s*|```$/gm, "")`)
- **safeParse(j)**: Valida il dato pulito, non il JSON grezzo (`safeParse(json)` è un bug)
- **safeParse() per voli**: Step 2 voli usa `.safeParse()` con error logging, non `.parse()`
- **Supabase**: Mai usare il JS client per save/load — si blocca su token refresh. Usa REST API. (Anche `updateProfile`/`fetchProfile` in `auth.tsx` usano REST API + JWT.)
- **Deep link AI**: Mai fidarsi — il frontend genera search URL reali (`getBookingSearchUrlWithDates`, `getGoogleSearchUrl`), non usa i link diretti dell'AI che 404
- **Vercel**: Ogni endpoint API deve avere un `api/*.ts` serverless function, non solo `server.ts`
- **Git**: Sempre `git pull` prima di pushare — Trinity lavora sullo stesso repo

## 🔮 Roadmap

**✅ Completati:**
- **Nominatim geocoding** — Usato per coordinate precise TravelMap Step 1 e distanze rotte auto in Step 2. Free tier, nessuna API key. Cache-aware: mapPoints stripped di prefissi italiani, activities usano `location`, attractions fallback name+destination. Duplicate city lookups skipped.
- **Car route km/duration removed** — Car segments mostrano solo costo stimato e nota Google Maps. `estimateDriveDurationMinutes` rimosso, `generateCarSegments` passa `duration: null` e `distance: null`.
- **TravelMap type support** — Tipi aggiuntivi: city, beach, nature, port, museum, monument con colori/emoji specifici. Legenda dinamica mostra solo i tipi presenti.

**📋 In programma:**
-(niente ancora)

## License

Apache-2.0