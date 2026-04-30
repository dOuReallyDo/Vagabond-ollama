import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Trash2, MapPin, Calendar, ChevronRight, ArrowLeft, CheckCircle2, Circle, Euro } from 'lucide-react';
import type { SavedTripV2 } from '../lib/storage-v2';
import { cn } from '../App';

interface SavedTripsV2Props {
  trips: SavedTripV2[];
  onLoad: (trip: SavedTripV2) => void;
  onDelete: (tripId: string) => void;
  onToggleFavorite: (tripId: string, isFavorite: boolean) => void;
  onBack: () => void;
}

export function SavedTripsV2({ trips, onLoad, onDelete, onToggleFavorite, onBack }: SavedTripsV2Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('it-IT', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatBudget = (budget: number) => {
    return `€${budget.toLocaleString('it-IT')}`;
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    try {
      const start = new Date(startDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
      const end = new Date(endDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
      return `${start} → ${end}`;
    } catch {
      return '';
    }
  };

  const getStepBadge = (trip: SavedTripV2) => {
    const steps = [
      { label: 'Itinerario', completed: trip.step1_completed },
      { label: 'Alloggi', completed: trip.step2_completed },
      { label: 'Budget', completed: trip.step3_completed },
    ];
    return steps;
  };

  const getFirstIncompleteStep = (trip: SavedTripV2): 1 | 2 | 3 => {
    if (!trip.step1_completed) return 1;
    if (!trip.step2_completed) return 2;
    return 3;
  };

  // Sort: favorites first, then by updated_at desc
  const sortedTrips = [...trips].sort((a, b) => {
    if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  return (
    <div className="min-h-screen bg-brand-paper p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full border border-brand-ink/10 flex items-center justify-center hover:bg-brand-ink/5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-3xl font-serif">I miei viaggi</h1>
            <p className="text-sm text-brand-ink/50 mt-1">
              {trips.length} {trips.length === 1 ? 'viaggio salvato' : 'viaggi salvati'}
            </p>
          </div>
        </div>

        {trips.length === 0 ? (
          <div className="text-center py-20">
            <MapPin className="w-12 h-12 text-brand-ink/20 mx-auto mb-4" />
            <h3 className="text-xl font-serif mb-2">Nessun viaggio salvato</h3>
            <p className="text-brand-ink/50 text-sm">
              Pianifica il tuo primo viaggio e lo troverai qui!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {sortedTrips.map((trip) => {
                const steps = getStepBadge(trip);
                const destination = trip.inputs?.destination || trip.destination || '';
                const country = trip.inputs?.country || '';
                const budget = trip.inputs?.budget;
                const startDate = trip.inputs?.startDate;
                const endDate = trip.inputs?.endDate;

                return (
                  <motion.div
                    key={trip.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    className={cn(
                      'group relative bg-white rounded-2xl border border-brand-ink/5 p-5 hover:shadow-lg transition-all cursor-pointer',
                      trip.is_favorite && 'ring-2 ring-amber-400/30',
                      trip.is_complete && 'border-green-200'
                    )}
                    onClick={() => onLoad(trip)}
                  >
                    {/* Top: name + actions */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-serif text-lg truncate">{trip.trip_name}</h3>
                          {trip.is_complete && (
                            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> Completo
                            </span>
                          )}
                        </div>
                        {destination && (
                          <p className="text-sm text-brand-ink/50 flex items-center gap-1 mt-1">
                            <MapPin className="w-3 h-3" /> {destination}{country ? `, ${country}` : ''}
                          </p>
                        )}
                        <p className="text-[10px] text-brand-ink/30 mt-2 flex items-center gap-2">
                          <Calendar className="w-3 h-3" /> {formatDate(trip.created_at)}
                          {budget != null && ` · ${formatBudget(budget)}`}
                          {startDate && endDate && ` · ${formatDateRange(startDate, endDate)}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(trip.id, !trip.is_favorite);
                          }}
                          className={cn(
                            'w-9 h-9 rounded-full flex items-center justify-center transition-colors',
                            trip.is_favorite
                              ? 'text-amber-400 bg-amber-50'
                              : 'text-brand-ink/20 hover:text-amber-400 hover:bg-amber-50'
                          )}
                        >
                          <Heart className={cn('w-4 h-4', trip.is_favorite && 'fill-amber-400')} />
                        </button>

                        {deletingId === trip.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(trip.id);
                                setDeletingId(null);
                              }}
                              className="text-xs text-red-500 font-bold px-2 py-1"
                            >
                              Conferma
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingId(null);
                              }}
                              className="text-xs text-brand-ink/40 px-2 py-1"
                            >
                              Annulla
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingId(trip.id);
                            }}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-brand-ink/20 hover:text-red-400 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Step progress badges */}
                    <div className="flex items-center gap-2 mt-3">
                      {steps.map((step, idx) => (
                        <span
                          key={idx}
                          className={cn(
                            'inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full',
                            step.completed
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-gray-100 text-gray-400'
                          )}
                        >
                          {step.completed ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Circle className="w-3 h-3" />
                          )}
                          {step.label}
                        </span>
                      ))}
                    </div>

                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-ink/20 group-hover:text-brand-accent transition-colors" />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}