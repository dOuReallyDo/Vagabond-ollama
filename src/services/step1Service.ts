import OpenAI from "openai";
import { ItineraryDraftSchema } from "../shared/step1-contract";
import type { ItineraryDraft } from "../shared/step1-contract";
import type { TravelInputs } from "./travelService";

export type { ItineraryDraft };
export type ProgressCallback = (step: string, progress: number) => void;

const ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Empty string cleaner ─────────────────────────────────────────────────

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

// ─── Profile builder ────────────────────────────────────────────────────────

function buildProfileSection(inputs: TravelInputs): string {
  if (!inputs.travelerProfile) return "";
  const p = inputs.travelerProfile;
  const totalPeople = inputs.people.adults + inputs.people.children.length;

  let section = `
PROFILO VIAGGIATORE:
- Fascia d'età: ${p.ageRange || "Non specificata"}
- Tipo di viaggio: ${p.travelerType || "Non specificato"}
- Interessi: ${p.interests?.length ? p.interests.join(", ") : "Non specificati"}
- Stile di viaggio: ${p.pace || "Equilibrato"}
- Mobilità: ${p.mobility || "Nessuna limitazione"}
- Conoscenza destinazione: ${p.familiarity || "Prima volta"}

REGOLE BASATE SUL PROFILO:
`;

  if (p.pace === "Slow & relax") {
    section += `- Rallenta il ritmo: MAX 2-3 attività al giorno. Includi pranzi lunghi, pause caffè, tempo libero per esplorare senza fretta.
- Suggerisci esperienze rilassanti: terme, passeggiate, mercati locali, aperitivi al tramonto.
- Evita itinerari fitti: meglio approfondire meno cose con più tempo per ognuna.\n`;
  }

  if (p.pace === "Avventura intensa") {
    section += `- Ritmo intenso: 4-5 attività al giorno. Alzata all'alba, giorno pieno, serale con vita notturna.
- Includi esperienze adrenaliniche: escursioni, sport, tour guidati mattina presto.
- Suggerisci sia attrazioni imperdibili che esperienze fuori dai sentieri battuti.\n`;
  }

  if (p.travelerType?.includes("Coppia romantica")) {
    section += `- Questo è un viaggio ROMANTICO. Suggerisci: ristoranti intimi con candele, esperienze per due (cena sul tetto, gita in barca al tramonto), alloggi con vista o jacuzzi.
- Evita: ostelli-party, attrazioni per famiglie rumorose, alberghi troppo economici.
- Nel "localTips" aggiungi consigli specifici per coppie.\n`;
  }

  if (p.travelerType?.includes("bimbi piccoli")) {
    section += `- Questo viaggio include BAMBINI PICCOLI. Regole fondamentali:
  a) Orari flessibili per pisolini (2-3h di pausa dopo pranzo).
  b) Attrazioni kid-friendly: parchi giochi, spiagge con acqua bassa, zoo, musei interattivi.
  c) Ristoranti family-friendly con menù bambini e seggioloni.
  d) Includi sempre un'attività indoor per giorni di pioggia.
- Nel budget, considera che i bambini piccoli spesso non pagano o pagano meno.\n`;
  }

  if (p.travelerType?.includes("ragazzi")) {
    section += `- Questo viaggio include RAGAZZI (6-17 anni). Suggerisci: avventura, sport acquatici, attrazioni interattive, food tour.
- Orari più flessibili ma attivi. Includi attività che tengono occupati i ragazzi.
- Nel budget, i ragazzi spesso hanno tariffe ridotte.\n`;
  }

  if (p.travelerType === "Solo/a") {
    section += `- Il viaggiatore è SOLO. Suggerisci: ostelli sociali (per conoscere gente), free walking tour, attività di gruppo, ristoranti con bancone.
- Includi esperienze per singoli: tour privati, cooking class, spettacoli.\n`;
  }

  if (p.travelerType === "Gruppo di amici") {
    section += `- Questo è un viaggio di GRUPPO. Suggerisci: alloggi spaziosi (ville, appartamenti), attività di gruppo, ristoranti per gruppi.
- Il budget per persona può essere inferiore (gruppi = sconti su alloggi e attività).\n`;
  }

  if (p.travelerType === "Viaggio di lavoro") {
    section += `- Questo è un viaggio di BUSINESS. Suggerisci: hotel centrali con WiFi veloce, coworking spaces, ristoranti per meeting.
- Includi una o due attività leisure compatibili con orari di lavoro.\n`;
  }

  if (p.interests?.length) {
    section += "\nREGOLE PER GLI INTERESSI SELEZIONATI:\n";
    const interestRules: Record<string, string> = {
      Cultura: "Includi almeno 1 museo/sito storico per giorno. Suggerisci musei meno conosciuti ma imperdibili.",
      Mare: "Includi attività costiere ogni giorno possibile. Spiagge attrezzate per famiglie o incontaminate per coppie.",
      "Food & Wine": "Includi almeno 1 esperienza culinaria al giorno (food tour, mercato locale, cooking class, ristorante tipico).",
      Natura: "Includi escursioni, parchi naturali, sentieri. Suggerisci orari migliori per evitare caldo/calore.",
      Sport: "Includi attività sportive (surf, trekking, ciclismo, diving). Verifica stagionalità.",
      Shopping: "Includi mercati locali, outlet, mercatini dell'usato, negozi artigianali.",
      Nightlife: "Includi bar, locali live, discoteche, rooftop bar. Suggerisci serate divertenti e zone della vita notturna.",
      Benessere: "Includi terme, spa, yoga, massaggi. Suggerisci hotel con wellness center.",
      Foto: "Includi viewpoints, golden hour spots, luoghi instagrammabili. Suggerisci orari migliori per foto.",
      Intrattenimento: "Includi spettacoli, concerti, teatro, cinema locale. Suggerisci eventi stagionali.",
      Avventura: "Includi sport estremi, escursioni fuoripista, esperienze uniche (parapendio, diving, safari).",
      Storia: "Includi siti storici, monumenti, musei archeologici, tour guidati storici. Contestualizza con aneddoti.",
    };
    for (const interest of p.interests) {
      if (interestRules[interest]) {
        section += `- ${interest}: ${interestRules[interest]}\n`;
      }
    }
  }

  if (p.mobility?.includes("Ridotta") || p.mobility?.includes("carrozzina")) {
    section += `- MOBILITÀ RIDOTTA/ASSENTE: Suggerisci SOLO attrazioni accessibili (ascensore, rampe, no scale). Evita luoghi con barriere architettoniche.
- Nel "localTips" aggiungi info specifiche su accessibilità.\n`;
  }

  if (p.familiarity?.includes("già stato") || p.familiarity?.includes("Esperto")) {
    section += `- Il viaggiatore CONOSCE GIÀ la destinazione. Evita le attrazioni più ovvie e turistiche.
- Suggerisci esperienze fuori dai sentieri battuti, quartieri locali, ristoranti nascosti.
- Nel "localTips" includi consigli per chi vuole vedere cose nuove.\n`;
  }

  return section;
}

