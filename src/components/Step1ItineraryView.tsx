/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Step 1 ItineraryView — displays itinerary draft with confirm/modify actions.
 * Part of the Vagabond 3-step architecture.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Sun, ShieldCheck, AlertTriangle, CheckCircle2,
  ExternalLink, Loader2, Lightbulb, Train,
  Clock, Smartphone, Users, MessageSquare, ArrowRight,
} from 'lucide-react';
import { cn } from '../App';
import { TravelMap } from './TravelMap';
import type { ItineraryDraft } from '../shared/step1-contract';
import type { TravelInputs } from '../shared/contract';
import { isWhitelistedUrl, getGoogleSearchUrl } from '../lib/urlSafety';

// ─── IMAGE HELPERS (mirrored from App.tsx) ───────────────────────────────────

const getImageUrl = (item: any, keyword: string, unsplashMap?: Map<string, string>) => {
  const kw = keyword.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (unsplashMap) {
    for (const tryKey of [kw, kw.split(' ').slice(0, 3).join(' '), kw.split(' ').slice(0, 2).join(' ')]) {
      if (unsplashMap.has(tryKey)) {
        return unsplashMap.get(tryKey)!;
      }
    }
  }
  const imageUrl = item?.imageUrl || item?.heroImageUrl;
  if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
    const url = imageUrl.trim();
    const bad = ['google.com/imgres', 'instagram.com', 'pinterest.com', 'flickr.com/photos', 'facebook.com'];
    if (!bad.some((b) => url.includes(b))) return url;
  }
  const seed = kw.replace(/[^a-z0-9]/g, '').trim().slice(0, 60);
  return `https://picsum.photos/seed/${seed}/800/600`;
};

const getUnsplashOnly = (keyword: string, unsplashMap?: Map<string, string>): string | null => {
  if (!unsplashMap) return null;
  const kw = keyword.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  for (const tryKey of [kw, kw.split(' ').slice(0, 3).join(' '), kw.split(' ').slice(0, 2).join(' ')]) {
    if (unsplashMap.has(tryKey)) {
      return unsplashMap.get(tryKey)!;
    }
  }
  return null;
};

// ─── WEATHER ICON HELPER ─────────────────────────────────────────────────────

function getWeatherEmoji(summary: string): string {
  const s = summary.toLowerCase();
  if (s.includes('pioggia') || s.includes('piovoso') || s.includes('rain') || s.includes('bagnato')) return '🌧️';
  if (s.includes('neve') || s.includes('snow') || s.includes('gelido')) return '❄️';
  if (s.includes('nuvoloso') || s.includes('coperto') || s.includes('cloud')) return '☁️';
  if (s.includes('tempesta') || s.includes('temporale') || s.includes('storm')) return '⛈️';
  if (s.includes('vento') || s.includes('ventoso') || s.includes('wind')) return '💨';
  if (s.includes('nebbia') || s.includes('fog')) return '🌫️';
  if (s.includes('sole') || s.includes('soleggiato') || s.includes('sunny') || s.includes('caldo') || s.includes('hot')) return '☀️';
  if (s.includes('mite') || s.includes('mild') || s.includes('piacevole')) return '🌤️';
  if (s.includes('freddo') || s.includes('cold') || s.includes('fresco')) return '🍂';
  return '🌤️';
}

// ─── BADGE ────────────────────────────────────────────────────────────────────

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

// ─── PROPS ─────────────────────────────────────────────────────────────────────

export interface Step1ItineraryViewProps {
  data: ItineraryDraft;
  inputs: TravelInputs;
  isLoading: boolean;
  onConfirm?: () => void;
  onModify?: (request: string) => void;
  unsplashImages?: Map<string, string>;
  readOnly?: boolean;
  onNavigateNext?: () => void;
}

// ─── IMAGE ERROR HANDLER ─────────────────────────────────────────────────────

