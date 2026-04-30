# Agent Team & Workflow — Vagabond-Ollama

## 3-Step Architecture (Apr 2026)

The app uses a sequential 3-step flow instead of a monolithic AI call:

1. **Step 1 — Itinerary** (`step1Service.ts`): Single AI call, focused prompt, 8k tokens max
2. **Step 2 — Accommodations + Transport** (`step2Service.ts`): 1 AI call per stop + 1 for flights, 4k/2k tokens
3. **Step 3 — Budget** (`step3Service.ts`): Pure JS calculation, no AI

Each step has its own Zod schema (`step1-contract.ts`, `step2-contract.ts`, `step3-contract.ts`) and saves independently to `saved_trips_v2`.

**Modification rule**: Only Step 1 is modifiable. Modifying Step 1 invalidates Steps 2-3.

## Lead Agent role
Tech Lead + Product Engineer: break down work, propose alternatives, enforce quality gates.

## Optional agents
- **Backend**: API proxy, security, tools
- **Frontend**: 3-step UI components (StepIndicator, Step1View, Step2View, Step3View)
- **QA**: tests, checklists, release gates
- **Security**: URL Safety layer (whitelist + sanitization + Safe Browsing API integration)

## Workflow (mandatory)
Every task output includes:
- what changes
- file paths
- how to test
- risks
- rollback plan

Never proceed to next milestone without "LOCK" summary.

## Key Files for New Agents

| File | Purpose |
|------|---------|
| `src/shared/step1-contract.ts` | ItineraryDraft Zod schema |
| `src/shared/step2-contract.ts` | AccommodationTransport Zod schema |
| `src/shared/step3-contract.ts` | BudgetCalculation Zod schema |
| `src/shared/contract-v2.ts` | TravelPlanV2 composed schema + ActiveStep type |
| `src/shared/contract.ts` | Legacy TravelPlan schema (v1, untouched) |
| `src/services/step1Service.ts` | generateItinerary() + modifyItinerary() |
| `src/services/step2Service.ts` | searchAccommodationsAndTransport() |
| `src/services/step3Service.ts` | calculateBudget() (pure JS) |
| `src/services/travelService.ts` | Legacy generateTravelPlan() (monolitico) |
| `src/lib/storage-v2.ts` | 3-step save/load/invalidation (Supabase REST) |
| `src/lib/storage.ts` | Legacy save/load (v1) |
| `src/components/StepIndicator.tsx` | 3-step visual stepper |
| `src/components/Step1ItineraryView.tsx` | Step 1 UI |
| `src/components/Step2AccommodationView.tsx` | Step 2 UI |
| `src/components/Step3BudgetView.tsx` | Step 3 UI |
| `supabase/migrations/add_saved_trips_v2.sql` | DB migration for v2 table |