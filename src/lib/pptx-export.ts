import PptxGenJS from 'pptxgenjs';
import type { TravelInputs } from '../shared/contract';
import type { ItineraryDraft } from '../shared/step1-contract';
import type { AccommodationTransport } from '../shared/step2-contract';
import type { BudgetCalculation } from '../shared/step3-contract';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  accent: '5A5A40',
  accentLight: '8B8B6A',
  paper: 'FDFCF9',
  ink: '1A1A1A',
  inkMuted: '6B6B6B',
  inkLight: '999999',
  white: 'FFFFFF',
  green: '4A7A4A',
  blue: '3A6EA5',
  amber: 'B8860B',
  warmBg: 'F5F4F0',
  warmBg2: 'FAF9F5',
  greenBg: 'F0F5F0',
  blueBg: 'F0F7FF',
  amberBg: 'FFF8F0',
  sectionLine: 'E8E6DF',
};

const FONT_SERIF = 'Georgia';
const FONT_SANS = 'Calibri';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return d; }
}
function fmtPrice(n: number): string { return `€${n.toLocaleString('it-IT')}`; }
function fmtShortDate(d: string): string {
  try { return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }); }
  catch { return d; }
}

const typeEmoji: Record<string, string> = {
  city: '🏙️', beach: '🏖️', nature: '🌿', port: '⚓', museum: '🏛️',
  monument: '🏛️', mountain: '⛰️', lake: '🏞️',
};
function emojiForType(t?: string): string { return typeEmoji[t || ''] || '📍'; }

// ─── Slide masters ───────────────────────────────────────────────────────────
function addMasters(pres: PptxGenJS) {
  pres.defineSlideMaster({
    title: 'COVER',
    background: { color: C.paper },
  });
  pres.defineSlideMaster({
    title: 'CONTENT',
    background: { color: C.paper },
  });
  pres.defineSlideMaster({
    title: 'SECTION',
    background: { color: C.accent },
  });
}

