/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Step 2 AccommodationTransportView — displays accommodations, restaurants, and flights
 * with per-stop accordion, selectable cards, trip timeline, and confirm/back actions.
 * Part of the Vagabond 3-step architecture.
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Hotel, Utensils, Plane, MapPin, Star, ChevronDown,
  ExternalLink, CheckCircle2, AlertTriangle, Loader2,
  ArrowLeft, ArrowRight, ShieldCheck, Train, Car,
  Check, PlaneTakeoff, PlaneLanding,
} from 'lucide-react';
import { cn } from '../App';
import type { AccommodationTransport, AccommodationStop, RestaurantStop, FlightSegment } from '../shared/step2-contract';
import type { TravelInputs } from '../shared/contract';
import type { ItineraryDraft } from '../shared/step1-contract';
import { isWhitelistedUrl, getBookingSearchUrl, getBookingSearchUrlWithDates, getTripAdvisorSearchUrl, getGoogleSearchUrl, getAirlineSearchUrl } from '../lib/urlSafety';
import { TravelMap } from './TravelMap';

// ─── STAR RATING ────────────────────────────────────────────────────────────

function StarRating({ value }: { value: number }) {
  const normalized = Math.min(5, value > 5 ? value / 2 : value);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn('w-3 h-3', i <= Math.round(normalized) ? 'fill-amber-400 text-amber-400' : 'text-gray-200')}
        />
      ))}
      <span className="text-xs text-gray-500 ml-1">{value}</span>
    </div>
  );
}

// ─── BADGE ──────────────────────────────────────────────────────────────────

function Badge({ children, color = 'default' }: { children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    default: 'bg-brand-ink/5 text-brand-ink/60',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    red: 'bg-red-50 text-red-700',
  };
  return (
    <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md', colors[color] || colors.default)}>
      {children}
    </span>
  );
}

// ─── SKELETON CARD ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-3xl border border-brand-ink/5 p-6 animate-pulse">
      <div className="h-5 bg-brand-ink/10 rounded w-3/4 mb-3" />
      <div className="h-3 bg-brand-ink/10 rounded w-1/2 mb-4" />
      <div className="flex gap-1 mb-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="w-3 h-3 bg-brand-ink/10 rounded-full" />
        ))}
      </div>
      <div className="h-3 bg-brand-ink/10 rounded w-2/3 mb-2" />
      <div className="h-3 bg-brand-ink/10 rounded w-1/3 mb-4" />
      <div className="flex justify-between border-t border-brand-ink/5 pt-4">
        <div className="h-4 bg-brand-ink/10 rounded w-16" />
        <div className="h-8 bg-brand-ink/10 rounded-full w-20" />
      </div>
    </div>
  );
}

// ─── TRIP TIMELINE ───────────────────────────────────────────────────────────

