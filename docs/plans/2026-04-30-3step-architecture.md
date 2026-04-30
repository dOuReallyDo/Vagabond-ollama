# VAGABOND 3-STEP Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Split the monolithic AI travel plan generation into 3 sequential steps (Itinerary → Accommodations+Transport → Budget) to handle complex/long trips with GLM-5.1 without timeouts.

**Architecture:** Client-side React app uses 3 progressive steps. Step 1 generates itinerary via AI (single call). Step 2 searches accommodations, restaurants, flights per-stop via AI (1 call per stop, parallelizable). Step 3 calculates budget purely in JS (no AI). Each step has its own Zod schema, save/load cycle, and UI confirmation gate. Modification only allowed in Step 1 (invalidates Steps 2-3). New Supabase table `saved_trips_v2` stores 3-step data separately. Old `saved_trips` table untouched.

**Tech Stack:** React + Vite + TypeScript + TailwindCSS + Zod + OpenAI SDK (Zhipu API) + Supabase + Framer Motion

---

## PHASE 1: Schema & Contracts (Agent α)

### Task 1.1: Create Step 1 Schema — ItineraryDraft

**Objective:** Define the Zod schema for Step 1 output (itinerary + overview + weather + safety, no flights/accommodations/budget).

**Files:**
- Create: `src/shared/step1-contract.ts`

**Step 1: Write the schema file**

```typescript
import { z } from "zod";

// Step 1 Output: Itinerary + Destination Overview + Weather + Safety + Inspirations
// NO flights, NO accommodations, NO restaurants, NO budget breakdown

export const ItineraryDraftSchema = z.object({
  destinationOverview: z.object({
    title: z.string(),
    description: z.string(),
    attractions: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        sourceUrl: z.string().optional(),
        category: z.string().optional(),
        estimatedVisitTime: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
    ),
    heroImageUrl: z.string().optional(),
    tagline: z.string().optional(),
  }),
  weatherInfo: z.object({
    summary: z.string(),
    pros: z.string(),
    cons: z.string(),
    averageTemp: z.string().optional(),
    packingTips: z.string().optional(),
  }),
  safetyAndHealth: z.object({
    safetyWarnings: z.string(),
    vaccinationsRequired: z.string(),
    safetyLevel: z.string().optional(),
    emergencyNumbers: z.string().optional(),
  }),
  itinerary: z.array(
    z.object({
      day: z.number(),
      title: z.string(),
      theme: z.string().optional(),
      activities: z.array(
        z.object({
          time: z.string(),
          location: z.string().optional(),
          name: z.string().optional(),
          description: z.string(),
          costEstimate: z.number().optional(),
          sourceUrl: z.string().optional(),
          imageUrl: z.string().optional(),
          lat: z.number().optional(),
          lng: z.number().optional(),
          duration: z.string().optional(),
          transport: z.string().optional(),
          travelTime: z.string().optional(),
          tips: z.string().optional(),
        })
      ),
    })
  ),
  localTips: z.array(z.string()).optional(),
  transportInfo: z.object({
    localTransport: z.string().optional(),
    bestApps: z.array(z.string()).optional(),
    estimatedLocalCost: z.string().optional(),
    privateTransferLinks: z.array(
      z.object({
        provider: z.string(),
        url: z.string(),
        description: z.string().optional(),
      })
    ).optional(),
  }).optional(),
  travelHighlights: z.object({
    whyChosen: z.string(),
    mainStops: z.array(z.object({
      name: z.string(),
      reason: z.string(),
    })),
    whyUnforgettable: z.string(),
  }).optional(),
  mapPoints: z.array(
    z.object({
      lat: z.number(),
      lng: z.number(),
      label: z.string(),
      type: z.string().optional(),
    })
  ).optional(),
});

export type ItineraryDraft = z.infer<typeof ItineraryDraftSchema>;
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Volumes/HD_esterno/Progetti/Trinity/Vagabond-ollama && npx tsc --noEmit src/shared/step1-contract.ts 2>&1 | head -20`
Expected: No errors related to step1-contract.ts

**Step 3: Commit**

