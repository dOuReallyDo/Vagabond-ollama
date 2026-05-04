/**
 * Accommodation search service — search for a specific hotel by name,
 * verify it exists at the stop city, and fetch reviews.
 * Uses GLM-5.1 with web_search (same as step2Service).
 */

import OpenAI from "openai";

const ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

async function getApiKey(): Promise<string> {
  let apiKey = "";

  try {
    const configRes = await fetch("/api/config");
    if (configRes.ok) {
      const config = await configRes.json();
      apiKey = config.apiKey;
    }
  } catch (e) {
    console.warn("Failed to fetch config from server", e);
  }

  if (!apiKey || apiKey.length < 20 || apiKey.startsWith("MY_")) {
    const envKey = process.env.ZHIPU_API_KEY;
    if (envKey && envKey.length > 20 && !envKey.startsWith("MY_")) {
      apiKey = envKey;
    }
  }

  apiKey = apiKey?.trim() || "";
  if (
    (apiKey.startsWith('"') && apiKey.endsWith('"')) ||
    (apiKey.startsWith("'") && apiKey.endsWith("'"))
  ) {
    apiKey = apiKey.slice(1, -1);
  }

  if (!apiKey) {
    throw new Error("Configurazione incompleta: API Key non trovata.");
  }

  return apiKey;
}

function extractText(content: string | OpenAI.ChatCompletionContentPart[]): string {
  if (typeof content === "string") return content;
  // GLM-5.1 with web_search returns content as array of parts
  const textParts = content
    .filter((p): p is OpenAI.ChatCompletionContentPartText => p.type === "text")
    .map(p => p.text);
  return textParts.join("");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function repairJson(jsonText: string): any {
  try {
    return JSON.parse(jsonText);
  } catch {
    let fixed = jsonText;
    const openBraces = (fixed.match(/{/g) || []).length;
    const closeBraces = (fixed.match(/}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/]/g) || []).length;
    if (openBrackets > closeBrackets) fixed += " ]".repeat(openBrackets - closeBrackets);
    if (openBraces > closeBraces) fixed += " }".repeat(openBraces - closeBraces);
    return JSON.parse(fixed);
  }
}

export interface AccommodationReviewResult {
  exists: boolean;
  summary: string;
  pros: string[];
  cons: string[];
  estimatedPricePerNight: number;
  bookingUrl: string;
}

/**
 * Generate a Booking.com search URL for a hotel + city + dates + guests
 */
function buildBookingSearchUrl(
  name: string,
  city: string,
  startDate: string,
  endDate: string,
  adults: number,
  children: number
): string {
  const checkin = startDate.replace(/-/g, "");
  const checkout = endDate.replace(/-/g, "");
  const query = encodeURIComponent(`${name} ${city}`);
  return `https://www.booking.com/searchresults.html?ss=${query}&checkin=${checkin}&checkout=${checkout}&group_adults=${adults}&group_children=${children}&no_rooms=1`;
}

async function callGLMSearch(
  apiKey: string,
  prompt: string,
  label: string
): Promise<string> {
  const client = new OpenAI({
    apiKey,
    baseURL: ZHIPU_BASE_URL,
    dangerouslyAllowBrowser: true,
  });

  console.log(`[AccommodationSearch] ${label} — calling GLM-5.1 with web_search`);

  const response = await client.chat.completions.create({
    model: "glm-5.1",
    max_tokens: 2048,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ type: "web_search", web_search: { enable: true } }] as any,
    messages: [{ role: "user", content: prompt }],
  });

  const finishReason = response.choices[0]?.finish_reason;
  const text = extractText(response.choices[0]?.message?.content || "");

  console.log(`[AccommodationSearch] ${label} — finish_reason: ${finishReason}, text length: ${text.length}`);
  console.log(`[AccommodationSearch] ${label} — response preview: ${text.substring(0, 300)}`);

  if (finishReason === "length") {
    console.warn(`[AccommodationSearch] ${label} — response truncated!`);
  }

  return text;
}

