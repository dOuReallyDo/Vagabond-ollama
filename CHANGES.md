# Changelog — Vagabond-ollama

## 2026-05-05 — extractStops parent location + preferredStops consolidation

### Fixed: Archipelago destinations creating one hotel per day instead of per island
- **Root cause**: AI generates locations like "Victoria, Mahé" and "Beau Vallon, Mahé". `extractStops()` took the first comma part ("Victoria", "Beau Vallon") as separate stops, creating one hotel booking per sub-location.
- **`extractParentLocation()`**: Extracts the island/region part (after last comma) as the stop name. "Victoria, Mahé" → "Mahé", "Beau Vallon, Mahé" → "Mahé", "Anse Source d'Argent, La Digue" → "La Digue". This groups all sub-locations on the same island under one hotel search.
- **`parseCitiesFromNotes()`**: Extracts explicit city names from user notes, preserving multi-word names ("la digue", "boa vista"). Handles Italian connectors: "mahé, praslin e la digue" → ["mahé", "praslin", "la digue"].
- **preferredStops consolidation**: When extracted stops exceed `preferredStops`, adjacent similar stops are merged using fuzzy matching (shared words, containment, note city matching). Reduces N extracted stops to the user's preferredStops count.
- **Signature change**: `extractStops(itinerary, tripStyle?, inputs?)` — now accepts optional `TravelInputs` for `preferredStops` and `notes`.

### File touched
- `src/services/step2Service.ts` — extractStops rewrite, extractParentLocation(), parseCitiesFromNotes(), consolidation logic

### Commit
`14762b4` — fix: extractStops uses parent location (island/region) + preferredStops consolidation

---

## 2026-05-04 (2) — Nominatim destCoords validation + Cape Verde + Italian prefixes

### Fixed: Destination geocoding wrong country (Boa Vista → Brazil instead of Cape Verde)
- **Root cause**: `detectCountryCode()` didn't have Cape Verde (`cv`). Without country code, Nominatim returned the most "important" Boa Vista (Brazil). The proximity check then used the wrong destination as reference, validating all Brazilian coordinates.
- **destCoords validation** (`nominatim.ts`): After geocoding the main destination, compare with AI mapPoints center. If >1000km apart, Nominatim is wrong — use AI center as reference. Also fallback to AI center if destCoords is null.
- **Cape Verde (`cv`)** added to `countryMap` + `ARCHIPELAGO_COUNTRIES` (500km threshold)
- **CITY_NAME_MAP**: Cape Verde cities — 'boa vista' → 'Boa Vista, Cape Verde', 'sal rei', 'sal', 'santa maria', 'santo antão', 'sao vicente', 'mindelo', 'santiago', 'praia', 'fogo', 'maio'
- **More countries**: Kenya, Tanzania, Mozambique, Senegal, Ghana, Nigeria, Ethiopia, Tunisia, Algeria, Cuba, Dominican Republic, Jamaica, Costa Rica, Panama, UAE, Oman, Qatar, Jordan, Lebanon, Taiwan, Hong Kong, Macao

### Expanded: Italian descriptive prefixes for geocoding
- Added patterns: `abbazia`, `basilica`, `chiesa`, `cattedrale`, `duomo`, `faro`, `spiaggia`, `portico`, `fondamenta`, `campus`, `piazzale`, `riva`, `riserva`, `oasi`, `santuario`, `monumento`, `area marina protetta`
- Fixes: "Abbazia di San Giorgio Maggiore" → "San Giorgio Maggiore", "Riserva Naturale Alberoni" → "Alberoni", "Fondamenta della Misericordia" → "Misericordia"

### File touched
- `src/lib/nominatim.ts` — all changes

### Commit
`ebf89b4` — fix: nominatim geocoding — destCoords validation + Cape Verde + Italian prefixes

---

## 2026-05-04 (1) — Nominatim geocoding fix + Accommodation search disabled

### Fixed: Nominatim geocoding for Indonesia/archipelago destinations
- **countryMap**: Added Indonesia (id), Malaysia (my), Philippines (ph), Japan (jp), Korea (kr), NZ, Singapore, Cambodia, Laos, Myanmar, South Africa + more
- **destCity cleanup**: Strip parenthesized country from destination — `"komodo (Indonesia)"` → `"komodo"` before using in context-first queries
- **Dynamic proximity threshold**: 
  - Archipelago nations (ID, PH, PG, NZ, JP, MY, LK): **500km** — islands are far apart
  - Large countries (US, CN, AU, BR, IN, RU, CA, MX, AR): **300km**
  - Europe/medium (default): **50km** — prevents same-name place confusion (e.g. Marina Grande → Sorrento instead of Capri)
- **CITY_NAME_MAP**: Added Komodo, Bali, Ubud, Jakarta, Labuan Bajo, Flores, Lombok, Tokyo, Kyoto, Osaka, + more SE Asian cities

### Disabled: Accommodation search feature
- **Reason**: GLM-5.1 `web_search` tool is insufficient for real hotel verification — returns `exists: false` for well-known hotels
- **Changes**:
  - Removed `AccommodationReviewer` component from both `App.tsx` and `Step2AccommodationView.tsx`
  - Kept `accommodationSearch.ts` service file for future reference
  - Removed `summarizeAccommodationReviews` import from App.tsx
  - Added TODO comments in both files
- ** TODO: Re-evaluate with stronger model (Claude/GPT-4) or integrate Booking.com API directly

### Previously: Accommodation search improvements (not deployed)
- `max_tokens: 1024` → `2048` for web_search results
- Improved prompt with explicit search instructions
- `extractText` now joins all text parts (content array)
- Retry with compact prompt on first failure
- `buildBookingSearchUrl()` deterministic fallback for booking URLs