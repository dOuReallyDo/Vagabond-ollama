/**
 * Nominatim (OpenStreetMap) geocoding service.
 * Resolves city/attraction names to accurate lat/lng coordinates.
 * Free tier: 1 request/sec, no API key needed.
 * Usage policy: https://operations.osmfoundation.org/policies/nominatim/
 */

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  importance: number;
}

interface GeocodedPoint {
  lat: number;
  lng: number;
  label: string;
  source: 'nominatim' | 'ai';
}

// Cache: avoid re-geocoding the same city multiple times per session
const geocodeCache = new Map<string, { lat: number; lng: number }>();

// Rate limiter: Nominatim requires max 1 req/sec
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1100; // 1.1s to be safe

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
  return fetch(url, {
    headers: {
      'User-Agent': 'Vagabond-TravelApp/1.0 (https://github.com/dOuReallyDo/Vagabond-ollama)',
    },
  });
}

/**
 * Italian descriptive prefixes that should be stripped before geocoding.
 * These cause Nominatim to return wrong locations.
 * E.g. "Centro di Lisbona" → "Lisbona", "Arrivo a Marsiglia" → "Marsiglia"
 */
const ITALIAN_PREFIXES = [
  /^centro\s+(di|del|della|dei|degli|delle|dell')\s*/i,
  /^zona\s+(di|del|della|dei|degli|delle|dell')\s*/i,
  /^area\s+(di|del|della|dei|degli|delle|dell')\s*/i,
  /^regione\s+(di|del|della|dei|degli|delle|dell')\s*/i,
  /^penisola\s+(di|del|della|dell')\s*/i,
  /^isola\s+(di|del|della|dell')\s*/i,
  /^costa\s+(di|del|della|dell'|dei)\s*/i,
  /^valle\s+(di|del|della|dell'|dei)\s*/i,
  /^parco\s+(nazionale\s+di|regionale\s+di|di|del|della|dell'|nazionale\s+del)\s*/i,
  /^parco\s+/i,
  /^arrivo\s+a\s*/i,
  /^partenza\s+da\s*/i,
  /^visita\s+a\s*/i,
  /^escursione\s+a\s*/i,
  /^giro\s+(di|del|della|dei|degli|delle)\s+/i,
  /^passeggiata\s+(a|in|per)\s*/i,
  /^tour\s+(di|del|della|dei|degli|delle)\s+/i,
  /^giornata\s+(a|in)\s*/i,
  /^serata\s+(a|in)\s*/i,
  /^mattina\s+(a|in)\s*/i,
  /^pomeriggio\s+(a|in)\s*/i,
  /^esplorazione\s+(di|del|della)\s*/i,
  /^scoperta\s+(di|del|della)\s*/i,
  /^pernottamento\s+(a|in)\s*/i,
  /^soggiorno\s+(a|in)\s*/i,
  /^fermata\s+(a|in)\s*/i,
  /^tappa\s+(a|in)\s*/i,
  /^cena\s+(a|in)\s*/i,
  /^pranzo\s+(a|in)\s*/i,
  /^colazione\s+(a|in)\s*/i,
  /^relax\s+(a|in)\s*/i,
  /^riposo\s+(a|in)\s*/i,
  /^volo\s+(da|a|per)\s*/i,
  /^trasferimento\s+(a|da|per)\s*/i,
  /^spostamento\s+(a|da|per)\s*/i,
];

/**
 * Strip Italian descriptive prefixes from a location name for geocoding.
 * "Centro di Lisbona" → "Lisbona"
 * "Arrivo a Marsiglia" → "Marsiglia"
 * "Escursione a Sintra" → "Sintra"
 */
function stripItalianPrefix(name: string): string {
  let cleaned = name.trim();
  for (const prefix of ITALIAN_PREFIXES) {
    cleaned = cleaned.replace(prefix, '');
  }
  return cleaned.trim();
}

/**
 * Geocode a single place name to lat/lng.
 * Returns null if geocoding fails (caller should keep AI-provided coords as fallback).
 * 
 * Strategy:
 * 1. Try with countryCode (restrict search to destination country)
 * 2. If no result, try without countryCode (global search — Nominatim is smart for known city names)
 * 3. Strip Italian prefixes and retry if original query failed
 */
async function geocodePlace(name: string, countryCode?: string): Promise<{ lat: number; lng: number } | null> {
  // Strip Italian descriptive prefixes before geocoding
  const cleanName = stripItalianPrefix(name);
  
  // Don't geocode very short strings (likely not real place names)
  if (cleanName.length < 2) return null;
  
  // Try geocoding in order of preference
  const queries: Array<{ query: string; cc: string | undefined }> = [];
  
  if (countryCode) {
    // With country code first (most precise)
    queries.push({ query: cleanName, cc: countryCode });
  }
  // Then without country code (Nominatim is smart about well-known city names)
  queries.push({ query: cleanName, cc: undefined });
  
  for (const { query, cc } of queries) {
    const cacheKey = `${query.toLowerCase()}|${cc || ''}`;
    if (geocodeCache.has(cacheKey)) {
      return geocodeCache.get(cacheKey)!;
    }
  }
  
  for (const { query, cc } of queries) {
    try {
      let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      if (cc) {
        url += `&countrycodes=${cc.toLowerCase()}`;
      }

      const res = await rateLimitedFetch(url);
      if (!res.ok) {
        console.warn(`[Nominatim] HTTP ${res.status} for "${query}" (cc=${cc})`);
        continue; // Try next query
      }

      const data: NominatimResult[] = await res.json();
      if (data.length === 0) {
        continue; // Try next query
      }

      const result = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };

      // Validate: lat must be -90..90, lng must be -180..180
      if (isNaN(result.lat) || isNaN(result.lng) || Math.abs(result.lat) > 90 || Math.abs(result.lng) > 180) {
        console.warn(`[Nominatim] Invalid coords for "${query}": ${result.lat}, ${result.lng}`);
        continue;
      }

      // Cache all variants
      const cacheKey = `${query.toLowerCase()}|${cc || ''}`;
      geocodeCache.set(cacheKey, result);
      // Also cache the original (uncleaned) name so we hit cache next time
      if (name.toLowerCase() !== query.toLowerCase()) {
        geocodeCache.set(`${name.toLowerCase()}|${cc || ''}`, result);
      }
      return result;
    } catch (err) {
      console.warn(`[Nominatim] Error geocoding "${query}" (cc=${cc}):`, err);
      continue;
    }
  }

  console.warn(`[Nominatim] No results for "${name}" (tried: "${cleanName}")`);
  return null;
}

/**
 * Detect country code from a location string like "Lisbona, Portogallo" or "Lisbon (Portugal)".
 * Returns ISO 3166-1 alpha-2 code if recognizable, undefined otherwise.
 */
function detectCountryCode(location: string): string | undefined {
  const countryMap: Record<string, string> = {
    'italia': 'it', 'italy': 'it',
    'portogallo': 'pt', 'portugal': 'pt',
    'spagna': 'es', 'spain': 'es',
    'francia': 'fr', 'france': 'fr',
    'germania': 'de', 'germany': 'de',
    'austria': 'at',
    'svizzera': 'ch', 'switzerland': 'ch',
    'regno unito': 'gb', 'united kingdom': 'gb', 'uk': 'gb',
    'irlanda': 'ie', 'ireland': 'ie',
    'grecia': 'gr', 'greece': 'gr',
    'croazia': 'hr', 'croatia': 'hr',
    'norvegia': 'no', 'norway': 'no',
    'svezia': 'se', 'sweden': 'se',
    'danimarca': 'dk', 'denmark': 'dk',
    'finlandia': 'fi', 'finland': 'fi',
    'paesi bassi': 'nl', 'netherlands': 'nl', 'oland': 'nl',
    'belgio': 'be', 'belgium': 'be',
    'polonia': 'pl', 'poland': 'pl',
    'cze': 'cz', 'czech': 'cz', 'ceca': 'cz', 'repubblica ceca': 'cz',
    'ungheria': 'hu', 'hungary': 'hu',
    'romania': 'ro', 'rumania': 'ro',
    'bulgaria': 'bg',
    'serbia': 'rs',
    'slovenia': 'si',
    'slovacchia': 'sk', 'slovakia': 'sk',
    'islanda': 'is', 'iceland': 'is',
    'marocco': 'ma', 'morocco': 'ma',
    'turchia': 'tr', 'turkey': 'tr',
    'egitto': 'eg', 'egypt': 'eg',
    'brasile': 'br', 'brazil': 'br',
    'argentina': 'ar',
    'stati uniti': 'us', 'usa': 'us', 'united states': 'us',
    'canada': 'ca',
    'australia': 'au',
    'giappone': 'jp', 'japan': 'jp',
    'cina': 'cn', 'china': 'cn',
    'thailandia': 'th', 'thailand': 'th',
    'vietnam': 'vn',
    'india': 'in',
    'mexico': 'mx', 'messico': 'mx',
    'colombia': 'co',
    'perù': 'pe', 'peru': 'pe',
    'cile': 'cl', 'chile': 'cl',
  };

  const lower = location.toLowerCase();
  for (const [name, code] of Object.entries(countryMap)) {
    if (lower.includes(name)) return code;
  }
  return undefined;
}

/**
 * Italian city name → local name mapping for common destinations.
 * Nominatim resolves Italian names (Lisbona) well, but some local names
 * give better results. This handles the most common cases.
 */
const CITY_NAME_MAP: Record<string, string> = {
  // Portugal
  'lisbona': 'Lisbon',
  'porto': 'Porto',  // Porto works in both Italian and local
  'faro': 'Faro',
  'coimbra': 'Coimbra',
  'braga': 'Braga',
  // UK/Ireland
  'londra': 'London',
  'edimburgo': 'Edinburgh',
  'dublino': 'Dublin',
  'cork': 'Cork',
  // Germany/Austria/Switzerland
  'monaco di baviera': 'Munich',
  'monaco': 'Munich',  // In Italian travel context, "Monaco" usually means Munich
  'colonia': 'Cologne',
  'francoforte': 'Frankfurt',
  'amburgo': 'Hamburg',
  'stoccarda': 'Stuttgart',
  'dresda': 'Dresden',
  'norimberga': 'Nuremberg',
  'vienna': 'Vienna',
  'zurigo': 'Zurich',
  'ginevra': 'Geneva',
  'basilea': 'Basel',
  'bern': 'Bern',
  // France
  'parigi': 'Paris',
  'lyon': 'Lyon',
  'lione': 'Lyon',
  'marsiglia': 'Marseille',
  'nizza': 'Nice',
  'tolosa': 'Toulouse',
  'bordeaux': 'Bordeaux',
  'strasburgo': 'Strasbourg',
  'nantes': 'Nantes',
  'montpellier': 'Montpellier',
  // Spain
  'barcellona': 'Barcelona',
  'madrid': 'Madrid',
  'siviglia': 'Seville',
  'valencia': 'Valencia',
  'granada': 'Granada',
  'malaga': 'Málaga',
  'bilbao': 'Bilbao',
  // Greece
  'atene': 'Athens',
  'salonicco': 'Thessaloniki',
  'creta': 'Crete',
  'santorini': 'Santorini',
  'rodi': 'Rhodes',
  // Croatia
  'zagabria': 'Zagreb',
  'dubrovnik': 'Dubrovnik',
  'spalato': 'Split',
  // Eastern Europe
  'praga': 'Prague',
  'budapest': 'Budapest',
  'varsavia': 'Warsaw',
  'cracovia': 'Krakow',
  // Nordic
  'stoccolma': 'Stockholm',
  'oslo': 'Oslo',
  'copenaghen': 'Copenhagen',
  'helsinki': 'Helsinki',
  'reykjavik': 'Reykjavik',
  // Netherlands/Belgium
  'amsterdam': 'Amsterdam',
  'rotterdam': 'Rotterdam',
  'bruxelles': 'Brussels',
  'anversa': 'Antwerp',
  'gand': 'Ghent',
  // UK cities
  'manchester': 'Manchester',
  'birmingham': 'Birmingham',
  'liverpool': 'Liverpool',
  'bath': 'Bath, UK',
  // Other
  'istanbul': 'Istanbul',
  'marrakech': 'Marrakech',
  'il cairo': 'Cairo',
  'cairo': 'Cairo',
  'capo verde': 'Cape Verde',
  'madera': 'Madeira',
  'azzorre': 'Azores',
};

/**
 * Resolve a city name to its most geocodable form.
 * Italian city names are mapped to local/international names that Nominatim handles best.
 */
function resolveCityName(name: string): string {
  const lower = name.toLowerCase().trim();
  // Check exact match first
  if (CITY_NAME_MAP[lower]) return CITY_NAME_MAP[lower];
  // Check if name starts with a mapped prefix
  for (const [itName, localName] of Object.entries(CITY_NAME_MAP)) {
    if (lower === itName || lower.startsWith(itName + ' ')) {
      return localName;
    }
  }
  return name;
}

/**
 * Extract a clean city/place name from a location string.
 * Handles patterns like:
 * - "Lisbona, Portogallo" → "Lisbona"
 * - "Lisbona (Portogallo)" → "Lisbona"
 * - "Centro di Lisbona" → "Lisbona"
 * - "Escursione a Sintra" → "Sintra"
 * - "Porto - Ribeira" → "Porto"
 */
function extractPlaceName(location: string): string {
  let name = location.trim();
  
  // Strip Italian descriptive prefixes (e.g., "Centro di Lisbona" → "Lisbona")
  name = stripItalianPrefix(name);
  
  // Take first part before comma/paren/dash/en-dash/em-dash
  name = name.split(/[,(–—]/)[0].trim();
  
  // Resolve Italian city names to local names for better geocoding
  name = resolveCityName(name);
  
  return name;
}

/**
 * Geocode all mapPoints from AI-generated itinerary data.
 * Replaces AI-provided lat/lng with Nominatim-resolved coordinates.
 * Falls back to AI coords if Nominatim fails for a point.
 * Also geocodes attraction points and activity locations.
 * 
 * Proximity check: sub-locations (e.g. "Marina Grande" near Capri) must be
 * within MAX_DEVIATION_KM of the main destination, otherwise they're likely
 * a same-name place in a different region (e.g. "Marina Grande" in Sicily).
 * 
 * @param data - The Step 1 ItineraryDraft data (mutated in place)
 * @param destination - The trip destination (for country context)
 * @param departureCity - The departure city (for country context enhancement)
 * @returns The same data object with updated coordinates
 */
export async function geocodeItinerary(
  data: any, // ItineraryDraft - using any to avoid circular imports
  destination: string,
  departureCity?: string
): Promise<any> {
  const countryCode = detectCountryCode(destination);
  
  // Also detect country from departure city for better context
  // (if destination doesn't contain a country name, departure might)
  const departureCountryCode = departureCity ? detectCountryCode(departureCity) : undefined;
  const effectiveCountryCode = countryCode || departureCountryCode;

  // Geocode the main destination first to get a reference point for proximity checks
  const destCity = destination.split(',')[0].trim();
  const destResolved = resolveCityName(destCity);
  const destCoords = await geocodePlace(destResolved, effectiveCountryCode);
  const MAX_DEVIATION_KM = 50; // Sub-locations must be within 50km of main destination

  // Helper: check if geocoded coords are plausible (within MAX_DEVIATION_KM of destination)
  function isWithinProximity(lat: number, lng: number): boolean {
    if (!destCoords) return true; // No reference point → accept any result
    const dist = haversineKm(destCoords.lat, destCoords.lng, lat, lng);
    if (dist > MAX_DEVIATION_KM) {
      console.warn(`[Nominatim] Proximity check failed: ${dist.toFixed(0)}km from destination (max ${MAX_DEVIATION_KM}km) — likely wrong same-name place`);
      return false;
    }
    return true;
  }

  // 1. Geocode mapPoints — extract clean place name from labels
  if (data.mapPoints && Array.isArray(data.mapPoints)) {
    const allLabels: string[] = (data.mapPoints as any[])
      .map((p: any) => p.label as string)
      .filter(Boolean);
    const uniqueLabels = Array.from(new Set(allLabels));
    const labelCoords = new Map<string, { lat: number; lng: number }>();

    for (const label of uniqueLabels) {
      const placeName = extractPlaceName(label);
      // Try with destination context FIRST (e.g. "Marina Grande, Capri")
      if (destCoords) {
        const contextResult = await geocodePlace(`${placeName}, ${destCity}`, effectiveCountryCode);
        if (contextResult && isWithinProximity(contextResult.lat, contextResult.lng)) {
          labelCoords.set(label, contextResult);
          continue;
        }
      }
      // Fallback: try without context
      const result = await geocodePlace(placeName, effectiveCountryCode);
      if (result && isWithinProximity(result.lat, result.lng)) {
        labelCoords.set(label, result);
      }
      // If both fail proximity, keep AI coords (fallback)
    }

    // Apply coordinates
    for (const point of data.mapPoints) {
      if (!point.label) continue;
      const coords = labelCoords.get(point.label);
      if (coords) {
        point.lat = coords.lat;
        point.lng = coords.lng;
      }
      // If Nominatim fails, keep AI-provided coords (they're our fallback)
    }
  }

  // 2. Geocode attraction points in destinationOverview
  //    Strategy: try attraction name alone first, then with destination context
  if (data.destinationOverview?.attractions && Array.isArray(data.destinationOverview.attractions)) {
    for (const attraction of data.destinationOverview.attractions) {
      if (!attraction.name) continue;
      const cleanName = extractPlaceName(attraction.name);
      
      // Try with destination context FIRST (e.g. "Grotta Azzurra, Capri")
      if (destCoords) {
        const contextResult = await geocodePlace(`${cleanName}, ${destCity}`, effectiveCountryCode);
        if (contextResult && isWithinProximity(contextResult.lat, contextResult.lng)) {
          attraction.lat = contextResult.lat;
          attraction.lng = contextResult.lng;
          continue;
        }
      }

      // Fallback: try just the attraction name
      const result = await geocodePlace(cleanName, effectiveCountryCode);
      if (result && isWithinProximity(result.lat, result.lng)) {
        attraction.lat = result.lat;
        attraction.lng = result.lng;
      }
      // If both fail proximity, keep AI-provided coords
    }
  }

  // 3. Geocode activity locations — use only the location field (city name),
  //    NOT the activity name (which is descriptive like "Escursione a Sormiou")
  if (data.itinerary && Array.isArray(data.itinerary)) {
    for (const day of data.itinerary) {
      if (!day.activities) continue;
      for (const activity of day.activities) {
        // Only geocode using the location field (city name), not the activity name
        if (!activity.location) continue;
        // Skip generic locations
        const genericLocations = ['casa', 'hotel', 'albergo', 'b&b', 'hostel'];
        if (genericLocations.some(g => activity.location.toLowerCase().includes(g))) continue;

        // Extract clean city name (strip prefixes, resolve Italian names)
        const cityName = extractPlaceName(activity.location);

        // Don't re-geocode the same city multiple times — use a cache check
        const cacheKey = `${cityName.toLowerCase()}|${effectiveCountryCode || ''}`;
        const existing = geocodeCache.get(cacheKey);
        if (existing && isWithinProximity(existing.lat, existing.lng)) {
          activity.lat = existing.lat;
          activity.lng = existing.lng;
          continue;
        }

        // Strategy: try with destination context FIRST (e.g. "Marina Grande, Capri")
        // because sub-location names are ambiguous ("Marina Grande" alone → Sorrento, not Capri)
        if (destCoords) {
          const contextResult = await geocodePlace(`${cityName}, ${destCity}`, effectiveCountryCode);
          if (contextResult && isWithinProximity(contextResult.lat, contextResult.lng)) {
            activity.lat = contextResult.lat;
            activity.lng = contextResult.lng;
            continue;
          }
        }

        // Fallback: try geocoding the city name alone
        const result = await geocodePlace(cityName, effectiveCountryCode);
        if (result && isWithinProximity(result.lat, result.lng)) {
          activity.lat = result.lat;
          activity.lng = result.lng;
        }
        // If both fail proximity, keep AI coords
      }
    }
  }

  // 4. Override mapPoints with cities extracted from itinerary locations (day-by-day)
  //    This ensures the map shows the actual route cities with arrows, not random AI points
  if (data.itinerary && Array.isArray(data.itinerary)) {
    const seenCities = new Set<string>();
    const cityRoute: { label: string; lat: number; lng: number }[] = [];

    for (const day of data.itinerary) {
      if (!day.activities || !Array.isArray(day.activities)) continue;
      for (const act of day.activities) {
        const loc = (act as any).location;
        if (!loc || typeof loc !== 'string') continue;
        // Skip generic locations
        const GENERIC = ['casa', 'hotel', 'albergo', 'b&b', 'hostel', 'resort', 'appartamento', 'villa', 'campeggio', 'pernottamento', 'check-in', 'check-out', 'ricerca', 'arrivo', 'partenza', 'aeroporto', 'stazione'];
        const locLower = loc.toLowerCase().trim();
        if (GENERIC.some(g => locLower === g || locLower.startsWith(g + ' '))) continue;
        
        // Extract clean city name (strip Italian prefixes, resolve names)
        const cityName = extractPlaceName(loc);
        if (!cityName || cityName.length < 2) continue;
        
        const key = cityName.toLowerCase();
        if (!seenCities.has(key)) {
          seenCities.add(key);
          // Find coordinates: check existing mapPoints first, then geocode cache, then geocode
          const existing = data.mapPoints?.find((p: any) => {
            if (!p.label) return false;
            const pClean = extractPlaceName(p.label).toLowerCase();
            return pClean === key;
          });
          if (existing && existing.lat && existing.lng && existing.lat !== 0 && existing.lng !== 0) {
            cityRoute.push({ label: cityName, lat: existing.lat, lng: existing.lng });
          } else {
            // Check activity geocoded coords cache
            const cacheKey = `${key}|${effectiveCountryCode || ''}`;
            const geocoded = geocodeCache.get(cacheKey);
            if (geocoded) {
              cityRoute.push({ label: cityName, lat: geocoded.lat, lng: geocoded.lng });
            } else {
              cityRoute.push({ label: cityName, lat: 0, lng: 0 }); // placeholder, will geocode next
            }
          }
        }
      }
    }

    // Geocode any cityRoute entries that still have lat=0, lng=0
    for (const city of cityRoute) {
      if (city.lat === 0 && city.lng === 0) {
        // Try with destination context first (e.g. "Marina Grande, Capri")
        let geocoded = false;
        if (destCoords) {
          const contextResult = await geocodePlace(`${city.label}, ${destCity}`, effectiveCountryCode);
          if (contextResult && isWithinProximity(contextResult.lat, contextResult.lng)) {
            city.lat = contextResult.lat;
            city.lng = contextResult.lng;
            geocoded = true;
          }
        }
        // Fallback: try without context
        if (!geocoded) {
          const result = await geocodePlace(city.label, effectiveCountryCode);
          if (result && isWithinProximity(result.lat, result.lng)) {
            city.lat = result.lat;
            city.lng = result.lng;
          }
        }
      }
    }

    // Only override mapPoints if we got valid cities (within proximity)
    const validCities = cityRoute.filter(c => c.lat !== 0 && c.lng !== 0);
    if (validCities.length >= 2) {
      data.mapPoints = validCities.map(c => ({
        lat: c.lat,
        lng: c.lng,
        label: c.label,
        type: 'city',
      }));
    }
  }

  return data;
}

/**
 * Geocode a pair of cities to get accurate coordinates for car route distance estimation.
 * Used by generateCarSegments() for haversine distance calculation.
 */
export async function geocodeCities(
  cityA: string,
  cityB: string,
  destination?: string
): Promise<{ a: { lat: number; lng: number } | null; b: { lat: number; lng: number } | null }> {
  const countryCode = destination ? detectCountryCode(destination) : undefined;
  const cityAResolved = resolveCityName(cityA);
  const cityBResolved = resolveCityName(cityB);
  // geocodePlace now has fallback logic, so we can call with countryCode
  const [a, b] = await Promise.all([
    geocodePlace(cityAResolved, countryCode),
    geocodePlace(cityBResolved, countryCode),
  ]);
  return { a, b };
}

/**
 * Haversine distance between two lat/lng points in km.
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Road distance estimate from haversine, applying a road factor.
 * European highway average: 1.35x straight-line.
 * City-to-city with some mountainous terrain: 1.4x.
 */
export function estimateRoadKmFromCoords(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const straightLine = haversineKm(lat1, lng1, lat2, lng2);
  const roadFactor = 1.35; // European road factor
  return Math.round(straightLine * roadFactor);
}

/**
 * Clear the geocode cache (useful for testing or memory management).
 */
export function clearGeocodeCache(): void {
  geocodeCache.clear();
}