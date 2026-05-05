import OpenAI from "openai";
import { z } from "zod";
import {
  AccommodationStopSchema,
  RestaurantStopSchema,
  FlightSegmentSchema,
  AccommodationTransportSchema,
} from "../shared/step2-contract";
import type {
  AccommodationStop,
  RestaurantStop,
  FlightSegment,
  AccommodationTransport,
} from "../shared/step2-contract";
import type { ItineraryDraft } from "../shared/step1-contract";
import type { TravelInputs } from "./travelService";

export type { AccommodationTransport };
export type ProgressCallback = (step: string, progress: number) => void;

const ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

// ─── Helpers (same pattern as travelService/step1Service) ──────────────────

async function getApiKey(): Promise<string> {
  let apiKey = "";

  // Try to get key from server (which reads process.env)
  try {
    const configRes = await fetch("/api/config");
    if (configRes.ok) {
      const config = await configRes.json();
      apiKey = config.apiKey;
    }
  } catch (e) {
    console.warn("Failed to fetch config from server", e);
  }

  // Fallback to Vite-injected env var
  if (!apiKey || apiKey.length < 20 || apiKey.startsWith("MY_")) {
    const envKey = process.env.ZHIPU_API_KEY;
    if (envKey && envKey.length > 20 && !envKey.startsWith("MY_")) {
      apiKey = envKey;
    }
  }

  // Sanitize
  apiKey = apiKey?.trim() || "";
  if (
    (apiKey.startsWith('"') && apiKey.endsWith('"')) ||
    (apiKey.startsWith("'") && apiKey.endsWith("'"))
  ) {
    apiKey = apiKey.slice(1, -1);
  }

  if (!apiKey) {
    throw new Error(
      "Configurazione incompleta: API Key non trovata. Contatta l'amministratore."
    );
  }

  return apiKey;
}

function extractText(content: string | OpenAI.ChatCompletionContentPart[]): string {
  if (typeof content === "string") return content;
  const textPart = content.find(
    (p): p is OpenAI.ChatCompletionContentPartText => p.type === "text"
  );
  return textPart?.text ?? "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function repairJson(jsonText: string): any {
  try {
    return JSON.parse(jsonText);
  } catch {
    // Try to fix truncated JSON by balancing braces/brackets
    let fixed = jsonText;
    const openBraces = (fixed.match(/\{/g) || []).length;
    const closeBraces = (fixed.match(/\}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) fixed += " ]".repeat(openBrackets - closeBrackets);
    if (openBraces > closeBraces) fixed += " }".repeat(openBraces - closeBraces);
    return JSON.parse(fixed);
  }
}

// ─── Empty string cleaner ────────────────────────────────────────────────

/** AI often returns "" instead of null. Convert empty strings to null recursively. */
function cleanEmptyStrings(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string' && obj.trim() === '') return null;
  if (Array.isArray(obj)) return obj.map(cleanEmptyStrings);
  if (typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      cleaned[key] = cleanEmptyStrings(value);
    }
    return cleaned;
  }
  return obj;
}

// ─── Stop extraction ────────────────────────────────────────────────────────

interface Stop {
  stopName: string;
  nights: number;
  dayIndices: number[];
}

/**
 * Extract the "parent" location from a raw location string.
 * E.g. "Victoria, Mahé" → "Mahé", "Beau Vallon, Mahé" → "Mahé"
 * "Mahé" → "Mahé", "Praslin" → "Praslin"
 * Returns the part after the last comma if it looks like an island/region,
 * otherwise the first part (the city).
 */
function extractParentLocation(raw: string): string {
  const parts = raw.split(/[,\-]+/).map(p => p.trim().replace(/[^\wÀ-ÿ\s]/g, "").trim()).filter(Boolean);
  if (parts.length <= 1) return parts[0] || raw;
  // If 2+ parts, the last part is typically the island/main city (e.g. "Mahé" in "Victoria, Mahé")
  // Use it as the stop for hotel grouping
  return parts[parts.length - 1];
}

/**
 * Parse explicit city names from user notes.
 * E.g. "vorrei visitare mahé, praslin e la digue" → ["mahé", "praslin", "la digue"]
 * Handles Italian connectors: "mahé, praslin e la digue" → 3 cities
 * Also handles: "mahé praslin la digue" (space-separated proper nouns)
 */
