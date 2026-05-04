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
    let fixed = jsonText;
    const openBraces = (fixed.match(/{/g) || []).length;
    const closeBraces = (fixed.match(/}/g) || []).length;
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

export const summarizeAccommodationReviews = async (
  name: string,
  city: string,
  startDate: string,
  endDate: string,
  people: { adults: number; children: { age: number }[] }
): Promise<AccommodationReviewResult> => {
  const apiKey = await getApiKey();
  const client = new OpenAI({
    apiKey,
    baseURL: ZHIPU_BASE_URL,
    dangerouslyAllowBrowser: true,
  });

  const totalPeople = people.adults + people.children.length;

  const prompt = `Sei un assistente di viaggio esperto. Cerca informazioni, recensioni e PREZZI REALI per l'alloggio "${name}" a "${city}" su siti come Booking.com e TripAdvisor.
Verifica se l'alloggio esiste davvero in quella città e se si trova effettivamente a ${city} (non in un'altra località con nome simile).

DETTAGLI VIAGGIO:
- Date: ${startDate} -> ${endDate}
- Persone: ${people.adults} adulti, ${people.children.length} bambini

Restituisci SOLO JSON valido (zero markdown, zero commenti) con questa struttura esatta:
{
  "exists": true,
  "summary": "Riassunto delle recensioni (circa 3-4 frasi)",
  "pros": ["Pro 1", "Pro 2"],
  "cons": ["Contro 1", "Contro 2"],
  "estimatedPricePerNight": 150,
  "bookingUrl": "URL DI RICERCA DIRETTO SU BOOKING.COM PER LE DATE E PERSONE INDICATE"
}

Se l'alloggio NON esiste a "${city}", imposta "exists": false e lascia gli altri campi vuoti o con un messaggio di errore nel "summary".
Il prezzo "estimatedPricePerNight" deve essere il costo REALE PER NOTTE per TUTTE le ${totalPeople} persone (quindi il costo della camera/e necessarie) per il periodo indicato.

IMPORTANTE: Restituisci esclusivamente un oggetto JSON valido. Non includere testo prima o dopo il JSON. Non usare blocchi di codice markdown.`;

  const response = await client.chat.completions.create({
    model: "glm-5.1",
    max_tokens: 1024,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ type: "web_search", web_search: { enable: true } }] as any,
    messages: [{ role: "user", content: prompt }],
  });

  const text = extractText(response.choices[0]?.message?.content || "");
  const cleanText = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");

  const jsonStartIdx = cleanText.indexOf("{");
  const jsonEndIdx = cleanText.lastIndexOf("}");

  if (jsonStartIdx === -1 || jsonEndIdx === -1) {
    console.error("Nessun JSON trovato nelle recensioni:", text);
    throw new Error("L'AI non ha restituito recensioni valide.");
  }

  try {
    return repairJson(cleanText.substring(jsonStartIdx, jsonEndIdx + 1));
  } catch {
    throw new Error("L'AI non ha restituito un JSON valido per le recensioni.");
  }
};