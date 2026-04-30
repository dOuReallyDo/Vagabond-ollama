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
   ZHIPU_API_KEY=your-z...here
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
- **Output**: ItineraryDraft (overview, meteo, sicurezza, programma, ispirazioni, fonti, mapPoints)
- **AI**: 1 chiamata GLM-5.1 con web_search, `max_tokens: 16000`
- **Auto-retry**: Se `finish_reason="length"` o JSON troncato o validazione Zod fallita, ritenta automaticamente con prompt compatto (`buildCompactPrompt()` — 2 attività/giorno, descrizioni brevi)
- **Modificabile**: l'utente può richiedere modifiche → invalida Steps 2-3
- **Pre-validation**: `cleanEmptyStrings()` converte `""` → `null`, poi Zod `.nullish()` accetta `null`
- **Fonti**: array `sources` con blog, guide, siti ufficiali
- **Distribuzione tappe**: Il prompt impone "REGOLE PER LA DISTRIBUZIONE DELLE TAPPE" — max N/2 tappe per viaggio di N giorni, città principali minimo 2-3 notti, modello base+escursione. Il prompt compatto include "TAPPE: MAX N/2 tappe..."
- **Mappa**: `TravelMap` (Leaflet) mostrata in Step1ItineraryView con i `mapPoints` prima delle card giornaliere
- **estimatedLocalCost**: Il prompt specifica che DEVE essere per-persona per-giorno (es. "€25 al giorno"), mai il totale del viaggio

### Step 2 — Alloggi & Trasporti (`step2Service.ts`)
- **Input**: ItineraryDraft confermato + TravelInputs
- **Output**: AccommodationTransport (hotel con `bookingUrl` + `officialUrl`, ristoranti, voli)
- **AI**: 1 chiamata per tappa + 1 per voli, max 4000 token/chiamata
- **`extractStops()`**: raggruppa giorni consecutivi per località, matching case-insensitive
- **Selezione utente**: `selectedIndex` su AccommodationStop e FlightSegment. L'utente clicca per scegliere alloggio e trasporto per ogni tappa. Solo i selezionati vanno nel budget.
- **TripTimeline**: timeline visiva delle tappe in cima (es. "Milano → Lisbona (3 notti) → Porto → Milano")
- **RunningTotalBar**: riepilogo live dei costi selezionati (alloggi + trasporti)
- **Non modificabile**: per cambiare, tornare allo Step 1

### Step 3 — Budget (`step3Service.ts`)
- **Input**: ItineraryDraft + AccommodationTransport + TravelInputs
- **Output**: BudgetCalculation (breakdown per categoria, warning se sfora, costTable espanso)
- **Nessuna AI**: puro calcolo JavaScript, istantaneo
- **Usa le selezioni utente**: calcola il budget usando `selectedIndex` da AccommodationStop e FlightSegment (non sempre `options[0]`)
- **Smart transport cost**: parsing intelligente di `estimatedLocalCost` — rileva "al giorno" vs "totale" dal testo. Numeri grandi senza keyword ⇒ trattati come totale. Cap: €200/persona/giorno, trasporti locali mai >30% del budget totale.
- **Salvataggio**: feedback visivo (Salvataggio... → Salvato! ✅)

### Salvataggio Progressivo (`storage-v2.ts`)
Ogni step viene salvato appena completato. Modifica Step 1 → invalida e cancella Steps 2-3.

**Architettura REST**: NON usa Supabase JS client per CRUD. Usa `fetch()` diretto alla REST API Supabase con JWT letto da localStorage (`sb-{ref}-auth-token`). Fallback a localStorage se offline.

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
                                    Salva viaggio (Supabase REST + localStorage)
```

### Flusso Legacy (feature flag `useV2Flow = false`)
```
Utente → Travel Form → generateTravelPlan() (monolitico)
                              ↓
                        TravelPlan → URL sanitization → UI → Salva