```bash
git add src/shared/step1-contract.ts
git commit -m "feat: add Step 1 ItineraryDraft Zod schema"
```

---

### Task 1.2: Create Step 2 Schema — AccommodationTransport

**Objective:** Define the Zod schema for Step 2 output (accommodations, restaurants, flights).

**Files:**
- Create: `src/shared/step2-contract.ts`

**Step 1: Write the schema file**

```typescript
import { z } from "zod";

// Step 2 Output: Accommodations + Restaurants + Flights/Transport
// Requires an ItineraryDraft as input to know which stops to search

// One stop's accommodation search result
export const AccommodationStopSchema = z.object({
  stopName: z.string(),
  nights: z.number().optional(),
  options: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      rating: z.number().optional(),
      reviewSummary: z.string().optional(),
      estimatedPricePerNight: z.number(),
      bookingUrl: z.string().optional(),
      imageUrl: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      address: z.string().optional(),
      amenities: z.array(z.string()).optional(),
      stars: z.number().optional(),
    })
  ),
});

export type AccommodationStop = z.infer<typeof AccommodationStopSchema>;

// One stop's restaurant search result
export const RestaurantStopSchema = z.object({
  stopName: z.string(),
  options: z.array(
    z.object({
      name: z.string(),
      cuisineType: z.string(),
      rating: z.number().optional(),
      reviewSummary: z.string().optional(),
      sourceUrl: z.string().optional(),
      priceRange: z.string(),
      imageUrl: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      address: z.string().optional(),
      mustTry: z.string().optional(),
    })
  ),
});

export type RestaurantStop = z.infer<typeof RestaurantStopSchema>;

// Flight segment
export const FlightSegmentSchema = z.object({
  segmentName: z.string(),
  options: z.array(
    z.object({
      airline: z.string(),
      route: z.string(),
      estimatedPrice: z.number(),
      date: z.string().optional(),
      departureTime: z.string().optional().nullable(),
      arrivalTime: z.string().optional().nullable(),
      duration: z.string().optional().nullable(),
      bookingUrl: z.string().optional(),
      verified: z.boolean().optional(),
    })
  ),
});

export type FlightSegment = z.infer<typeof FlightSegmentSchema>;

// Full Step 2 output
export const AccommodationTransportSchema = z.object({
  accommodations: z.array(AccommodationStopSchema),
  bestRestaurants: z.array(RestaurantStopSchema),
  flights: z.array(FlightSegmentSchema).optional(),
});

export type AccommodationTransport = z.infer<typeof AccommodationTransportSchema>;
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Volumes/HD_esterno/Progetti/Trinity/Vagabond-ollama && npx tsc --noEmit src/shared/step2-contract.ts 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/shared/step2-contract.ts
git commit -m "feat: add Step 2 AccommodationTransport Zod schema"
```

---

### Task 1.3: Create Step 3 Schema — BudgetCalculation

**Objective:** Define the Zod schema for Step 3 output (budget breakdown). Pure calculation, no AI.

**Files:**
- Create: `src/shared/step3-contract.ts`

**Step 1: Write the schema file**

```typescript
import { z } from "zod";

// Step 3 Output: Budget breakdown — computed from Step 1 + Step 2 data, NO AI call

export const BudgetCalculationSchema = z.object({
  budgetBreakdown: z.object({
    flights: z.number(),
    accommodation: z.number(),
    activities: z.number(),
    food: z.number(),
    totalEstimated: z.number(),
    transport: z.number().optional(),
    misc: z.number().optional(),
    perPersonPerDay: z.number().optional(),
  }),
  budgetWarning: z.string().nullable(),
  // Detailed cost table for transparency
  costTable: z.array(
    z.object({
      category: z.string(),
      items: z.array(
        z.object({
          name: z.string(),
          cost: z.number(),
          notes: z.string().optional(),
        })
      ),
      subtotal: z.number(),
    })
  ).optional(),
});

export type BudgetCalculation = z.infer<typeof BudgetCalculationSchema>;
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Volumes/HD_esterno/Progetti/Trinity/Vagabond-ollama && npx tsc --noEmit src/shared/step3-contract.ts 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/shared/step3-contract.ts
git commit -m "feat: add Step 3 BudgetCalculation Zod schema"
```

