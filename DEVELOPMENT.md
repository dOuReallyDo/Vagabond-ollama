# Requisiti di Sviluppo - Vagabond-Ollama

## 📋 Requisiti Minimi di Sistema
- **Node.js**: v20.0.0 o superiore
- **npm**: v10.0.0 o superiore
- **Chiave API Zhipu**: Necessaria per il motore AI (GLM-5.1)
- **Progetto Supabase**: Per autenticazione e persistenza dati

## 🛠️ Setup Ambiente di Sviluppo

1. **Clonazione**:
   ```bash
   git clone https://github.com/dOuReallyDo/Vagabond-ollama.git
   cd Vagabond-ollama
   ```

2. **Installazione Dipendenze**:
   ```bash
   npm install --legacy-peer-deps
   ```

3. **Variabili d'Ambiente**:
   Crea un file `.env` nella root del progetto:
   ```env
   ZHIPU_API_KEY=your-zhipu-api-key-here
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   GOOGLE_SAFE_BROWSING_API_KEY=***
   VITE_UNSPLASH_ACCESS_KEY=your-unsplash-access-key
   ```

4. **Setup Supabase**:
   - Crea un progetto su [supabase.com](https://supabase.com)
   - Vai in **SQL Editor** ed esegui `supabase/schema.sql` (crea profiles, saved_trips, saved_trips_v2)
   - Per la migrazione 3-step, esegui anche `supabase/migrations/add_saved_trips_v2.sql`
   - Copia URL e anon key nel `.env`

5. **Avvia**:
   ```bash
   npm run dev
   ```

## 🏗️ Architettura 3-Step (Aprile 2026)

L'app usa un flusso a 3 step anziché una singola chiamata AI monolitica:

### Step 1 — Itinerario (`step1Service.ts`)
- **Input**: TravelInputs (destinazione, date, budget, profilo)
- **Output**: ItineraryDraft (overview, meteo, sicurezza, programma, ispirazioni)
- **AI**: 1 chiamata GLM-5.1 con web_search, max 8000 token
- **Modificabile**: l'utente può richiedere modifiche → invalida Steps 2-3

### Step 2 — Alloggi &Trasporti (`step2Service.ts`)
- **Input**: ItineraryDraft confermato + TravelInputs
- **Output**: AccommodationTransport (hotel, ristoranti, voli)
- **AI**: 1 chiamata per tappa + 1 per voli, max 4000 token/chiamata
- **Non modificabile**: per cambiare, tornare allo Step 1

### Step 3 — Budget (`step3Service.ts`)
- **Input**: ItineraryDraft + AccommodationTransport + TravelInputs
- **Output**: BudgetCalculation (breakdown per categoria, warning se sfora)
- **Nessuna AI**: puro calcolo JavaScript, istantaneo

### Salvataggio Progressivo (`storage-v2.ts`)
Ogni step viene salvato appena completato. Modifica Step 1 → invalida e cancella Steps 2-3.

### DB: `saved_trips_v2`
Tabella separata da `saved_trips` (legacy). Colonne: `step1_data`, `step2_data`, `step3_data` (JSONB) + flag `_completed`.

## Flusso Dati

```
Utente → Profile Form → Travel Form → Step 1: generateItinerary()
                                              ↓
                                        ItineraryDraft
                                              ↓
                                    Utente conferma o modifica
                                              ↓
                              Step 2: searchAccommodationsAndTransport()
                                              ↓
                                    AccommodationTransport
                                              ↓
                                    Utente conferma
                                              ↓
                              Step 3: calculateBudget() (instant)
                                              ↓
                                    BudgetCalculation
                                              ↓
                                    Salva viaggio (Supabase)
```

### Flusso Legacy (feature flag `useV2Flow = false`)
```
Utente → Travel Form → generateTravelPlan() (monolitico)
                              ↓
                        TravelPlan → UI → Salva
```

## Modelli AI

| Task | Modello | Max Tokens | Note |
|------|---------|-----------|------|
| Itinerario (Step 1) | `glm-5.1` | 8000 | web_search, 1 chiamata |
| Modifica itinerario | `glm-5.1` | 8000 | web_search, 1 chiamata |
| Alloggi per tappa (Step 2) | `glm-5.1` | 4000 | web_search, 1 chiamata/tappa |
| Voli (Step 2) | `glm-5.1` | 2000 | web_search, 1 chiamata |
| Budget (Step 3) | — (puro JS) | — | Nessuna chiamata AI |
| Lookup nazioni | — (Nominatim) | — | API gratuita OpenStreetMap |
| Recensioni alloggi | `glm-5.1` | 1024 | web_search (legacy) |
| Piano monolitico (legacy) | `glm-5.1` | 16000 | web_search (legacy) |

## Componenti Chiave

| Componente | Responsabilità |
|-----------|---------------|
| `StepIndicator` | Stepper visivo 3 step |
| `Step1ItineraryView` | Display itinerario + conferma/modifica |
| `Step2AccommodationView` | Display alloggi + ristoranti + voli + conferma |
| `Step3BudgetView` | Display budget + salva viaggio |
| `AuthProvider` | Sessione auth, profilo utente |
| `ProfileForm` | Step 1 del form — profilo viaggiatore |
| `SavedTrips` | Lista e gestione viaggi salvati |

## Database Schema

Vedere `supabase/schema.sql` per il DDL completo.

### Tabella `profiles`
Collegata a `auth.users` tramite `id`. Contiene: `age_range`, `traveler_type`, `interests[]`, `pace`, `mobility`, `familiarity`. Row Level Security abilitata.

### Tabella `saved_trips` (legacy)
Tabella originale. `id`, `user_id`, `trip_name`, `destination`, `inputs` (JSONB), `plan` (JSONB), `is_favorite`. RLS abilitata.

### Tabella `saved_trips_v2` (3-step)
Nuova tabella per la versione 3-step:
- `step1_data` (JSONB ItineraryDraft) + `step1_completed` (boolean)
- `step2_data` (JSONB AccommodationTransport) + `step2_completed` (boolean)
- `step3_data` (JSONB BudgetCalculation) + `step3_completed` (boolean)
- `is_complete` (boolean) — true solo quando tutti e 3 gli step sono completi
- RLS abilitata con policy per user_id

## ⚠️ Regole Critiche di Sviluppo

1. **Sempre `git pull` prima di lavorare** — Trinity potrebbe avere versioni più aggiornate
2. **Mai usare Supabase JS client per save/load** — il client si blocca durante token refresh. Usare REST API con JWT diretto (vedi `storage-v2.ts`)
3. **Vercel pitfall**: Route definite SOLO in `server.ts` → 405 su Vercel. Aggiungere sempre `api/*.ts` serverless function
4. **Step 3 non è AI** — è puro calcolo JS. Non aggiungere chiamate AI.
5. **Modifica Step 1 invalida Steps 2-3** — sempre chiamare `invalidateStepsAfter(tripId, 1)` quando si modifica l'itinerario
6. **Feature flag `useV2Flow`** — default `true`. Se `false`, usa il flusso monolitico legacy