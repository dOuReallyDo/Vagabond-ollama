# Data Contract Schema — Vagabond-Ollama

## Input: TravelInputs

```typescript
interface TravelInputs {
  // Chi viaggia
  people: {
    adults: number;           // min 1
    children: { age: number }[];
  };

  // Soldi
  budget: number;              // min 100, totale per tutte le persone

  // Dove
  departureCity: string;       // min 2 chars
  departureCountry?: string;
  destination: string;         // min 2 chars
  country?: string;

  // Quando
  startDate: string;           // ISO date
  endDate: string;             // ISO date
  isPeriodFlexible: boolean;   // ±3 giorni

  // Come
  accommodationType: string;   // comma-separated multi-select
  flightPreference?: string;  // "Volo diretto" | "Volo economico" | "Treno" | "Auto privata"
  stopover?: string;           // città di scalo
  departureTimePreference?: string;

  // Note
  notes?: string;

  // MODIFICA (per iterazioni successive)
  modificationRequest?: string;
  previousPlan?: any;

  // 🆕 PROFILO VIAGGIATORE
  travelerProfile?: {
    ageRange?: string;          // "18-25" | "26-35" | "36-45" | "46-55" | "56-65" | "65+"
    travelerType?: string;      // "Solo/a" | "Coppia romantica" | "Famiglia con bimbi piccoli" | "Famiglia con ragazzi" | "Gruppo di amici" | "Viaggio di lavoro"
    interests?: string[];       // max 5: "Cultura" | "Mare" | "Food & Wine" | "Natura" | "Sport" | "Shopping" | "Nightlife" | "Benessere" | "Foto" | "Intrattenimento" | "Avventura" | "Storia"
    pace?: string;              // "Slow & relax" | "Equilibrato" | "Avventura intensa"
    mobility?: string;          // "Nessuna limitazione" | "Ridotta" | "A carrozzina"
    familiarity?: string;        // "Mai stato qui" | "Ci sono già stato" | "Esperto della zona"
  };
}
```

## Output v1 (Legacy): TravelPlan

Invariato rispetto a Vagabond originale. Vedere `src/shared/contract.ts` per lo schema Zod completo.

Campi principali: `budgetWarning`, `destinationOverview`, `weatherInfo`, `safetyAndHealth`, `itinerary`, `budgetBreakdown`, `flights`, `accommodations`, `bestRestaurants`, `mapPoints`, `localTips`, `transportInfo`, `travelBlogs`, `travelHighlights`.

## Output v2 (3-Step Architecture)

### Step 1: ItineraryDraft (`src/shared/step1-contract.ts`)

Generato da `generateItinerary()` in `step1Service.ts`. Contiene SOLO itinerario e overview, NESSUN volo/alloggio/budget.

```typescript
interface ItineraryDraft {
  budgetWarning?: string;          // Solo per warning trasporto (es. "Auto privata non disponibile per destinazioni intercontinentali")
  destinationOverview: {
    title: string;
    description: string;
    attractions: Array<{
      name: string;
      description: string;
      sourceUrl?: string;
      category?: string;
      estimatedVisitTime?: string;
      lat?: number;
      lng?: number;
    }>;
    heroImageUrl?: string;
    tagline?: string;
  };
  weatherInfo: {
    summary: string;
    pros: string;
    cons: string;
    averageTemp?: string;
    packingTips?: string;
  };
  safetyAndHealth: {
    safetyWarnings: string;
    vaccinationsRequired: string;
    safetyLevel?: string;
    emergencyNumbers?: string;
  };
  itinerary: Array<{
    day: number;
    title: string;
    theme?: string;
    activities: Array<{
      time: string;
      location?: string;
      name?: string;
      description: string;
      costEstimate?: number;
      sourceUrl?: string;
      imageUrl?: string;
      lat?: number;
      lng?: number;
      duration?: string;
      transport?: string;
      travelTime?: string;
      tips?: string;
    }>;
  }>;
  localTips?: string[];
  transportInfo?: {
    localTransport?: string;
    bestApps?: string[];
    estimatedLocalCost?: string;
    privateTransferLinks?: Array<{
      provider: string;
      url: string;
      description?: string;
    }>;
  };
  travelHighlights?: {
    whyChosen: string;
    mainStops: Array<{ name: string; reason: string }>;
    whyUnforgettable: string;
  };
  mapPoints?: Array<{ lat: number; lng: number; label: string; type?: string }>;
}
```

### Step 2: AccommodationTransport (`src/shared/step2-contract.ts`)

