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
  source: 'nominatim' | 'ai';  // to track where coords came from
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
 * Geocode a single place name to lat/lng.
 * Returns null if geocoding fails (caller should keep AI-provided coords as fallback).
 */
async function geocodePlace(name: string, countryCode?: string): Promise<{ lat: number; lng: number } | null> {
  const cacheKey = `${name.toLowerCase()}|${countryCode || ''}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  try {
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`;
    if (countryCode) {
      url += `&countrycodes=${countryCode.toLowerCase()}`;
    }

    const res = await rateLimitedFetch(url);
    if (!res.ok) {
      console.warn(`[Nominatim] HTTP ${res.status} for "${name}"`);
      return null;
    }

    const data: NominatimResult[] = await res.json();
    if (data.length === 0) {
      console.warn(`[Nominatim] No results for "${name}"`);
      return null;
    }

    const result = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };

    // Validate: lat must be -90..90, lng must be -180..180
    if (isNaN(result.lat) || isNaN(result.lng) || Math.abs(result.lat) > 90 || Math.abs(result.lng) > 180) {
      console.warn(`[Nominatim] Invalid coords for "${name}": ${result.lat}, ${result.lng}`);
      return null;
    }

    geocodeCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`[Nominatim] Error geocoding "${name}":`, err);
    return null;
  }
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
    'cze': 'cz', 'czech': 'cz', 'ceca': 'cz',
    'ungheria': 'hu', 'hungary': 'hu',
    'romania': 'ro',
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
  };

  const lower = location.toLowerCase();
  for (const [name, code] of Object.entries(countryMap)) {
    if (lower.includes(name)) return code;
  }
  return undefined;
}

/**
 * Geocode all mapPoints from AI-generated itinerary data.
 * Replaces AI-provided lat/lng with Nominatim-resolved coordinates.
 * Falls back to AI coords if Nominatim fails for a point.
 * Also geocodes attraction points and activity locations.
 * 
 * @param data - The Step 1 ItineraryDraft data (mutated in place)
 * @param destination - The trip destination (for country context)
 * @returns The same data object with updated coordinates
 */
export async function geocodeItinerary(
  data: any, // ItineraryDraft - using any to avoid circular imports
  destination: string
): Promise<any> {
  const countryCode = detectCountryCode(destination);

  // 1. Geocode mapPoints
  if (data.mapPoints && Array.isArray(data.mapPoints)) {
    const geocodePromises = data.mapPoints.map(async (point: any) => {
      if (!point.label) return;
      const result = await geocodePlace(point.label, countryCode);
      if (result) {
        point.lat = result.lat;
        point.lng = result.lng;
      }
      // If Nominatim fails, keep AI-provided coords (they're our fallback)
    });

    await Promise.all(geocodePromises);
  }

  // 2. Geocode attraction points in destinationOverview
  if (data.destinationOverview?.attractions && Array.isArray(data.destinationOverview.attractions)) {
    for (const attraction of data.destinationOverview.attractions) {
      if (!attraction.name) continue;
      // For attractions, try "name + destination" for better accuracy
      const searchName = `${attraction.name}, ${destination.split(',')[0]}`;
      const result = await geocodePlace(searchName, countryCode);
      if (result) {
        attraction.lat = result.lat;
        attraction.lng = result.lng;
      }
    }
  }

  // 3. Geocode activity locations in itinerary days
  if (data.itinerary && Array.isArray(data.itinerary)) {
    for (const day of data.itinerary) {
      if (!day.activities) continue;
      for (const activity of day.activities) {
        // Only geocode if activity has a name (not generic like "check-in")
        if (!activity.name || !activity.location) continue;
        // Skip generic activities
        const genericNames = ['pernottamento', 'check-in', 'check-out', 'colazione', 'check in', 'check out', 'relax', 'arrivo', 'partenza', 'riposo'];
        if (genericNames.some(g => activity.name.toLowerCase().includes(g))) continue;

        const searchName = `${activity.name}, ${activity.location}`;
        const result = await geocodePlace(searchName, countryCode);
        if (result) {
          activity.lat = result.lat;
          activity.lng = result.lng;
        }
      }
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
  const [a, b] = await Promise.all([
    geocodePlace(cityA, countryCode),
    geocodePlace(cityB, countryCode),
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