```

## Immagini Unsplash

L'integrazione Unsplash arricchisce le viste con immagini reali:
1. `useEffect` in App.tsx si attiva quando `step1Data` è disponibile
2. Estrae keyword da destinationOverview, attractions, activities
3. Cerca Unsplash API con stagger 300ms, max 15 query
4. Fallback a picsum.photos se no key o no risultati

## Modelli AI

| Task | Modello | Max Tokens | Note |
|------|---------|-----------|------|
| Itinerario (Step 1) | `glm-5.1` | 16000 | web_search, auto-retry con prompt compatto |
| Modifica itinerario | `glm-5.1` | 16000 | web_search, auto-retry |
| Alloggi per tappa (Step 2) | `glm-5.1` | 4000 | web_search, 1 chiamata/tappa |
| Retry alloggi (Step 2) | `glm-5.1` | 3000 | Prompt semplificato |
| Voli (Step 2) | `glm-5.1` | 2000 | web_search, 1 chiamata |
| Budget (Step 3) | — (puro JS) | — | Nessuna chiamata AI |
| Lookup nazioni | — (Nominatim) | — | API gratuita OpenStreetMap |
| Recensioni alloggi | `glm-5.1` | 1024 | web_search (legacy) |
| Piano monolitico (legacy) | `glm-5.1` | 16000 | web_search (legacy) |

## Componenti Chiave

| Componente | Responsabilità |
|-----------|---------------|
| `StepIndicator` | Stepper visivo 3 step (orizontal desktop, vertical mobile) |
| `Step1ItineraryView` | Display itinerario + TravelMap (Leaflet) + Unsplash images + fonti + conferma/modifica |
| `Step2AccommodationView` | TripTimeline + alloggi/trasporti selezionabili + RunningTotalBar + ristoranti + conferma |
| `Step3BudgetView` | Display budget (da selezioni utente) + costTable + salva con feedback visivo |
| `AuthProvider` | Sessione auth, profilo utente (persistSession: true) |
| `ProfileForm` | Step 1 del form — profilo viaggiatore |
| `SavedTrips` | Lista e gestione viaggi salvati (v2) |

## Deploy (Vercel)

`vercel.json` configura:
- Build: `npm run build` → `dist/`
- Route SPA: tutte le route non-API riscrivono a `/index.html`
- Route API: `/api/*` → serverless functions (`api/*.ts`)
- **Importante**: Route definite SOLO in `server.ts` restituiscono 405 su Vercel. Aggiungere sempre `api/*.ts` per ogni endpoint.

## ⚠️ Regole Critiche di Sviluppo

1. **Sempre `git pull` prima di lavorare** — Trinity potrebbe avere versioni più aggiornate
2. **Mai usare Supabase JS client per save/load** — il client si blocca durante token refresh. Usare REST API con JWT diretto (vedi `storage-v2.ts`)
3. **Vercel pitfall**: Route definite SOLO in `server.ts` → 405 su Vercel. Aggiungere sempre `api/*.ts` serverless function
4. **Step 3 non è AI** — è puro calcolo JS. Non aggiungere chiamate AI.
5. **Modifica Step 1 invalida Steps 2-3** — sempre chiamare `invalidateStepsAfter(tripId, 1)` quando si modifica l'itinerario
6. **Feature flag `useV2Flow`** — default `true`. Se `false`, usa il flusso monolitico legacy
7. **Zod `.nullish()` non `.optional()`** — GLM-5.1 ritorna `null` non `undefined`. Usare `.nullish()` per `z.string()` e `z.number()`
8. **`cleanEmptyStrings()` sempre prima di Zod** — GLM-5.1 ritorna `""` per campi che non trova
9. **`safeParse(j)` non `safeParse(json)`** — validare sempre il dato pulito, non il JSON grezzo
10. **Auto-retry su troncamento** — se Step 1 fallisce per JSON troncato (`finish_reason: "length"`), il codice ritenta con `buildCompactPrompt()`
11. **Distribuzione tappe** — il prompt Step 1 impone max N/2 tappe per viaggio di N giorni, città principali 2-3 notti. Se l'AI genera 10 tappe per 10 giorni, è un bug del prompt.
12. **Budget usa `selectedIndex`** — calculateBudget() prende l'opzione selezionata dall'utente per alloggi e trasporti, non sempre `options[0]`
13. **Smart transport cost** — `estimatedLocalCost` è ambiguo (per-giorno vs totale). Il codice lo parsifica intelligentemente e applica cap 30% budget + €200/persona/giorno.
14. **Mappa in Step 1** — TravelMap usa i `mapPoints` dell'ItineraryDraft. Se l'AI non restituisce mapPoints validi, la mappa non viene renderizzata.