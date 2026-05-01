# Concept: Vagabond-ollama

## Il Problema
Pianificare un viaggio oggi richiede ore di navigazione tra decine di siti diversi (TripAdvisor, Booking, blog di viaggi, Google Maps). Spesso le informazioni sono frammentate e non tengono conto della stagionalità specifica o del budget reale del viaggiatore.

## La Soluzione
Vagabond-ollama agisce come un **Concierge Digitale** progressivo. Non si limita a suggerire destinazioni, ma costruisce un itinerario in 3 fasi con conferma dell'utente a ogni step:

1. **Prova Visiva**: Foto reali del luogo via Unsplash.
2. **Prova Logistica**: Coordinate, mappe, link a Booking.com e siti ufficiali.
3. **Prova Economica**: Breakdown dei costi calcolato automaticamente.
4. **Prova Temporale**: Analisi meteo e stagionalità.
5. **Prova di Fonte**: Blog, guide turistiche, siti ufficiali verificati.

## Architettura 3-Step

```
① Itinerario → ② Alloggi & Trasporti → ③ Budget
   (modificabile)     (seleziona + conferma)    (salva)
```

- Ogni step ha un prompt più piccolo → meno timeout AI
- L'utente può modificare l'itinerario prima di cercare alloggi
- Modifica Step 1 → Steps 2-3 invalidati e ricalcolati
- Viaggi lunghi (14+ giorni) non si bloccano grazie ad auto-retry con prompt compatto
- **Distribuzione tappe intelligente**: Max N/2 tappe per viaggio di N giorni, città principali 2-3 notti
- **Selezione utente**: In Step 2 l'utente sceglie alloggio e trasporto per ogni tappa — solo i selezionati vanno nel budget
- **Timeline visiva**: Le tappe sono visibili in sequenza (es. "Milano → Lisbona (3gg) → Porto → Milano")
- **Mappa interattiva**: Leaflet/OpenStreetMap con marker mostrata nell'itinerario (Step 1)

## I Miei Viaggi — Visualizzazione Step-by-Step
- **SavedTripsV2**: ogni viaggio salvato mostra badge di completamento per step (📋 Itinerario ✓/○, 🏨 Alloggi ✓/○, 💰 Budget ✓/○)
- **Read-only navigation**: caricando un viaggio salvato si naviga tra gli step senza poter modificare (solo "← Indietro" / "Avanti →")
- Preferiti in cima alla lista, eliminazione con conferma
- La visualizzazione a step permette di rivedere itinerario, alloggi e budget come in un report interattivo

## User Persona
- **Il Viaggiatore Curioso**: Cerca esperienze autentiche lontano dai circuiti di massa.
- **La Famiglia Organizzata**: Ha bisogno di gestire budget e attività per bambini in modo chiaro.
- **Lo Slow Traveler**: Vuole godersi il viaggio senza correre, con un itinerario logico e ben spaziato.

## Design Philosophy
- **Minimalismo**: L'interfaccia deve sparire per lasciare spazio alle immagini e alle informazioni.
- **Fiducia**: Ogni link deve funzionare (URL Safety 3-layer + v2 sanitizers per flusso 3-step), ogni costo deve essere realistico (cap trasporti al 30% del budget). URL AI-generati sono sanificati sia nel flusso legacy (`sanitizeTravelPlanAsync()`) che nel flusso v2 (`sanitizeStep1Urls()` + `sanitizeStep2Urls()`).
- **Mai fidarsi dei deep link AI**: GLM-5.1 fabbrica link finti (booking.com/hotel/fake, tripadvisor/Restaurant_Review-fake) che portano a 404. Il frontend genera SEMPRE search URL reali dai dati strutturati — HotelCard usa `getBookingSearchUrlWithDates` con date per-tappa, RestaurantCard usa Google Search, FlightCard per auto usa Google Maps. Solo le search URL (non i deep link) sono trusted.
- **Progressività**: L'utente conferma e seleziona prima di procedere — niente sorprese, niente costi nascosti.
- **Resilienza**: Se l'AI tronca la risposta, il sistema ritenta automaticamente con un prompt più conciso.

## Car Route UX — "Auto privata"
Quando l'utente sceglie "Auto privata" come trasporto, il FlightCard non mostra info volo ma un layout dedicato:
- **Distanza** in km, **tempo di viaggio**, **costo carburante+pedaggi**
- Link "Vedi su Google Maps" con URL direzioni per il tragitto
- Niente orari volo, niente "Prenota" — è un percorso stradale, non un volo

## Per-Stop Booking Dates
Ogni tappa dell'itinerario ha le sue date di check-in/check-out per Booking.com, calcolate accumulando le notti dalla data di partenza del viaggio. Questo dà link di ricerca più pertinenti rispetto a usare le date dell'intero viaggio.

## Stack
- **AI**: GLM-5.1 via Zhipu API (con web_search integrato)
- **Auth & DB**: Supabase (REST API per CRUD, JS client solo per auth)
- **Deploy**: Vercel (serverless functions per endpoint API)
- **Immagini**: Unsplash API (fallback picsum.photos)