---

### Task 1.4: Update TravelPlan as composition of 3 steps

**Objective:** Define the composed TravelPlan that assembles all 3 steps. Keep existing `contract.ts` working for backwards compatibility but add a new v2 type.

**Files:**
- Create: `src/shared/contract-v2.ts`

**Step 1: Write the composed contract**

```typescript
import { z } from "zod";
import { ItineraryDraftSchema } from "./step1-contract";
import { AccommodationTransportSchema } from "./step2-contract";
import { BudgetCalculationSchema } from "./step3-contract";
import { TravelInputsSchema } from "./contract";

// Composed v2 TravelPlan — assembled from 3 sequential steps
export const TravelPlanV2Schema = z.object({
  // The original form inputs
  inputs: TravelInputsSchema,
  // Step completion flags
  step1Completed: z.boolean(),
  step2Completed: z.boolean(),
  step3Completed: z.boolean(),
  // Step data (filled progressively)
  step1: ItineraryDraftSchema.optional(),
  step2: AccommodationTransportSchema.optional(),
  step3: BudgetCalculationSchema.optional(),
});

export type TravelPlanV2 = z.infer<typeof TravelPlanV2Schema>;

// Current active step
export type ActiveStep = 1 | 2 | 3;
```

**Step 2: Commit**

```bash
git add src/shared/contract-v2.ts
git commit -m "feat: add TravelPlanV2 composed schema"
```

---

## PHASE 2: AI Services (Agent α)

### Task 2.1: Create Step 1 AI service — generateItinerary()

**Objective:** Refactor the monolithic `generateTravelPlan` prompt into a focused Step 1 prompt that only generates itinerary + overview + weather + safety + tips.

**Files:**
- Create: `src/services/step1Service.ts`

**Key changes from current `generateTravelPlan()`:**
- Remove flights, accommodations, restaurants, budgetBreakdown from prompt and expected JSON
- Remove instructions about hotel prices, bookingUrl, star ratings
- Remove budget percentage rules for flights (that moves to Step 2)
- Keep: profile section, destination, dates, format rules (brevity), itinerary structure
- Keep: web_search tool (2-3 uses for local info)
- Add: `budgetWarning` field only for transport compatibility warnings
- max_tokens: 8000 (much smaller output than current 16000)
- model: "glm-5.1"

**Step 1: Write step1Service.ts**

The file exports `generateItinerary(inputs, onProgress?)` returning `ItineraryDraft`.
The prompt is a compacted version of the existing prompt, stripped of:
- REGOLE CRITICHE PER VOLI E LOGISTICA
- ALLOGGI E TAPPE section
- LINK UFFICIALE HOTEL section
- flights/accommodations/bestRestaurants/budgetBreakdown from JSON structure

Kept:
- Profile section (unchanged)
- DETTAGLI VIAGGIO (departure, destination, dates, budget, notes)
- REGOLE PER IL MEZZO DI TRASPORTO (simplified — just compatibility check, no price search)
- FORMAT rules (brevity)
- ITINERARIO GIORNALIERO with dateList
- destinationOverview, weatherInfo, safetyAndHealth, itinerary, localTips, transportInfo, travelHighlights, mapPoints in JSON structure

**Step 2: Write failing test for generateItinerary format**

Test that the function's output validates against `ItineraryDraftSchema`.
Use a mock for the OpenAI client.

**Step 3: Commit**

```bash
git add src/services/step1Service.ts
git commit -m "feat: add Step 1 generateItinerary service"
```

---

### Task 2.2: Create Step 2 AI service — searchAccommodationsAndTransport()

**Objective:** New service that searches accommodations, restaurants, and flights per-stop. Makes 1 AI call per stop, then assembles results.

**Files:**
- Create: `src/services/step2Service.ts`