const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const target = e.target as HTMLImageElement;
  const fallback = target.dataset.fallback;
  if (fallback && target.src !== fallback) {
    target.src = fallback;
  } else {
    target.style.display = 'none';
  }
};

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function Step1ItineraryView({
  data,
  inputs,
  isLoading,
  onConfirm,
  onModify,
  unsplashImages,
  readOnly,
  onNavigateNext,
}: Step1ItineraryViewProps) {
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({ 0: true });
  const [showModifyInput, setShowModifyInput] = useState(false);
  const [modifyText, setModifyText] = useState('');

  const handleModifySubmit = () => {
    if (!modifyText.trim()) return;
    onModify(modifyText.trim());
    setModifyText('');
    setShowModifyInput(false);
  };

  const destination = data.destinationOverview?.title || inputs.destination || '';
  const country = inputs.country || '';

  // Resolve hero image: AI URL → unsplash lookup → picsum fallback
  const heroImageUrl = getImageUrl(
    data.destinationOverview,
    `${destination} ${country} landscape`,
    unsplashImages,
  );

  return (
    <div className="min-h-screen bg-brand-paper pb-32">

      {/* ─── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative h-[50vh] md:h-[60vh] overflow-hidden">
        {heroImageUrl && (
          <img
            src={heroImageUrl}
            alt={destination}
            className="absolute inset-0 w-full h-full object-cover"
            onError={handleImageError}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-brand-paper" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent" />

        <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-16 lg:p-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl"
          >
            {data.destinationOverview?.tagline && (
              <p className="text-white/70 text-sm font-sans uppercase tracking-[0.2em] mb-3">
                {data.destinationOverview.tagline}
              </p>
            )}
            <h1 className="text-6xl md:text-8xl text-white leading-none drop-shadow-lg">
              {destination}
            </h1>
          </motion.div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 pt-0">

        {/* ─── INTRO — descrizione viaggio ────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-10 -mt-10 relative z-10 bg-white rounded-[2rem] shadow-lg p-8 md:p-12"
        >
          <p className="text-xs uppercase tracking-widest text-brand-accent font-bold mb-4">Il tuo itinerario</p>
          <p className="text-2xl md:text-3xl font-serif leading-snug text-brand-ink mb-8">
            {data.destinationOverview?.description}
          </p>

          {/* Travel Highlights */}
          {data.travelHighlights && (
            <>
              {data.travelHighlights.whyChosen && (
                <p className="text-brand-ink/70 leading-relaxed mb-8 text-base md:text-lg">
                  {data.travelHighlights.whyChosen}
                </p>
              )}

              {data.travelHighlights.mainStops?.length > 0 && (
                <div className="mb-8">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-brand-ink/40 mb-4">Le tappe del viaggio</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.travelHighlights.mainStops.map((stop, i) => (
                      <div key={i} className="flex gap-3 bg-brand-ink/3 rounded-2xl p-4">
                        <div className="w-7 h-7 rounded-full bg-brand-accent/10 text-brand-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div>
                          <p className="font-semibold text-brand-ink text-sm mb-0.5">{stop.name}</p>
                          <p className="text-brand-ink/60 text-sm leading-relaxed">{stop.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.travelHighlights.whyUnforgettable && (
                <div className="border-l-4 border-brand-accent pl-5">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-brand-accent mb-2">Perché sarà indimenticabile</p>
                  <p className="font-serif italic text-lg text-brand-ink/80 leading-relaxed">
                    {data.travelHighlights.whyUnforgettable}
                  </p>
                </div>
              )}
            </>
          )}
        </motion.section>

        {/* ─── BUDGET WARNING ──────────────────────────────────────────────── */}
        {data.budgetWarning && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12 bg-amber-50 border-2 border-amber-200 p-8 rounded-[2rem] flex items-start gap-5 shadow-sm"
          >
            <div className="p-3 bg-amber-100 rounded-2xl shrink-0">
              <AlertTriangle className="w-6 h-6 text-amber-700" />
            </div>
            <div>
              <h3 className="text-xl font-serif mb-2 text-amber-900">Nota sul budget</h3>
              <p className="text-amber-800 leading-relaxed">{data.budgetWarning}</p>
            </div>
          </motion.div>
        )}

        {/* ─── ATTRAZIONI ──────────────────────────────────────────────────── */}
        {data.destinationOverview?.attractions?.length > 0 && (
          <section className="mb-20">
            <h2 className="text-5xl mb-2">Da vedere</h2>
            <p className="text-brand-ink/50 mb-8 font-sans text-sm">Le attrazioni imperdibili della destinazione</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {data.destinationOverview.attractions.map((attr, i) => {
                const attrImgUrl = getImageUrl(attr, `${attr.name} ${destination}`, unsplashImages);
                return (
                <motion.a
                  key={i}
                  href={attr.sourceUrl || `https://www.google.com/search?q=${encodeURIComponent(attr.name + ' ' + destination)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="group relative bg-white border border-brand-ink/5 overflow-hidden rounded-3xl shadow-sm block hover:shadow-md transition-shadow"
                >
                  {attrImgUrl && (
                    <div className="h-48 overflow-hidden">
                      <img
                        src={attrImgUrl}
                        alt={attr.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={handleImageError}
                      />
                    </div>
                  )}
                  <div className="flex flex-col h-full p-6">
                    {attr.category && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-brand-ink/40 mb-2">{attr.category}</span>
                    )}
                    <h3 className="text-2xl text-brand-ink mb-2 leading-tight group-hover:text-brand-accent transition-colors">
                      {attr.name}
                    </h3>
                    <p className="text-brand-ink/70 text-sm leading-relaxed flex-grow">{attr.description}</p>
                    {attr.estimatedVisitTime && (
                      <div className="mt-4 flex items-center gap-1.5 text-brand-ink/50 text-xs">
                        <Clock className="w-3 h-3" /> {attr.estimatedVisitTime}
                      </div>
                    )}
                    <div className="mt-4 flex items-center gap-1.5 text-[10px] text-brand-accent font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                      <ExternalLink className="w-3 h-3" /> Scopri di più
                    </div>
                  </div>
                </motion.a>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── METEO + SICUREZZA ───────────────────────────────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-20">
          {/* Meteo */}
          <div className="glass p-8 rounded-[2rem] lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-50 rounded-2xl">
                  <Sun className="text-amber-500 w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-3xl">
                    {getWeatherEmoji(data.weatherInfo?.summary || '')} Meteo e stagione
                  </h2>
                  {data.weatherInfo?.averageTemp && (
                    <p className="text-brand-ink/40 text-sm">{data.weatherInfo.averageTemp} in media</p>
                  )}
                </div>
              </div>
              <a
                href={`https://www.google.com/search?q=site:climaeviaggi.it+${encodeURIComponent(country || destination)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-600 bg-amber-50 px-4 py-2 rounded-full hover:bg-amber-100 transition-colors"
              >
                Clima e Viaggi <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-brand-ink/80 leading-relaxed mb-6">{data.weatherInfo?.summary}</p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-emerald-50 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 block mb-2">Punti di forza</span>
                <p className="text-sm text-emerald-900 leading-relaxed">{data.weatherInfo?.pros}</p>
              </div>
              <div className="bg-amber-50 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 block mb-2">Da tenere a mente</span>
                <p className="text-sm text-amber-900 leading-relaxed">{data.weatherInfo?.cons}</p>
              </div>
            </div>
            {data.weatherInfo?.packingTips && (
              <div className="bg-blue-50 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 block mb-2">Cosa mettere in valigia</span>
                <p className="text-sm text-blue-900 leading-relaxed">{data.weatherInfo.packingTips}</p>
              </div>
            )}
          </div>

          {/* Sicurezza */}
          <div className="glass p-8 rounded-[2rem]">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 rounded-2xl">
                  <ShieldCheck className="text-emerald-600 w-6 h-6" />
                </div>
                <h2 className="text-3xl">Sicurezza</h2>
              </div>
              <a
                href={`https://www.google.com/search?q=site:viaggiaresicuri.it+${encodeURIComponent(country || destination)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-4 py-2 rounded-full hover:bg-emerald-100 transition-colors"
              >
                Viaggiare Sicuri <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            {data.safetyAndHealth?.safetyLevel && (
              <div className="mb-4">
                <Badge color={data.safetyAndHealth.safetyLevel === 'Alto' ? 'green' : data.safetyAndHealth.safetyLevel === 'Basso' ? 'red' : 'amber'}>
                  Livello {data.safetyAndHealth.safetyLevel}
                </Badge>
              </div>
            )}
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-ink/40 mb-1">Avvertenze</p>
                <p className="text-brand-ink/80 leading-relaxed">{data.safetyAndHealth?.safetyWarnings}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-ink/40 mb-1">Vaccinazioni</p>
                <p className="text-brand-ink/80 leading-relaxed">{data.safetyAndHealth?.vaccinationsRequired}</p>
              </div>
              {data.safetyAndHealth?.emergencyNumbers && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-brand-ink/40 mb-1">Numeri utili</p>
                  <p className="text-brand-ink/80 leading-relaxed">{data.safetyAndHealth.emergencyNumbers}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ─── ITINERARIO GIORNALIERO ──────────────────────────────────────── */}
        <section className="mb-20">
          <h2 className="text-5xl mb-2">Il tuo itinerario</h2>
          <p className="text-brand-ink/50 mb-12 font-sans text-sm">Ogni giornata pensata per vivere la destinazione in modo autentico</p>

          {data.mapPoints && data.mapPoints.length > 0 && (
            <div className="mb-12">
              <TravelMap points={data.mapPoints as any} destination={destination} />
            </div>
          )}

          <div className="space-y-6">
            {data.itinerary.map((day, i) => {
              const isExpanded = expandedDays[i];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white rounded-[2rem] border border-brand-ink/5 overflow-hidden shadow-sm hover:shadow-md transition-all"
                >
                  {/* Header cliccabile */}
                  <div
                    onClick={() => setExpandedDays(prev => ({ ...prev, [i]: !prev[i] }))}
                    className="p-6 md:p-8 cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-brand-accent/10 text-brand-accent flex items-center justify-center text-sm font-bold shrink-0">
                          {day.day}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-brand-ink/40">Giorno</span>
                          <h3 className="text-xl md:text-2xl font-serif leading-tight">{day.title}</h3>
                        </div>
                      </div>
                      {day.theme && (
                        <div className="md:ml-4">
                          <Badge color="blue">{day.theme}</Badge>
                        </div>
                      )}
                    </div>
                    <div className={cn(
                      "w-10 h-10 rounded-full border border-brand-ink/10 flex items-center justify-center transition-all group-hover:border-brand-accent group-hover:bg-brand-accent/5",
                      isExpanded && "bg-brand-accent border-brand-accent text-white group-hover:bg-brand-accent group-hover:text-white"
                    )}>
                      {isExpanded ? '−' : '+'}
                    </div>
                  </div>

                  {/* Contenuto espandibile */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-8 md:px-8 md:pb-10 border-t border-brand-ink/5 pt-8">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {day.activities.map((act, j) => {
                              const actText = ((act.name || '') + ' ' + (act.description || '')).toLowerCase();
                              const isGeneric = ['check out', 'checkout', 'check-in', 'check in', 'colazione', 'partenza', 'riposo', 'tempo libero'].some(kw => actText.includes(kw));
                              // Unsplash image for non-generic activities
                              const actImageKey = !isGeneric && act.name && act.name.length > 3
                                ? `${act.name} ${act.location || destination}`
                                : null;
                              const actImgUrl = actImageKey ? getUnsplashOnly(actImageKey, unsplashImages) : null;
                              return (
                                <div
                                  key={j}
                                  className={cn(
                                    "group bg-brand-paper/30 rounded-3xl border p-6 transition-all",
                                    act.name?.toLowerCase().includes('pernottamento')
                                      ? "border-brand-accent/20 bg-brand-accent/5"
                                      : "border-brand-ink/5"
                                  )}
                                >
                                  {/* Layout: thumbnail next to content if image exists */}
                                  <div className={cn(actImgUrl && "flex gap-4")}>
                                    {actImgUrl && (
                                      <div className="shrink-0 w-20 h-20 rounded-2xl overflow-hidden">
                                        <img
                                          src={actImgUrl}
                                          alt={act.name || ''}
                                          className="w-full h-full object-cover"
                                          onError={handleImageError}
                                        />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-mono bg-white px-2 py-0.5 rounded-md text-brand-ink/60 shadow-sm">{act.time}</span>
                                          {act.duration && (
                                            <span className="text-xs text-brand-ink/40 flex items-center gap-1">
                                              <Clock className="w-3 h-3" /> {act.duration}
                                            </span>
                                          )}
                                        </div>
                                        {act.costEstimate !== undefined && !act.name?.toLowerCase().includes('pernottamento') && (
                                          <span className="text-sm font-bold text-brand-accent">
                                            {act.costEstimate === 0 ? null : `€${act.costEstimate}`}
                                          </span>
                                        )}
                                      </div>
                                      {act.name && <h4 className="text-lg font-serif mb-2 leading-tight">{act.name}</h4>}
                                      {act.location && (
                                        <p className="text-xs text-brand-accent mb-2 flex items-center gap-1 font-medium">
                                          <MapPin className="w-3 h-3" /> {act.location}
                                        </p>
                                      )}
                                      <p className="text-brand-ink/70 text-sm leading-relaxed">{act.description}</p>
                                    </div>
                                  </div>

                                  {(act.transport || act.travelTime) && (
                                    <div className="mt-4 pt-4 border-t border-brand-ink/5 flex flex-wrap gap-3">
                                      {act.transport && (
                                        <div className="flex items-center gap-1.5 text-xs text-brand-ink/50">
                                          <Train className="w-3.5 h-3.5" /> {act.transport}
                                        </div>
                                      )}
                                      {act.travelTime && (
                                        <div className="flex items-center gap-1.5 text-xs text-brand-ink/50">
                                          <Clock className="w-3.5 h-3.5" /> {act.travelTime}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {act.tips && (
                                    <div className="mt-3 flex items-start gap-2 bg-amber-50 p-3 rounded-xl">
                                      <Lightbulb className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                      <p className="text-xs text-amber-800 leading-relaxed">{act.tips}</p>
                                    </div>
                                  )}

                                  {!isGeneric && (
                                    <a
                                      href={act.sourceUrl && isWhitelistedUrl(act.sourceUrl) ? act.sourceUrl : getGoogleSearchUrl(`${act.name || ''} ${act.location || destination}`)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-accent hover:underline"
                                    >
                                      <ExternalLink className="w-3 h-3" /> Scopri di più
                                    </a>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ─── FONTI E ISPIRAZIONI ────────────────────────────────────────── */}
        {data.sources && data.sources.length > 0 && (
          <section className="mb-20">
            <h2 className="text-3xl mb-6">Fonti e ispirazioni</h2>
            <p className="text-brand-ink/50 mb-6 font-sans text-sm">Risorse utilizzate per costruire il tuo itinerario</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.sources.map((source, i) => (
                <a
                  key={i}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 bg-white border border-brand-ink/5 rounded-2xl p-4 hover:border-brand-accent/30 hover:shadow-sm transition-all"
                >
                  <div className="shrink-0 w-8 h-8 rounded-xl bg-brand-accent/10 text-brand-accent flex items-center justify-center">
                    <ExternalLink className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-brand-ink group-hover:text-brand-accent transition-colors truncate">{source.title}</p>
                    {source.type && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-brand-ink/40">{source.type}</span>
                    )}
                    <p className="text-xs text-brand-ink/40 truncate mt-0.5">{source.url}</p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ─── CONSIGLI LOCALI + TRASPORTI ─────────────────────────────────── */}
        {(data.localTips?.length > 0 || data.transportInfo) && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-20">
            {data.localTips && data.localTips.length > 0 && (
              <div className="glass p-8 rounded-[2rem]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-yellow-50 rounded-2xl">
                    <Lightbulb className="w-6 h-6 text-yellow-500" />
                  </div>
                  <h2 className="text-3xl">Consigli locali</h2>
                </div>
                <ul className="space-y-4">
                  {data.localTips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-brand-ink/80 text-sm leading-relaxed">{tip}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.transportInfo && (
              <div className="glass p-8 rounded-[2rem]">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-cyan-50 rounded-2xl">
                    <Train className="w-6 h-6 text-cyan-600" />
                  </div>
                  <h2 className="text-3xl">Come muoversi</h2>
                </div>
                <p className="text-brand-ink/80 leading-relaxed mb-6 text-sm">{data.transportInfo.localTransport}</p>
                {data.transportInfo.bestApps && data.transportInfo.bestApps.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-ink/40 mb-3 flex items-center gap-2">
                      <Smartphone className="w-3 h-3" /> App consigliate
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {data.transportInfo.bestApps.map((app, i) => (
                        <Badge key={i} color="blue">{app}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {data.transportInfo.estimatedLocalCost && (
                  <p className="mt-4 text-sm text-brand-ink/60 border-t border-brand-ink/5 pt-4">
                    Costo locale stimato: <strong>{data.transportInfo.estimatedLocalCost}</strong>
                  </p>
                )}
                {data.transportInfo.privateTransferLinks && data.transportInfo.privateTransferLinks.length > 0 && (
                  <div className="mt-6 border-t border-brand-ink/5 pt-6">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-ink/40 mb-3 flex items-center gap-2">
                      <Users className="w-3 h-3" /> Trasferimenti privati
                    </p>
                    <div className="space-y-3">
                      {data.transportInfo.privateTransferLinks.map((link, i) => (
                        <a
                          key={i}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-3 bg-brand-paper rounded-xl hover:bg-brand-ink/5 transition-colors group"
                        >
                          <div>
                            <p className="text-sm font-bold text-brand-ink group-hover:text-brand-accent transition-colors">{link.provider}</p>
                            {link.description && <p className="text-[10px] text-brand-ink/50">{link.description}</p>}
                          </div>
                          <ExternalLink className="w-4 h-4 text-brand-ink/20 group-hover:text-brand-accent transition-colors" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

      </div>

      {/* ─── BOTTOM ACTION BAR ──────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-t border-brand-ink/5 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          {/* Modify input — appears inline when "Modifica" is clicked */}
          {!readOnly && (
          <AnimatePresence>
            {showModifyInput && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden mb-4"
              >
                <div className="bg-brand-paper p-6 rounded-2xl border border-brand-ink/10 shadow-sm">
                  <h3 className="text-lg font-serif mb-3 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-brand-accent" />
                    Modifica l'itinerario
                  </h3>
                  <p className="text-brand-ink/60 text-sm mb-4">
                    Descrivi cosa vuoi cambiare: aggiungere giorni, cambiare destinazioni, attività diverse...
                  </p>
                  <textarea
                    className="w-full bg-white border border-brand-ink/10 rounded-2xl p-4 min-h-[100px] text-sm leading-relaxed focus:ring-2 ring-brand-accent/20 outline-none transition-all resize-none placeholder:text-brand-ink/25"
                    placeholder="Es. Aggiungi un giorno a Roma, sostituisci il museo con un'attività all'aperto..."
                    value={modifyText}
                    onChange={(e) => setModifyText(e.target.value)}
                    disabled={isLoading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && modifyText.trim()) {
                        e.preventDefault();
                        handleModifySubmit();
                      }
                    }}
                  />
                  <div className="mt-4 flex justify-end gap-3">
                    <button
                      onClick={() => { setShowModifyInput(false); setModifyText(''); }}
                      disabled={isLoading}
                      className="px-6 py-3 rounded-2xl font-bold text-brand-ink/60 hover:text-brand-ink border-2 border-brand-ink/10 hover:border-brand-ink/30 transition-all disabled:opacity-50"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={handleModifySubmit}
                      disabled={!modifyText.trim() || isLoading}
                      className="bg-brand-accent text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-brand-accent/85 transition-all disabled:opacity-50 shadow-lg shadow-brand-accent/25"
                    >
                      {isLoading ? (
                        <><Loader2 className="w-5 h-5 animate-spin" /> Aggiornamento...</>
                      ) : (
                        <><ArrowRight className="w-5 h-5" /> Aggiorna</>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          )}

          {/* Action buttons */}
          {readOnly ? (
            <div className="flex justify-end">
              {onNavigateNext && (
                <button
                  onClick={onNavigateNext}
                  className="flex items-center justify-center gap-2 bg-brand-accent text-white px-8 py-4 rounded-2xl font-bold hover:bg-brand-accent/85 transition-all shadow-lg shadow-brand-accent/25"
                >
                  Avanti →
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <button
                onClick={() => setShowModifyInput(!showModifyInput)}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-bold border-2 border-brand-ink/10 text-brand-ink/70 hover:border-brand-accent hover:text-brand-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✏️ Modifica itinerario
              </button>
              <button
                onClick={onConfirm}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 bg-brand-accent text-white px-8 py-4 rounded-2xl font-bold hover:bg-brand-accent/85 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-accent/25"
              >
                {isLoading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Elaborazione...</>
                ) : (
                  '✓ Conferma itinerario'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}