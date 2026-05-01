/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Step 3 BudgetView — displays calculated budget breakdown with save/back actions.
 * Part of the Vagabond 3-step architecture.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Euro, Plane, Hotel, MapPin, Utensils, AlertTriangle,
  CheckCircle2, ChevronDown, ArrowLeft, Download, ShieldCheck, Loader2,
} from 'lucide-react';
import { cn } from '../App';
import type { BudgetCalculation } from '../shared/step3-contract';
import type { TravelInputs } from '../shared/contract';

// ─── PROPS ──────────────────────────────────────────────────────────────────

export interface Step3BudgetViewProps {
  data: BudgetCalculation;
  inputs: TravelInputs;
  totalPeople: number;
  totalDays: number;
  onSave: () => void;
  onBack: () => void;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  readOnly?: boolean;
}

// ─── FORMAT HELPERS ──────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `€${amount.toLocaleString('it-IT')}`;
}

// ─── CATEGORY CONFIG ─────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'flights', label: 'Trasporti', icon: Plane, color: 'bg-blue-50 text-blue-600' },
  { key: 'accommodation', label: 'Alloggi', icon: Hotel, color: 'bg-purple-50 text-purple-600' },
  { key: 'activities', label: 'Attività', icon: MapPin, color: 'bg-green-50 text-green-600' },
  { key: 'food', label: 'Cibo', icon: Utensils, color: 'bg-orange-50 text-orange-600' },
  { key: 'misc', label: 'Extra e Imprevisti', icon: Euro, color: 'bg-gray-50 text-gray-600' },
] as const;

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function Step3BudgetView({
  data,
  inputs,
  totalPeople,
  totalDays,
  onSave,
  onBack,
  saveStatus = 'idle',
  readOnly,
}: Step3BudgetViewProps) {
  const [costTableExpanded, setCostTableExpanded] = useState(true);

  const { budgetBreakdown, budgetWarning, costTable } = data;
  const estimatedTotal = budgetBreakdown.totalEstimated;
  const inputBudget = inputs.budget;
  const isOverBudget = estimatedTotal > inputBudget;
  const perPersonPerDay = budgetBreakdown.perPersonPerDay;

  // ── Budget comparison ─────────────────────────────────────────────────────
  const budgetDiff = Math.abs(estimatedTotal - inputBudget);
  const budgetPercent = inputBudget > 0 ? ((estimatedTotal / inputBudget) * 100).toFixed(0) : '—';

  return (
    <div className="min-h-screen bg-brand-paper pb-24">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <h1 className="text-5xl mb-2 flex items-center gap-3">
            <Euro className="w-9 h-9 text-brand-accent" /> Riepilogo Budget
          </h1>
          <p className="text-brand-ink/50 font-sans text-sm">
            Stima dei costi per il viaggio a <strong>{inputs.destination}</strong>
          </p>
        </motion.section>

        {/* BUDGET WARNING / OK BANNER */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-10"
        >
          {isOverBudget ? (
            <div className="bg-red-50 border-2 border-red-200 p-8 rounded-[2rem] flex items-start gap-5 shadow-sm">
              <div className="p-3 bg-red-100 rounded-2xl shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-700" />
              </div>
              <div>
                <h3 className="text-xl font-serif mb-2 text-red-900">Budget superato</h3>
                <p className="text-red-800 leading-relaxed text-sm">
                  La spesa stimata è <strong>{formatCurrency(estimatedTotal)}</strong>, ovvero <strong>{formatCurrency(budgetDiff)}</strong> in più rispetto al tuo budget di <strong>{formatCurrency(inputBudget)}</strong> ({budgetPercent}% del budget).
                </p>
                {budgetWarning && (
                  <p className="text-red-700 text-sm mt-2 italic">{budgetWarning}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border-2 border-emerald-200 p-8 rounded-[2rem] flex items-start gap-5 shadow-sm">
              <div className="p-3 bg-emerald-100 rounded-2xl shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-700" />
              </div>
              <div>
                <h3 className="text-xl font-serif mb-2 text-emerald-900">Nel budget! 🎉</h3>
                <p className="text-emerald-800 leading-relaxed text-sm">
                  La spesa stimata è <strong>{formatCurrency(estimatedTotal)}</strong>, rientra nel tuo budget di <strong>{formatCurrency(inputBudget)}</strong>.
                  {budgetDiff > 0 && (
                    <> Ti rimangono circa <strong>{formatCurrency(budgetDiff)}</strong> di margine.</>
                  )}
                </p>
              </div>
            </div>
          )}
        </motion.section>

        {/* SUMMARY CARDS */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12"
        >
          {/* Total estimated */}
          <div className={cn(
            'p-6 rounded-[2rem] border-2',
            isOverBudget ? 'bg-red-50 border-red-200' : 'bg-white border-brand-ink/5'
          )}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-ink/40 mb-2">
              Totale stimato
            </p>
            <p className={cn('text-4xl font-bold', isOverBudget ? 'text-red-600' : 'text-brand-accent')}>
              {formatCurrency(estimatedTotal)}
            </p>
            <p className="text-xs text-brand-ink/40 mt-1">
              per {totalPeople} {totalPeople === 1 ? 'persona' : 'persone'} · {totalDays} {totalDays === 1 ? 'giorno' : 'giorni'}
            </p>
          </div>

          {/* Your budget */}
          <div className="bg-white p-6 rounded-[2rem] border-2 border-brand-ink/5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-ink/40 mb-2">
              Il tuo budget
            </p>
            <p className="text-4xl font-bold text-brand-ink">{formatCurrency(inputBudget)}</p>
            <p className="text-xs text-brand-ink/40 mt-1">
              {isOverBudget
                ? `+${formatCurrency(budgetDiff)} oltre il budget`
                : `${formatCurrency(budgetDiff)} di margine`
              }
            </p>
          </div>

          {/* Per person per day */}
          <div className="bg-white p-6 rounded-[2rem] border-2 border-brand-ink/5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-ink/40 mb-2">
              Per persona / giorno
            </p>
            {perPersonPerDay ? (
              <>
                <p className="text-4xl font-bold text-brand-ink">{formatCurrency(perPersonPerDay)}</p>
                <p className="text-xs text-brand-ink/40 mt-1">media giornaliera a persona</p>
              </>
            ) : (
              <p className="text-2xl text-brand-ink/40">—</p>
            )}
          </div>
        </motion.section>

        {/* BREAKDOWN */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass p-8 md:p-12 rounded-[2rem] mb-12"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-brand-accent/10 rounded-2xl">
              <Euro className="text-brand-accent w-6 h-6" />
            </div>
            <div>
              <h2 className="text-4xl">Dettaglio costi</h2>
              <p className="text-brand-ink/40 text-sm">Stime basate sui prezzi medi del periodo</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            {CATEGORIES.map(({ key, label, icon: Icon, color }) => {
              const value = budgetBreakdown[key as keyof typeof budgetBreakdown];
              const amount = typeof value === 'number' ? value : 0;
              const bgColor = color.split(' ')[0];
              const textColor = color.split(' ')[1];
              return (
                <div key={key} className={cn('p-5 rounded-2xl text-center', bgColor)}>
                  <Icon className={cn('w-5 h-5 mx-auto mb-2', textColor)} />
                  <p className="text-xs font-bold text-gray-500 mb-1">{label}</p>
                  <p className="text-xl font-bold text-gray-800">
                    {amount > 0 ? formatCurrency(amount) : '—'}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-brand-ink/10">
            <span className="text-2xl font-serif italic text-brand-ink/60">Totale stimato</span>
            <div className="text-right">
              <span className="text-4xl font-bold text-brand-accent">{formatCurrency(estimatedTotal)}</span>
              {perPersonPerDay && (
                <p className="text-xs text-brand-ink/40 mt-1">
                  ≈ {formatCurrency(perPersonPerDay)} / persona / giorno
                </p>
              )}
            </div>
          </div>
        </motion.section>

        {/* DETAILED COST TABLE (expandable) */}
        {costTable && costTable.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-12"
          >
            <button
              type="button"
              onClick={() => setCostTableExpanded(v => !v)}
              className="w-full flex items-center justify-between gap-3 text-left group"
            >
              <h2 className="text-3xl font-serif group-hover:text-brand-accent transition-colors">
                Dettaglio completo
              </h2>
              <div className={cn(
                'w-10 h-10 rounded-full border border-brand-ink/10 flex items-center justify-center transition-all shrink-0',
                costTableExpanded ? 'bg-brand-accent border-brand-accent text-white' : 'hover:border-brand-accent hover:bg-brand-accent/5'
              )}>
                <ChevronDown className={cn('w-5 h-5 transition-transform duration-300', costTableExpanded ? 'rotate-180' : '')} />
              </div>
            </button>

            <AnimatePresence initial={false}>
              {costTableExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="mt-6 space-y-6">
                    {costTable.map((category, catIdx) => {
                      // Determine table structure by category
                      const isTransport = category.category === 'Trasporti';
                      const isAccommodation = category.category === 'Alloggi';
                      const isActivity = category.category === 'Attività';

                      return (
                        <div key={catIdx} className="bg-white rounded-2xl border border-brand-ink/5 overflow-hidden">
                          {/* Category header — bold */}
                          <div className="p-5 border-b border-brand-ink/5 flex items-center justify-between bg-brand-ink/[0.02]">
                            <h3 className="font-bold text-lg text-brand-ink">{category.category}</h3>
                            <span className="font-bold text-brand-accent text-lg">{formatCurrency(category.subtotal)}</span>
                          </div>

                          {/* Table header row */}
                          {isTransport && (
                            <div className="grid grid-cols-[100px_1fr_90px] px-5 py-2 border-b border-brand-ink/5 bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-brand-ink/40">
                              <span>Data</span>
                              <span>Descrizione</span>
                              <span className="text-right">Costo</span>
                            </div>
                          )}
                          {isAccommodation && (
                            <div className="grid grid-cols-[90px_100px_1fr_50px_90px] px-5 py-2 border-b border-brand-ink/5 bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-brand-ink/40">
                              <span>Data arrivo</span>
                              <span>Luogo</span>
                              <span>Alloggio</span>
                              <span className="text-center">Notti</span>
                              <span className="text-right">Costo</span>
                            </div>
                          )}
                          {isActivity && (
                            <div className="grid grid-cols-[90px_80px_1fr_50px_80px] px-5 py-2 border-b border-brand-ink/5 bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-brand-ink/40">
                              <span>Data</span>
                              <span>Luogo</span>
                              <span>Descrizione</span>
                              <span className="text-center">Durata</span>
                              <span className="text-right">Costo</span>
                            </div>
                          )}

                          {/* Table rows */}
                          <div className="divide-y divide-brand-ink/5">
                            {category.items.map((item, itemIdx) => {
                              if (isTransport) {
                                return (
                                  <div key={itemIdx} className="grid grid-cols-[100px_1fr_90px] px-5 py-3 items-center">
                                    <span className="text-xs text-brand-ink/60 font-mono">{item.date || '—'}</span>
                                    <div>
                                      <p className="text-sm text-brand-ink">{item.name}</p>
                                      {item.description && <p className="text-[10px] text-brand-ink/40">{item.description}</p>}
                                    </div>
                                    <span className="text-sm font-medium text-brand-ink/70 text-right">{formatCurrency(item.cost)}</span>
                                  </div>
                                );
                              }
                              if (isAccommodation) {
                                return (
                                  <div key={itemIdx} className="grid grid-cols-[90px_100px_1fr_50px_90px] px-5 py-3 items-center">
                                    <span className="text-xs text-brand-ink/60 font-mono">{item.date || '—'}</span>
                                    <span className="text-xs text-brand-ink/70">{item.location || item.name}</span>
                                    <div>
                                      <p className="text-sm text-brand-ink">{item.hotelName || item.name}</p>
                                      {item.notes && <p className="text-[10px] text-brand-ink/40">{item.notes}</p>}
                                    </div>
                                    <span className="text-xs text-brand-ink/60 text-center">{item.nights ?? '—'}</span>
                                    <span className="text-sm font-medium text-brand-ink/70 text-right">{formatCurrency(item.cost)}</span>
                                  </div>
                                );
                              }
                              if (isActivity) {
                                return (
                                  <div key={itemIdx} className="grid grid-cols-[90px_80px_1fr_50px_80px] px-5 py-3 items-center">
                                    <span className="text-xs text-brand-ink/60 font-mono">{item.date || '—'}</span>
                                    <span className="text-xs text-brand-ink/70">{item.location || '—'}</span>
                                    <p className="text-sm text-brand-ink truncate">{item.description || item.name}</p>
                                    <span className="text-xs text-brand-ink/60 text-center">{item.duration || '—'}</span>
                                    <span className="text-sm font-medium text-brand-ink/70 text-right">{formatCurrency(item.cost)}</span>
                                  </div>
                                );
                              }
                              // Default: Cibo, Extra e Imprevisti
                              return (
                                <div key={itemIdx} className="px-5 py-3 flex items-center justify-between">
                                  <div>
                                    <p className="text-sm text-brand-ink">{item.name}</p>
                                    {item.notes && (
                                      <p className="text-[10px] text-brand-ink/40">{item.notes}</p>
                                    )}
                                  </div>
                                  <span className="text-sm font-medium text-brand-ink/70">{formatCurrency(item.cost)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )}

        {/* BUDGET WARNING (detailed) */}
        {budgetWarning && !isOverBudget && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mb-12"
          >
            <div className="glass p-8 rounded-[2rem]">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-amber-50 rounded-2xl">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <h3 className="text-xl font-serif text-amber-900">Nota sul budget</h3>
              </div>
              <p className="text-amber-800 leading-relaxed">{budgetWarning}</p>
            </div>
          </motion.section>
        )}

        {/* BOTTOM ACTION BAR */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="sticky bottom-0 bg-white/90 backdrop-blur-md border-t border-brand-ink/5 py-4 -mx-6 px-6 -mb-8 z-40"
        >
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2 text-sm text-brand-ink/70 hover:text-brand-ink transition-colors px-4 py-3 rounded-xl hover:bg-brand-ink/5"
            >
              <ArrowLeft className="w-4 h-4" /> {readOnly ? '← Indietro' : 'Torna agli alloggi'}
            </button>
            {readOnly ? (
              <span className="text-sm text-brand-ink/40 italic">Visualizzazione viaggio salvato</span>
            ) : (
              <button
                type="button"
                onClick={onSave}
                disabled={saveStatus === 'saving' || saveStatus === 'saved'}
                className={cn(
                  "flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm shadow-lg transition-all",
                  saveStatus === 'saved'
                    ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                    : saveStatus === 'error'
                      ? 'bg-red-500 text-white shadow-red-500/20'
                      : 'bg-brand-accent text-white shadow-brand-accent/20 hover:bg-brand-accent/90'
                )}
              >
                {saveStatus === 'saved' ? (
                  <><CheckCircle2 className="w-4 h-4" /> Salvato!</>
                ) : saveStatus === 'saving' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Salvataggio...</>
                ) : saveStatus === 'error' ? (
                  <>Errore — riprova</>
                ) : (
                  <><Download className="w-4 h-4" /> Salva viaggio</>
                )}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}