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
 * Extract unique stops from itinerary by grouping consecutive days
 * in the same location. Location is determined by the first word of
 * the first activity's location, or the day title if no activities.
 */
function extractStops(itinerary: ItineraryDraft): Stop[] {
  const stops: Stop[] = [];

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

    // Take up to first 2 words (city + region) and clean
    const stopName = cleanLocation
      .split(/[,\-]+/)[0]  // Take part before comma (e.g. "Lisbona, Portogallo" → "Lisbona")
      .trim()
      .replace(/[^\wÀ-ÿ\s]/g, "")
      .trim();

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

  // Calculate nights per stop (days count = dayIndices.length, nights = days - 1 for intermediate stops, days for last)
  // More precisely: nights per stop = number of dayIndices (they spend that many nights)
  // But the last day is departure day — travelers don't sleep there.
  // Actually: nights in a stop = number of dayIndices if we count Pernottamento activities,
  // but simpler: nights = dayIndices.length (each day they're there, they sleep there, except potentially the last day)
  // For safety: nights = dayIndices.length (assume each day = one night)
  for (const stop of stops) {
    stop.nights = stop.dayIndices.length;
  }

  // The last day of the trip is typically a departure day with no overnight stay
  // Adjust: if the last stop only has 1 day, it's likely departure — keep nights=1 anyway
  // since the Pernottamento activity is expected in the itinerary.

  return stops;
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

ISTRUZIONI:
1. Usa la ricerca web per trovare prezzi REALI e aggiornati per alloggi a ${stopName}.
2. Proponi 2-3 opzioni di alloggio (hotel, B&B, ostello, appartamento) con prezzi per notte trovati online.
3. Proponi 2 opzioni di ristorante locale con fascia di prezzo.
4. Le descrizioni DEVONO essere brevi ma informative: 1-2 frasi per reviewSummary.
5. Per "estimatedPricePerNight" indica il costo TOTALE della camera per TUTTE le ${totalPeople} persone, NON per persona.
6. Per "bookingUrl" usa il link a booking.com. Per "officialUrl" usa il sito ufficiale dell'hotel. Includi ENTRAMBI se possibile.

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
  const jsonStartIdx = text.indexOf("{");
  const jsonEndIdx = text.lastIndexOf("}");

  if (jsonStartIdx === -1 || jsonEndIdx === -1) {
    throw new Error(`Nessun JSON valido trovato per la tappa ${stopName}`);
  }

  const jsonText = text.substring(jsonStartIdx, jsonEndIdx + 1);
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

  const prompt = `Cerca 2 alloggi e 1 ristorante a ${stopName} per ${nights} notti (${totalPeople} persone, tipo: ${accommodationType}). Prezzi reali trovati online. Descrizioni brevi ma informative. SOLO JSON:

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
  const jsonStartIdx = text.indexOf("{");
  const jsonEndIdx = text.lastIndexOf("}");

  if (jsonStartIdx === -1 || jsonEndIdx === -1) {
    throw new Error(`Nessun JSON valido trovato per la tappa ${stopName} (retry)`);
  }

  const jsonText = text.substring(jsonStartIdx, jsonEndIdx + 1);
  const rawJson = repairJson(jsonText);
  const json = cleanEmptyStrings(rawJson) as Record<string, unknown>;

  const accommodations = AccommodationStopSchema.parse(json.accommodations);
  const restaurants = RestaurantStopSchema.parse(json.restaurants);

  return { accommodations, restaurants };
}

// ─── Flight/transport search ─────────────────────────────────────────────────

async function searchFlights(
  inputs: TravelInputs,
  apiKey: string
): Promise<FlightSegment[]> {
  const totalPeople = inputs.people.adults + inputs.people.children.length;
  const flightPref = inputs.flightPreference || "Volo diretto";
  const departure = `${inputs.departureCity}${inputs.departureCountry ? ` (${inputs.departureCountry})` : ""}`;
  const destination = `${inputs.destination}${inputs.country ? ` (${inputs.country})` : ""}`;

  const prompt = `Sei un esperto di trasporti con accesso a ricerca web. Cerca opzioni di volo/treno per questa tratta.

TRATTA: ${departure} → ${destination}
DATE: ${inputs.startDate} → ${inputs.endDate}
PERSONE: ${totalPeople}
PREFERENZA TRASPORTO: ${flightPref}
BUDGET TOTALE: €${inputs.budget}
STOPOVER: ${inputs.stopover || "Nessuno"}

ISTRUZIONI:
1. Usa la ricerca web per verificare quali compagnie aeree/treno operano realmente questa tratta.
2. Per "estimatedPrice" indica il costo PER PERSONA found online (stima realistica).
3. IMPOSTA SEMPRE departureTime e arrivalTime a null (gli orari cambiano continuamente).
4. Imposta "verified" a false.
5. Per "bookingUrl" usa il sito ufficiale della compagnia (es. https://www.ryanair.com, https://www.trenitalia.com).

Se la preferenza è "Auto privata", cerca informazioni su distanza e pedaggi. Se è "Treno", cerca tratte ferroviarie reali.

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
    max_tokens: 2000,
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
  const jsonStartIdx = text.indexOf("{");
  const jsonEndIdx = text.lastIndexOf("}");

  if (jsonStartIdx === -1 || jsonEndIdx === -1) {
    throw new Error("Nessun JSON valido trovato per la ricerca voli");
  }

  const jsonText = text.substring(jsonStartIdx, jsonEndIdx + 1);
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
    const stops = extractStops(itinerary);

    if (stops.length === 0) {
      // Fallback: if we can't extract stops, use destination as single stop
      const totalDays = itinerary.itinerary.length;
      stops.push({
        stopName: inputs.destination.split(/[\s,]+/)[0],
        nights: totalDays > 0 ? totalDays - 1 : 1,
        dayIndices: itinerary.itinerary.map((_, i) => i),
      });
    }

    const totalStops = stops.length;
    const accommodations: AccommodationStop[] = [];
    const bestRestaurants: RestaurantStop[] = [];
    const warnings: string[] = [];

    // Search accommodations & restaurants for each stop (1 AI call per stop)
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const progressPercent = 15 + Math.round((i / (totalStops + 1)) * 65); // 15-80%
      onProgress?.(`Ricerca alloggi a ${stop.stopName}... (${i + 1}/${totalStops})`, progressPercent);

      try {
        const result = await searchStopAccommodations(
          stop.stopName,
          stop.nights,
          inputs,
          apiKey
        );
        accommodations.push(result.accommodations);
        bestRestaurants.push(result.restaurants);
      } catch (primaryError) {
        console.warn(`Step 2: Primary search failed for stop "${stop.stopName}", retrying with simpler prompt...`, primaryError);

        // Retry once with simpler prompt
        try {
          const result = await searchStopAccommodationsRetry(
            stop.stopName,
            stop.nights,
            inputs,
            apiKey
          );
          accommodations.push(result.accommodations);
          bestRestaurants.push(result.restaurants);
        } catch (retryError) {
          console.error(`Step 2: Both searches failed for stop "${stop.stopName}", skipping.`, retryError);
          warnings.push(`Impossibile trovare alloggi per ${stop.stopName}`);
        }
      }
    }

    // Search flights (1 AI call)
    let flights: FlightSegment[] = [];
    onProgress?.("Ricerca voli e trasporti...", 85);

    try {
      flights = await searchFlights(inputs, apiKey);
    } catch (flightError) {
      console.error("Step 2: Flight search failed, continuing without flights.", flightError);
      warnings.push("Impossibile trovare opzioni di volo per la tratta selezionata");
    }

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