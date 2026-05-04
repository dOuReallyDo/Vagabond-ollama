# Changelog — Vagabond-ollama

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