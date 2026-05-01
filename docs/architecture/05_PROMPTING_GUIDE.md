# Prompting & Anti-hallucination Policy — VAGABOND_Dou

## System behavior
- Travel Designer con stile "I Coralli di Beatrice": method-driven, realistic, evidence-based.
- Output strictly JSON-only.
- **Il profilo viaggiatore viene iniettato PRIMA delle regole di voli/logistica** per dare contesto umano all'AI.

## Profilo Viaggiatore nel Prompt

Il prompt include una sezione dedicata:

```
PROFILO VIAGGIATORE:
- Fascia d'età: 36-45
- Tipo di viaggio: Coppia romantica
- Interessi: Cultura, Food & Wine, Benessere
- Stile di viaggio: Slow & relax
- Mobilità: Nessuna limitazione
- Conoscenza destinazione: Mai stato qui

REGOLE BASATE SUL PROFILO:
[solo le regole attive per il profilo selezionato]
```

### Regole condizionali per `pace`
| Valore | Attività/giorno | Stile |
|--------|-----------------|-------|
| Slow & relax | 2-3 | Pranzi lunghi, pause, tempo libero |
| Equilibrato | 3-4 | Default, ritmo moderato |
| Avventura intensa | 4-5 | Alzata all'alba, serate notturne |

### Regole condizionali per `travelerType`
| Tipo | Cosa cambia |
|------|------------|
| Coppia romantica | Ristoranti intimi, esperienze per due, hotel con vista |
| Famiglia bimbi piccoli | Pisolini, parchi giochi, food family, hotel con piscina |
| Famiglia ragazzi | Sport acquatici, avventura, attività interattive |
| Solo/a | Ostelli sociali, free tour, easy socializzazione |
| Gruppo amici | Ville/appartamenti, serate divertenti, sconti gruppo |
| Business | WiFi veloce, coworking, attività compatibili |

### Regole condizionali per `interests`
Ogni interesse attiva una regola specifica:
- **Cultura** → almeno 1 museo/sito per giorno
- **Mare** → attività costiere ogni giorno
- **Food & Wine** → 1 esperienza culinaria al giorno
- **Natura** → escursioni, parchi, sentieri
- **Sport** → attività sportive con verifica stagionalità
- etc.

### Regole per `mobility` e `familiarity`
- Mobilità ridotta → solo attrazioni accessibili, hotel con ascensore
- Conosce già la zona → evitare attrazioni ovvie, proporre hidden gems

## Anti-hallucination (regole originali)
- Never fabricate prices or logistics
- If evidence not found: state uncertainty in assumptions
- Use ranges with explicit assumptions
- Prefer official sources for safety/visa
- `departureTime` e `arrivalTime` sempre null (non verificabili)
- `verified: false` su tutti i voli
- **NON fabbricare deep link**: GLM-5.1 tende a generare URL deep finti (es. `booking.com/hotel/it/fake.html`, `tripadvisor.it/Restaurant_Review-fake`) che 404. Per `sourceUrl` e `bookingUrl`, usare SOLO search URL (es. `booking.com/searchresults?...`, `tripadvisor.it/Search?...`, `google.com/search?...`) o URL homepage ufficiali verificati. Il frontend non usa mai i deep link AI — genera sempre search URL reali dai dati strutturati.

## 🔗 sourceUrl Requirements (Step 1 & Step 2)

### Step 2 — Ristoranti
- `sourceUrl` è **OBBLIGATORIO** per ogni ristorante
- Deve essere un link a `tripadvisor.it` (search URL, es. `https://www.tripadvisor.it/Search?q=...`)
- Se l'AI non trova il link TripAdvisor specifico, generare un search URL: `https://www.tripadvisor.it/Search?q=${name}+${city}`
- Gli esempi JSON nel prompt Step 2 includono SEMPRE `sourceUrl` nello schema ristoranti

### Step 1 — Attività
- `sourceUrl` è **OBBLIGATORIO** per attività turistiche (musei, attrazioni, esperienze)
- Per le attività turistiche: usare `google.com/search?q=...` come fallback
- **NO** `sourceUrl` per attività di tipo pernottamento/check-in/relax (non ha senso linkare hotel check-in)
- Le attività Step 1 mostrano sempre "Scopri di più" con link (tranne pernottamento/relax)
- Gli esempi JSON nel prompt Step 1 includono `sourceUrl` per le attività turistiche

## 🚗 Car Route Prompting (Step 2 — "Auto privata")

Quando `flightPreference = "Auto privata"`, il prompt di ricerca voli include istruzioni dettagliate per generare info sul percorso stradale invece di voli:

- `airline`: "Auto privata" (identificatore della modalità)
- `route`: "Città di partenza → Città di arrivo (Auto)"
- `estimatedPrice`: costo stimato carburante + pedaggi (es. "€85")
- `duration`: tempo di viaggio stimato (es. "4h 30min")
- `distance`: distanza in km (es. "450 km") — campo dedicato nel FlightSegmentSchema
- `departureTime` e `arrivalTime`: `null` (non applicabile per auto)
- `bookingUrl`: `null` (non si prenota un'auto)

Il FlightCard renderizza un layout dedicato per "Auto privata" con:
- Distanza (km), tempo di viaggio, costo carburante+pedaggi
- Link "Vedi su Google Maps" con URL direzioni (generato dal frontend, non dall'AI)
- Nessun orario volo, nessun pulsante "Prenota"

## 🔗 URL Safety Prompt Rules

The `generateTravelPlan` prompt includes a dedicated "🔗 SICUREZZA DEI LINK" section that constrains Claude's URL generation:

### Trusted Domains Whitelist (in prompt)
The prompt lists 80+ trusted domains organized by category:
- **Booking/Accommodation**: booking.com, hotels.com, airbnb.com, expedia.com, etc.
- **Reviews/Attractions**: tripadvisor.com, timeout.com, lonelyplanet.com, etc.
- **Flights**: google.com/flights, skyscanner.com, kayak.com, etc.
- **Maps/Transport**: google.com/maps, rome2rio.com, etc.
- **Official tourism**: [country].tourism, [city].gov, etc.
- **Images**: unsplash.com, pexels.com, pixabay.com, etc.

### Explicit Rules (in prompt)
- `bookingUrl` → must be Booking.com or official hotel website
- `sourceUrl` → must be a trusted domain (TripAdvisor, LonelyPlanet, official tourism sites)
- **No URL shorteners** (bit.ly, tinyurl, t.co, etc.)
- **No suspicious TLDs** (.xyz, .top, .click, .buzz, etc.)
- **No HTTP URLs** — only HTTPS allowed
- **No IP addresses** as URLs
- **No redirect parameters** (utm_source, fbclid, ref, etc.)

### Defense in Depth
These prompt rules are Layer 1. Even if Claude generates an unsafe URL, Layers 2 (sanitizeTravelPlan post-processing) and 3 (Google Safe Browsing API) will catch and replace it.