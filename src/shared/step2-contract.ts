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