function parseCitiesFromNotes(notes: string | undefined): string[] {
  if (!notes) return [];
  const clean = notes.toLowerCase()
    .replace(/[.;:!?()]/g, ',')
    // Remove common Italian filler words and verbs — as whole words only
    .replace(/\b(vorrei|voglio|visitare|vedere|andare|fare|stare|dormire|fermarmi|pernottare|anche|poi|prima|dopo|stessa|stesso|sopratutto|soprattutto|magari|possibilmente|vogliamo|vorremmo)\b/gi, '')
    // Replace " e " with comma to split on it
    .replace(/\s+e\s+/gi, ',')
    // Split on commas
    .split(/[,]+/)
    .map(t => t.trim()
      // Strip leading articles/prepositions, BUT preserve "la" when followed by capitalizable proper noun patterns
      // e.g. "la digue" should keep "la" as part of the name
      .replace(/^(in|dal|alle|agli|del|della|delle|degli|di|da|per|con|su|il|lo|le|gli|un|una|uno|i|al)\s+/gi, '')
      // "a" is ambiguous — "a praslin" → strip, but keep if it's "la digue"
      .replace(/^a\s+(?=[a-z])/gi, '')
      .trim()
    )
    // Filter out empty and too-short tokens, but allow multi-word names like "la digue", "boa vista"
    .filter(t => t.length >= 3 && t.length <= 40);
  return clean;
}

/**
 * Extract unique stops from itinerary by grouping consecutive days
 * in the same location. Uses parent location (island/region) when available
 * to avoid splitting one logical stop into sub-locations.
 * Respects preferredStops count from inputs for consolidation.
 */