// ─── Main export function ────────────────────────────────────────────────────
export async function exportTripToPPTX(
  inputs: TravelInputs,
  step1Data: ItineraryDraft,
  step2Data: AccommodationTransport,
  step3Data: BudgetCalculation,
): Promise<void> {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9';
  pres.author = 'Vagabond';
  pres.title = `${inputs.destination} — Itinerario di viaggio`;

  addMasters(pres);

  const { destinationOverview, weatherInfo, safetyAndHealth, itinerary, localTips, transportInfo, travelHighlights, mapPoints, sources } = step1Data;
  const { accommodations, bestRestaurants, flights } = step2Data;
  const { budgetBreakdown, costTable, budgetWarning } = step3Data;

  const dayCount = Math.round((new Date(inputs.endDate).getTime() - new Date(inputs.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const totalPeople = inputs.people.adults + inputs.people.children.length;
  const destTitle = destinationOverview?.title || inputs.destination;

  // ── SLIDE 1: COVER ──────────────────────────────────────────────────────
  {
    const slide = pres.addSlide({ masterName: 'COVER' });
    // Hero image or gradient placeholder
    if (destinationOverview?.heroImageUrl) {
      slide.addImage({ path: destinationOverview.heroImageUrl, x: 0, y: 0, w: '100%', h: '100%', sizing: { type: 'cover', w: 10, h: 5.625 } });
      // Dark overlay for text readability
      slide.addShape('rect', { x: 0, y: 0, w: '100%', h: '100%', fill: { color: '000000', transparency: 55 } });
    } else {
      slide.addShape('rect', { x: 0, y: 0, w: '100%', h: '100%', fill: { color: C.accent } });
    }
    slide.addText(destTitle, { x: 0.8, y: 1.4, w: 8.4, h: 1.6, fontSize: 44, fontFace: FONT_SERIF, color: C.white, bold: true });
    if (destinationOverview?.tagline) {
      slide.addText(destinationOverview.tagline, { x: 0.8, y: 3.0, w: 8.4, h: 0.6, fontSize: 18, fontFace: FONT_SERIF, color: C.white, italic: true });
    }
    // Summary bar
    const summaryItems = [
      `📍 ${inputs.destination}${inputs.country ? ', ' + inputs.country : ''}`,
      `📅 ${fmtShortDate(inputs.startDate)} → ${fmtShortDate(inputs.endDate)}`,
      `👥 ${totalPeople} persone`,
      `💰 Budget: ${fmtPrice(inputs.budget)}`,
    ];
    if (inputs.departureCity) summaryItems.push(`✈️ Da: ${inputs.departureCity}`);
    slide.addText(summaryItems.join('   ·   '), { x: 0.8, y: 4.2, w: 8.4, h: 0.5, fontSize: 13, fontFace: FONT_SANS, color: C.white, align: 'left' });
    slide.addText('Generato da Vagabond', { x: 0.8, y: 4.9, w: 8.4, h: 0.3, fontSize: 10, fontFace: FONT_SANS, color: C.white, transparency: 50 });
  }

  // ── SLIDE 2: OVERVIEW + WEATHER + SAFETY ───────────────────────────────
  {
    const slide = pres.addSlide({ masterName: 'CONTENT' });
    // Section header
    slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });
    slide.addText('Panoramica', { x: 0.6, y: 0.3, w: 9, h: 0.6, fontSize: 28, fontFace: FONT_SERIF, color: C.accent, bold: true });

    let yPos = 1.1;

    // Overview description
    if (destinationOverview?.description) {
      slide.addText(destinationOverview.description, { x: 0.6, y: yPos, w: 9, h: 0.9, fontSize: 14, fontFace: FONT_SANS, color: C.ink, lineSpacingMultiple: 1.3, valign: 'top' });
      yPos += 1.0;
    }

    // Weather + Safety side by side
    const leftX = 0.6, colW = 4.2, gap = 0.4;
    const rightX = leftX + colW + gap;

    if (weatherInfo) {
      slide.addShape('roundRect', { x: leftX, y: yPos, w: colW, h: 1.8, fill: { color: C.blueBg }, rectRadius: 0.1 });
      slide.addText('🌤️ Meteo', { x: leftX + 0.2, y: yPos + 0.1, w: colW - 0.4, h: 0.35, fontSize: 14, fontFace: FONT_SERIF, color: C.blue, bold: true });
      const weatherLines: any[] = [
        { text: weatherInfo.summary, options: { fontSize: 12, color: C.ink, breakLine: true } },
      ];
      if (weatherInfo.averageTemp) weatherLines.push({ text: `Temperatura media: ${weatherInfo.averageTemp}`, options: { fontSize: 11, color: C.inkMuted, breakLine: true } });
      if (weatherInfo.packingTips) weatherLines.push({ text: `🧳 ${weatherInfo.packingTips}`, options: { fontSize: 11, color: C.inkMuted } });
      slide.addText(weatherLines, { x: leftX + 0.2, y: yPos + 0.45, w: colW - 0.4, h: 1.2 });
    }

    if (safetyAndHealth) {
      slide.addShape('roundRect', { x: rightX, y: yPos, w: colW, h: 1.8, fill: { color: C.amberBg }, rectRadius: 0.1 });
      slide.addText('🛡️ Sicurezza', { x: rightX + 0.2, y: yPos + 0.1, w: colW - 0.4, h: 0.35, fontSize: 14, fontFace: FONT_SERIF, color: C.amber, bold: true });
      const safetyLines: any[] = [];
      if (safetyAndHealth.safetyLevel) safetyLines.push({ text: `Livello sicurezza: ${safetyAndHealth.safetyLevel}`, options: { fontSize: 11, color: C.ink, breakLine: true } });
      if (safetyAndHealth.safetyWarnings) safetyLines.push({ text: safetyAndHealth.safetyWarnings, options: { fontSize: 11, color: C.inkMuted, breakLine: true } });
      if (safetyAndHealth.emergencyNumbers) safetyLines.push({ text: `📞 ${safetyAndHealth.emergencyNumbers}`, options: { fontSize: 11, color: C.inkMuted } });
      if (safetyLines.length) slide.addText(safetyLines, { x: rightX + 0.2, y: yPos + 0.45, w: colW - 0.4, h: 1.2 });
    }
  }

  // ── SLIDE 3: ATTRACTIONS + MAP ─────────────────────────────────────────
  if (destinationOverview?.attractions && destinationOverview.attractions.length > 0) {
    const slide = pres.addSlide({ masterName: 'CONTENT' });
    slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });
    slide.addText('🎯 Attrazioni principali', { x: 0.6, y: 0.3, w: 9, h: 0.6, fontSize: 28, fontFace: FONT_SERIF, color: C.accent, bold: true });

    const cols = Math.min(destinationOverview.attractions.length, 3);
    const colW = (9 - 0.4 * (cols - 1)) / cols;
    destinationOverview.attractions.slice(0, 6).forEach((attr, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 0.6 + col * (colW + 0.4);
      const y = 1.1 + row * 2.0;
      slide.addShape('roundRect', { x, y, w: colW, h: 1.7, fill: { color: C.warmBg }, rectRadius: 0.1 });
      slide.addText(attr.name, { x: x + 0.15, y: y + 0.1, w: colW - 0.3, h: 0.35, fontSize: 14, fontFace: FONT_SANS, color: C.ink, bold: true });
      const sub: any[] = [];
      if (attr.estimatedVisitTime) sub.push({ text: `⏱ ${attr.estimatedVisitTime}`, options: { fontSize: 10, color: C.inkLight, breakLine: true } });
      sub.push({ text: attr.description, options: { fontSize: 11, color: C.inkMuted } });
      slide.addText(sub, { x: x + 0.15, y: y + 0.45, w: colW - 0.3, h: 1.1 });
    });

    // Map points summary
    if (mapPoints && mapPoints.length > 0) {
      const mapText = mapPoints.map(p => `${emojiForType(p.type)} ${p.label}`).join('   ·   ');
      const slide2 = pres.addSlide({ masterName: 'CONTENT' });
      slide2.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });
      slide2.addText('📍 Tappe del viaggio', { x: 0.6, y: 0.3, w: 9, h: 0.6, fontSize: 28, fontFace: FONT_SERIF, color: C.accent, bold: true });
      // Show map points as cards
      mapPoints.forEach((p, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = 0.6 + col * 2.3;
        const y = 1.1 + row * 1.0;
        if (y < 4.5) {
          slide2.addShape('roundRect', { x, y, w: 2.1, h: 0.8, fill: { color: C.warmBg }, rectRadius: 0.08 });
          slide2.addText(`${emojiForType(p.type)} ${p.label}`, { x: x + 0.1, y: y + 0.05, w: 1.9, h: 0.7, fontSize: 12, fontFace: FONT_SANS, color: C.ink, valign: 'middle' });
        }
      });
    }
  }

  // ── ITINERARY SLIDES (1 or 2 days per slide) ───────────────────────────
  if (itinerary && itinerary.length > 0) {
    // Section divider
    {
      const slide = pres.addSlide({ masterName: 'SECTION' });
      slide.addText('📋 Itinerario', { x: 0.8, y: 1.5, w: 8.4, h: 1.2, fontSize: 40, fontFace: FONT_SERIF, color: C.white, bold: true });
      slide.addText(`${dayCount} giorn${dayCount === 1 ? 'o' : 'i'} · ${inputs.destination}`, { x: 0.8, y: 2.7, w: 8.4, h: 0.6, fontSize: 18, fontFace: FONT_SANS, color: C.white });
    }

    // Days: 1-2 per slide
    const daysPerSlide = Math.max(1, itinerary.length <= 4 ? 2 : (itinerary.length <= 8 ? 2 : 3));
    for (let i = 0; i < itinerary.length; i += daysPerSlide) {
      const daysChunk = itinerary.slice(i, i + daysPerSlide);
      const slide = pres.addSlide({ masterName: 'CONTENT' });
      slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });

      if (daysChunk.length === 1) {
        const day = daysChunk[0];
        slide.addText(`Giorno ${day.day}: ${day.title}`, { x: 0.6, y: 0.25, w: 9, h: 0.55, fontSize: 22, fontFace: FONT_SERIF, color: C.accent, bold: true });
        if (day.theme) slide.addText(day.theme, { x: 0.6, y: 0.75, w: 9, h: 0.3, fontSize: 12, fontFace: FONT_SANS, color: C.inkLight, italic: true });
        let actY = day.theme ? 1.1 : 1.0;
        (day.activities || []).forEach((act, ai) => {
          if (actY > 4.8) return; // overflow guard
          // Activity card
          slide.addShape('roundRect', { x: 0.6, y: actY, w: 8.8, h: 0.75, fill: { color: ai % 2 === 0 ? C.warmBg2 : C.white }, rectRadius: 0.08 });
          const timeStr = act.time ? `  ${act.time}  ` : '';
          const locStr = act.location ? ` 📍${act.location}` : '';
          const durStr = act.duration ? ` ⏱${act.duration}` : '';
          const costStr = act.costEstimate != null ? `  ${fmtPrice(act.costEstimate)}` : '';
          const title = `${timeStr}${act.name || 'Attività'}${locStr}${durStr}${costStr}`;
          slide.addText(title, { x: 0.8, y: actY + 0.02, w: 8.4, h: 0.32, fontSize: 12, fontFace: FONT_SANS, color: C.ink, bold: true });
          if (act.description) slide.addText(act.description, { x: 0.8, y: actY + 0.32, w: 8.4, h: 0.35, fontSize: 10, fontFace: FONT_SANS, color: C.inkMuted, valign: 'top' });
          actY += 0.82;
        });
      } else {
        // 2 days side by side
        const halfW = 4.3;
        daysChunk.forEach((day, di) => {
          const xBase = 0.6 + di * (halfW + 0.4);
          slide.addText(`G${day.day}: ${day.title}`, { x: xBase, y: 0.25, w: halfW, h: 0.5, fontSize: 16, fontFace: FONT_SERIF, color: C.accent, bold: true });
          if (day.theme) slide.addText(day.theme, { x: xBase, y: 0.7, w: halfW, h: 0.25, fontSize: 10, fontFace: FONT_SANS, color: C.inkLight, italic: true });
          let actY = 1.0;
          (day.activities || []).slice(0, 6).forEach((act, ai) => {
            if (actY > 4.8) return;
            slide.addShape('roundRect', { x: xBase, y: actY, w: halfW, h: 0.62, fill: { color: ai % 2 === 0 ? C.warmBg2 : C.white }, rectRadius: 0.06 });
            const timeStr = act.time ? `${act.time} ` : '';
            const costStr = act.costEstimate != null ? ` · ${fmtPrice(act.costEstimate)}` : '';
            slide.addText(`${timeStr}${act.name || act.location || 'Attività'}${costStr}`, { x: xBase + 0.1, y: actY + 0.02, w: halfW - 0.2, h: 0.28, fontSize: 10, fontFace: FONT_SANS, bold: true, color: C.ink });
            slide.addText(act.description || '', { x: xBase + 0.1, y: actY + 0.28, w: halfW - 0.2, h: 0.3, fontSize: 9, fontFace: FONT_SANS, color: C.inkMuted, valign: 'top' });
            actY += 0.67;
          });
        });
      }
    }
  }

  // ── ACCOMMODATIONS ─────────────────────────────────────────────────────
  if (accommodations && accommodations.length > 0) {
    {
      const slide = pres.addSlide({ masterName: 'SECTION' });
      slide.addText('🏨 Alloggi', { x: 0.8, y: 1.5, w: 8.4, h: 1.2, fontSize: 40, fontFace: FONT_SERIF, color: C.white, bold: true });
      slide.addText(`${accommodations.length} ${accommodations.length === 1 ? 'tappa' : 'tappe'}`, { x: 0.8, y: 2.7, w: 8.4, h: 0.6, fontSize: 18, fontFace: FONT_SANS, color: C.white });
    }

    accommodations.forEach((stop) => {
      const slide = pres.addSlide({ masterName: 'CONTENT' });
      slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });
      slide.addText(`${stop.stopName} · ${stop.nights} ${stop.nights === 1 ? 'notte' : 'notti'}`, { x: 0.6, y: 0.25, w: 9, h: 0.55, fontSize: 22, fontFace: FONT_SERIF, color: C.accent, bold: true });

      let y = 1.0;
      (stop.options || []).forEach((opt, oi) => {
        if (y > 4.6) return;
        const isSelected = oi === (stop.selectedIndex ?? 0);
        const bgColor = isSelected ? C.warmBg : C.white;
        const borderColor = isSelected ? C.accent : C.sectionLine;
        slide.addShape('rect', { x: 0.6, y, w: 0.06, h: 1.15, fill: { color: borderColor } });
        slide.addShape('roundRect', { x: 0.7, y, w: 8.7, h: 1.15, fill: { color: bgColor }, rectRadius: 0.06 });

        const starStr = opt.stars ? '⭐'.repeat(Math.min(opt.stars, 5)) + ' ' : '';
        const selTag = isSelected ? '  ✓ Selezionato' : '';
        slide.addText(`${starStr}${opt.name}  (${opt.type})${selTag}`, { x: 0.9, y: y + 0.05, w: 8.3, h: 0.32, fontSize: 13, fontFace: FONT_SANS, color: C.ink, bold: isSelected });
        if (opt.address) slide.addText(`📍 ${opt.address}`, { x: 0.9, y: y + 0.35, w: 4, h: 0.25, fontSize: 10, fontFace: FONT_SANS, color: C.inkLight });

        const ratingStr = opt.rating ? `⭐ ${opt.rating}` : '';
        const amenStr = opt.amenities ? opt.amenities.slice(0, 4).join(' · ') : '';
        slide.addText(`${fmtPrice(opt.estimatedPricePerNight)}/notte   ·   ${ratingStr}${amenStr ? '   ·   ' + amenStr : ''}`, { x: 0.9, y: y + 0.6, w: 8.3, h: 0.28, fontSize: 10, fontFace: FONT_SANS, color: C.inkMuted });
        if (opt.reviewSummary) slide.addText(`"${opt.reviewSummary}"`, { x: 0.9, y: y + 0.85, w: 8.3, h: 0.25, fontSize: 10, fontFace: FONT_SANS, color: C.inkMuted, italic: true });

        y += 1.25;
      });
    });
  }

  // ── RESTAURANTS ─────────────────────────────────────────────────────────
  if (bestRestaurants && bestRestaurants.length > 0) {
    const slide = pres.addSlide({ masterName: 'CONTENT' });
    slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });
    slide.addText('🍽️ Ristoranti consigliati', { x: 0.6, y: 0.3, w: 9, h: 0.55, fontSize: 28, fontFace: FONT_SERIF, color: C.accent, bold: true });

    let y = 1.0;
    bestRestaurants.forEach((stop) => {
      if (y > 4.8) return;
      slide.addText(stop.stopName, { x: 0.6, y, w: 9, h: 0.3, fontSize: 14, fontFace: FONT_SANS, color: C.accent, bold: true });
      y += 0.35;
      (stop.options || []).slice(0, 3).forEach((r) => {
        if (y > 4.8) return;
        slide.addText(`${r.name}  ·  ${r.cuisineType}${r.priceRange ? ' · ' + r.priceRange : ''}${r.rating ? ' · ⭐' + r.rating : ''}${r.mustTry ? ' · 🍽 ' + r.mustTry : ''}`, { x: 0.8, y, w: 8.6, h: 0.28, fontSize: 11, fontFace: FONT_SANS, color: C.ink });
        y += 0.32;
      });
      y += 0.15;
    });
  }

  // ── TRANSPORT ──────────────────────────────────────────────────────────
  if (flights && flights.length > 0) {
    const slide = pres.addSlide({ masterName: 'CONTENT' });
    slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });
    slide.addText('✈️ Trasporti', { x: 0.6, y: 0.3, w: 9, h: 0.55, fontSize: 28, fontFace: FONT_SERIF, color: C.accent, bold: true });

    let y = 1.0;
    flights.forEach((seg) => {
      if (y > 4.6) return;
      slide.addText(seg.segmentName, { x: 0.6, y, w: 9, h: 0.35, fontSize: 16, fontFace: FONT_SERIF, color: C.ink, bold: true });
      y += 0.45;
      (seg.options || []).forEach((opt, oi) => {
        if (y > 4.6) return;
        const isSelected = oi === (seg.selectedIndex ?? 0);
        const bgCol = isSelected ? C.warmBg : C.white;
        slide.addShape('roundRect', { x: 0.6, y, w: 8.8, h: 0.55, fill: { color: bgCol }, rectRadius: 0.06 });
        const selTag = isSelected ? '  ✓' : '';
        const timeStr = opt.departureTime && opt.arrivalTime ? `${opt.departureTime}→${opt.arrivalTime}  ` : '';
        const durStr = opt.duration ? `⏱${opt.duration}  ` : '';
        slide.addText(`${opt.airline}  ·  ${opt.route}  ·  ${timeStr}${durStr}${fmtPrice(opt.estimatedPrice)}${selTag}`, { x: 0.8, y: y + 0.05, w: 8.4, h: 0.45, fontSize: 12, fontFace: FONT_SANS, color: C.ink, bold: isSelected, valign: 'middle' });
        y += 0.6;
      });
      y += 0.1;
    });

    // Local transport info
    if (transportInfo?.localTransport) {
      if (y < 4.5) {
        slide.addShape('roundRect', { x: 0.6, y, w: 8.8, h: 0.7, fill: { color: C.greenBg }, rectRadius: 0.08 });
        slide.addText('🚌 Trasporti locali', { x: 0.8, y: y + 0.05, w: 8.4, h: 0.25, fontSize: 12, fontFace: FONT_SANS, color: C.green, bold: true });
        const localLines: any[] = [{ text: transportInfo.localTransport, options: { fontSize: 10, color: C.inkMuted, breakLine: !!transportInfo.estimatedLocalCost } }];
        if (transportInfo.estimatedLocalCost) localLines.push({ text: `💰 ${transportInfo.estimatedLocalCost}`, options: { fontSize: 10, color: C.inkMuted } });
        slide.addText(localLines, { x: 0.8, y: y + 0.3, w: 8.4, h: 0.35 });
      }
    }
  }

  // ── BUDGET ─────────────────────────────────────────────────────────────
  {
    const slide = pres.addSlide({ masterName: 'SECTION' });
    slide.addText('💰 Budget stimato', { x: 0.8, y: 1.5, w: 8.4, h: 1.2, fontSize: 40, fontFace: FONT_SERIF, color: C.white, bold: true });
    slide.addText(`${fmtPrice(budgetBreakdown.totalEstimated)} in totale`, { x: 0.8, y: 2.7, w: 8.4, h: 0.6, fontSize: 18, fontFace: FONT_SANS, color: C.white });
  }

  {
    const slide = pres.addSlide({ masterName: 'CONTENT' });
    slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });
    slide.addText('💰 Budget dettagliato', { x: 0.6, y: 0.25, w: 9, h: 0.55, fontSize: 28, fontFace: FONT_SERIF, color: C.accent, bold: true });

    // Category summary cards
    const categories = [
      { label: '✈️ Trasporti', value: budgetBreakdown.flights, bg: C.greenBg },
      { label: '🏨 Alloggi', value: budgetBreakdown.accommodation, bg: C.warmBg },
      { label: '🎯 Attività', value: budgetBreakdown.activities, bg: C.blueBg },
      { label: '🍽️ Cibo', value: budgetBreakdown.food, bg: C.amberBg },
      { label: '📦 Extra', value: budgetBreakdown.misc || 0, bg: C.warmBg2 },
    ].filter(c => c.value > 0);

    const cardW = Math.min(1.8, 9 / categories.length);
    categories.forEach((cat, i) => {
      const x = 0.6 + i * (cardW + 0.2);
      slide.addShape('roundRect', { x, y: 1.0, w: cardW, h: 1.3, fill: { color: cat.bg }, rectRadius: 0.1 });
      slide.addText(cat.label, { x: x + 0.1, y: 1.05, w: cardW - 0.2, h: 0.3, fontSize: 10, fontFace: FONT_SANS, color: C.inkMuted, align: 'center' });
      slide.addText(fmtPrice(cat.value), { x: x + 0.1, y: 1.35, w: cardW - 0.2, h: 0.7, fontSize: 22, fontFace: FONT_SERIF, color: C.accent, bold: true, align: 'center' });
    });

    // Total card
    const totalX = 0.6 + categories.length * (cardW + 0.2);
    if (totalX + cardW <= 9.5) {
      slide.addShape('rect', { x: totalX, y: 1.0, w: cardW, h: 1.3, fill: { color: C.accent }, rectRadius: 0.1 });
      slide.addText('TOTALE', { x: totalX + 0.1, y: 1.05, w: cardW - 0.2, h: 0.3, fontSize: 10, fontFace: FONT_SANS, color: C.white, align: 'center' });
      slide.addText(fmtPrice(budgetBreakdown.totalEstimated), { x: totalX + 0.1, y: 1.35, w: cardW - 0.2, h: 0.7, fontSize: 24, fontFace: FONT_SERIF, color: C.white, bold: true, align: 'center' });
    }

    if (budgetBreakdown.perPersonPerDay) {
      slide.addText(`≈ ${fmtPrice(budgetBreakdown.perPersonPerDay)}/persona/giorno`, { x: 0.6, y: 2.4, w: 9, h: 0.3, fontSize: 12, fontFace: FONT_SANS, color: C.inkLight, align: 'center' });
    }

    if (budgetWarning) {
      slide.addShape('roundRect', { x: 0.6, y: 2.8, w: 8.8, h: 0.5, fill: { color: C.amberBg }, rectRadius: 0.08 });
      slide.addText(`⚠️ ${budgetWarning}`, { x: 0.8, y: 2.85, w: 8.4, h: 0.4, fontSize: 11, fontFace: FONT_SANS, color: C.amber });
    }

    // Cost detail table
    if (costTable && costTable.length > 0) {
      let y = 3.5;
      costTable.forEach((cat) => {
        if (y > 5.0) return;
        slide.addShape('rect', { x: 0.6, y, w: 8.8, h: 0.32, fill: { color: C.warmBg } });
        slide.addText(cat.category, { x: 0.7, y, w: 5, h: 0.32, fontSize: 11, fontFace: FONT_SANS, color: C.accent, bold: true, valign: 'middle' });
        slide.addText(fmtPrice(cat.subtotal), { x: 7.5, y, w: 1.8, h: 0.32, fontSize: 11, fontFace: FONT_SANS, color: C.accent, bold: true, align: 'right', valign: 'middle' });
        y += 0.35;
        (cat.items || []).slice(0, 5).forEach((item) => {
          if (y > 5.0) return;
          const dateStr = item.date ? fmtShortDate(item.date) + ' ' : '';
          const locStr = item.location ? `📍${item.location} ` : '';
          slide.addText(`${dateStr}${locStr}${item.name}`, { x: 0.8, y, w: 6, h: 0.26, fontSize: 9, fontFace: FONT_SANS, color: C.inkMuted, valign: 'middle' });
          slide.addText(fmtPrice(item.cost), { x: 7.5, y, w: 1.8, h: 0.26, fontSize: 9, fontFace: FONT_SANS, color: C.ink, align: 'right', valign: 'middle' });
          y += 0.27;
        });
        y += 0.1;
      });
    }
  }

  // ── TIPS & HIGHLIGHTS ──────────────────────────────────────────────────
  if ((localTips && localTips.length > 0) || travelHighlights) {
    const slide = pres.addSlide({ masterName: 'CONTENT' });
    slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });
    slide.addText('💡 Consigli e spunti', { x: 0.6, y: 0.3, w: 9, h: 0.55, fontSize: 28, fontFace: FONT_SERIF, color: C.accent, bold: true });

    let y = 1.0;
    if (travelHighlights) {
      if (travelHighlights.whyChosen) {
        slide.addText(travelHighlights.whyChosen, { x: 0.6, y, w: 9, h: 0.6, fontSize: 12, fontFace: FONT_SANS, color: C.ink, lineSpacingMultiple: 1.3 });
        y += 0.7;
      }
      if (travelHighlights.mainStops && travelHighlights.mainStops.length > 0) {
        travelHighlights.mainStops.slice(0, 4).forEach((s) => {
          if (y > 4.5) return;
          slide.addText(`${s.name} — ${s.reason}`, { x: 0.6, y, w: 9, h: 0.28, fontSize: 11, fontFace: FONT_SANS, color: C.inkMuted });
          y += 0.32;
        });
        y += 0.15;
      }
    }

    if (localTips && localTips.length > 0) {
      slide.addShape('roundRect', { x: 0.6, y, w: 8.8, h: Math.min(localTips.length * 0.35 + 0.4, 2.5), fill: { color: C.warmBg2 }, rectRadius: 0.1 });
      slide.addText('Consigli locali', { x: 0.8, y: y + 0.05, w: 8.4, h: 0.3, fontSize: 14, fontFace: FONT_SERIF, color: C.accent, bold: true });
      const tipLines = localTips.slice(0, 7).map((tip, i) => ({
        text: tip,
        options: { bullet: true, breakLine: i < Math.min(localTips.length, 7) - 1, fontSize: 11, color: C.inkMuted },
      }));
      slide.addText(tipLines, { x: 0.8, y: y + 0.35, w: 8.4, h: Math.min(localTips.length * 0.3 + 0.1, 2.0) });
    }
  }

  // ── SOURCES ────────────────────────────────────────────────────────────
  if (sources && sources.length > 0) {
    const slide = pres.addSlide({ masterName: 'CONTENT' });
    slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });
    slide.addText('📚 Fonti e ispirazioni', { x: 0.6, y: 0.3, w: 9, h: 0.55, fontSize: 28, fontFace: FONT_SERIF, color: C.accent, bold: true });

    const srcLines = sources.slice(0, 12).map((s, i) => ({
      text: `${s.type}: ${s.title}`,
      options: { bullet: true, breakLine: i < Math.min(sources.length, 12) - 1, fontSize: 11, color: C.inkMuted },
    }));
    slide.addText(srcLines, { x: 0.6, y: 1.0, w: 8.8, h: 3.5 });

    // Footer
    slide.addText(`Generato da Vagabond · ${fmtDate(new Date().toISOString())}`, { x: 0.6, y: 4.9, w: 8.8, h: 0.3, fontSize: 10, fontFace: FONT_SANS, color: C.inkLight, align: 'center' });
  }

  // ── Write file ─────────────────────────────────────────────────────────
  const destination = inputs.destination || 'Viaggio';
  const startDate = inputs.startDate || new Date().toISOString().slice(0, 10);
  const fileName = `${destination.replace(/[^a-zA-Z0-9àèéìòù]/g, '_')}_${startDate}.pptx`;
  await pres.writeFile({ fileName });
}