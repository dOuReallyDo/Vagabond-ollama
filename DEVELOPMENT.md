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
- **Input**: TravelInputs (destinazione, date, budget, profilo, **stopover**)
- **Output**: ItineraryDraft (overview, meteo, sicurezza, programma, ispirazioni, fonti, mapPoints)
- **AI**: 1 chiamata GLM-5.1 con web_search, `max_tokens: 16000`
- **Auto-retry**: Se `finish_reason="length"` o JSON troncato o validazione Zod fallita, ritenta automaticamente con prompt compatto (`buildCompactPrompt()` — 2 attività/giorno, descrizioni brevi)
- **Modificabile**: l'utente può richiedere modifiche → invalida Steps 2-3
- **Pre-validation**: `cleanEmptyStrings()` converte `""` → `null`, poi Zod `.nullish()` accetta `null`
- **Stopover**: `inputs.stopover` è incluso nel DETTAGLI VIAGGIO del prompt (`Stopover richiesto: ${inputs.stopover || "Nessuno"}`), sia in `generateItinerary()` che in `buildCompactPrompt()`
- **Fonti**: array `sources` con blog, guide, siti ufficiali
- **Distribuzione tappe**: Il prompt impone "REGOLE PER LA DISTRIBUZIONE DELLE TAPPE" — max N/2 tappe per viaggio di N giorni, città principali minimo 2-3 notti, modello base+escursione. Il prompt compatto include "TAPPE: MAX N/2 tappe..."
- **Mappa**: `TravelMap` (Leaflet) mostrata in Step1ItineraryView con i `mapPoints` prima delle card giornaliere
- **estimatedLocalCost**: Il prompt specifica che DEVE essere per-persona per-giorno (es. "€25 al giorno"), mai il totale del viaggio
- **Nominatim geocoding (post-processing)**: Dopo che l'AI genera l'itinerario, `geocodeItinerary()` (da `src/lib/nominatim.ts`) risolve i nomi di località in coordinate lat/lng accurate sostituendo quelle fornite dall'AI. Geocodifica: (1) `mapPoints`, (2) attrazioni in `destinationOverview`, (3) attività non-generiche nei giorni dell'itinerario. Se Nominatim fallisce per un punto, mantiene le coordinate AI come fallback. Vedi anche Regola Critica #26.

### Step 2 — Alloggi & Trasporti (`step2Service.ts`)
- **Input**: ItineraryDraft confermato + TravelInputs
- **Output**: AccommodationTransport (hotel con `bookingUrl` + `officialUrl`, ristoranti, voli, segmenti auto)
- **AI parallel**: `Promise.allSettled` per tutte le ricerche per-tappa + voli in parallelo (non più sequenziale). Preferenza auto salta la chiamata AI voli.
- **max 4000 token/chiamata** (voli aumentato da 2000 a 4000)
- **Programmatic car segments**: Quando `flightPreference` include "auto", `generateCarSegments()` crea un segmento per tratta (partenza→tappa1→...→ritorno) — **nessuna chiamata AI per auto**. **Singola opzione per segmento** con distanza stimata, costo carburante+pedaggi (€0.15/km + €0.07/km), durata realistica, URL Google Maps. **Stima distanza a 3 livelli**: (1) tabella 80+ rotte europee hardcodate (`estimateRoadKm`), (2) fallback Nominatim geocoding + haversine (`estimateRoadKmFromCoords` da `src/lib/nominatim.ts`, fattore stradale 1.35×), (3) ultimo resort 400km. **Tier di velocità realistici**: <100km → 60km/h (urbano), 100-400km → 90km/h (misto), >400km → 100km/h (autostrada). FlightCard usa `flight.airline.toLowerCase().includes('auto privata')` per renderizzare segmenti auto con Google Maps iframe.
- **`extractStops()`**: raggruppa giorni consecutivi per località, matching case-insensitive
- **Markdown code block stripping**: GLM-5.1 con `web_search` wrap JSON in `\`\`\`json...\`\`\``. Tutti e 3 i parse point (alloggi primari, retry alloggi, voli) stripsano i blocchi markdown prima dell'estrazione JSON. Senza questo, `indexOf("{")` ritorna -1 → "Nessun JSON valido" → `flights = []`.
- **`cleanEmptyStrings()`**: Applicato prima di Zod parse in tutti e 3 i parse point. GLM-5.1 ritorna `""` per campi nullish (departureTime, arrivalTime, bookingUrl, duration) — Zod `.nullish()` rifiuta `""`.
- **Flight validation**: Usa `.safeParse()` (non `.parse()`) con error logging, così i fallimenti non throwano e sono diagnosticabili.
- **System message**: La ricerca voli include `"Sei un assistente che risponde SOLO in JSON. Nessun testo prima o dopo il JSON. Nessun markdown."` per ridurre il markdown wrapping.
- **Diagnostic logging**: `[Step2-Flights] Raw response length/first 300 chars` loggato prima del parsing; errori loggati su parse failure.
 - **Selezione utente**: `selectedIndex` su AccommodationStop e FlightSegment. L'utente clicca per scegliere alloggio e trasporto per ogni tappa. Solo i selezionati vanno nel budget.
