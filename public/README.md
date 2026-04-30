# Vagabond-Ollama — Travel Planner AI (3-Step Architecture)

Fork di [Vagabond AI](https://github.com/dOuReallyDo/Vagabond) migrato da Claude a **GLM-5.1 via Zhipu API** con architettura a 3 step.

## 🆕 Novità Aprile 2026 — Architettura 3-Step

L'app usa ora un **flusso a 3 step** invece di una singola chiamata AI monolitica. Questo risolve i timeout di GLM-5.1 su viaggi complessi (14+ giorni):

1. **Step 1 — Itinerario** (AI, 1 chiamata): destinazione, meteo, sicurezza, programma giorno per giorno, ispirazioni
2. **Step 2 — Alloggi & Trasporti** (AI, 1 chiamata per tappa + 1 per voli, max 4000 token): hotel, ristoranti, voli/treni per ogni tappa
3. **Step 3 — Budget** (JS puro, nessuna AI): calcolo automatico dei costi

**Vantaggi:**
- Ogni step ha un prompt più piccolo → meno timeout
- L'utente può **modificare l'itinerario** (Step 1) prima di cercare alloggi
- Modifica Step 1 → Steps 2-3 invalidati e ricalcolati
- Viaggi lunghi (14+ giorni) non si bloccano più

Il flusso legacy (monolitico) è ancora disponibile tramite feature flag `useV2Flow = false`.

## ✨ Caratteristiche Principali

- **Itinerari Dinamici**: Generazione di piani giornalieri dettagliati
- **3-Step Flow**: Itinerario → Alloggi → Budget con conferma progressiva
- **Mappe Interattive**: Integrazione con Leaflet/OpenStreetMap
- **Ricerca Real-Time**: GLM-5.1 AI con web search per prezzi reali
- **Budget Intelligence**: Calcolo automatico dei costi con dettaglio per categoria
- **Profilo Viaggiatore**: Età, interessi, ritmo, mobilità — itinerari personalizzati
- **Autenticazione**: Supabase Auth (email + Google OAuth)
- **Viaggi Salvati**: Persistenza in 3 fasi (itinerario, alloggi, budget)
- **URL Safety**: 3-layer protection per tutti i link
- **localStorage Fallback**: Funziona anche senza login

## 🏗️ Architettura 3-Step

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

## 🛠️ Tech Stack

| Layer | Tecnologia |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Tailwind CSS v4 |
| **Animazioni** | Framer Motion |
| **Icone** | Lucide React |
| **AI** | GLM-5.1 via Zhipu API (OpenAI-compatible) con web_search |
| **Auth & DB** | Supabase (PostgreSQL + RLS + Auth) |
| **Maps** | Leaflet + OpenStreetMap |
| **Build** | Vite |
| **Deploy** | Vercel |

## 📦 Struttura del Progetto

```
src/
├── App.tsx                          # Main app (3-step flow + legacy fallback)
├── shared/
│   ├── contract.ts                  # v1 schemas (TravelPlan, TravelInputs)
│   ├── contract-v2.ts               # v2 composed schema (TravelPlanV2)
│   ├── step1-contract.ts            # ItineraryDraft schema
│   ├── step2-contract.ts            # AccommodationTransport schema
│   └── step3-contract.ts            # BudgetCalculation schema
├── services/
│   ├── step1Service.ts              # generateItinerary() + modifyItinerary()
│   ├── step2Service.ts              # searchAccommodationsAndTransport()
│   ├── step3Service.ts              # calculateBudget() (pure JS)
│   ├── travelService.ts             # Legacy: generateTravelPlan(), getDestinationCountries()
│   └── unsplashService.ts           # Unsplash image search
├── components/
│   ├── StepIndicator.tsx            # 3-step visual stepper
│   ├── Step1ItineraryView.tsx       # Step 1: itinerary + confirm/modify
│   ├── Step2AccommodationView.tsx   # Step 2: hotels + restaurants + flights
│   ├── Step3BudgetView.tsx          # Step 3: budget breakdown + save
│   ├── AuthForm.tsx                 # Login/Signup UI
│   ├── ProfileForm.tsx              # Profilo viaggiatore
│   ├── SavedTrips.tsx              # Lista viaggi salvati
│   ├── TravelMap.tsx               # Leaflet map
│   └── NoteSuggestions.tsx         # Clickable note suggestions
├── lib/
│   ├── auth.tsx                     # Auth context + hooks (Supabase)
│   ├── storage.ts                   # v1: Supabase REST + localStorage fallback
│   ├── storage-v2.ts               # v2: 3-step save/load/invalidation
│   ├── supabase.ts                  # Supabase client
│   ├── urlSafety.ts                 # URL whitelist, validation, sanitization
│   └── safeBrowsing.ts             # Google Safe Browsing API client + cache
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
ZHIPU_API_KEY=your-zhipu-api-key-here
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
GOOGLE_SAFE_BROWSING_API_KEY=***
VITE_UNSPLASH_ACCESS_KEY=your-unsplash-access-key
```

### 3. Supabase Setup

1. Crea un progetto su [supabase.com](https://supabase.com)
2. Vai in **SQL Editor** ed esegui `supabase/schema.sql` (crea profiles + saved_trips + saved_trips_v2)
3. Copia **Project URL** e **anon public key** in `.env`

### 4. Avvia in locale

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

## 🔒 Sicurezza degli URL

3-layer protection:
1. **Prompt-level**: istruzioni esplicite per domini fidati
2. **Post-processing**: `sanitizeTravelPlanAsync()` verifica ogni URL
3. **Google Safe Browsing API**: verifica batch per domini sconosciuti

## License

Apache-2.0
