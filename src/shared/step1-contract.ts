import { z } from "zod";

// Step 1 Output: Itinerary + Destination Overview + Weather + Safety + Inspirations
// NO flights, NO accommodations, NO restaurants, NO budget breakdown

export const ItineraryDraftSchema = z.object({
  budgetWarning: z.string().nullish(),
  destinationOverview: z.object({
    title: z.string(),
    description: z.string(),
    attractions: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        sourceUrl: z.string().nullish(),
        category: z.string().nullish(),
        estimatedVisitTime: z.string().nullish(),
        lat: z.number().nullish(),
        lng: z.number().nullish(),
      })
    ),
    heroImageUrl: z.string().nullish(),
    tagline: z.string().nullish(),
  }),
  weatherInfo: z.object({
    summary: z.string(),
    pros: z.string(),
    cons: z.string(),
    averageTemp: z.string().nullish(),
    packingTips: z.string().nullish(),
  }),
  safetyAndHealth: z.object({
    safetyWarnings: z.string(),
    vaccinationsRequired: z.string(),
    safetyLevel: z.string().nullish(),
    emergencyNumbers: z.string().nullish(),
  }),
  itinerary: z.array(
    z.object({
      day: z.number(),
      title: z.string(),
      theme: z.string().nullish(),
      activities: z.array(
        z.object({
          time: z.string(),
          location: z.string().nullish(),
          name: z.string().nullish(),
          description: z.string(),
          costEstimate: z.number().nullish(),
          sourceUrl: z.string().nullish(),
          imageUrl: z.string().nullish(),
          lat: z.number().nullish(),
          lng: z.number().nullish(),
          duration: z.string().nullish(),
          transport: z.string().nullish(),
          travelTime: z.string().nullish(),
          tips: z.string().nullish(),
        })
      ),
    })
  ),
  localTips: z.array(z.string()).optional(),
  transportInfo: z.object({
    localTransport: z.string().nullish(),
    bestApps: z.array(z.string()).optional(),
    estimatedLocalCost: z.string().nullish(),
    privateTransferLinks: z.array(
      z.object({
        provider: z.string(),
        url: z.string(),
        description: z.string().nullish(),
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
      type: z.string().nullish(),
    })
  ).optional(),
});

export type ItineraryDraft = z.infer<typeof ItineraryDraftSchema>;