- **TripTimeline**: timeline visiva delle tappe in cima (es. "Milano → Lisbona (3 notti) → Porto → Milano")
- **RunningTotalBar**: riepilogo live dei costi selezionati (alloggi + trasporti)
- **Google Maps iframe per auto**: Ogni segmento auto in FlightCard mostra una mappa Google Maps integrata (`https://maps.google.com/maps?f=d&source=s_d&saddr={origin}&daddr={destination}&hl=it&output=embed`) in layout 2 colonne (sinistra: info, destra: mappa)
- **Layout single-column**: TravelMap rimossa da Step 2 (ancora presente in Step 1). Il contenuto scorre verticalmente senza sidebar sticky
- **Tornando da Step 3**: `step2Confirmed` viene impostato a `false`, permettendo la riselezione degli alloggi senza tornare a Step 1
- **Non modificabile**: per cambiare, tornare allo Step 1

### Step 3 — Budget (`step3Service.ts`)
- **Input**: ItineraryDraft + AccommodationTransport + TravelInputs
- **Output**: BudgetCalculation (breakdown per 5 categorie, warning se sfora, costTable strutturato)
- **Nessuna AI**: puro calcolo JavaScript, istantaneo
- **Usa le selezioni utente**: calcola il budget usando `selectedIndex` da AccommodationStop e FlightSegment (non sempre `options[0]`)
- **5 categorie**: Trasporti, Alloggi, Attività, Cibo, Extra e Imprevisti (10% buffer)
- **Nessun "Trasporti locali"**: rimosso — fuoriviante e non sempre applicabile. Le stime di `estimatedLocalCost` erano inaffidabili
- **Tabella strutturata per categoria**:
  - Trasporti: Data | Descrizione | Costo
  - Alloggi: Data arrivo | Luogo | Nome alloggio selezionato | Notti | Costo
  - Attività: Data | Luogo | Descrizione | Durata | Costo
  - Cibo/Extra: formato semplice nome + costo
- **Campi estesi in costTable items**: `date`, `location`, `description`, `duration`, `hotelName`, `nights`
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
| Voli (Step 2) | `glm-5.1` | 4000 | web_search, 1 chiamata (solo se NON auto) |
| Auto (Step 2) | — (puro JS) | — | `generateCarSegments()`, nessuna chiamata AI |
| Budget (Step 3) | — (puro JS) | — | Nessuna chiamata AI |
| Lookup nazioni | — (Nominatim) | — | API gratuita OpenStreetMap, vedi `src/lib/nominatim.ts` |
| Recensioni alloggi | `glm-5.1` | 1024 | web_search (legacy) |
| Piano monolitico (legacy) | `glm-5.1` | 16000 | web_search (legacy) |

## Componenti Chiave

