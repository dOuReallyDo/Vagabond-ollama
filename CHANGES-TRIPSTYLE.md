# Vagabond-ollama — Changelog

## 4 maggio 2026 (2) — Nominatim destCoords validation + Cape Verde

### Commit
`ebf89b4` — fix: nominatim geocoding — destCoords validation + Cape Verde + Italian prefixes

### Problema
Boa Vista (Capo Verde) geocodificata in Brasile (6552km di errore). Tutti i mapPoints finivano in Sudamerica.

### Soluzioni
1. **destCoords validation**: Se Nominatim geocodifica la destinazione >1000km dal centro dei mapPoints AI, usa il centro AI come riferimento. Se destCoords è null, fallback al centro AI.
2. **Cape Verde (`cv`)** aggiunto a countryMap + ARCHIPELAGO_COUNTRIES (500km proximity). CITY_NAME_MAP con tutte le città principali.
3. **Prefissi italiani espansi**: abbazia, basilica, chiesa, cattedrale, duomo, faro, spiaggia, portico, fondamenta, riserva, oasi, santuario, monumento, area marina protetta, campus, piazzale, riva.
4. **Paesi aggiunti**: Kenya, Tanzania, Mozambique, Senegal, Ghana, Nigeria, Ethiopia, Tunisia, Algeria, Cuba, Dominican Republic, Jamaica, Costa Rica, Panama, UAE, Oman, Qatar, Jordan, Lebanon, Taiwan, Hong Kong, Macao.

### File toccati
- `src/lib/nominatim.ts`

---

## 4 maggio 2026 — tripStyle + geocoding + hotel search

