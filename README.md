# Vagabond-Ollama — Travel Planner AI (3-Step Architecture)

Fork di [Vagabond AI](https://github.com/dOuReallyDo/Vagabond) migrato da Claude a **GLM-5.1 via Zhipu API** con architettura a 3 step e auto-retry su troncamento.

## 🆕 Novità Aprile 2026 — Architettura 3-Step

L'app usa ora un **flusso a 3 step** invece di una singola chiamata AI monolitica. Questo risolve i timeout di GLM-5.1 su viaggi complessi (14+ giorni):

1. **Step 1 — Itinerario** (AI, 1 chiamata, max 16k token): destinazione, meteo, sicurezza, programma giorno per giorno, fonti, mappa
2. **Step 2 — Alloggi & Trasporti** (AI, 1 chiamata per tappa + 1 per voli, max 4000 token): hotel con bookingUrl + officialUrl, ristoranti, voli/treni — **l'utente seleziona** alloggio e trasporto per ogni tappa
3. **Step 3 — Budget** (JS puro, nessuna AI): calcolo automatico basato sulle **selezioni utente** con costTable espanso

**Vantaggi:**
- Ogni step ha un prompt più piccolo → meno timeout
- L'utente può **modificare l'itinerario** (Step 1) prima di cercare alloggi
- Modifica Step 1 → Steps 2-3 invalidati e ricalcolati
- Viaggi lunghi (14+ giorni) non si bloccano più
- **Auto-retry**: se l'AI tronca il JSON, ritenta automaticamente con prompt compatto
- **Distribuzione tappe**: Max N/2 tappe per viaggio di N giorni — niente cambio città ogni giorno
- **Selezione utente**: solo gli alloggi e trasporti scelti vanno nel budget
- **Costi realistici**: smart parsing dei costi trasporti locali (per-giorno vs totale), cap al 30% del budget

Il flusso legacy (monolitico) è ancora disponibile tramite feature flag `useV2Flow = false`.

## ✨ Caratteristiche Principali

- **Itinerari Dinamici**: Generazione di piani giornalieri dettagliati con distribuzione tappe intelligente (N/2 max tappe)
- **3-Step Flow**: Itinerario → Alloggi (selezionabili) → Budget con conferma progressiva
- **Auto-retry su troncamento**: Se il JSON è troncato, ritenta con prompt più conciso
- **Mappe Interattive**: Integrazione con Leaflet/OpenStreetMap
- **Ricerca Real-Time**: GLM-5.1 AI con web search per prezzi reali
- **Budget Intelligence**: Calcolo automatico basato sulle selezioni utente con dettaglio per categoria, smart transport cost parsing
- **Profilo Viaggiatore**: Età, interessi, ritmo, mobilità — itinerari personalizzati
- **Immagini Unsplash**: Foto reali per destinazione, attrazioni e attività
- **Fonti verificabili**: Blog, guide e siti ufficiali per ogni itinerario
- **Autenticazione**: Supabase Auth (email + Google OAuth)
- **Viaggi Salvati**: Persistenza in 3 fasi (itinerario, alloggi, budget) su `saved_trips_v2`
- **URL Safety**: 3-layer protection per tutti i link (whitelist + structural + Google Safe Browsing)
- **localStorage Fallback**: Funziona anche senza login

## 🏗️ Architettura 3-Step

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   FORM      │────►│  STEP 1          │────►│  STEP 2          │────►│  STEP 3      │
│  (input)    │     │  ITINERARIO       │     │  ALLOGGI+TRASP   │     │  BUDGET       │
│             │     │  AI (1 call)      │     │  AI (1 call/stop)│     │  Pure JS      │
│             │     │  max 16k tokens   │     │  4k/stop, 4k flight│    │              │
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
│   ├── step2Service.ts              # searchAccommodationsAndTransport() (per-stop + extractStops + selectedIndex)
│   ├── step3Service.ts              # calculateBudget() (pure JS, uses selectedIndex, smart transport cost)
│   ├── travelService.ts             # Legacy: generateTravelPlan(), getDestinationCountries()
│   └── unsplashService.ts           # Unsplash image search
├── components/
│   ├── StepIndicator.tsx            # 3-step visual stepper
│   ├── Step1ItineraryView.tsx       # Step 1: itinerary + TravelMap + Unsplash images + sources + confirm/modify
│   ├── Step2AccommodationView.tsx   # Step 2: TripTimeline + selectable hotels/flights + RunningTotalBar
│   ├── Step3BudgetView.tsx          # Step 3: budget breakdown + save feedback
│   ├── AuthForm.tsx                 # Login/Signup UI
│   ├── ProfileForm.tsx              # Profilo viaggiatore
│   ├── SavedTrips.tsx              # Lista viaggi salvati
│   ├── TravelMap.tsx               # Leaflet map
│   └── NoteSuggestions.tsx         # Clickable note suggestions
├── lib/
│   ├── auth.tsx                     # Auth context + hooks (Supabase)
│   ├── storage.ts                   # v1: Supabase REST + localStorage fallback
│   ├── storage-v2.ts               # v2: 3-step save/load/invalidation (REST API + JWT)
│   ├── supabase.ts                  # Supabase client (persistSession: true)
│   ├── urlSafety.ts                 # URL whitelist, validation, sanitization
│   └── safeBrowsing.ts             # Google Safe Browsing API client + cache
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
2. **Post-processing**: `sanitizeTravelPlanAsync()` verifica ogni URL (structural + whitelist)
3. **Google Safe Browsing API**: verifica batch per domini sconosciuti (fail-closed)

## ⚠️ Note di Sviluppo

- **Zod**: Usa `.nullish()` (non `.optional()`) per `z.string()` e `z.number()` — GLM-5.1 ritorna `null`
- **cleanEmptyStrings()**: Sempre prima di `safeParse()` — GLM-5.1 ritorna `""` per campi vuoti. Applicare in tutti i parse point di Step 1 e Step 2
- **Markdown code blocks**: GLM-5.1 con `web_search` wrappa JSON in `\`\`\`json...\`\`\``. Sempre strippare prima del parsing JSON (`text.replace(/^```json\s*|^```\s*|```$/gm, "")`)
- **safeParse(j)**: Valida il dato pulito, non il JSON grezzo (`safeParse(json)` è un bug)
- **safeParse() per voli**: Step 2 voli usa `.safeParse()` con error logging, non `.parse()`
- **Supabase**: Mai usare il JS client per save/load — si blocca su token refresh. Usa REST API.
- **Vercel**: Ogni endpoint API deve avere un `api/*.ts` serverless function, non solo `server.ts`
- **Git**: Sempre `git pull` prima di pushare — Trinity lavora sullo stesso repo

## License

Apache-2.0