// ─── Transport compatibility ────────────────────────────────────────────────

function buildTransportSection(inputs: TravelInputs): string {
  const departure = `${inputs.departureCity}${inputs.departureCountry ? ` (${inputs.departureCountry})` : ""}`;
  const destination = `${inputs.destination}${inputs.country ? ` (${inputs.country})` : ""}`;
  const preference = inputs.flightPreference || "Volo diretto";

  return `
REGOLE PER IL MEZZO DI TRASPORTO:
Il viaggiatore ha richiesto: "${preference}"

PRIMA DI TUTTO verifica se il mezzo scelto è compatibile con la tratta ${departure} → ${destination}:
- AUTO PRIVATA: inadatta se la distanza supera ~1.500 km o se richiede attraversamento di oceani/mari non collegati da traghetto. Adatta per destinizioni europee raggiungibili in meno di 15 ore di guida.
- TRENO: inadatto per destinazioni intercontinentali o isole non raggiungibili via ferrovia. Adatto per destinazioni europee con buoni collegamenti ferroviari.
- VOLO DIRETTO: inadatto se non esiste un volo diretto sulla tratta. In tal caso proponi il minimo di scali.
- VOLO ECONOMICO: sempre compatibile, ma segnala se i tempi di percorrenza con scali sono eccessivi.

SE IL MEZZO SCELTO NON È COMPATIBILE:
1. Segnalalo CHIARAMENTE nel campo "budgetWarning" con una spiegazione semplice (es. "Auto privata non disponibile per destinazioni intercontinentali")
2. Suggerisci automaticamente il mezzo più appropriato per quella tratta.
3. NON includere dettagli sui prezzi dei voli o prenotazioni — quelli saranno gestiti nel passo successivo.
`;
}

