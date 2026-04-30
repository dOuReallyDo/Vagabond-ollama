/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Step 2 AccommodationTransportView — displays accommodations, restaurants, and flights
 * with per-stop accordion and confirm/back actions.
 * Part of the Vagabond 3-step architecture.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Hotel, Utensils, Plane, MapPin, Star, ChevronDown,
  ExternalLink, CheckCircle2, AlertTriangle, Loader2,
  ArrowLeft, ArrowRight, ShieldCheck, Train, Car,
} from 'lucide-react';
import { cn } from '../App';
import type { AccommodationTransport, AccommodationStop, RestaurantStop, FlightSegment } from '../shared/step2-contract';
import type { TravelInputs } from '../shared/contract';

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

// ─── HOTEL CARD ─────────────────────────────────────────────────────────────

function HotelCard({ hotel, nights }: { hotel: AccommodationStop['options'][0]; nights?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="group bg-white rounded-3xl shadow-sm border border-brand-ink/5 p-6 hover:shadow-md transition-all duration-300"
    >
      {/* Header: name + stars */}
      <div className="flex justify-between items-start mb-1">
        <h4 className="text-lg font-serif leading-tight group-hover:text-brand-accent transition-colors pr-2">
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

      {/* Type */}
      <p className="text-[10px] text-brand-ink/40 uppercase tracking-widest mb-3">{hotel.type}</p>

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
          <span className="font-bold text-lg">€{hotel.estimatedPricePerNight}</span>
          {nights && nights > 1 && (
            <span className="text-xs text-brand-ink/40 ml-1">
              × {nights} = €{hotel.estimatedPricePerNight * nights}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hotel.officialUrl && (
            <a
              href={hotel.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold uppercase tracking-widest text-brand-ink/60 hover:text-brand-ink flex items-center gap-1"
            >
              Sito ufficiale <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {hotel.bookingUrl && (
            <a
              href={hotel.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
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

function RestaurantCard({ restaurant }: { restaurant: RestaurantStop['options'][0] }) {
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
    </motion.div>
  );
}

// ─── FLIGHT CARD ────────────────────────────────────────────────────────────

function FlightCard({ flight, numPeople }: { flight: FlightSegment['options'][0]; numPeople: number }) {
  const isCarRoute = flight.airline?.toLowerCase() === 'auto privata';
  const routeParts = flight.route?.split(/\s*(?:->|→)\s*/) || [];
  const totalPrice = flight.estimatedPrice * numPeople;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-7 rounded-3xl hover:shadow-md transition-all group block relative border-2 border-transparent"
    >
      {/* Verified badge */}
      <div className={cn(
        "absolute -top-3 right-6 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-sm flex items-center gap-1",
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

      <div className="flex justify-between items-start mb-6">
        <div>
          <p className="font-bold text-xl text-brand-ink">{flight.airline}</p>
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
          <p className="text-2xl font-bold text-brand-accent">€{totalPrice}</p>
          <p className="text-[10px] text-brand-ink/40 font-bold uppercase tracking-tighter">
            Totale per {numPeople} pers.
          </p>
        </div>
      </div>

      {/* Times */}
      <div className="space-y-3 py-4 border-y border-brand-ink/5 mb-4">
        {(!flight.departureTime && !flight.arrivalTime) ? (
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
                {isCarRoute
                  ? <Car className="w-3 h-3 text-blue-600" />
                  : <Plane className="w-3 h-3 text-blue-600" />
                }
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

      {flight.bookingUrl && (
        <a
          href={flight.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-bold text-brand-accent hover:underline flex items-center gap-1"
        >
          Prenota su {flight.airline} <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </motion.div>
  );
}

// ─── PROPS ──────────────────────────────────────────────────────────────────

export interface Step2AccommodationViewProps {
  data: AccommodationTransport;
  inputs: TravelInputs;
  isLoading: boolean;
  loadingProgress?: string; // e.g. "Ricerca alloggi a Lima... (2/4 tappe)"
  onConfirm: () => void;
  onBack: () => void;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function Step2AccommodationView({
  data,
  inputs,
  isLoading,
  loadingProgress,
  onConfirm,
  onBack,
}: Step2AccommodationViewProps) {
  const [expandedStops, setExpandedStops] = useState<Record<number, boolean>>({ 0: true });

  const toggleStop = (idx: number) => {
    setExpandedStops(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const numPeople = inputs.people.adults + inputs.people.children.length;

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
          className="mb-12"
        >
          <h1 className="text-5xl mb-2 flex items-center gap-3">
            <Hotel className="w-9 h-9 text-brand-accent" /> Alloggi & Trasporti
          </h1>
          <p className="text-brand-ink/50 font-sans text-sm">
            Le strutture selezionate per il tuo pernottamento e i mezzi di trasporto
          </p>
        </motion.section>

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
                  Prezzi indicativi — verifica disponibilità e orari sui siti ufficiali
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
                      <FlightCard key={i} flight={flight} numPeople={numPeople} />
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
          <div className="flex items-center gap-3 mb-8">
            <Hotel className="w-7 h-7" />
            <h2 className="text-4xl">Alloggi per tappa</h2>
          </div>

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
                            <HotelCard key={j} hotel={hotel} nights={stop.nights} />
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
                      <RestaurantCard key={j} restaurant={restaurant} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* BOTTOM ACTION BAR */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="sticky bottom-0 bg-white/90 backdrop-blur-md border-t border-brand-ink/5 py-4 -mx-6 px-6 -mb-8 z-40"
        >
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2 text-sm text-brand-ink/70 hover:text-brand-ink transition-colors px-4 py-3 rounded-xl hover:bg-brand-ink/5"
            >
              <ArrowLeft className="w-4 h-4" /> Torna all'itinerario
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex items-center gap-2 bg-brand-accent text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-brand-accent/90 transition-colors shadow-lg shadow-brand-accent/20"
            >
              Conferma alloggi e trasporti <CheckCircle2 className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}