**Design:**
- Export `searchAccommodationsAndTransport(itinerary, inputs, onProgress?)` returning `AccommodationTransport`
- Extract unique stops from `itinerary.itinerary` (group consecutive days in same location)
- For each stop: call AI with focused prompt searching accommodations + restaurants for that city
- For flights: single call to AI to search flight options for the route
- Each call uses web_search with max 3-4 searches per call
- max_tokens: 4000 per stop call, 2000 for flights call
- Progress callback: "Ricerca alloggi a {city}... ({n}/{total})"
- On partial failure: skip failed stop, continue with others, include warning in output

**Step 1: Write step2Service.ts**

```typescript
// Key function signature:
export const searchAccommodationsAndTransport = async (
  itinerary: ItineraryDraft,
  inputs: TravelInputs,
  onProgress?: (step: string, progress: number) => void
): Promise<AccommodationTransport> => { ... }
```

Internal function `searchStopAccommodations(stopName, nights, inputs)`:
- Prompt asks for 2-3 hotel options with real prices + 2 restaurant options
- Uses web_search to find real prices
- Returns `AccommodationStop` + `RestaurantStop`

Internal function `searchFlights(inputs)`:
- Prompt asks for flight/train/flight options for the route
- Uses web_search to verify airlines
- Returns `FlightSegment[]`

**Step 2: Commit**

```bash
git add src/services/step2Service.ts
git commit -m "feat: add Step 2 searchAccommodationsAndTransport service"
```

---

### Task 2.3: Create Step 3 service — calculateBudget()

**Objective:** Pure JS function that takes Step 1 + Step 2 data and calculates budget breakdown. No AI call.

**Files:**
- Create: `src/services/step3Service.ts`

**Design:**
- Input: `ItineraryDraft` + `AccommodationTransport` + `TravelInputs`
- Sum all `costEstimate` from itinerary activities → activities total
- Sum `estimatedPricePerNight * nights` for each accommodation option (use the FIRST option per stop)
- Sum `estimatedPrice * totalPeople` for each flight
- Estimate food cost: ~€30/person/day (adjustable by destination)
- Calculate perPersonPerDay
- Generate budgetWarning if total > input budget
- Build `costTable[]` for detailed transparency view

```typescript
export const calculateBudget = (
  step1: ItineraryDraft,
  step2: AccommodationTransport,
  inputs: TravelInputs
): BudgetCalculation => { ... }
```

**Step 2: Commit**

```bash
git add src/services/step3Service.ts
git commit -m "feat: add Step 3 calculateBudget (pure JS, no AI)"
```

---

### Task 2.4: Create Step 1 modification service

**Objective:** Allow modifying the itinerary (Step 1 only) via AI, returning a new ItineraryDraft.

**Files:**
- Modify: `src/services/step1Service.ts`

**Design:**
- Export `modifyItinerary(existingDraft, modificationRequest, inputs, onProgress?)` returning `ItineraryDraft`
- Prompt includes the existing draft JSON + user's modification request
- Same prompt rules as generateItinerary but focused on updating
- Much smaller prompt since we provide the existing plan

**Step 1: Add modifyItinerary function to step1Service.ts**

**Step 2: Commit**

```bash
git add src/services/step1Service.ts
git commit -m "feat: add modifyItinerary for Step 1 modifications"
```

---

## PHASE 3: Database (Agent γ)

### Task 3.1: Create saved_trips_v2 SQL schema

**Objective:** New table with 3-step data columns. Old `saved_trips` untouched.