### Commit sequence
1. `2337589` — feat: tripStyle (relax/balanced/adventure)
2. `3c64aca` — fix: relax mode merges all stops into one hotel
3. `ee66c58` — fix: geocoding proximity + hotel location constraint
4. `8764847` — feat: accommodation search (search & add hotel per stop)
5. `6026d88` — fix: vercel.json rewrite catching /assets/* (Leaflet 404)
6. `5c9fe85` — fix: geocoding context-first strategy + 50km proximity

---

### 1. tripStyle — Stile di viaggio (`src/shared/contract.ts`, `src/App.tsx`, `src/services/step1Service.ts`)

**Schema** (`contract.ts`):
- Aggiunto `tripStyle: z.enum(["relax", "balanced", "adventure"])` dopo `stopover`
- `preferredStops` rimane opzionale

**UI** (`App.tsx`):
- 3 card stilizzate (🌴 Relax / 📍 Equilibrato / ⛺ Avventura) al posto del +/- counter
- Relax → `preferredStops=1` hardcoded, selettore tappe nascosto
- Equilibrato → preferredStops default 2, label "≥2 notti"
- Avventura → preferredStops default 3, label "anche 1 notte"

**Prompt** (`step1Service.ts`):
- Relax: "1 sola città base, mai cambiare hotel, escursioni giornaliere (day-trip)"
- Avventura: "tappe anche di 1 notte, ~N/2+1 tappe, ogni giorno città diversa"
- Equilibrato: comportamento precedente (≥2 notti, max N/2)

**Comportamento per stile**:

| Stile | preferredStops | Vincolo notti | Descrizione |
|-------|---------------|---------------|-------------|
| Relax | 1 (hardcoded) | N-1 notti nella stessa città | Città base + day-trip |
| Balanced | default 2, 1-10 | ≥ 2 notti per tappa | Comportamento originale |
| Adventure | default 3, 1-10 | 1 notte permessa | Massimo spostamento |

---

### 2. Relax stop merge (`src/services/step2Service.ts`)

`extractStops(itinerary, tripStyle)`:
- Se `tripStyle === 'relax'` e >1 stop rilevati (AI genera "Anacapri", "Capri centro"), li fonde in 1 unico stop
- Usa lo stop con più `dayIndices` come nome principale
- Risultato: 1 ricerca albergo → 1 hotel per tutto il viaggio

---

### 3. Geocoding proximity fix (`src/lib/nominatim.ts`)

**Problema**: "Marina Grande" geocodificata a Scilla (Calabria, 285km), "Marina Piccola" a Ardea (Lazio, 182km). Anche con `countrycodes=it`, Nominatim ritorna il risultato con più importance, non il più vicino alla destinazione.

**Fix — Context-first strategy**:
1. Geocodifica prima la destinazione principale (es. "Capri") per ottenere coordinate di riferimento
2. Per ogni sotto-luogo, prova PRIMA con contesto destinazione: `"Marina Grande, Capri"` → risultato corretto (40.556°)
3. Fallback senza contesto solo se il contesto fallisce
4. Prossimità: se il risultato è a >50km dalla destinazione, scartato (mantiene coordinate AI)
5. Applicato a tutte e 4 le sezioni: mapPoints, attractions, activities, city route

**Raggio**: ridotto da 100km a 50km (Sorrento è solo ~17km da Capri e passava il check a 100km)

---

### 4. Hotel location constraint (`src/services/step2Service.ts`)

Prompt Step2 ora dice:
- "⚠️ REGOLA FONDAMENTALE: Gli alloggi DEVONO essere a {stopName} o nel raggio di 5km"
- "NON proporre hotel in altre città, anche se hanno '{stopName}' nel nome"
- "ESATTAMENTE 3 opzioni con le recensioni migliori e rating ≥4.0"

---

### 5. Accommodation search — Cerca alloggio (`src/services/accommodationSearch.ts`, `src/components/Step2AccommodationView.tsx`, `src/App.tsx`)

**Nuovo servizio** `accommodationSearch.ts`:
- Chiama GLM-5.1 con `web_search` per verificare esistenza hotel, leggere recensioni (pros/cons), stimare prezzo
- Ritorna `{ exists, summary, pros, cons, estimatedPricePerNight, bookingUrl }`
- Adattato da Vagabond-Dou (usava Anthropic Claude, ora usa Zhipu GLM-5.1)

**Componente** `AccommodationReviewer`:
- Input nome alloggio + select tappa → tasto "Verifica"
- Mostra: esistenza, summary, pros/cons, link Booking/TripAdvisor
- Tasto "Aggiungi alla tappa" → inserisce hotel nelle opzioni della tappa
- Disabilitato in readOnly (viaggi salvati completati)
- Posizionato dopo la sezione alloggi, prima dei ristoranti

**Callback** `onAccommodationAdd` in App.tsx:
- Aggiunge hotel a `step2Data.accommodations[stopIndex].options`
- Aggiorna stato React

---

### 6. Vercel deploy fix (`vercel.json`)

**Problema**: regola `{ "source": "/(.*)", "destination": "/index.html" }` intercettava `/assets/leaflet-src-*.js` ritornando HTML → MIME type error

**Fix**: aggiunta regola `{ "source": "/assets/(.*)", "destination": "/assets/$1" }` PRIMA della catch-all. Cache-Control immutable per assets statici.

---

### File toccati (tutti i commit)
- `src/shared/contract.ts` — tripStyle enum
- `src/App.tsx` — tripStyle UI + AccommodationReviewer callback
- `src/services/step1Service.ts` — prompt differenziato per stile
- `src/services/step2Service.ts` — extractStops con tripStyle + hotel prompt vincolante
- `src/services/accommodationSearch.ts` — nuovo servizio ricerca alloggi
- `src/components/Step2AccommodationView.tsx` — AccommodationReviewer component + onAccommodationAdd prop
- `src/lib/nominatim.ts` — context-first geocoding + 50km proximity
- `vercel.json` — assets rewrite rule

### Rollback
```
git revert 5c9fe85..2337589  # revert all
git checkout ca77750          # clean state before all changes
```