export const summarizeAccommodationReviews = async (
  name: string,
  city: string,
  startDate: string,
  endDate: string,
  people: { adults: number; children: { age: number }[] }
): Promise<AccommodationReviewResult> => {
  const apiKey = await getApiKey();
  const totalPeople = people.adults + people.children.length;

  // Main prompt — explicit search instructions for web_search
  const prompt = `Usa la ricerca web per trovare informazioni reali su questo alloggio.

RICERCA: "${name}" a ${city}
Cerca su Booking.com, TripAdvisor, Google Hotels. Verifica che l'alloggio "${name}" esista REALMENTE a ${city} e non in un'altra città con nome simile.

DATI VIAGGIO:
- Check-in: ${startDate}
- Check-out: ${endDate}  
- Ospiti: ${people.adults} adulti${people.children.length > 0 ? `, ${people.children.length} bambini` : ""}

Se l'alloggio ESISTE a ${city}, restituisci questo JSON:
{
  "exists": true,
  "summary": "Riassunto recensioni da TripAdvisor/Booking (3-4 frasi con dettagli specifici)",
  "pros": ["Vantaggio specifico 1", "Vantaggio specifico 2", "Vantaggio specifico 3"],
  "cons": ["Svantaggio specifico 1", "Svantaggio specifico 2"],
  "estimatedPricePerNight": PREZZO_REALE_PER_NOTTE_PER_TUTTI_I_${totalPeople}_OSPITI,
  "bookingUrl": "URL_BOOKINGdiretto_o_ricerca"
}

Se l'alloggio NON esiste a ${city} (non trovato su nessun sito), restituisci:
{
  "exists": false,
  "summary": "Alloggio non trovato a ${city}",
  "pros": [],
  "cons": [],
  "estimatedPricePerNight": 0,
  "bookingUrl": ""
}

REGOLE:
- estimatedPricePerNight = costo TOTALE per notte per ${totalPeople} persone (tutte le camere necessarie)
- Se non trovi il prezzo esatto, indica una stima realistica basata sulla categoria dell'hotel
- pros e cons DEVONO essere specifici di questo hotel (non generici)
- bookingUrl = URL Booking.com diretto se trovato, altrimenti URL di ricerca
- Restituisci SOLO JSON valido, niente markdown, niente testo prima o dopo`;

  let text = await callGLMSearch(apiKey, prompt, "main");

  // Clean markdown wrappers
  const cleanText = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
  const jsonStartIdx = cleanText.indexOf("{");
  const jsonEndIdx = cleanText.lastIndexOf("}");

  if (jsonStartIdx === -1 || jsonEndIdx === -1) {
    // Retry with simpler prompt
    console.warn("[AccommodationSearch] No JSON in main response — retrying with compact prompt");

    const compactPrompt = `Cerca su web: hotel "${name}" a ${city}. Esiste? Recensioni? Prezzo a notte per ${totalPeople} persone (${startDate} - ${endDate})?

Rispondi SOLO con JSON:
{"exists":boolean,"summary":"testo","pros":["p1","p2"],"cons":["c1"],"estimatedPricePerNight":number,"bookingUrl":"url"}`;

    text = await callGLMSearch(apiKey, compactPrompt, "retry");
    const retryClean = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
    const retryStart = retryClean.indexOf("{");
    const retryEnd = retryClean.lastIndexOf("}");

    if (retryStart === -1 || retryEnd === -1) {
      throw new Error("L'AI non ha restituito recensioni valide.");
    }

    try {
      const result = repairJson(retryClean.substring(retryStart, retryEnd + 1));
      return ensureBookingUrl(result, name, city, startDate, endDate, people.adults, people.children.length);
    } catch {
      throw new Error("L'AI non ha restituito un JSON valido per le recensioni.");
    }
  }

  try {
    const result = repairJson(cleanText.substring(jsonStartIdx, jsonEndIdx + 1));
    return ensureBookingUrl(result, name, city, startDate, endDate, people.adults, people.children.length);
  } catch {
    throw new Error("L'AI non ha restituito un JSON valido per le recensioni.");
  }
};

/**
 * Ensure bookingUrl is a valid Booking.com URL.
 * If the AI returned an invalid/missing URL, generate one deterministically.
 */
function ensureBookingUrl(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any,
  name: string,
  city: string,
  startDate: string,
  endDate: string,
  adults: number,
  children: number
): AccommodationReviewResult {
  const url = result.bookingUrl || "";
  const isValidBookingUrl = url.startsWith("https://www.booking.com") || url.startsWith("https://booking.com");
  const isValidUrl = url.startsWith("http://") || url.startsWith("https://");

  return {
    exists: result.exists ?? true,
    summary: result.summary || "",
    pros: Array.isArray(result.pros) ? result.pros : [],
    cons: Array.isArray(result.cons) ? result.cons : [],
    estimatedPricePerNight: result.estimatedPricePerNight || 0,
    bookingUrl: isValidBookingUrl
      ? url
      : isValidUrl
        ? url // keep TripAdvisor or other valid URLs
        : buildBookingSearchUrl(name, city, startDate, endDate, adults, children),
  };
}