| Componente | Responsabilità |
|-----------|---------------|
| `StepIndicator` | Stepper visivo 3 step (orizontal desktop, vertical mobile) |
| `Step1ItineraryView` | Display itinerario + TravelMap (Leaflet) + Unsplash images + fonti + conferma/modifica |
| `Step2AccommodationView` | TripTimeline + alloggi/trasporti selezionabili + Google Maps iframe per auto + RunningTotalBar + conferma (single-column, no TravelMap) |
| `Step3BudgetView` | Display budget (da selezioni utente) + costTable + salva con feedback visivo |
| `AuthProvider` | Sessione auth, profilo utente (persistSession: true) |
| `ProfileForm` | Step 1 del form — profilo viaggiatore |
| `SavedTrips` | Lista e gestione viaggi salvati (v1, legacy) |
| `SavedTripsV2` | Lista viaggi salvati v2 — badge step (📋 ✓/○, 🏨 ✓/○, 💰 ✓/○), preferiti primi, elimina con conferma, onLoadTripV2 |
| `src/lib/nominatim.ts` | Geocoding Nominatim centralizzato — `geocodeItinerary()` (Step 1 post-processing), `geocodeCities()` + `estimateRoadKmFromCoords()` (Step 2 fallback distanze auto), `haversineKm()`, cache + rate limiter 1 req/sec |

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
8. **`cleanEmptyStrings()` sempre prima di Zod** — GLM-5.1 ritorna `""` per campi che non trova. Applicare in **tutti** i parse point di Step 1 e Step 2 (non solo Step 1)
9. **`safeParse(j)` non `safeParse(json)`** — validare sempre il dato pulito, non il JSON grezzo
10. **Strippare markdown code blocks prima del JSON parsing** — GLM-5.1 con `web_search` wrappa le risposte JSON in `\`\`\`json...\`\`\``. Sempre strippare con `text.replace(/^```json\s*|^```\s*|```$/gm, "")` prima di cercare il JSON. Senza questo, `indexOf("{")` ritorna -1 e il parsing fallisce silenziosamente.
11. **`.safeParse()` per voli e alloggi in Step 2** — usare `.safeParse()` non `.parse()` per validazione voli, così i fallimenti loggano errori senza throware. Step 1 può continuare con `.parse()` perché ha auto-retry.
12. **Auto-retry su troncamento** — se Step 1 fallisce per JSON troncato (`finish_reason: "length"`), il codice ritenta con `buildCompactPrompt()`
13. **Distribuzione tappe** — il prompt Step 1 impone max N/2 tappe per viaggio di N giorni, città principali 2-3 notti. Se l'AI genera 10 tappe per 10 giorni, è un bug del prompt.
14. **Budget usa `selectedIndex`** — calculateBudget() prende l'opzione selezionata dall'utente per alloggi e trasporti, non sempre `options[0]`
15. **Budget: 5 categorie, senza trasporti locali** — Le categorie sono: Trasporti (ex "Voli"), Alloggi, Attività, Cibo, Extra e Imprevisti. "Trasporti locali" rimosso — `estimatedLocalCost` era fuoriviante. Ogni categoria ha colonne specifiche nella tabella (vedi step3 sezione sopra).
16. **Mappa in Step 1** — TravelMap usa i `mapPoints` dell'ItineraryDraft. Se l'AI non restituisce mapPoints validi, la mappa non viene renderizzata. **TravelMap rimossa da Step 2** — la sidebar sticky è stata eliminata; Step 2 ora ha layout single-column. Le mappe per route auto sono embed Google Maps iframe dentro FlightCard.
17. **Nominatim geocoding per mapPoints e route auto** — `src/lib/nominatim.ts` è il modulo centralizzato per geocoding Nominatim. Offre: `geocodeItinerary()` (post-Processing Step 1: risolve mapPoints, attrazioni, attività), `geocodeCities()` + `estimateRoadKmFromCoords()` (fallback distanza route auto in Step 2), `haversineKm()`. Cache in memoria per sessione, rate limiter a 1 req/sec per policy Nominatim. Vedi anche nota Step 1 e Step 2.
18. **SavedTripsV2** — Quando `useV2Flow=true`, usare `SavedTripsV2` (non `SavedTrips`). Il componente mostra badge di completamento per ogni step, preferiti primi, e `onLoadTripV2(trip)` ripristina l'intero stato v2 (lastInputs, currentTripId, step data + completion flags, activeStep=1 per sola visualizzazione).
19. **ReadOnly mode** — Tutti e 3 gli step component accettano `readOnly?: boolean`. Step 2 readOnly è `viewingSavedTrip` solo (non `step2Confirmed || viewingSavedTrip`). **Viaggi incompleti**: riprendono dal primo step incompiuto (`step1Confirmed = !!trip.step1_data`, `viewingSavedTrip=false`). **Viaggi completi**: read-only, navigazione tra step senza modifica. Lo StepIndicator è cliccabile per navigazione. **"Nuova ricerca"** nella top bar v2 resetta lo stato. **"Avanti →" auto-inizia**: se `step2Data` è null, auto-chiama `confirmItinerary()`; se `step3Data` è null, auto-calcola il budget.
20. **v2 URL Safety** — I flussi v2 usano `sanitizeStep1Urls()` e `sanitizeStep2Urls()` (non `sanitizeTravelPlanAsync()`). Vengono chiamati in App.tsx dopo `generateItinerary()`, `modifyItinerary()`, `searchAccommodationsAndTransport()`. Helper condivisi: `runAsyncSanitizer()`, `isSafeImageUrl()` per whitelist CDN immagini.
21. **MAI fidarsi dei deep link AI** — GLM-5.1 fabbrica link falsi che 404 (es. `booking.com/hotel/it/fake.html`, `tripadvisor.it/Restaurant_Review-fake`). Il frontend genera SEMPRE search URL dai dati reali: HotelCard → `getBookingSearchUrlWithDates(name, city, checkin, checkout, adults)`, RestaurantCard → Google Search `${name} ${city} tripadvisor`, FlightCard (auto) → Google Maps, attività Step1 → `getGoogleSearchUrl()`. Solo le search URL AI sono trusted: `booking.com/searchresults`, `tripadvisor.it/Search`, `google.com/search`.
22. **Date per-stop per Booking.com** — Le URL Booking.com usano check-in/checkout calcolati per tappa (`stopDates` via `useMemo` in `Step2AccommodationView`), non le date dell'intero viaggio. Ogni tappa ha il suo `(checkIn, checkOut)` basato sulle notti dell'itinerario.
23. **Car route: generazione programmatica (singola opzione)** — Quando `flightPreference` include "auto", `generateCarSegments()` crea segmenti in JS puro (nessuna chiamata AI). Un segmento per tratta (partenza→tappa1→tappa2→...→ritorno). **Singola opzione** per segmento (rimosse le 2 opzioni Autostrada/Senza pedaggi). Stima distanza: tabella 80+ rotte europee → fallback Nominatim+Haversine (1.35× fattore stradale) → 400km ultimo resort. Costo: €0.15/km carburante + €0.07/km pedaggi. Durata realistica per tier: <100km→60km/h, 100-400km→90km/h, >400km→100km/h. Ogni segmento ha URL Google Maps (`flight.bookingUrl`). FlightCard usa `flight.airline.toLowerCase().includes('auto privata')`.
24. **Auth profile: REST API, non Supabase JS** — `updateProfile` e `fetchProfile` in `auth.tsx` usano REST API + JWT da localStorage (helper `getAccessTokenFromLocalStorage()`), come `storage-v2.ts`. Questo risolve l'hang `initializePromise` che bloccava il pulsante salva profilo.
25. **Navigazione step sempre visibile** — Gli Step 1 e 2 sono sempre renderizzati quando si torna indietro dallo Step 3. Step 2 riceve `readOnly={viewingSavedTrip}` (non `step2Confirmed || viewingSavedTrip`). Tornando da Step 3, `step2Confirmed` viene impostato a `false` per permettere la riselezione. I placeholder "Itinerario confermato!" / "Alloggi confermati!" appaiono solo quando i dati del prossimo step non sono ancora caricati. **"Nuova ricerca"** nella top bar v2.
26. **sourceUrl OBBLIGATORIO** — Nei prompt Step 2: `sourceUrl` è OBBLIGATORIO per i ristoranti (link a tripadvisor.it). Nei prompt Step 1: `sourceUrl` OBBLIGATORIO per attività turistiche (google.com/search), NO per pernottamento/check-in. Esempi JSON include `sourceUrl` nello schema ristoranti e attività.
27. **Nominatim rate limiting** — Il modulo `src/lib/nominatim.ts` implementa `rateLimitedFetch()` con intervallo minimo 1.1 secondi tra richieste e `User-Agent` header richiesto. È VIETATO chiamare `https://nominatim.openstreetmap.org/search` direttamente senza passare attraverso il rate limiter. La policy Nominatim (https://operations.osmfoundation.org/policies/nominatim/) impone max 1 req/sec. Le chiamate sono cachate in memoria per sessione (`geocodeCache`). Per Step 1, `geocodeItinerary()` processa mapPoints in parallelo (ma rispettando il rate limiter); per Step 2, `geocodeCities()` è usata come fallback per distanze non nella tabella rotte europee.