Generato da `searchAccommodationsAndTransport()` in `step2Service.ts`. Contiene alloggi, ristoranti e voli per ogni tappa.

```typescript
interface AccommodationTransport {
  accommodations: Array<{
    stopName: string;
    nights?: number;
    options: Array<{
      name: string;
      type: string;
      rating?: number;
      reviewSummary?: string;
      estimatedPricePerNight: number;
      bookingUrl?: string;
      imageUrl?: string;
      lat?: number;
      lng?: number;
      address?: string;
      amenities?: string[];
      stars?: number;
    }>;
  }>;
  bestRestaurants: Array<{
    stopName: string;
    options: Array<{
      name: string;
      cuisineType: string;
      rating?: number;
      reviewSummary?: string;
      sourceUrl?: string;
      priceRange: string;
      imageUrl?: string;
      lat?: number;
      lng?: number;
      address?: string;
      mustTry?: string;
    }>;
  }>;
  flights?: Array<{
    segmentName: string;
    options: Array<{
      airline: string;
      route: string;
      estimatedPrice: number;
      date?: string;
      departureTime?: string | null;
      arrivalTime?: string | null;
      duration?: string | null;
      distance?: string | null;       // 🆕 Per "Auto privata" — distanza in km (es. "450 km")
      bookingUrl?: string;
      verified?: boolean;
    }>;
  }>;
}
```

### Step 3: BudgetCalculation (`src/shared/step3-contract.ts`)

Calcolato da `calculateBudget()` in `step3Service.ts`. **Nessuna chiamata AI** — puro calcolo JS dai dati di Step 1 + Step 2.

```typescript
interface BudgetCalculation {
  budgetBreakdown: {
    flights: number;
    accommodation: number;
    activities: number;
    food: number;
    totalEstimated: number;
    transport?: number;
    misc?: number;
    perPersonPerDay?: number;
  };
  budgetWarning: string | null;   // es. "Budget stimato €3500 supera il budget di €3000 di €500"
  costTable?: Array<{
    category: string;
    items: Array<{ name: string; cost: number; notes?: string }>;
    subtotal: number;
  }>;
}
```

### Composed: TravelPlanV2 (`src/shared/contract-v2.ts`)

```typescript
interface TravelPlanV2 {
  inputs: TravelInputs;
  step1Completed: boolean;
  step2Completed: boolean;
  step3Completed: boolean;
  step1?: ItineraryDraft;
  step2?: AccommodationTransport;
  step3?: BudgetCalculation;
}

type ActiveStep = 1 | 2 | 3;
```

## SavedTrip v1 (Legacy)

```typescript
interface SavedTrip {
  id: string;                   // UUID
  user_id: string;              // FK → profiles
  trip_name: string;
  destination?: string;
  inputs: TravelInputs;         // JSONB
  plan: TravelPlan;             // JSONB (monolitico)
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}
```

Tabella: `saved_trips`

## SavedTripV2 (3-Step)

```typescript
interface SavedTripV2 {
  id: string;                   // UUID
  user_id: string;              // FK → profiles
  trip_name: string;
  destination?: string;
  inputs: TravelInputs;         // JSONB
  step1_data: ItineraryDraft | null;   // JSONB
  step1_completed: boolean;
  step2_data: AccommodationTransport | null;  // JSONB
  step2_completed: boolean;
  step3_data: BudgetCalculation | null;       // JSONB
  step3_completed: boolean;
  is_complete: boolean;         // true solo quando tutti e 3 gli step sono completi
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}
```

Tabella: `saved_trips_v2` (separata da `saved_trips`, v1 intatta)

## ⚠️ URL Sanitization

All v1 TravelPlan objects and v2 ItineraryDraft/AccommodationTransport objects are sanitized via `sanitizeTravelPlanAsync()` before rendering or saving. See CLAUDE.md for details.

**⚠️ AI Deep Links**: The frontend never uses AI-generated deep links directly (e.g., `booking.com/hotel/it/fake.html`). Instead, it generates real search URLs from structured data:
- `getBookingSearchUrlWithDates(name, city, checkin, checkout, adults)` with per-stop dates for HotelCard
- Google Search `${name} ${city} tripadvisor` for RestaurantCard
- `getGoogleSearchUrl(query)` for Step1 activity "Scopri di più" links
- Google Maps directions URL for car routes
- Only search URLs are trusted: `booking.com/searchresults`, `tripadvisor.it/Search`, `google.com/search`