function extractStops(itinerary: ItineraryDraft, tripStyle?: string, inputs?: TravelInputs): Stop[] {
  const stops: Stop[] = [];
  const preferredStops = inputs?.preferredStops;
  const userNotes = inputs?.notes;

  for (const day of itinerary.itinerary) {
    // Determine location: use full location string, or day title
    let locationRaw = "";
    if (day.activities && day.activities.length > 0 && day.activities[0].location) {
      locationRaw = day.activities[0].location;
    } else {
      locationRaw = day.title || "";
    }

    // Clean location: remove common Italian prefixes like "Arrivo a", "Visita", "Esplorazione", "Partenza da"
    const cleanLocation = locationRaw
      .replace(/^(Arrivo a |Arrivo a|Visita |Visita|Esplorazione |Esplorazione|Partenza da |Partenza da|Scoperta |Scoperta|Giornata a |Giornata a|Tour di |Tour di)\s*/i, "")
      .trim();

    // Determine the stop name: prefer the parent location (island/region)
    // e.g. "Victoria, Mahé" → use "Mahé" as the stop (same hotel across Mahé)
    const parentLocation = extractParentLocation(cleanLocation);
    // Also keep the full first part as display name for single-location cases
    const cityPart = cleanLocation
      .split(/[,\-]+/)[0]
      .trim()
      .replace(/[^\wÀ-ÿ\s]/g, "")
      .trim();

    // Use parent location if it differs from city part (meaning there's a comma = sub-location)
    // Otherwise use the city part directly
    const stopName = parentLocation.toLowerCase() !== cityPart.toLowerCase() ? parentLocation : cityPart;

    if (!stopName) continue;

    // Normalize for matching (case-insensitive)
    const normalizedName = stopName.toLowerCase();

    // If same as last stop (case-insensitive), extend it
    if (stops.length > 0 && stops[stops.length - 1].stopName.toLowerCase() === normalizedName) {
      stops[stops.length - 1].dayIndices.push(day.day - 1);
    } else {
      stops.push({
        stopName, // Keep original casing for display
        nights: 1,
        dayIndices: [day.day - 1],
      });
    }
  }

  // RELAX mode: if tripStyle is 'relax', merge all stops into one
  if (tripStyle === 'relax' && stops.length > 1) {
    const mainStop = stops.reduce((a, b) =>
      a.dayIndices.length >= b.dayIndices.length ? a : b
    );
    const mergedStop: Stop = {
      stopName: mainStop.stopName,
      nights: 0,
      dayIndices: stops.flatMap(s => s.dayIndices).sort((a, b) => a - b),
    };
    mergedStop.nights = mergedStop.dayIndices.length;
    stops.length = 0;
    stops.push(mergedStop);
  }

  // CONSOLIDATION: if user specified preferredStops and we extracted more,
  // try to merge adjacent stops that belong to the same logical city/island
  if (preferredStops && preferredStops > 0 && stops.length > preferredStops) {
    // Try matching against explicit city names from user notes
    const noteCities = parseCitiesFromNotes(userNotes);
    
    // Group adjacent stops by fuzzy matching (same parent or same root word)
    // Merge until we reach preferredStops count
    let merged = [...stops];
    while (merged.length > preferredStops && merged.length > 1) {
      // Find the pair of adjacent stops that are most similar (to merge first)
      let bestIdx = -1;
      let bestScore = 0;
      for (let i = 0; i < merged.length - 1; i++) {
        const a = merged[i].stopName.toLowerCase();
        const b = merged[i + 1].stopName.toLowerCase();
        // Score: check if one contains the other, or they share a significant word
        let score = 0;
        if (a.includes(b) || b.includes(a)) score = 3;
        const aWords = a.split(/\s+/);
        const bWords = new Set(b.split(/\s+/));
        const sharedWords = aWords.filter(w => w.length > 2 && bWords.has(w)).length;
        score += sharedWords;
        // Check against note cities — if both map to same note city, high score
        for (const nc of noteCities) {
          const matchesA = a.includes(nc) || nc.includes(a);
          const matchesB = b.includes(nc) || nc.includes(b);
          if (matchesA && matchesB) { score += 5; break; }
        }
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      // If no good merge found, merge the smallest adjacent pair
      if (bestIdx === -1) {
        let minDays = Infinity;
        for (let i = 0; i < merged.length - 1; i++) {
          const totalDays = merged[i].dayIndices.length + merged[i + 1].dayIndices.length;
          if (totalDays < minDays) {
            minDays = totalDays;
            bestIdx = i;
          }
        }
      }
      // Merge bestIdx and bestIdx+1
      const a = merged[bestIdx];
      const b = merged[bestIdx + 1];
      // Use the name from whichever has more days
      const mergedStop: Stop = {
        stopName: a.dayIndices.length >= b.dayIndices.length ? a.stopName : b.stopName,
        nights: 0,
        dayIndices: [...a.dayIndices, ...b.dayIndices].sort((x, y) => x - y),
      };
      mergedStop.nights = mergedStop.dayIndices.length;
      merged.splice(bestIdx, 2, mergedStop);
    }
    stops.length = 0;
    stops.push(...merged);
  }

  // Calculate nights per stop
  for (const stop of stops) {
    stop.nights = stop.dayIndices.length;
  }

  return stops;
}

// ─── Generate car route segments programmatically (no AI needed) ──────────

/**
 * Estimate road distance (km) between two European cities.
 * 1. Check the lookup table of real Google Maps distances
 * 2. Fallback: use Nominatim geocoding + haversine with 1.35x road factor
 */
async function estimateRoadKmWithGeocode(cityA: string, cityB: string, destination?: string): Promise<{ km: number; fromCoords: boolean }> {
  const europeanDistances: Record<string, number> = {
    // Common Italy routes (real Google Maps distances)
    'milano-roma': 570, 'roma-napoli': 230, 'milano-torino': 140, 'milano-venezia': 270,
    'roma-firenze': 280, 'firenze-bologna': 100, 'bologna-venezia': 150,
    'milano-firenze': 300, 'roma-bari': 380,
    // Portugal
    'lisbona-porto': 310, 'porto-lisbona': 310,
    'lisbona-algarve': 280, 'algarve-lisbona': 280,
    // Spain
    'madrid-barcellona': 620, 'barcellona-valencia': 350,
    'madrid-siviglia': 530, 'siviglia-granada': 250,
    // France
    'parigi-lione': 460, 'lione-marsiglia': 310, 'parigi-nizza': 930,
    'parigi-bordeaux': 590,
    // UK
    'londra-manchester': 340, 'londra-edinburgo': 650,
    // Germany
    'berlino-monaco': 590, 'monaco-amburgo': 780, 'francoforte-berlino': 550,
    // Cross-border common
    'milano-parigi': 850, 'roma-parigi': 1430, 'milano-lione': 450,
    'barcellona-marsiglia': 500, 'lione-barcellona': 670,
    'lisbona-madrid': 620, 'madrid-lisbona': 620,
    'milano-vienna': 830, 'roma-vienna': 1120,
  };

  const normalizeCity = (c: string) => c.toLowerCase().split(',')[0].trim()
    .replace(/^(città di |city of |ville de )/i, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // strip accents

  const a = normalizeCity(cityA);
  const b = normalizeCity(cityB);
  const key1 = `${a}-${b}`;
  const key2 = `${b}-${a}`;

  if (europeanDistances[key1]) return { km: europeanDistances[key1], fromCoords: false };
  if (europeanDistances[key2]) return { km: europeanDistances[key2], fromCoords: false };

  // Fallback: Nominatim geocoding + haversine
  try {
    const { geocodeCities, estimateRoadKmFromCoords } = await import('../lib/nominatim');
    const coords = await geocodeCities(cityA, cityB, destination);
    if (coords.a && coords.b) {
      const km = estimateRoadKmFromCoords(coords.a.lat, coords.a.lng, coords.b.lat, coords.b.lng);
      return { km, fromCoords: true };
    }
  } catch (err) {
    console.warn(`[CarSegments] Nominatim fallback failed for ${cityA}→${cityB}:`, err);
  }

  // Last resort fallback
  return { km: 400, fromCoords: true };
}

async function generateCarSegments(
  inputs: TravelInputs,
  stops: Stop[]
): Promise<FlightSegment[]> {
  const departureCity = inputs.departureCity || 'Casa';
  const fuelCostPerKm = 0.15;  // €0.15/km average European fuel
  const tollCostPerKm = 0.07;  // €0.07/km average European tolls
  const destination = `${inputs.destination}${inputs.country ? ` (${inputs.country})` : ""}`;

  const segments: FlightSegment[] = [];

  // Build ordered list of cities in the trip
  const cityList = [departureCity, ...stops.map(s => s.stopName), departureCity];

  // Create one segment per consecutive pair — single option (with tolls)
  for (let i = 0; i < cityList.length - 1; i++) {
    const fromCity = cityList[i];
    const toCity = cityList[i + 1];
    const { km: distKm } = await estimateRoadKmWithGeocode(fromCity, toCity, destination);
    const fuelCost = Math.round(distKm * fuelCostPerKm);
    const tollCost = Math.round(distKm * tollCostPerKm);
    const totalCost = fuelCost + tollCost;
    const googleMapsUrl = `https://www.google.com/maps/dir/${encodeURIComponent(fromCity)}/${encodeURIComponent(toCity)}`;

    segments.push({
      segmentName: `Auto: ${fromCity} → ${toCity}`,
      selectedIndex: 0,
      options: [
        {
          airline: 'Auto privata',
          route: `${fromCity} → ${toCity}`,
          estimatedPrice: totalCost,
          date: inputs.startDate,
          departureTime: null,
          arrivalTime: null,
          duration: null,
          distance: null,
          bookingUrl: googleMapsUrl,
          verified: false,
        },
      ],
    });
  }

  return segments;
}

// ─── Per-stop accommodation + restaurant search ─────────────────────────────

interface StopSearchResult {
  accommodations: AccommodationStop;
  restaurants: RestaurantStop;
}

async function searchStopAccommodations(
  stopName: string,
  nights: number,
  inputs: TravelInputs,
  apiKey: string
): Promise<StopSearchResult> {
  const totalPeople = inputs.people.adults + inputs.people.children.length;
  const accommodationType = inputs.accommodationType || "Hotel";

  const prompt = `Sei un esperto di viaggi con accesso a ricerca web in tempo reale. Cerca alloggi e ristoranti per questa tappa del viaggio.

TAPPA: ${stopName}
NOTTI: ${nights}
PERSONE: ${totalPeople} (${inputs.people.adults} adulti${inputs.people.children.length ? `, ${inputs.people.children.length} bambini` : ""})
TIPOLOGIA ALLOGGIO PREFERITA: ${accommodationType}
BUDGET TOTALE VIAGGIO: €${inputs.budget}
DATE: ${inputs.startDate} → ${inputs.endDate}

⚠️ REGOLA FONDAMENTALE: Gli alloggi DEVONO essere a ${stopName} o nel raggio di 5 km da ${stopName}. NON proporre hotel che si trovano in altre città, regioni o zone — anche se hanno "${stopName}" nel nome. Verifica SU GOOGLE MAPS che l'indirizzo sia realmente a ${stopName} prima di proporlo.

ISTRUZIONI:
1. Usa la ricerca web per trovare prezzi REALI e aggiornati per alloggi a ${stopName}.
2. Proponi ESATTAMENTE 3 opzioni di alloggio con le recensioni migliori e rating più alto a ${stopName}. Dai priorità a hotel con rating ≥4.0 su booking.com/tripadvisor.
3. Proponi 2 opzioni di ristorante locale con fascia di prezzo. Per OGNI ristorante includi un link "sourceUrl" a tripadvisor.it.
4. Le descrizioni DEVONO essere brevi ma informative: 1-2 frasi per reviewSummary.
5. Per "estimatedPricePerNight" indica il costo TOTALE della camera per TUTTE le ${totalPeople} persone, NON per persona.
6. Per "bookingUrl" usa il link a booking.com. Per "officialUrl" usa il sito ufficiale dell'hotel. Includi ENTRAMBI se possibile.
7. Per i ristoranti, il campo "sourceUrl" è OBBLIGATORIO: usa un link a tripadvisor.it per ogni ristorante.

🔗 SICUREZZA DEI LINK:
- USA SOLO link a siti noti: booking.com, tripadvisor.it, airbnb.com, hotels.com, ecc.
- NON usare URL shortener o siti sconosciuti.
- Se non trovi un link sicuro, lascia il campo vuoto.

REGOLE DI FORMATO (CRITICHE):
- Brevità ASSOLUTA: ogni stringa di testo MAX 5 parole.
- JSON: SOLO il JSON, zero markdown, zero commenti.

Struttura JSON richiesta:
{
  "accommodations": {
    "stopName": "${stopName}",
    "nights": ${nights},
    "options": [
      {
        "name": "Nome Hotel",
        "type": "Hotel",
        "rating": 4.5,
        "reviewSummary": "Breve recensione",
        "estimatedPricePerNight": 100,
        "bookingUrl": "https://www.booking.com/hotel/...",
        "officialUrl": "https://www.hotelname.com",
        "address": "Indirizzo",
        "amenities": ["WiFi", "Parcheggio"],
        "stars": 4
      }
    ]
  },
  "restaurants": {
    "stopName": "${stopName}",
    "options": [
      {
        "name": "Nome Ristorante",
        "cuisineType": "Cucina locale",
        "rating": 4.5,
        "reviewSummary": "Breve recensione",
        "sourceUrl": "https://www.tripadvisor.it/Restaurant_Review-...",
        "priceRange": "€€",
        "address": "Indirizzo",
        "mustTry": "Piatto tipico"
      }
    ]
  }
}

IMPORTANTE: Restituisci esclusivamente un oggetto JSON valido. Non includere testo prima o dopo il JSON. Non usare blocchi di codice markdown (\`\`\`json). Restituisci SOLO il JSON.`;

  const client = new OpenAI({
    apiKey,
    baseURL: ZHIPU_BASE_URL,
    dangerouslyAllowBrowser: true,
  });

  const response = await client.chat.completions.create({
    model: "glm-5.1",
    max_tokens: 4000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ type: "web_search", web_search: { enable: true } }] as any,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const text = extractText(response.choices[0]?.message?.content || "");
  // Strip markdown code blocks if present
  const cleanText = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
  const jsonStartIdx = cleanText.indexOf("{");
  const jsonEndIdx = cleanText.lastIndexOf("}");

  if (jsonStartIdx === -1 || jsonEndIdx === -1) {
    throw new Error(`Nessun JSON valido trovato per la tappa ${stopName}`);
  }

  const jsonText = cleanText.substring(jsonStartIdx, jsonEndIdx + 1);
  const rawJson = repairJson(jsonText);
  const json = cleanEmptyStrings(rawJson) as Record<string, unknown>;

  // Validate sub-objects
  const accommodations = AccommodationStopSchema.parse(json.accommodations);
  const restaurants = RestaurantStopSchema.parse(json.restaurants);

  return { accommodations, restaurants };
}

// ─── Simpler retry prompt for failed stops ──────────────────────────────────

async function searchStopAccommodationsRetry(
  stopName: string,
  nights: number,
  inputs: TravelInputs,
  apiKey: string
): Promise<StopSearchResult> {
  const totalPeople = inputs.people.adults + inputs.people.children.length;
  const accommodationType = inputs.accommodationType || "Hotel";

  const prompt = `Cerca 2 alloggi e 1 ristorante a ${stopName} per ${nights} notti (${totalPeople} persone, tipo: ${accommodationType}). Prezzi reali trovati online. Descrizioni brevi ma informative. Per i ristoranti includi SEMPRE sourceUrl a tripadvisor.it. SOLO JSON:

{
  "accommodations": {
    "stopName": "${stopName}",
    "nights": ${nights},
    "options": [
      {
        "name": "Hotel",
        "type": "Hotel",
        "rating": 4.0,
        "reviewSummary": "Breve recensione",
        "estimatedPricePerNight": 80,
        "bookingUrl": "https://www.booking.com/hotel/...",
        "officialUrl": "https://www.hotel.com",
        "address": "Indirizzo",
        "amenities": ["WiFi"],
        "stars": 3
      }
    ]
  },
  "restaurants": {
    "stopName": "${stopName}",
    "options": [
      {
        "name": "Ristorante",
        "cuisineType": "Locale",
        "rating": 4.0,
        "reviewSummary": "Buon cibo",
        "sourceUrl": "https://www.tripadvisor.it/Restaurant_Review-...",
        "priceRange": "€€",
        "mustTry": "Piatto tipico"
      }
    ]
  }
}

SOLO JSON, zero markdown.`;

  const client = new OpenAI({
    apiKey,
    baseURL: ZHIPU_BASE_URL,
    dangerouslyAllowBrowser: true,
  });

  const response = await client.chat.completions.create({
    model: "glm-5.1",
    max_tokens: 3000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ type: "web_search", web_search: { enable: true } }] as any,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const text = extractText(response.choices[0]?.message?.content || "");
  // Strip markdown code blocks if present
  const cleanText = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
  const jsonStartIdx = cleanText.indexOf("{");
  const jsonEndIdx = cleanText.lastIndexOf("}");

  if (jsonStartIdx === -1 || jsonEndIdx === -1) {
    throw new Error(`Nessun JSON valido trovato per la tappa ${stopName} (retry)`);
  }

  const jsonText = cleanText.substring(jsonStartIdx, jsonEndIdx + 1);
  const rawJson = repairJson(jsonText);
  const json = cleanEmptyStrings(rawJson) as Record<string, unknown>;

  const accommodations = AccommodationStopSchema.parse(json.accommodations);
  const restaurants = RestaurantStopSchema.parse(json.restaurants);

  return { accommodations, restaurants };
}

// ─── Flight/transport search ─────────────────────────────────────────────────

async function searchFlights(
  inputs: TravelInputs,
  apiKey: string,
  stops?: Stop[]
): Promise<FlightSegment[]> {
  const totalPeople = inputs.people.adults + inputs.people.children.length;
  const flightPref = inputs.flightPreference || "Volo diretto";
  const departure = `${inputs.departureCity}${inputs.departureCountry ? ` (${inputs.departureCountry})` : ""}`;
  const destination = `${inputs.destination}${inputs.country ? ` (${inputs.country})` : ""}`;

  // Build stop list for car/trip routes
  const isCarRoute = flightPref.toLowerCase().includes('auto');
  const stopsList = stops && stops.length > 0 ? stops : [];
  const stopsRoute = isCarRoute && stopsList.length > 0
    ? [departure, ...stopsList.map(s => s.stopName), departure].join(' → ')
    : '';

  const carRouteSection = isCarRoute ? `
IMPORTANTE — AUTOROUTE CON TAPPE REALI:
Il viaggio in auto ha le seguenti TAPPE OBBLIGATORIE (stesse dell'itinerario):
${stopsList.map((s, i) => `- Tappa ${i + 1}: ${s.stopName} (${s.nights} ${s.nights === 1 ? 'notte' : 'notti'})`).join('\n')}
- Crea un segment per OGNI tratta tra tappe consecutive: ${stopsRoute}
- Per ogni segment: "route" = "CittàA → CittàB", "distance" in km, "duration" realistico, "estimatedPrice" = benzina+pedaggi PER TUTTO IL PERCORSO (non per persona)
- "bookingUrl" per ogni segment = \`https://www.google.com/maps/dir/CittàA/CittàB\`
- IMPOSTA departureTime e arrivalTime a null
- "airline" = "Auto privata" per tutti i segment` : '';

  const prompt = `Sei un esperto di trasporti con accesso a ricerca web. Cerca opzioni di volo/treno per questa tratta.

TRATTA: ${departure} → ${destination}
DATE: ${inputs.startDate} → ${inputs.endDate}
PERSONE: ${totalPeople}
PREFERENZA TRASPORTO: ${flightPref}
BUDGET TOTALE: €${inputs.budget}
STOPOVER: ${inputs.stopover || "Nessuno"}
${carRouteSection}
ISTRUZIONI:
1. Usa la ricerca web per verificare quali compagnie aeree/treno operano realmente questa tratta.
2. Per "estimatedPrice" indica il costo PER PERSONA found online (stima realistica).
3. IMPOSTA SEMPRE departureTime e arrivalTime a null (gli orari cambiano continuamente).
4. Imposta "verified" a false.
5. Per "bookingUrl" usa il sito ufficiale della compagnia (es. https://www.ryanair.com, https://www.trenitalia.com).

Se la preferenza è "Auto privata":
- Cerca su Google Maps la DISTANZA in km e il TEMPO DI PERCORRENZA reale per ogni tratta.
- Includi il campo "distance" con la distanza (es. "1.850 km").
- In "estimatedPrice" metti il costo stimato di benzina + pedaggi PER TUTTO IL PERCORSO (non per persona).
- In "duration" metti il tempo di percorrenza reale (es. "18h totale, consigliato in 2 giorni").
- In "bookingUrl" metti un link a Google Maps per la tratta (es. https://www.google.com/maps/dir/CittàA/CittàB).
- IMPOSTA departureTime e arrivalTime a null — per l'auto non ha senso.

Se è "Treno", cerca tratte ferroviarie reali.

🔗 SICUREZZA DEI LINK:
- USA SOLO link a siti ufficiali delle compagnie (tap.pt, ryanair.com, trenitalia.com, ecc.)
- NON usare Google Flights come bookingUrl.
- Se non trovi un link sicuro, lascia il campo vuoto.

REGOLE DI FORMATO:
- Brevità ASSOLUTA: ogni stringa di testo MAX 5 parole.
- JSON: SOLO il JSON, zero markdown, zero commenti.

Struttura JSON richiesta:
{
  "flights": [
    {
      "segmentName": "Volo/Treno: Città A → Città B",
      "options": [
        {
          "airline": "Compagnia",
          "route": "Città A → Città B",
          "estimatedPrice": 150,
          "date": "${inputs.startDate}",
          "departureTime": null,
          "arrivalTime": null,
          "duration": "2h30",
          "bookingUrl": "https://www.compagnia.com",
          "verified": false
        }
      ]
    }
  ]
}

IMPORTANTE: Restituisci esclusivamente un oggetto JSON valido. Non includere testo prima o dopo il JSON. Non usare blocchi di codice markdown. Restituisci SOLO il JSON.`;

  const client = new OpenAI({
    apiKey,
    baseURL: ZHIPU_BASE_URL,
    dangerouslyAllowBrowser: true,
  });

  const response = await client.chat.completions.create({
    model: "glm-5.1",
    max_tokens: 4000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ type: "web_search", web_search: { enable: true } }] as any,
    messages: [
      {
        role: "system",
        content: "Sei un assistente che risponde SOLO in JSON. Nessun testo prima o dopo il JSON. Nessun markdown.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const text = extractText(response.choices[0]?.message?.content || "");
  console.log("[Step2-Flights] Raw response length:", text.length, "first 300 chars:", text.substring(0, 300));

  // Strip markdown code blocks if present (GLM sometimes wraps JSON in ```json...```)
  let cleanText = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");

  const jsonStartIdx = cleanText.indexOf("{");
  const jsonEndIdx = cleanText.lastIndexOf("}");

  if (jsonStartIdx === -1 || jsonEndIdx === -1) {
    console.error("[Step2-Flights] No JSON found in response. Full text:", text.substring(0, 1000));
    throw new Error("Nessun JSON valido trovato per la ricerca voli");
  }

  const jsonText = cleanText.substring(jsonStartIdx, jsonEndIdx + 1);
  const rawJson = repairJson(jsonText);
  const json = cleanEmptyStrings(rawJson) as Record<string, unknown>;

  // Validate flight segments — use safeParse to be resilient
  const flightResult = z.array(FlightSegmentSchema).safeParse(json.flights);
  if (flightResult.success) {
    return flightResult.data;
  }
  console.error("[Step2] Flight validation errors:", JSON.stringify(flightResult.error.issues, null, 2));
  console.error("[Step2] Raw flights data:", JSON.stringify(json.flights)?.substring(0, 500));
  throw new Error("Validazione voli fallita — risposta AI non conforme allo schema");
}

// ─── Main export: searchAccommodationsAndTransport ───────────────────────────

export const searchAccommodationsAndTransport = async (
  itinerary: ItineraryDraft,
  inputs: TravelInputs,
  onProgress?: ProgressCallback
): Promise<AccommodationTransport> => {
  onProgress?.("Inizializzazione ricerca alloggi e trasporti...", 5);

  try {
    onProgress?.("Verifica configurazione...", 10);
    const apiKey = await getApiKey();

    // Extract unique stops from itinerary
    const stops = extractStops(itinerary, inputs.tripStyle, inputs);

    if (stops.length === 0) {
      // Fallback: if we can't extract stops, use destination as single stop
      const totalDays = itinerary.itinerary.length;
      stops.push({
        stopName: inputs.destination.split(/[\s,]+/)[0],
        nights: totalDays > 0 ? totalDays - 1 : 1,
        dayIndices: itinerary.itinerary.map((_, i) => i),
      });
    }

    // Search accommodations & restaurants + flights in PARALLEL
    const totalStops = stops.length;
    const accommodations: AccommodationStop[] = [];
    const bestRestaurants: RestaurantStop[] = [];
    const warnings: string[] = [];

    // If car route, generate segments programmatically (no AI call needed, faster + reliable)
    const isCarRoute = (inputs.flightPreference || '').toLowerCase().includes('auto');
    let carSegments: FlightSegment[] | null = null;

    if (isCarRoute && stops.length > 0) {
      onProgress?.("Calcolo tratte auto...", 65);
      carSegments = await generateCarSegments(inputs, stops);
    }

    // Build all stop search promises
    const stopPromises = stops.map((stop, i) => {
      const progressPercent = 15 + Math.round((i / (totalStops + 1)) * 50);
      onProgress?.(`Ricerca alloggi a ${stop.stopName}... (${i + 1}/${totalStops})`, progressPercent);
      return searchStopAccommodations(
        stop.stopName,
        stop.nights,
        inputs,
        apiKey
      ).catch(primaryError => {
        console.warn(`Step 2: Primary search failed for stop "${stop.stopName}", retrying with simpler prompt...`, primaryError);
        return searchStopAccommodationsRetry(
          stop.stopName,
          stop.nights,
          inputs,
          apiKey
        ).catch(retryError => {
          console.error(`Step 2: Both searches failed for stop "${stop.stopName}", skipping.`, retryError);
          warnings.push(`Impossibile trovare alloggi per ${stop.stopName}`);
          return null;
        });
      });
    });

    // Start flight search concurrently (only if NOT car route — car is pure JS)
    let flightPromise: Promise<FlightSegment[]>;
    if (carSegments) {
      // Car segments already generated, no AI call needed
      flightPromise = Promise.resolve(carSegments);
    } else {
      onProgress?.("Ricerca voli e trasporti in parallelo...", 65);
      flightPromise = searchFlights(inputs, apiKey, stops).catch(flightError => {
        console.error("Step 2: Flight search failed, continuing without flights.", flightError);
        warnings.push("Impossibile trovare opzioni di volo per la tratta selezionata");
        return [] as FlightSegment[];
      });
    }

    // Wait for all in parallel
    onProgress?.("Attendendo risultati...", 70);
    const [stopResults, flights] = await Promise.all([
      Promise.allSettled(stopPromises),
      flightPromise,
    ]);

    // Process stop results
    for (const result of stopResults) {
      if (result.status === 'fulfilled' && result.value) {
        accommodations.push(result.value.accommodations);
        bestRestaurants.push(result.value.restaurants);
      }
    }

    onProgress?.("Ricerca completata!", 95);

    // Assemble result
    const result: AccommodationTransport = {
      accommodations,
      bestRestaurants,
      flights: flights.length > 0 ? flights : undefined,
    };

    // Validate final structure
    const validationResult = AccommodationTransportSchema.safeParse(result);
    if (!validationResult.success) {
      console.error(
        "Step 2 Validation Errors:",
        JSON.stringify(validationResult.error.issues, null, 2)
      );
      // Return what we have even if validation fails partially
      // Warnings will already note missing stops
    }

    onProgress?.("Ricerca completata!", 100);
    return validationResult.success ? validationResult.data : result;
  } catch (error) {
    console.error("Step 2: searchAccommodationsAndTransport failed:", error);
    throw error;
  }
};