**Files:**
- Modify: `supabase/schema.sql` (APPEND new table, don't modify existing)
- Create: `supabase/migrations/add_saved_trips_v2.sql` (standalone migration file)

**Step 1: Write the migration SQL**

```sql
-- =============================================
-- 4. SAVED_TRIPS_V2 (3-step architecture)
-- =============================================
CREATE TABLE IF NOT EXISTS public.saved_trips_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Trip info
  trip_name TEXT NOT NULL,
  destination TEXT,
  
  -- Original form inputs (JSONB)
  inputs JSONB NOT NULL DEFAULT '{}',
  
  -- Step 1: Itinerary Draft (JSONB)
  step1_data JSONB DEFAULT '{}',
  step1_completed BOOLEAN DEFAULT false,
  
  -- Step 2: Accommodations + Transport (JSONB)
  step2_data JSONB DEFAULT '{}',
  step2_completed BOOLEAN DEFAULT false,
  
  -- Step 3: Budget calculation (JSONB)
  step3_data JSONB DEFAULT '{}',
  step3_completed BOOLEAN DEFAULT false,
  
  -- Overall completion
  is_complete BOOLEAN DEFAULT false,
  
  -- Flags
  is_favorite BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saved_trips_v2_user ON public.saved_trips_v2 (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_trips_v2_favorite ON public.saved_trips_v2 (user_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_saved_trips_v2_incomplete ON public.saved_trips_v2 (user_id) WHERE is_complete = false;

-- RLS policies
ALTER TABLE public.saved_trips_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trips v2"
  ON public.saved_trips_v2 FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trips v2"
  ON public.saved_trips_v2 FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trips v2"
  ON public.saved_trips_v2 FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own trips v2"
  ON public.saved_trips_v2 FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at trigger for v2
DROP TRIGGER IF EXISTS set_updated_at_v2 ON public.saved_trips_v2;
CREATE TRIGGER set_updated_at_v2
  BEFORE UPDATE ON public.saved_trips_v2
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

**Step 2: Run migration on Supabase (via dashboard SQL editor)**

Copy-paste the SQL into Supabase SQL Editor and run it.
Verify with: `SELECT * FROM saved_trips_v2 LIMIT 1;`

**Step 3: Commit**

```bash
git add supabase/migrations/add_saved_trips_v2.sql supabase/schema.sql
git commit -m "feat: add saved_trips_v2 table with 3-step columns"
```

---

### Task 3.2: Create storage v2 functions

**Objective:** New save/load/update functions for 3-step trips. Keep old storage.ts untouched.

**Files:**
- Create: `src/lib/storage-v2.ts`

**Design:**
- Uses REST API with direct JWT (same pattern as existing `storage.ts`)
- `SavedTripV2` interface with step1_data, step2_data, step3_data, step flags
- `saveStep(tripId, stepNumber, data)` — save a single step's data, mark step completed
- `loadTripsV2(userId)` — load all v2 trips for user
- `loadTripV2(tripId)` — load single trip
- `createTripV2(inputs, userId)` — create new trip with inputs
- `updateStepCompleted(tripId, step1Completed, step2Completed, step3Completed)` — update flags
- `invalidateStepsAfter(tripId, afterStep)` — when Step 1 is modified, clear Step 2 and 3
- localStorage fallback key: `vagabond_saved_trips_v2_local`

**Step 1: Write storage-v2.ts**

**Step 2: Commit**

```bash
git add src/lib/storage-v2.ts
git commit -m "feat: add storage-v2 for 3-step trip persistence"
```

---

## PHASE 4: Frontend Step Flow (Agent β)

### Task 4.1: Add step state management to App.tsx

**Objective:** Add 3-step state tracking to the main app component. New state variables and step transitions.

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add new state variables**

```typescript
// 3-step state
const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
const [step1Data, setStep1Data] = useState<ItineraryDraft | null>(null);
const [step2Data, setStep2Data] = useState<AccommodationTransport | null>(null);
const [step3Data, setStep3Data] = useState<BudgetCalculation | null>(null);
const [step1Confirmed, setStep1Confirmed] = useState(false);
const [step2Confirmed, setStep2Confirmed] = useState(false);
const [step3Confirmed, setStep3Confirmed] = useState(false);
```

**Step 2: Add step transition handlers**

```typescript
// Confirm Step 1 → move to Step 2
const confirmItinerary = () => {
  setStep1Confirmed(true);
  setActiveStep(2);
  // Auto-save Step 1
  saveStep(tripId, 1, step1Data);
};

// Modify Step 1 → invalidate Steps 2-3
const modifyItinerary = () => {
  setStep1Confirmed(false);
  setStep2Data(null);
  setStep2Confirmed(false);
  setStep3Data(null);
  setStep3Confirmed(false);
  setActiveStep(1);
  // Invalidate steps 2-3 in DB
  invalidateStepsAfter(tripId, 1);
};

// Confirm Step 2 → move to Step 3
const confirmAccommodations = () => {
  setStep2Confirmed(true);
  setActiveStep(3);
  // Auto-calculate budget
  const budget = calculateBudget(step1Data!, step2Data!, inputs);
  setStep3Data(budget);
  saveStep(tripId, 2, step2Data);
};

// Save full trip
const saveFullTrip = () => {
  setStep3Confirmed(true);
  saveStep(tripId, 3, step3Data);
  // Mark trip as complete
};
```

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add 3-step state management to App"
```

---

### Task 4.2: Create StepIndicator component

**Objective:** Visual stepper showing which step is active/completed/pending.

**Files:**
- Create: `src/components/StepIndicator.tsx`

**Design:**
- 3 circles connected by lines: ① Itinerario → ② Alloggi & Trasporti → ③ Budget
- Active step: filled blue, with animation
- Completed step: green checkmark
- Pending step: gray circle
- Click on completed step → go back to that step (for review)
- Mobile responsive (vertical on small screens)

**Step 1: Write StepIndicator.tsx**

Props: `activeStep`, `step1Completed`, `step2Completed`, `step3Completed`, `onStepClick`

**Step 2: Commit**

```bash
git add src/components/StepIndicator.tsx
git commit -m "feat: add StepIndicator stepper component"
```

---

### Task 4.3: Create Step 1 view — ItineraryView

**Objective:** Display Step 1 results (itinerary, overview, weather, safety) with "Conferma Itinerario" and "Modifica" buttons.

**Files:**
- Create: `src/components/Step1ItineraryView.tsx`

**Design:**
- Extracts the itinerary/overview/weather/safety rendering from current ResultsView
- Adds bottom action bar: [Modifica ✏️] [Conferma Itinerario ✓]
- "Modifica" opens inline input for modification request → calls `modifyItinerary()`
- "Conferma" marks Step 1 confirmed and moves to Step 2
- Shows travel highlights, ispirazioni, local tips (the "inspirations" from current design)

**Step 1: Write Step1ItineraryView.tsx**
- Props: `data: ItineraryDraft`, `inputs: TravelInputs`, `onConfirm()`, `onModify(request: string)`
- Reuses existing card/tab styling from ResultsView

**Step 2: Commit**

```bash
git add src/components/Step1ItineraryView.tsx
git commit -m "feat: add Step 1 ItineraryView component"
```

---

### Task 4.4: Create Step 2 view — AccommodationTransportView

**Objective:** Display Step 2 results (accommodations, restaurants, flights) with "Conferma" button and per-stop loading progress.

**Files:**
- Create: `src/components/Step2AccommodationView.tsx`

**Design:**
- Shows progress bar during search: "Ricerca alloggi a Lima... (2/4 tappe)"
- Per-stop accordion: city name + nights → expand to see 2-3 hotel options + 2 restaurants
- Hotel cards with rating, price, amenities, bookingUrl (reuse existing card styling)
- Flight/train section at top
- Bottom action bar: [← Torna all'itinerario] [Conferma Alloggi & Trasporti ✓]
- No edit button — to change, go back to Step 1

**Step 1: Write Step2AccommodationView.tsx**

**Step 2: Commit**

```bash
git add src/components/Step2AccommodationView.tsx
git commit -m "feat: add Step 2 AccommodationTransportView component"
```

---

### Task 4.5: Create Step 3 view — BudgetView

**Objective:** Display calculated budget with breakdown table and cost transparency. "Salva Viaggio" final button.

**Files:**
- Create: `src/components/Step3BudgetView.tsx`

**Design:**
- Summary cards: Total, Per Person/Day
- Breakdown: Flights, Accommodation, Activities, Food, Transport, Misc
- Detailed costTable if available
- Budget warning banner if total > input budget
- Comparison: "Il tuo budget: €X | Stima: €Y"
- Bottom action bar: [← Torna agli alloggi] [Salva Viaggio 💾]
- "Salva Viaggio" = save all 3 steps + mark complete

**Step 1: Write Step3BudgetView.tsx**

**Step 2: Commit**

```bash
git add src/components/Step3BudgetView.tsx
git commit -m "feat: add Step 3 BudgetView component"
```

---

### Task 4.6: Wire up 3-step flow in App.tsx

**Objective:** Replace the monolithic ResultsView with the 3-step flow. Wire StepIndicator + Step1View + Step2View + Step3View.

**Files:**
- Modify: `src/App.tsx`

**Design:**
- After trip generation: show StepIndicator + Step1ItineraryView
- Step 1 confirmed → auto-trigger Step 2 search → show Step2AccommodationView
- Step 2 confirmed → auto-calculate Step 3 → show Step3BudgetView
- Step 3 saved → show "Viaggio salvato!" success + navigate to saved trips
- Keep existing ResultsView available as fallback (hidden behind a feature flag or just unused)
- The form (FormView) stays unchanged — same input flow

**Key flow changes:**
1. User fills form → clicks "Genera itinerario" (renamed from current button)
2. `generateItinerary()` called (Step 1 AI, single call) → results shown in Step1ItineraryView
3. User reviews → "Conferma itinerario"
4. `searchAccommodationsAndTransport()` called (Step 2 AI, multi-call) → progress shown, results in Step2AccommodationView
5. User reviews → "Conferma alloggi e trasporti"
6. `calculateBudget()` called (Step 3, pure JS, instant) → BudgetView shown
7. User reviews → "Salva viaggio"

**Step 1: Modify App.tsx to integrate the step components**

**Step 2: Test full flow manually in dev**

Run: `cd /Volumes/HD_esterno/Progetti/Trinity/Vagabond-ollama && npm run dev`

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire up 3-step flow replacing monolithic ResultsView"
```

---

## PHASE 5: Testing (Agent δ)

### Task 5.1: Unit tests for Step 3 budget calculation

**Objective:** Test that `calculateBudget()` correctly sums costs from Step 1 + Step 2 data.

**Files:**
- Create: `src/__tests__/step3Budget.test.ts`

**Test cases:**
1. Simple 2-day trip → correct totals
2. 14-day trip with multiple stops → correct per-stop sums
3. Budget overflow → budgetWarning generated
4. Missing fields → graceful defaults (0)
5. Per-person calculation with multiple adults

**Step 1: Write tests**

**Step 2: Run tests**

Run: `cd /Volumes/HD_esterno/Progetti/Trinity/Vagabond-ollama && npm test`
Expected: All pass

**Step 3: Commit**

```bash
git add src/__tests__/step3Budget.test.ts
git commit -m "test: add Step 3 budget calculation unit tests"
```

---

### Task 5.2: Unit tests for storage-v2 save/load

**Objective:** Test that 3-step save/load works, step invalidation works.

**Files:**
- Create: `src/__tests__/storageV2.test.ts`

**Test cases:**
1. Create trip → save Step 1 → load → Step 1 data present
2. Save Step 2 on top → load → both steps present
3. Invalidate after Step 1 → Step 2 and 3 cleared
4. localStorage fallback works when no Supabase

**Step 1: Write tests**

**Step 2: Run tests**

Run: `npm test`
Expected: All pass

**Step 3: Commit**

```bash
git add src/__tests__/storageV2.test.ts
git commit -m "test: add storage-v2 save/load/invalidation tests"
```

---

### Task 5.3: Integration test — 14-day trip

**Objective:** End-to-end manual test of a 14-day Peru trip to verify no timeout.

**Manual test steps:**
1. `npm run dev`
2. Enter: 14 days, Peru, €3000 budget, 2 adults
3. Step 1: Should generate itinerary in <60s
4. Confirm Step 1
5. Step 2: Should search 4-5 stops, each completing in <30s
6. Confirm Step 2
7. Step 3: Should calculate budget instantly
8. Save trip
9. Verify trip appears in saved trips list
10. Reload page → trip loads with correct step data

**Acceptance criteria:**
- No timeout or JSON truncation at any step
- Each step completes within reasonable time
- Save/load works
- Modifying Step 1 clears Steps 2-3

---

## PHASE 6: Cleanup & Deploy (Dou — Orchestrator)

### Task 6.1: Update CLAUDE.md and documentation

**Files:**
- Modify: `CLAUDE.md` — document 3-step architecture, new files, new DB table

### Task 6.2: Old contract.ts backwards compatibility check

**Verify:** Old `saved_trips` data can still be loaded. The old `TravelPlan` type is still importable. No breaking changes.

### Task 6.3: Deploy to Vercel

- Push to GitHub
- Verify Vercel build passes
- Add `saved_trips_v2` table in production Supabase
- Test on production URL

### Task 6.4: Update vagabond-ollama-migration skill

- Update skill to reflect 3-step architecture
- Document new files and their purposes

---

## IMPLEMENTATION ORDER

Tasks should be executed in this sequence:

1. **Task 1.1 → 1.2 → 1.3 → 1.4** (schemas — sequential, dependencies between them)
2. **Task 3.1** (DB — can run in parallel with Phase 2 if SQL is ready)
3. **Task 2.1 → 2.2 → 2.3 → 2.4** (AI services — sequential, Task 2.2 depends on Task 1.1/1.2)
4. **Task 4.2** (StepIndicator — no deps, can start early)
5. **Task 3.2** (storage-v2 — can parallel with Phase 4)
6. **Task 4.1 → 4.3 → 4.4 → 4.5 → 4.6** (frontend — mostly sequential)
7. **Task 5.1 → 5.2** (unit tests — after services + storage)
8. **Task 5.3** (integration test — after all UI wired)
9. **Task 6.1 → 6.4** (cleanup — after everything works)

## PARALLELIZATION OPPORTUNITIES

These task groups can run simultaneously:
- **(Phase 1 + Task 3.1)** — schemas + DB migration
- **(Task 4.2 + Task 3.2)** — StepIndicator + storage-v2 (independent)
- **(Task 5.1 + Task 5.2)** — unit tests (independent)

## RISKS & MITIGATIONS

| Risk | Mitigation |
|------|-----------|
| Step 2 multi-call: one stop fails | Skip failed stop, continue others, add warning. Retry button per-stop |
| GLM-5.1 still truncates Step 1 for long trips | Reduce max_activities_per_day to 3 for trips >10 days. Shorter descriptions |
| Step 2 prompt too complex for GLM | Simplify: ask for less amenities data, shorter reviewSummary |
| Supabase migration fails | Old table untouched. Run migration manually, verify before proceeding |
| Breaking existing saved trips | Old `storage.ts` + `saved_trips` table unchanged. v2 is additive |
| Frontend too complex with 3 steps | StepIndicator gives clear visual progress. Each step has single CTA |

## FILE MAP (new files)

```
src/shared/step1-contract.ts      — ItineraryDraft Zod schema
src/shared/step2-contract.ts      — AccommodationTransport Zod schema
src/shared/step3-contract.ts      — BudgetCalculation Zod schema
src/shared/contract-v2.ts         — TravelPlanV2 composed schema
src/services/step1Service.ts      — generateItinerary() + modifyItinerary()
src/services/step2Service.ts      — searchAccommodationsAndTransport()
src/services/step3Service.ts      — calculateBudget() (pure JS)
src/lib/storage-v2.ts             — 3-step save/load/invalidation
src/components/StepIndicator.tsx  — Visual stepper
src/components/Step1ItineraryView.tsx   — Step 1 UI
src/components/Step2AccommodationView.tsx — Step 2 UI
src/components/Step3BudgetView.tsx      — Step 3 UI
supabase/migrations/add_saved_trips_v2.sql — DB migration
src/__tests__/step3Budget.test.ts — Budget calculation tests
src/__tests__/storageV2.test.ts   — Storage v2 tests
```

## FILES MODIFIED (existing)

```
src/App.tsx              — 3-step state + wiring (major refactor of results section)
supabase/schema.sql      — Append saved_trips_v2 table
```

## FILES UNTOUCHED

```
src/shared/contract.ts   — Old TravelPlan schema (backwards compatible)
src/lib/storage.ts       — Old save functions (backwards compatible)
src/services/travelService.ts — Old generateTravelPlan (kept as legacy)
src/components/ResultsView — Old results view (kept but unused in v2 flow)
supabase — old saved_trips table untouched
```