// ─── Compact prompt (fallback for truncated responses) ───────────────────

function buildCompactPrompt(
  inputs: TravelInputs,
  dateList: string,
  profileSection: string,
  transportSection: string
): string {
  const totalPeople = inputs.people.adults + inputs.people.children.length;
  const nights = Math.round(
    (new Date(inputs.endDate).getTime() - new Date(inputs.startDate).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  const totalDays = nights + 1;

  return `
Sei un esperto agente di viaggi. Genera un itinerario per questo viaggio. RISPOSTA COMPATTA — usa descrizioni brevi e concise per ogni attività.
${profileSection}
${transportSection}
DETTAGLI VIAGGIO:
- Partenza: ${inputs.departureCity}${inputs.departureCountry ? ` (${inputs.departureCountry})` : ""}
- Destinazione: ${inputs.destination}${inputs.country ? ` (${inputs.country})` : ""}
- Date: ${inputs.startDate} → ${inputs.endDate} (${totalDays} giorni, ${nights} notti)
- Persone: ${totalPeople} (${inputs.people.adults} adulti${inputs.people.children.length ? `, ${inputs.people.children.length} bambini` : ""})
- Budget TOTALE: €${inputs.budget}
- Note: ${inputs.notes || "nessuna"}

REGOLE COMPATTE PER EVITARE TRONCAMENTO:
- MAX 2 attività per giorno, descrizione MAX 8 parole per attività
- destinationOverview: MAX 2 frasi
- attractions: MAX 2 elementi, descrizione MAX 6 parole
- weatherInfo, safetyAndHealth: 1 frase per campo
- travelHighlights: whyChosen e whyUnforgettable: MAX 1 frase
- localTips: MAX 2 elementi
- transportInfo: 1 frase per campo, MAX 2 bestApp
- mapPoints: MAX 3 punti (1 per tappa principale)
- sources: MAX 3 fonti
- NESSUN campo tips, travelTime, transport nelle attività
- JSON PURO: zero markdown, zero testo dopo }

TAPPE: MAX N/2 tappe per viaggio di N giorni. Città principali: 2-3 notti. Non cambiare città ogni giorno.

ITINERARIO GIORNALIERO:
${dateList}

Struttura JSON (riempi TUTTI i campi):
{
  "budgetWarning": null,
  "destinationOverview": {
    "title": "Nome",
    "description": "2 frasi",
    "tagline": "Slogan",
    "heroImageUrl": null,
    "attractions": [
      { "name": "A", "description": "6 parole", "category": "C", "estimatedVisitTime": "1h", "lat": 0, "lng": 0 }
    ]
  },
  "weatherInfo": { "summary": "1 frase", "pros": "1 frase", "cons": "1 frase", "averageTemp": "25C", "packingTips": "1 frase" },
  "safetyAndHealth": { "safetyWarnings": "1 frase", "vaccinationsRequired": "Nessuna", "safetyLevel": "Alto", "emergencyNumbers": "112" },
  "itinerary": [
    {
      "day": 1,
      "title": "Titolo",
      "theme": "Tema",
      "activities": [
        { "time": "09:00", "location": "Luogo", "name": "Nome", "description": "8 parole", "costEstimate": 20, "duration": "2h" }
      ]
    }
  ],
  "localTips": ["Tip1", "Tip2"],
  "transportInfo": { "localTransport": "1 frase", "bestApps": ["App1"], "estimatedLocalCost": "€X al giorno" (costo giornaliero per persona) },
  "travelHighlights": { "whyChosen": "1 frase", "mainStops": [{ "name": "Tappa", "reason": "Motivo" }], "whyUnforgettable": "1 frase" },
  "mapPoints": [{ "lat": 0, "lng": 0, "label": "Tappa", "type": "attraction" }],
  "sources": [{ "title": "Fonte", "url": "https://...", "type": "blog" }]
}

SOLO il JSON. Niente markdown. Niente testo dopo }.`;
}

// ─── generateItinerary ──────────────────────────────────────────────────────

export const generateItinerary = async (
  inputs: TravelInputs,
  onProgress?: ProgressCallback
): Promise<ItineraryDraft> => {
  onProgress?.("Inizializzazione richiesta...", 5);

  try {
    onProgress?.("Verifica configurazione...", 10);
    const apiKey = await getApiKey();

    onProgress?.("Analizzo la destinazione e il periodo...", 20);

    const totalPeople = inputs.people.adults + inputs.people.children.length;
    const nights = Math.round(
      (new Date(inputs.endDate).getTime() - new Date(inputs.startDate).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    const totalDays = nights + 1;

    const start = new Date(inputs.startDate);
    const dateList = Array.from({ length: totalDays })
      .map((_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return `- Giorno ${i + 1}: ${d.toLocaleDateString("it-IT", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}`;
      })
      .join("\n");

    onProgress?.("Preparazione prompt...", 30);

    const profileSection = buildProfileSection(inputs);
    const transportSection = buildTransportSection(inputs);

    const prompt = `
Sei un esperto agente di viaggi con profonda conoscenza locale. Il tuo obiettivo è creare un ITINERARIO DETTAGLIATO per il viaggio. NON includere voli, alloggi, ristoranti o budget — saranno gestiti in passi successivi.
${profileSection}
${transportSection}
DETTAGLI VIAGGIO:
- Partenza: ${inputs.departureCity}${inputs.departureCountry ? ` (${inputs.departureCountry})` : ""}
- Destinazione: ${inputs.destination}${inputs.country ? ` (${inputs.country})` : ""}
- Date: ${inputs.startDate} → ${inputs.endDate} (${totalDays} giorni, ${nights} notti)
- Persone: ${totalPeople} (${inputs.people.adults} adulti${inputs.people.children.length ? `, ${inputs.people.children.length} bambini` : ""})
- Budget TOTALE: €${inputs.budget}
- Note: ${inputs.notes || "nessuna"}

🔗 SICUREZZA DEI LINK (OBBLIGATORIO):
Per TUTTI i campi URL nel JSON (sourceUrl, imageUrl, heroImageUrl), segui queste regole:
- USA SOLO link a siti noti e affidabili (booking.com, tripadvisor.it/.com, lonelyplanet.com, google.com/maps, ecc.)
- NON usare MAI: URL shortener, link a siti sconosciuti con TLD sospetti, link HTTP (solo HTTPS), link con parametri di redirect.
- Se non riesci a trovare un link sicuro per una risorsa, lascia il campo URL vuoto (undefined/null) piuttosto che inserire un link dubbio.

REGOLE DI FORMATO (CRITICHE PER EVITARE TRONCAMENTI):
- destinationOverview, travelHighlights: 2-3 frasi persuasive.
- Attività per giorno: MAX 3 attività (mattina, pomeriggio, sera). Descrizioni: 1 frase.
- Attrazioni: MAX 3 elementi, descrizione: MAX 10 parole.
- localTips: MAX 3 elementi.
- sources: MAX 5 fonti.
- JSON: SOLO il JSON, zero markdown, zero commenti, niente testo dopo la chiusura }.

REGOLE PER LA DISTRIBUZIONE DELLE TAPPE (OBBLIGATORIE):
- NON cambiare città ogni giorno. Raggruppa i pernottamenti per ridurre gli spostamenti.
- Città principali (capirettali, mete turistiche importanti): MINIMO 2-3 notti.
- Città secondarie/piccole: anche 1 notte se vale la pena, ma senza esagerare.
- REGOLA GENERALE: per un viaggio di N giorni, il numero di tappe (città dove si pernotta) NON deve superare N/2. Esempio: 10 giorni = MAX 5 tappe, 6 giorni = MAX 3 tappe.
- Se la destinazione è un'unica nazione/isola, concentrati su 2-3 basi e fai escursioni giornaliere da lì.
- OGNI "location" nel campo attività di un giorno deve corrispondere alla città dove si pernotta quella notte. Se l'attività è un'escursione in una città vicina, indicare la location dell'escursione ma il pernottamento rimane nella base.
- Il campo "title" di ogni giorno deve riflettere la tappa/città dove si pernotta.

FONTI: Alla fine del JSON, includi un array "sources" con i blog, guide turistiche e siti ufficiali che hai consultato via web_search. Inserisci SOLO fonti reali e verificabili, con URL corretti.

ITINERARIO GIORNALIERO:
${dateList}

Struttura JSON richiesta (DEVI riempire TUTTI i campi con dati reali):
{
  "budgetWarning": "Avviso solo se il mezzo di trasporto scelto non è compatibile con la tratta, altrimenti null",
  "destinationOverview": {
    "title": "Nome Destinazione",
    "description": "2-3 frasi descrittive e coinvolgenti",
    "tagline": "Slogan",
    "heroImageUrl": "URL immagine",
    "attractions": [
      { "name": "A", "description": "2-3 frasi descrittive", "category": "C", "estimatedVisitTime": "1h", "lat": 0, "lng": 0 }
    ]
  },
  "weatherInfo": {
    "summary": "S", "pros": "P", "cons": "C", "averageTemp": "20C", "packingTips": "T"
  },
  "safetyAndHealth": {
    "safetyWarnings": "W", "vaccinationsRequired": "V", "safetyLevel": "L", "emergencyNumbers": "N"
  },
  "itinerary": [
    {
      "day": 1,
      "title": "Data - Titolo",
      "theme": "Tema",
      "activities": [
        { "time": "08:00", "location": "L", "name": "N", "description": "1-2 frasi concise", "costEstimate": 0, "duration": "1h", "transport": "T", "travelTime": "10m", "tips": "T" }
      ]
    }
  ],
  "localTips": ["T1", "T2"],
  "transportInfo": {
    "localTransport": "T",
    "bestApps": ["A"],
    "estimatedLocalCost": "€X al giorno" (DEVE essere costo giornaliero per persona, es. "€20 al giorno", NON il totale del viaggio),
    "privateTransferLinks": [
      { "provider": "P", "url": "U", "description": "D" }
    ]
  },
  "travelHighlights": {
    "whyChosen": "2-3 frasi persuasive: perché questo itinerario è ideale per questo viaggiatore",
    "mainStops": [
      { "name": "Tappa 1", "reason": "Motivo" }
    ],
    "whyUnforgettable": "2-3 frasi persuasive: cosa renderà questo viaggio indimenticabile"
  },
  "mapPoints": [
    { "lat": 0, "lng": 0, "label": "L", "type": "T" }
  ],
  "sources": [
    { "title": "Nome blog o guida", "url": "https://...", "type": "blog" },
    { "title": "Sito ufficiale", "url": "https://...", "type": "official" }
  ]
}

- "estimatedLocalCost" DEVE essere il costo medio giornaliero PER PERSONA dei trasporti locali (es. "€25 al giorno"). NON il costo totale del viaggio. Se non puoi stimare con precisione, usa "€15-25 al giorno" come range ragionevole.

IMPORTANTE: Restituisci esclusivamente un oggetto JSON valido. Non includere testo prima o dopo il JSON. Non usare blocchi di codice markdown (\\\`\\\`\\\`json). NON spiegare il tuo ragionamento, non fare preamboli, non fare commenti finali. Restituisci SOLO il JSON.`;

    onProgress?.("Generazione itinerario...", 45);

    // ─── Call AI with auto-retry on truncation ─────────────
    const callAI = async (currentPrompt: string, attempt: number): Promise<ItineraryDraft> => {
      onProgress?.(attempt === 1 ? "Generazione itinerario..." : "Ritento con formato ridotto...", attempt === 1 ? 45 : 55);

      const client = new OpenAI({
        apiKey,
        baseURL: ZHIPU_BASE_URL,
        dangerouslyAllowBrowser: true,
      });

      const response = await client.chat.completions.create({
        model: "glm-5.1",
        max_tokens: 16000,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ type: "web_search", web_search: { enable: true } }] as any,
        messages: [
          {
            role: "user",
            content: currentPrompt,
          },
        ],
      });

      onProgress?.("Elaborazione dati ricevuti...", 85);
      const choice = response.choices[0];
      const finishReason = choice?.finish_reason;
      const text = extractText(choice?.message?.content || "");

      console.log(`[Step1] Attempt ${attempt}, finish_reason: ${finishReason}, response length: ${text.length}`);

      // Check for truncation
      const isTruncated = finishReason === "length";

      const jsonStartIdx = text.indexOf("{");
      const jsonEndIdx = text.lastIndexOf("}");

      if (jsonStartIdx === -1 || jsonEndIdx === -1) {
        console.error("Nessun JSON trovato nel testo ricevuto:", text);
        if (isTruncated && attempt === 1) {
          console.log("[Step1] Response truncated with no JSON, retrying with compact prompt...");
          return callAI(buildCompactPrompt(inputs, dateList, profileSection, transportSection), 2);
        }
        throw new Error(
          "L'AI non ha restituito un itinerario valido. Riprova."
        );
      }

      const jsonText = text.substring(jsonStartIdx, jsonEndIdx + 1);

      let json: unknown;
      try {
        json = repairJson(jsonText);
      } catch (repairError) {
        console.error("JSON repair failed:", repairError);
        if (attempt === 1) {
          console.log("[Step1] JSON repair failed, retrying with compact prompt...");
          return callAI(buildCompactPrompt(inputs, dateList, profileSection, transportSection), 2);
        }
        throw new Error(
          "L'AI ha interrotto la generazione dell'itinerario perché troppo lungo. Prova a ridurre la durata del viaggio o a essere più specifico nelle note."
        );
      }

      // Data cleaning (Pre-validation)
      let j = cleanEmptyStrings(json) as Record<string, unknown>;

      // Clean privateTransferLinks: filter out malformed entries
      if (
        j.transportInfo &&
        typeof j.transportInfo === "object" &&
        !Array.isArray(j.transportInfo)
      ) {
        const ti = j.transportInfo as Record<string, unknown>;
        if (Array.isArray(ti.privateTransferLinks)) {
          ti.privateTransferLinks = (ti.privateTransferLinks as unknown[]).filter(
            (link) =>
              link &&
              typeof link === "object" &&
              !Array.isArray(link) &&
              (link as Record<string, unknown>).provider &&
              (link as Record<string, unknown>).url
          );
        }
      }

      // If itinerary is not an array, the JSON was likely truncated mid-array
      if (!Array.isArray(j.itinerary)) {
        console.warn("[Step1] itinerary is not an array, likely truncated. Type:", typeof j.itinerary);
        if (attempt === 1) {
          console.log("[Step1] Retrying with compact prompt...");
          return callAI(buildCompactPrompt(inputs, dateList, profileSection, transportSection), 2);
        }
        // On 2nd attempt, try to salvage what we have
        if (j.itinerary == null) {
          (j as Record<string, unknown>).itinerary = [];
        }
      }

      const validationResult = ItineraryDraftSchema.safeParse(j);
      if (!validationResult.success) {
        console.error(
          "Step 1 Validation Errors:",
          JSON.stringify(validationResult.error.issues, null, 2)
        );
        console.error("Step 1 Raw AI response (first 2000 chars):", text.substring(0, 2000));

        if (attempt === 1) {
          console.log("[Step1] Validation failed, retrying with compact prompt...");
          return callAI(buildCompactPrompt(inputs, dateList, profileSection, transportSection), 2);
        }

        throw new Error(
          "L'itinerario generato non rispetta il formato richiesto. Riprova."
        );
      }

      return validationResult.data;
    };

    return await callAI(prompt, 1);
  } catch (error) {
    console.error("Step 1 API call failed:", error);
    throw error;
  }
};

// ─── modifyItinerary ─────────────────────────────────────────────────────────

export const modifyItinerary = async (
  existingDraft: ItineraryDraft,
  modificationRequest: string,
  inputs: TravelInputs,
  onProgress?: ProgressCallback
): Promise<ItineraryDraft> => {
  onProgress?.("Inizializzazione modifica...", 5);

  try {
    onProgress?.("Verifica configurazione...", 10);
    const apiKey = await getApiKey();

    onProgress?.("Preparazione modifica itinerario...", 20);

    const profileSection = buildProfileSection(inputs);
    const transportSection = buildTransportSection(inputs);

    const totalPeople = inputs.people.adults + inputs.people.children.length;
    const nights = Math.round(
      (new Date(inputs.endDate).getTime() - new Date(inputs.startDate).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    const totalDays = nights + 1;

    const prompt = `
Sei un esperto agente di viaggi. Hai precedentemente generato questo itinerario di viaggio:
${JSON.stringify(existingDraft)}

L'utente ha richiesto le seguenti modifiche o aggiunte:
"${modificationRequest}"
${profileSection}
${transportSection}
DETTAGLI VIAGGIO (per riferimento):
- Partenza: ${inputs.departureCity}${inputs.departureCountry ? ` (${inputs.departureCountry})` : ""}
- Destinazione: ${inputs.destination}${inputs.country ? ` (${inputs.country})` : ""}
- Date: ${inputs.startDate} → ${inputs.endDate} (${totalDays} giorni, ${nights} notti)
- Persone: ${totalPeople}
- Budget TOTALE: €${inputs.budget}

Aggiorna l'itinerario tenendo conto delle richieste di modifica dell'utente.

REGOLE DI FORMATO (CRITICHE PER EVITARE TRONCAMENTI):
- destinationOverview, travelHighlights: 2-3 frasi persuasive.
- Attività per giorno: MAX 3 attività (mattina, pomeriggio, sera). Descrizioni: 1 frase.
- Attrazioni: MAX 3 elementi, descrizione: MAX 10 parole.
- localTips: MAX 3 elementi.
- sources: MAX 5 fonti.
- JSON: SOLO il JSON, zero markdown, zero commenti, niente testo dopo la chiusura }.
- NON includere voli, alloggi, ristoranti o budget breakdown — solo itinerario e info destinazione.

FONTI: Alla fine del JSON, includi un array "sources" con i blog, guide turistiche e siti ufficiali che hai consultato via web_search. Inserisci SOLO fonti reali e verificabili, con URL corretti. Minimo 3, massimo 8 fonti.

Struttura JSON richiesta (stessa struttura dell'itinerario originale, aggiornata con le modifiche):
{
  "budgetWarning": "Avviso trasporto se necessario, altrimenti null",
  "destinationOverview": { ... },
  "weatherInfo": { ... },
  "safetyAndHealth": { ... },
  "itinerary": [ ... ],
  "localTips": [...],
  "transportInfo": { ... },
  "travelHighlights": { ... },
  "mapPoints": [ ... ],
  "sources": [
    { "title": "Nome blog o guida", "url": "https://...", "type": "blog" },
    { "title": "Sito ufficiale", "url": "https://...", "type": "official" }
  ]
}

IMPORTANTE: Restituisci esclusivamente un oggetto JSON valido con TUTTI i campi. Non includere testo prima o dopo il JSON. Non usare blocchi di codice markdown (\\\`\\\`\\\`json). NON spiegare il tuo ragionamento. Restituisci SOLO il JSON completo aggiornato.`;

    onProgress?.("Aggiorno l'itinerario...", 40);

    const client = new OpenAI({
      apiKey,
      baseURL: ZHIPU_BASE_URL,
      dangerouslyAllowBrowser: true,
    });

    const response = await client.chat.completions.create({
      model: "glm-5.1",
      max_tokens: 16000,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ type: "web_search", web_search: { enable: true } }] as any,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    onProgress?.("Elaborazione modifica...", 85);
    const text = extractText(response.choices[0]?.message?.content || "");

    const jsonStartIdx = text.indexOf("{");
    const jsonEndIdx = text.lastIndexOf("}");

    if (jsonStartIdx === -1 || jsonEndIdx === -1) {
      console.error("Nessun JSON trovato nel testo di modifica:", text);
      throw new Error(
        "L'AI non ha restituito un itinerario modificato valido. Riprova."
      );
    }

    const jsonText = text.substring(jsonStartIdx, jsonEndIdx + 1);

    let json: unknown;
    try {
      json = repairJson(jsonText);
    } catch {
      throw new Error(
        "L'AI ha interrotto la modifica dell'itinerario. Il piano potrebbe essere troppo lungo. Prova con una richiesta più specifica."
      );
    }

    // Data cleaning (Pre-validation)
    let j = cleanEmptyStrings(json) as Record<string, unknown>;

    if (
      j.transportInfo &&
      typeof j.transportInfo === "object" &&
      !Array.isArray(j.transportInfo)
    ) {
      const ti = j.transportInfo as Record<string, unknown>;
      if (Array.isArray(ti.privateTransferLinks)) {
        ti.privateTransferLinks = (ti.privateTransferLinks as unknown[]).filter(
          (link) =>
            link &&
            typeof link === "object" &&
            !Array.isArray(link) &&
            (link as Record<string, unknown>).provider &&
            (link as Record<string, unknown>).url
        );
      }
    }

    const validationResult = ItineraryDraftSchema.safeParse(j);
    if (!validationResult.success) {
      console.error(
        "Step 1 Modify Validation Errors:",
        JSON.stringify(validationResult.error.issues, null, 2)
      );
      throw new Error(
        "L'itinerario modificato non rispetta il formato richiesto. Riprova."
      );
    }

    return validationResult.data;
  } catch (error) {
    console.error("Step 1 modify API call failed:", error);
    throw error;
  }
};