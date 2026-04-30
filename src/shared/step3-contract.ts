import { z } from "zod";

// Step 3 Output: Budget breakdown — computed from Step 1 + Step 2 data, NO AI call

export const BudgetCalculationSchema = z.object({
  budgetBreakdown: z.object({
    flights: z.number(),
    accommodation: z.number(),
    activities: z.number(),
    food: z.number(),
    totalEstimated: z.number(),
    transport: z.number().nullish(),
    misc: z.number().nullish(),
    perPersonPerDay: z.number().nullish(),
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
          notes: z.string().nullish(),
        })
      ),
      subtotal: z.number(),
    })
  ).optional(),
});

export type BudgetCalculation = z.infer<typeof BudgetCalculationSchema>;