function TripTimeline({ stops, departureCity }: { stops: AccommodationStop[]; departureCity: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-10"
    >
      <div className="glass p-5 rounded-2xl overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {/* Departure city at start */}
          <div className="flex items-center gap-1.5 shrink-0">
            <PlaneTakeoff className="w-4 h-4 text-brand-accent" />
            <span className="text-sm font-bold text-brand-ink">{departureCity}</span>
          </div>

          {stops.map((stop, i) => (
            <React.Fragment key={i}>
              <ArrowRight className="w-4 h-4 text-brand-ink/30 shrink-0" />
              <div className="flex items-center gap-1.5 shrink-0 bg-brand-accent/10 rounded-full px-3 py-1.5">
                <MapPin className="w-3.5 h-3.5 text-brand-accent" />
                <span className="text-sm font-semibold text-brand-ink">{stop.stopName}</span>
                {stop.nights != null && (
                  <span className="text-[10px] font-bold text-brand-accent bg-brand-accent/20 rounded-full px-1.5 py-0.5">
                    {stop.nights} {stop.nights === 1 ? 'notte' : 'notti'}
                  </span>
                )}
              </div>
            </React.Fragment>
          ))}

          {/* Return to departure city */}
          <ArrowRight className="w-4 h-4 text-brand-ink/30 shrink-0" />
          <div className="flex items-center gap-1.5 shrink-0">
            <PlaneLanding className="w-4 h-4 text-brand-ink/50" />
            <span className="text-sm font-bold text-brand-ink/70">{departureCity}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── HOTEL CARD (selectable) ────────────────────────────────────────────────

function HotelCard({
  hotel,
  nights,
  isSelected,
  onSelect,
  stopName,
  checkin,
  checkout,
  adults,
  children,
}: {
  hotel: AccommodationStop['options'][0];
  nights?: number;
  isSelected: boolean;
  onSelect: () => void;
  stopName?: string;
  checkin?: string;
  checkout?: string;
  adults?: number;
  children?: { age: number }[];
}) {
  // Generate real search URLs — AI URLs are often fake/deep links that 404
  // Only trust booking.com/searchresults or tripadvisor /Search?q= URLs from AI.
  // All other AI-generated deep links get replaced with search URLs built from real data.
  const effectiveBookingUrl = (() => {
    // Only trust AI booking.com URL if it's a search page (not a deep /hotel/ link)
    if (hotel.bookingUrl && hotel.bookingUrl.includes('booking.com/searchresults')) return hotel.bookingUrl;
    // Always generate a real Booking.com search URL — it works with real hotel names + dates
    if (hotel.name && stopName && checkin && checkout) {
      return getBookingSearchUrlWithDates(hotel.name, stopName, checkin, checkout, adults || 2, children);
    }
    if (hotel.name && stopName) return getBookingSearchUrl(hotel.name, stopName);
    return hotel.bookingUrl || null;
  })();

  const effectiveOfficialUrl = (() => {
    // Only trust AI tripadvisor URL if it's a search page
    if (hotel.officialUrl && hotel.officialUrl.includes('tripadvisor.it/Search')) return hotel.officialUrl;
    if (hotel.officialUrl && hotel.officialUrl.includes('tripadvisor.com/Search')) return hotel.officialUrl;
    // Fallback: Google search for official site
    if (hotel.name) return getGoogleSearchUrl(`${hotel.name} sito ufficiale`);
    return null;
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onSelect}
      className={cn(
        'group relative bg-white rounded-3xl shadow-sm p-6 hover:shadow-md transition-all duration-300 cursor-pointer',
        isSelected
          ? 'ring-2 ring-brand-accent shadow-md scale-[1.01] border-transparent'
          : 'border border-brand-ink/5'
      )}
    >
      {/* Selected badge */}
      {isSelected && (
        <div className="absolute -top-2 -right-2 z-10 bg-brand-accent text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg">
          <Check className="w-4 h-4" />
        </div>
      )}

      {/* Type + Selected label */}
      <div className="flex items-center gap-2 mb-1">
        <p className="text-[10px] text-brand-ink/40 uppercase tracking-widest">{hotel.type}</p>
        {isSelected && (
          <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md">
            Selezionato
          </span>
        )}
      </div>

      {/* Header: name + stars */}
      <div className="flex justify-between items-start mb-1">
        <h4 className={cn('text-lg font-serif leading-tight pr-2 transition-colors', isSelected ? 'text-brand-accent' : 'group-hover:text-brand-accent')}>
          {hotel.name}
        </h4>
        {hotel.stars && (
          <div className="flex shrink-0">
            {Array.from({ length: hotel.stars }).map((_, k) => (
              <Star key={k} className="w-3 h-3 fill-amber-400 text-amber-400" />
            ))}
          </div>
        )}
      </div>

      {/* Rating */}
      {hotel.rating && <StarRating value={hotel.rating} />}

      {/* Address */}
      {hotel.address && (
        <p className="text-xs text-brand-ink/40 mt-2 flex items-start gap-1">
          <MapPin className="w-3 h-3 shrink-0 mt-0.5" /> {hotel.address}
        </p>
      )}

      {/* Review summary */}
      {hotel.reviewSummary && (
        <p className="text-sm text-brand-ink/60 mt-3 italic leading-relaxed line-clamp-2">
          &ldquo;{hotel.reviewSummary}&rdquo;
        </p>
      )}

      {/* Amenities */}
      {(hotel.amenities || []).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {hotel.amenities!.slice(0, 4).map((a: string, k: number) => (
            <Badge key={k}>{a}</Badge>
          ))}
          {hotel.amenities!.length > 4 && (
            <Badge color="default">+{hotel.amenities!.length - 4}</Badge>
          )}
        </div>
      )}

      {/* Footer: price + booking link */}
      <div className="flex justify-between items-center pt-4 mt-4 border-t border-brand-ink/5">
        <div>
          <span className="text-xs text-brand-ink/40 block">per notte</span>
          <span className={cn('font-bold text-lg', isSelected ? 'text-brand-accent' : '')}>€{hotel.estimatedPricePerNight}</span>
          {nights && nights > 1 && (
            <span className={cn('text-xs ml-1 font-semibold', isSelected ? 'text-brand-accent/80' : 'text-brand-ink/40')}>
              × {nights} = €{hotel.estimatedPricePerNight * nights}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {effectiveOfficialUrl && (
            <a
              href={effectiveOfficialUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-bold uppercase tracking-widest text-brand-ink/60 hover:text-brand-ink flex items-center gap-1"
            >
              Sito ufficiale <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {effectiveBookingUrl && (
            <a
              href={effectiveBookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-bold uppercase tracking-widest text-brand-accent hover:underline flex items-center gap-1"
            >
              Prenota <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── RESTAURANT CARD ────────────────────────────────────────────────────────

function RestaurantCard({ restaurant, stopName }: { restaurant: RestaurantStop['options'][0]; stopName?: string }) {
  // Generate real URL — TripAdvisor Search blocks, use Google instead
  const effectiveUrl = (() => {
    // Only trust AI tripadvisor URL if it's a search page
    if (restaurant.sourceUrl && (restaurant.sourceUrl.includes('tripadvisor.it/Search') || restaurant.sourceUrl.includes('tripadvisor.com/Search'))) return restaurant.sourceUrl;
    // Google search — first result is always TripAdvisor anyway
    if (restaurant.name && stopName) return getGoogleSearchUrl(`${restaurant.name} ${stopName} tripadvisor`);
    if (restaurant.name) return getGoogleSearchUrl(`${restaurant.name} ristorante`);
    return null;
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="group bg-white rounded-3xl shadow-sm border border-brand-ink/5 p-6 hover:shadow-md transition-all duration-300"
    >
      <h4 className="text-lg font-serif mb-0.5 group-hover:text-brand-accent transition-colors">{restaurant.name}</h4>
      <p className="text-[10px] text-brand-ink/40 uppercase tracking-widest mb-3">{restaurant.cuisineType}</p>

      {restaurant.rating && <StarRating value={restaurant.rating} />}

      {restaurant.address && (
        <p className="text-xs text-brand-ink/40 mt-2 flex items-start gap-1">
          <MapPin className="w-3 h-3 shrink-0 mt-0.5" /> {restaurant.address}
        </p>
      )}

      {restaurant.mustTry && (
        <div className="mt-3 bg-orange-50 p-3 rounded-xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600 mb-0.5">Da provare</p>
          <p className="text-xs text-orange-800">{restaurant.mustTry}</p>
        </div>
      )}

      <div className="flex justify-between items-center pt-4 mt-4 border-t border-brand-ink/5">
        <span className="text-xs text-brand-ink/40">Fascia di prezzo</span>
        <span className="font-bold">{restaurant.priceRange}</span>
      </div>

      {effectiveUrl && (
        <a
          href={effectiveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-accent hover:underline"
        >
          <ExternalLink className="w-3 h-3" /> Vedi su TripAdvisor
        </a>
      )}
    </motion.div>
  );
}

// ─── FLIGHT CARD (selectable) ────────────────────────────────────────────────

function FlightCard({
  flight,
  numPeople,
  isSelected,
  onSelect,
}: {
  flight: FlightSegment['options'][0];
  numPeople: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isCarRoute = flight.airline?.toLowerCase().includes('auto privata');
  const routeParts = flight.route?.split(/\s*(?:->|→)\s*/) || [];
  const totalPrice = flight.estimatedPrice * numPeople;

  // For car routes: use the bookingUrl which already has the correct Google Maps link per segment
  // (generated programmatically by generateCarSegments from real itinerary stops)

  const effectiveFlightUrl = (() => {
    // Only trust AI airline URL if it's clearly the homepage (no deep paths)
    if (flight.bookingUrl && isWhitelistedUrl(flight.bookingUrl)) {
      const hostname = new URL(flight.bookingUrl).hostname;
      const pathname = new URL(flight.bookingUrl).pathname;
      // Trust only homepage-level URLs (e.g. ryanair.com, ryanair.com/it)
      if (pathname === '/' || pathname.length <= 4) return flight.bookingUrl;
    }
    // Generate search for airline official site
    if (flight.airline) return getAirlineSearchUrl(flight.airline);
    return flight.bookingUrl || null;
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onSelect}
      className={cn(
        'glass p-7 rounded-3xl hover:shadow-md transition-all group block relative cursor-pointer',
        isSelected
          ? 'ring-2 ring-brand-accent scale-[1.01]'
          : 'border-2 border-transparent'
      )}
    >
      {/* Selected badge */}
      {isSelected && (
        <div className="absolute -top-2 -right-2 z-10 bg-brand-accent text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg">
          <Check className="w-4 h-4" />
        </div>
      )}

      {/* Verified badge */}
      <div className={cn(
        "absolute -top-3 right-10 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-sm flex items-center gap-1",
        flight.verified === false
          ? "bg-amber-100 text-amber-700"
          : "bg-green-100 text-green-700"
      )}>
        {flight.verified === false ? (
          <><AlertTriangle className="w-2.5 h-2.5" /> Indicativo — verifica</>
        ) : (
          <><CheckCircle2 className="w-2.5 h-2.5" /> Verificato</>
        )}
      </div>

      {/* Selected label */}
      {isSelected && (
        <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md">
          Selezionato
        </span>
      )}

      <div className="flex justify-between items-start mb-6 mt-1">
        <div>
          <p className={cn('font-bold text-xl', isSelected ? 'text-brand-accent' : 'text-brand-ink')}>{flight.airline}</p>
          {flight.date && (
            <p className="text-[10px] font-bold text-brand-accent uppercase tracking-widest mt-1">Data: {flight.date}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-brand-ink/40 text-xs font-mono uppercase tracking-wider">{routeParts[0]?.trim()}</span>
            <div className="h-[1px] w-8 bg-brand-ink/10 relative">
              {isCarRoute
                ? <Car className="w-2 h-2 absolute -top-1 left-1/2 -translate-x-1/2 text-brand-ink/20" />
                : <Plane className="w-2 h-2 absolute -top-1 left-1/2 -translate-x-1/2 text-brand-ink/20" />
              }
            </div>
            <span className="text-brand-ink/40 text-xs font-mono uppercase tracking-wider">{routeParts[1]?.trim()}</span>
          </div>
        </div>
        <div className="text-right">
          <p className={cn('text-2xl font-bold', isSelected ? 'text-brand-accent' : 'text-brand-accent')}>€{totalPrice}</p>
          <p className="text-[10px] text-brand-ink/40 font-bold uppercase tracking-tighter">
            Totale per {numPeople} pers.
          </p>
        </div>
      </div>

      {/* Times / Car info */}
      <div className="space-y-3 py-4 border-y border-brand-ink/5 mb-4">
        {isCarRoute ? (
          <div className="space-y-3">
            {flight.distance && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-brand-ink/40 uppercase font-bold">Distanza</span>
                <span className="text-sm font-bold text-brand-ink">{flight.distance}</span>
              </div>
            )}
            {flight.duration && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-brand-ink/40 uppercase font-bold">Tempo di percorrenza</span>
                <span className="text-sm font-bold text-brand-ink">{flight.duration}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-brand-ink/40 uppercase font-bold">Benzina + pedaggi</span>
              <span className="text-sm font-bold text-brand-accent">€{flight.estimatedPrice}</span>
            </div>
          </div>
        ) : (!flight.departureTime && !flight.arrivalTime) ? (
          <div className="flex items-center gap-3 bg-amber-50 rounded-2xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-800">Orari non disponibili in tempo reale</p>
              <p className="text-[11px] text-amber-700 mt-0.5">Verifica gli orari precisi e la disponibilità sul sito della compagnia.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-blue-50 rounded-lg">
                <Plane className="w-3 h-3 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-ink/40">Partenza</p>
                <p className="text-sm font-bold text-brand-ink">{flight.departureTime || '—'}</p>
              </div>
            </div>
            {flight.duration && (
              <div className="text-center">
                <p className="text-[10px] text-brand-ink/40 uppercase font-bold">Durata</p>
                <p className="text-[10px] font-medium text-brand-ink/70">{flight.duration}</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-ink/40">Arrivo</p>
                <p className="text-sm font-bold text-brand-ink">{flight.arrivalTime || '—'}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Link: Google Maps for car, airline site for flights */}
      {isCarRoute ? (
        <a
          href={flight.bookingUrl || `https://www.google.com/maps/dir/${routeParts.map(p => encodeURIComponent(p.trim())).join('/')}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-bold text-brand-accent hover:underline flex items-center gap-1"
        >
          Vedi su Google Maps <ExternalLink className="w-3.5 h-3.5" />
        </a>
      ) : effectiveFlightUrl && (
        <a
          href={effectiveFlightUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-bold text-brand-accent hover:underline flex items-center gap-1"
        >
          Prenota su {flight.airline} <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </motion.div>
  );
}

// ─── RUNNING TOTAL BAR ────────────────────────────────────────────────────────

function RunningTotalBar({
  accommodations,
  flights,
  numPeople,
}: {
  accommodations: AccommodationStop[];
  flights?: FlightSegment[];
  numPeople: number;
}) {
  const accTotal = accommodations.reduce((sum, stop) => {
    const idx = stop.selectedIndex ?? 0;
    const option = stop.options[idx];
    const pricePerNight = option?.estimatedPricePerNight ?? 0;
    const nights = stop.nights ?? 1;
    return sum + pricePerNight * nights;
  }, 0);

  const flightTotal = (flights ?? []).reduce((sum, segment) => {
    const idx = segment.selectedIndex ?? 0;
    const option = segment.options[idx];
    const pricePerPerson = option?.estimatedPrice ?? 0;
    return sum + pricePerPerson * numPeople;
  }, 0);

  return (
    <div className="glass p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Hotel className="w-5 h-5 text-brand-accent" />
          <span className="text-sm text-brand-ink/60">Alloggi selezionati:</span>
          <span className="font-bold text-lg text-brand-ink">€{accTotal}</span>
        </div>
        <div className="hidden sm:block w-px h-6 bg-brand-ink/10" />
        <div className="flex items-center gap-2">
          <Plane className="w-5 h-5 text-brand-accent" />
          <span className="text-sm text-brand-ink/60">Trasporti selezionati:</span>
          <span className="font-bold text-lg text-brand-ink">€{flightTotal}</span>
        </div>
      </div>
      <div className="text-sm text-brand-ink/50 italic">
        Totale: <span className="font-bold text-brand-ink not-italic">€{accTotal + flightTotal}</span>
      </div>
    </div>
  );
}

// ─── PROPS ──────────────────────────────────────────────────────────────────

export interface Step2AccommodationViewProps {
  data: AccommodationTransport;
  inputs: TravelInputs;
  itinerary: ItineraryDraft;
  isLoading: boolean;
  loadingProgress?: string; // e.g. "Ricerca alloggi a Lima... (2/4 tappe)"
  onConfirm: () => void;
  onBack: () => void;
  onAccommodationSelect: (stopIndex: number, optionIndex: number) => void;
  onFlightSelect: (segmentIndex: number, optionIndex: number) => void;
  readOnly?: boolean;
  onNavigateNext?: () => void;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function Step2AccommodationView({
  data,
  inputs,
  itinerary,
  isLoading,
  loadingProgress,
  onConfirm,
  onBack,
  onAccommodationSelect,
  onFlightSelect,
  readOnly,
  onNavigateNext,
}: Step2AccommodationViewProps) {
  const [expandedStops, setExpandedStops] = useState<Record<number, boolean>>({ 0: true });

  const toggleStop = (idx: number) => {
    setExpandedStops(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const numPeople = inputs.people.adults + inputs.people.children.length;

  // Build mapPoints from accommodations for the sticky map
  const mapPoints = useMemo(() => {
    const points: Array<{ lat: number; lng: number; label: string; type?: string }> = [];
    for (const stop of data.accommodations) {
      for (const opt of stop.options) {
        if (opt.lat && opt.lng && opt.lat !== 0 && opt.lng !== 0) {
          points.push({ lat: opt.lat, lng: opt.lng, label: opt.name, type: 'hotel' });
        }
      }
    }
    // Also include itinerary mapPoints if available
    if (itinerary.mapPoints) {
      for (const p of itinerary.mapPoints) {
        if (p.lat && p.lng && p.lat !== 0 && p.lng !== 0) {
          points.push({ lat: p.lat, lng: p.lng, label: p.label, type: (p.type as any) || 'attraction' });
        }
      }
    }
    return points;
  }, [data.accommodations, itinerary.mapPoints]);

  // Calculate check-in/checkout dates per stop from itinerary + trip start date
  // Each stop maps to consecutive days in the itinerary. First stop starts on startDate,
  // each subsequent stop starts after the previous stop's nights.
  const stopDates = useMemo(() => {
    const result: Record<string, { checkin: string; checkout: string }> = {};
    const startDate = new Date(inputs.startDate);
    let dayOffset = 0;
    for (const stop of data.accommodations) {
      const nights = stop.nights ?? 1;
      const checkinDate = new Date(startDate);
      checkinDate.setDate(checkinDate.getDate() + dayOffset);
      const checkoutDate = new Date(checkinDate);
      checkoutDate.setDate(checkoutDate.getDate() + nights);
      result[stop.stopName] = {
        checkin: checkinDate.toISOString().split('T')[0],
        checkout: checkoutDate.toISOString().split('T')[0],
      };
      dayOffset += nights;
    }
    return result;
  }, [data.accommodations, inputs.startDate]);
  const departureCity = inputs.departureCity || 'Città di partenza';

  // ── Loading State ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-paper pb-24">
        <div className="max-w-7xl mx-auto px-6 py-12">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12"
          >
            <h1 className="text-5xl mb-2 flex items-center gap-3">
              <Hotel className="w-9 h-9 text-brand-accent" /> Alloggi & Trasporti
            </h1>
            <p className="text-brand-ink/50 font-sans text-sm">
              Ricercando le migliori opzioni per il tuo viaggio...
            </p>
          </motion.div>

          {/* Progress bar */}
          {loadingProgress && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-8"
            >
              <div className="glass p-6 rounded-2xl flex items-center gap-4">
                <Loader2 className="w-6 h-6 text-brand-accent animate-spin" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-brand-ink">{loadingProgress}</p>
                  <div className="w-full bg-brand-ink/5 h-2 rounded-full overflow-hidden mt-2">
                    <motion.div
                      className="h-full bg-brand-accent rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 30, ease: 'linear' }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Skeleton cards */}
          <div className="space-y-8">
            {[0, 1].map(idx => (
              <div key={idx}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-7 w-7 bg-brand-ink/10 rounded-full animate-pulse" />
                  <div className="h-6 bg-brand-ink/10 rounded w-32 animate-pulse" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Loaded State ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-brand-paper pb-24">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-5xl mb-2 flex items-center gap-3">
            <Hotel className="w-9 h-9 text-brand-accent" /> Alloggi & Trasporti
          </h1>
          <p className="text-brand-ink/50 font-sans text-sm">
            Le strutture selezionate per il tuo pernottamento e i mezzi di trasporto
          </p>
        </motion.section>

        {/* TRIP TIMELINE */}
        <TripTimeline stops={data.accommodations} departureCity={departureCity} />

        {/* RUNNING TOTAL */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-10"
        >
          <RunningTotalBar
            accommodations={data.accommodations}
            flights={data.flights}
            numPeople={numPeople}
          />
        </motion.div>

        {/* MAIN LAYOUT: Content + Sticky Map */}
        <div className="flex gap-8 items-start">
          {/* LEFT: Content */}
          <div className="flex-1 min-w-0">

        {/* FLIGHTS / TRANSPORT SECTION */}
        {data.flights && data.flights.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-16"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-4xl mb-2 flex items-center gap-3">
                  <Plane className="w-7 h-7" /> Mezzo di Trasporto
                </h2>
                <p className="text-brand-ink/50 font-sans text-sm">
                  Seleziona un'opzione per tratta — il prezzo scelto andrà nel budget
                </p>
              </div>
            </div>
            <div className="space-y-12">
              {data.flights.map((segment, segmentIdx) => (
                <div key={segmentIdx}>
                  {segment.segmentName && (
                    <h3 className="text-2xl font-serif mb-6 flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-brand-accent/10 text-brand-accent flex items-center justify-center text-sm font-bold">
                        {segmentIdx + 1}
                      </span>
                      {segment.segmentName}
                    </h3>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {segment.options.map((flight, i) => (
                      <FlightCard
                        key={i}
                        flight={flight}
                        numPeople={numPeople}
                        isSelected={(segment.selectedIndex ?? 0) === i}
                        onSelect={readOnly ? () => {} : () => onFlightSelect(segmentIdx, i)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* ACCOMMODATIONS — Per-stop accordion */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-4">
            <Hotel className="w-7 h-7" />
            <h2 className="text-4xl">Alloggi per tappa</h2>
          </div>
          <p className="text-brand-ink/50 font-sans text-sm mb-8">
            {readOnly
              ? 'Alloggi selezionati per ogni tappa'
              : 'Seleziona un alloggio per ogni tappa — la scelta andrà nel budget finale'
            }
          </p>

          <div className="space-y-6">
            {data.accommodations.map((stop, i) => (
              <div key={i} className="bg-white rounded-[2rem] border border-brand-ink/5 overflow-hidden shadow-sm">
                {/* Accordion header */}
                <button
                  type="button"
                  onClick={() => toggleStop(i)}
                  className="w-full p-6 md:p-8 flex items-center justify-between gap-4 hover:bg-brand-paper/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full bg-brand-accent/10 text-brand-accent flex items-center justify-center text-sm font-bold shrink-0">
                      {i + 1}
                    </span>
                    <div className="text-left">
                      <h3 className="text-xl md:text-2xl font-serif text-brand-accent italic flex items-center gap-2">
                        <MapPin className="w-5 h-5" /> {stop.stopName}
                      </h3>
                      {stop.nights && (
                        <p className="text-xs text-brand-ink/40 mt-0.5">
                          {stop.nights} {stop.nights === 1 ? 'notte' : 'notti'} · {stop.options.length} {stop.options.length === 1 ? 'opzione' : 'opzioni'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className={cn(
                    'w-10 h-10 rounded-full border border-brand-ink/10 flex items-center justify-center transition-all shrink-0',
                    expandedStops[i] ? 'bg-brand-accent border-brand-accent text-white' : 'hover:border-brand-accent hover:bg-brand-accent/5'
                  )}>
                    <ChevronDown className={cn('w-5 h-5 transition-transform duration-300', expandedStops[i] ? 'rotate-180' : '')} />
                  </div>
                </button>

                {/* Accordion body */}
                <AnimatePresence initial={false}>
                  {expandedStops[i] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-8 md:px-8 md:pb-10 border-t border-brand-ink/5 pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                          {stop.options.map((hotel, j) => (
                            <HotelCard
                              key={j}
                              hotel={hotel}
                              nights={stop.nights ?? undefined}
                              isSelected={(stop.selectedIndex ?? 0) === j}
                              onSelect={readOnly ? () => {} : () => onAccommodationSelect(i, j)}
                              stopName={stop.stopName}
                              checkin={stopDates[stop.stopName]?.checkin}
                              checkout={stopDates[stop.stopName]?.checkout}
                              adults={inputs.people.adults}
                              children={inputs.people.children}
                            />
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </motion.section>

        {/* RESTAURANTS — Per-stop */}
        {data.bestRestaurants.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-16"
          >
            <div className="flex items-center gap-3 mb-8">
              <Utensils className="w-7 h-7" />
              <h2 className="text-4xl">Dove mangiare</h2>
            </div>
            <p className="text-brand-ink/50 mb-8 font-sans text-sm">
              Ristoranti locali autentici, selezionati per qualità e genuinità
            </p>
            <div className="space-y-12">
              {data.bestRestaurants.map((stop, i) => (
                <div key={i}>
                  <h3 className="text-2xl mb-6 text-brand-accent italic flex items-center gap-2">
                    <MapPin className="w-5 h-5" /> {stop.stopName}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {stop.options.map((restaurant, j) => (
                      <RestaurantCard key={j} restaurant={restaurant} stopName={stop.stopName} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* END LEFT column */}
          </div>

          {/* RIGHT: Sticky Map */}
          {mapPoints.length > 0 && (
            <div className="hidden lg:block w-96 shrink-0 sticky top-8">
              <div className="rounded-2xl overflow-hidden shadow-lg border border-brand-ink/10">
                <TravelMap
                  points={mapPoints as any}
                  destination={inputs.destination}
                />
              </div>
              {/* Stop name labels under map */}
              <div className="mt-3 space-y-1">
                {data.accommodations.map((stop, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-brand-ink/60">
                    <span className="w-5 h-5 rounded-full bg-brand-accent/10 text-brand-accent flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                    {stop.stopName} · {stop.nights} {stop.nights === 1 ? 'notte' : 'notti'}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM ACTION BAR */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="sticky bottom-0 bg-white/90 backdrop-blur-md border-t border-brand-ink/5 py-4 -mx-6 px-6 -mb-8 z-40"
        >
          {/* Running total */}
          <div className="max-w-3xl mx-auto mb-3">
            <RunningTotalBar
              accommodations={data.accommodations}
              flights={data.flights}
              numPeople={numPeople}
            />
          </div>
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2 text-sm text-brand-ink/70 hover:text-brand-ink transition-colors px-4 py-3 rounded-xl hover:bg-brand-ink/5"
            >
              <ArrowLeft className="w-4 h-4" /> {readOnly ? '← Indietro' : "Torna all'itinerario"}
            </button>
            {readOnly ? (
              onNavigateNext && (
                <button
                  type="button"
                  onClick={onNavigateNext}
                  className="flex items-center gap-2 bg-brand-accent text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-brand-accent/90 transition-colors shadow-lg shadow-brand-accent/20"
                >
                  Avanti →
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={onConfirm}
                className="flex items-center gap-2 bg-brand-accent text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-brand-accent/90 transition-colors shadow-lg shadow-brand-accent/20"
              >
                Conferma alloggi e trasporti <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}