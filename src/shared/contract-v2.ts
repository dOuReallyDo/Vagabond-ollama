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