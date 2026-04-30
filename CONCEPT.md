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
   (modificabile)     (conferma)           (salva)
```

- Ogni step ha un prompt più piccolo → meno timeout AI
- L'utente può modificare l'itinerario prima di cercare alloggi
- Modifica Step 1 → Steps 2-3 invalidati e ricalcolati
- Viaggi lunghi (14+ giorni) non si bloccano grazie ad auto-retry con prompt compatto

## User Persona
- **Il Viaggiatore Curioso**: Cerca esperienze autentiche lontano dai circuiti di massa.
- **La Famiglia Organizzata**: Ha bisogno di gestire budget e attività per bambini in modo chiaro.
- **Lo Slow Traveler**: Vuole godersi il viaggio senza correre, con un itinerario logico e ben spaziato.

## Design Philosophy
- **Minimalismo**: L'interfaccia deve sparire per lasciare spazio alle immagini e alle informazioni.
- **Fiducia**: Ogni link deve funzionare (URL Safety 3-layer), ogni costo deve essere realistico.
- **Progressività**: L'utente conferma prima di procedere — niente sorprese.
- **Resilienza**: Se l'AI tronca la risposta, il sistema ritenta automaticamente con un prompt più conciso.

## Stack
- **AI**: GLM-5.1 via Zhipu API (con web_search integrato)
- **Auth & DB**: Supabase (REST API per CRUD, JS client solo per auth)
- **Deploy**: Vercel (serverless functions per endpoint API)
- **Immagini**: Unsplash API (fallback picsum.photos)