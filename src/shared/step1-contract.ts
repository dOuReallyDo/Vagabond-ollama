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