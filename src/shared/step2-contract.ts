import { z } from "zod";

// Step 2 Output: Accommodations + Restaurants + Flights/Transport
// Requires an ItineraryDraft as input to know which stops to search

// One stop's accommodation search result
export const AccommodationStopSchema = z.object({
  stopName: z.string(),
  nights: z.number().nullish(),
  selectedIndex: z.number().optional().default(0),
  options: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      rating: z.number().nullish(),
      reviewSummary: z.string().nullish(),
      estimatedPricePerNight: z.number(),
      bookingUrl: z.string().nullish(),
      officialUrl: z.string().nullish(),
      imageUrl: z.string().nullish(),
      lat: z.number().nullish(),
      lng: z.number().nullish(),
      address: z.string().nullish(),
      amenities: z.array(z.string()).optional(),
      stars: z.number().nullish(),
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
      rating: z.number().nullish(),
      reviewSummary: z.string().nullish(),
      sourceUrl: z.string().nullish(),
      priceRange: z.string(),
      imageUrl: z.string().nullish(),
      lat: z.number().nullish(),
      lng: z.number().nullish(),
      address: z.string().nullish(),
      mustTry: z.string().nullish(),
    })
  ),
});

export type RestaurantStop = z.infer<typeof RestaurantStopSchema>;

// Flight segment
export const FlightSegmentSchema = z.object({
  segmentName: z.string(),
  selectedIndex: z.number().optional().default(0),
  options: z.array(
    z.object({
      airline: z.string(),
      route: z.string(),
      estimatedPrice: z.number(),
      date: z.string().nullish(),
      departureTime: z.string().nullish(),
      arrivalTime: z.string().nullish(),
      duration: z.string().nullish(),
      distance: z.string().nullish(),
      bookingUrl: z.string().nullish(),
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