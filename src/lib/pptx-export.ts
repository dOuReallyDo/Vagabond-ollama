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

// Safe image add — catches URL errors gracefully
// ─── Image pre-fetch (URL → base64 for browser pptxgenjs) ──────────────────────
const imageCache = new Map<string, string>();

async function prefetchImages(urls: string[]): Promise<void> {
  const unique = [...new Set(urls.filter(u => u && !imageCache.has(u)))];
  // Fetch in parallel (batches of 5 to avoid overwhelming)
  const batchSize = 5;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(async (url) => {
      try {
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) return;
        const blob = await resp.blob();
        const b64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        });
        if (b64) imageCache.set(url, b64);
      } catch { /* skip */ }
    }));
  }
}

function getImgData(url: string): string | null {
  return imageCache.get(url) || null;
}

function safeImage(slide: PptxGenJS.Slide, opts: PptxGenJS.ImageProps) {
  // If path is a URL, convert to base64 data URI (browser pptxgenjs can't fetch URLs)
  const resolvedOpts = { ...opts };
  if (resolvedOpts.path && !resolvedOpts.path.startsWith('data:')) {
    const data = getImgData(resolvedOpts.path);
    if (data) {
      delete (resolvedOpts as any).path;
      resolvedOpts.data = data;
    } else {
      return; // image not fetched — skip silently
    }
  }
  try { slide.addImage(resolvedOpts); } catch { /* skip broken images */ }
}

// ─── Slide masters ───────────────────────────────────────────────────────────
function addMasters(pres: PptxGenJS) {
  pres.defineSlideMaster({ title: 'COVER', background: { color: C.paper } });
  pres.defineSlideMaster({ title: 'CONTENT', background: { color: C.paper } });
  pres.defineSlideMaster({ title: 'SECTION', background: { color: C.accent } });
}

// ─── Unsplash lookup (same logic as App.tsx getImageUrl / getUnsplashOnly) ────
function lookupUnsplash(keyword: string, unsplashMap?: Map<string, string>): string | null {
  if (!unsplashMap) return null;
  const kw = keyword.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  for (const tryKey of [kw, kw.split(' ').slice(0, 3).join(' '), kw.split(' ').slice(0, 2).join(' ')]) {
    if (unsplashMap.has(tryKey)) return unsplashMap.get(tryKey)!;
  }
  return null;
}

// ─── Main export function ────────────────────────────────────────────────────
export async function exportTripToPPTX(
  inputs: TravelInputs,
  step1Data: ItineraryDraft,
  step2Data: AccommodationTransport,
  step3Data: BudgetCalculation,
  unsplashImages?: Map<string, string>,
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

  // ── Pre-fetch all images → base64 (browser pptxgenjs needs data URIs) ───
  const allImageUrls: string[] = [];
  const dest = destinationOverview?.title || inputs.destination || 'travel';

  // Hero image: AI-provided + Unsplash fallback
  const heroUnsplash = lookupUnsplash(`${dest} ${inputs.country || ''} landscape`.trim(), unsplashImages);
  if (destinationOverview?.heroImageUrl) allImageUrls.push(destinationOverview.heroImageUrl);
  if (heroUnsplash) allImageUrls.push(heroUnsplash);

  // Attractions: Unsplash images (no imageUrl in schema, only sourceUrl)
  if (destinationOverview?.attractions) {
    destinationOverview.attractions.forEach(attr => {
      const attrUnsplash = lookupUnsplash(`${attr.name} ${dest}`, unsplashImages);
      if (attrUnsplash) allImageUrls.push(attrUnsplash);
    });
  }

  // Itinerary activities: AI imageUrl + Unsplash fallback
  const GENERIC = ['check out', 'checkout', 'check-in', 'check in', 'checkin', 'colazione', 'partenza', 'riposo', 'tempo libero', 'notte in', 'pernottamento'];
  if (itinerary) itinerary.forEach(d => (d.activities || []).forEach(a => {
    if (a.imageUrl) allImageUrls.push(a.imageUrl!);
    const text = ((a.name || '') + ' ' + (a.description || '')).toLowerCase();
    if (!GENERIC.some(kw => text.includes(kw)) && a.name && a.name.length > 3) {
      const loc = a.location || dest;
      const actUnsplash = lookupUnsplash(`${a.name} ${loc}`, unsplashImages);
      if (actUnsplash) allImageUrls.push(actUnsplash);
    }
  }));

  // Map points / stops: Unsplash images
  if (mapPoints) {
    mapPoints.forEach(p => {
      const mpUnsplash = lookupUnsplash(`${p.label} ${dest}`, unsplashImages);
      if (mpUnsplash) allImageUrls.push(mpUnsplash);
    });
  }

  // Accommodations & restaurants: AI-provided images only (no Unsplash for these)
  if (accommodations) accommodations.forEach(s => (s.options || []).forEach(o => { if (o.imageUrl) allImageUrls.push(o.imageUrl!); }));
  if (bestRestaurants) bestRestaurants.forEach(s => (s.options || []).forEach(r => { if (r.imageUrl) allImageUrls.push(r.imageUrl!); }));
  imageCache.clear();
  await prefetchImages(allImageUrls);

  // ── SLIDE 1: COVER ──────────────────────────────────────────────────────
  {
    const slide = pres.addSlide({ masterName: 'COVER' });
    // Use AI hero image if available, else Unsplash, else solid bg
    const coverImg = destinationOverview?.heroImageUrl || heroUnsplash;
    if (coverImg) {
      safeImage(slide, { path: coverImg, x: 0, y: 0, w: '100%', h: '100%', sizing: { type: 'cover', w: 10, h: 5.625 } });
      slide.addShape('rect', { x: 0, y: 0, w: '100%', h: '100%', fill: { color: '000000', transparency: 55 } });
    } else {
      slide.addShape('rect', { x: 0, y: 0, w: '100%', h: '100%', fill: { color: C.accent } });
    }
    slide.addText(destTitle, { x: 0.8, y: 1.4, w: 8.4, h: 1.6, fontSize: 44, fontFace: FONT_SERIF, color: C.white, bold: true });
    if (destinationOverview?.tagline) {
      slide.addText(destinationOverview.tagline, { x: 0.8, y: 3.0, w: 8.4, h: 0.6, fontSize: 18, fontFace: FONT_SERIF, color: C.white, italic: true });
    }
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
    slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });
    slide.addText('Panoramica', { x: 0.6, y: 0.3, w: 9, h: 0.6, fontSize: 28, fontFace: FONT_SERIF, color: C.accent, bold: true });

    let yPos = 1.1;
    if (destinationOverview?.description) {
      slide.addText(destinationOverview.description, { x: 0.6, y: yPos, w: 9, h: 0.9, fontSize: 14, fontFace: FONT_SANS, color: C.ink, lineSpacingMultiple: 1.3, valign: 'top' });
      yPos += 1.0;
    }

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
      const y = 1.1 + row * 2.2;

      // Attraction image from Unsplash — placed ABOVE the card
      const attrImgUrl = lookupUnsplash(`${attr.name} ${dest}`, unsplashImages);
      const imgH = 0.9; // image height
      if (attrImgUrl) {
        safeImage(slide, { path: attrImgUrl, x, y, w: colW, h: imgH, sizing: { type: 'cover', w: colW, h: imgH }, rounding: true });
      }

      // Text card below the image (or at top if no image)
      const cardY = attrImgUrl ? y + imgH + 0.05 : y;
      const cardH = attrImgUrl ? 1.0 : 1.5;
      slide.addShape('roundRect', { x, y: cardY, w: colW, h: cardH, fill: { color: C.warmBg }, rectRadius: 0.1 });

      slide.addText(attr.name, { x: x + 0.15, y: cardY + 0.1, w: colW - 0.3, h: 0.3, fontSize: 13, fontFace: FONT_SANS, color: C.ink, bold: true });
      const sub: any[] = [];
      if (attr.estimatedVisitTime) sub.push({ text: `⏱ ${attr.estimatedVisitTime}`, options: { fontSize: 10, color: C.inkLight, breakLine: true } });
      sub.push({ text: attr.description, options: { fontSize: 10, color: C.inkMuted } });
      slide.addText(sub, { x: x + 0.15, y: cardY + 0.4, w: colW - 0.3, h: cardH - 0.5 });
    });

    // Map points summary
    if (mapPoints && mapPoints.length > 0) {
      const slide2 = pres.addSlide({ masterName: 'CONTENT' });
      slide2.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });
      slide2.addText('📍 Tappe del viaggio', { x: 0.6, y: 0.3, w: 9, h: 0.6, fontSize: 28, fontFace: FONT_SERIF, color: C.accent, bold: true });
      mapPoints.forEach((p, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = 0.6 + col * 2.3;
        const y = 1.1 + row * 1.8;
        if (y < 3.6) {
          const mpImgUrl = lookupUnsplash(`${p.label} ${dest}`, unsplashImages);
          // Label pill at top
          slide2.addShape('roundRect', { x, y, w: 2.1, h: 0.5, fill: { color: C.warmBg }, rectRadius: 0.08 });
          slide2.addText(`${emojiForType(p.type)} ${p.label}`, { x: x + 0.1, y: y + 0.05, w: 1.9, h: 0.4, fontSize: 11, fontFace: FONT_SANS, color: C.ink, bold: true, valign: 'middle' });
          // Image below the label
          if (mpImgUrl) {
            safeImage(slide2, { path: mpImgUrl, x, y: y + 0.55, w: 2.1, h: 0.95, sizing: { type: 'cover', w: 2.1, h: 0.95 }, rounding: true });
          }
        }
      });
    }
  }

  // ── ITINERARY SLIDES ────────────────────────────────────────────────────
  if (itinerary && itinerary.length > 0) {
    {
      const slide = pres.addSlide({ masterName: 'SECTION' });
      slide.addText('📋 Itinerario', { x: 0.8, y: 1.5, w: 8.4, h: 1.2, fontSize: 40, fontFace: FONT_SERIF, color: C.white, bold: true });
      slide.addText(`${dayCount} giorn${dayCount === 1 ? 'o' : 'i'} · ${inputs.destination}`, { x: 0.8, y: 2.7, w: 8.4, h: 0.6, fontSize: 18, fontFace: FONT_SANS, color: C.white });
    }

    for (const day of itinerary) {
      // Each day gets its own slide with full activity details
      const slide = pres.addSlide({ masterName: 'CONTENT' });
      slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });
      slide.addText(`Giorno ${day.day}: ${day.title}`, { x: 0.6, y: 0.25, w: 9, h: 0.55, fontSize: 22, fontFace: FONT_SERIF, color: C.accent, bold: true });
      if (day.theme) slide.addText(day.theme, { x: 0.6, y: 0.75, w: 9, h: 0.3, fontSize: 12, fontFace: FONT_SANS, color: C.inkLight, italic: true });

      let actY = day.theme ? 1.1 : 1.0;
      (day.activities || []).forEach((act) => {
        if (actY > 4.8) return;

        // Resolve image: AI imageUrl first, then Unsplash fallback
        const isGenericAct = GENERIC.some(kw => ((act.name || '') + ' ' + (act.description || '')).toLowerCase().includes(kw));
        const actUnsplash = (!isGenericAct && act.name && act.name.length > 3)
          ? lookupUnsplash(`${act.name} ${act.location || dest}`, unsplashImages)
          : null;
        const resolvedImgUrl = act.imageUrl || actUnsplash;

        const hasImg = !!resolvedImgUrl;
        const cardW = hasImg ? 7.5 : 8.8;
        const cardX = 0.6;

        // Image on the right, text on the left
        if (hasImg) {
          safeImage(slide, { path: resolvedImgUrl!, x: cardX + cardW + 0.15, y: actY, w: 1.15, h: 0.75, sizing: { type: 'cover', w: 1.15, h: 0.75 }, rounding: true });
        }

        slide.addShape('roundRect', { x: cardX, y: actY, w: cardW, h: 0.75, fill: { color: C.warmBg2 }, rectRadius: 0.08 });
        // Accent bar
        slide.addShape('rect', { x: cardX, y: actY, w: 0.06, h: 0.75, fill: { color: C.accent } });

        const timeStr = act.time ? `${act.time} ` : '';
        const locStr = act.location ? ` 📍${act.location}` : '';
        const durStr = act.duration ? ` ⏱${act.duration}` : '';
        const costStr = act.costEstimate != null ? `  ${fmtPrice(act.costEstimate)}` : '';
        slide.addText(`${timeStr}${act.name || 'Attività'}${locStr}${durStr}${costStr}`, { x: cardX + 0.15, y: actY + 0.02, w: cardW - 0.25, h: 0.32, fontSize: 12, fontFace: FONT_SANS, color: C.ink, bold: true });
        if (act.description) slide.addText(act.description, { x: cardX + 0.15, y: actY + 0.32, w: cardW - 0.25, h: 0.38, fontSize: 10, fontFace: FONT_SANS, color: C.inkMuted, valign: 'top' });
        actY += 0.82;
      });
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

        // Hotel image on the right
        const hasImg = !!opt.imageUrl;
        if (hasImg) {
          safeImage(slide, { path: opt.imageUrl!, x: 8.2, y: y + 0.05, w: 1.2, h: 1.05, sizing: { type: 'cover', w: 1.2, h: 1.05 }, rounding: true });
        }

        const textW = hasImg ? 7.4 : 8.7;
        slide.addShape('rect', { x: 0.6, y, w: 0.06, h: 1.15, fill: { color: borderColor } });
        slide.addShape('roundRect', { x: 0.7, y, w: textW, h: 1.15, fill: { color: bgColor }, rectRadius: 0.06 });

        const starStr = opt.stars ? '⭐'.repeat(Math.min(opt.stars, 5)) + ' ' : '';
        const selTag = isSelected ? '  ✓ Selezionato' : '';
        slide.addText(`${starStr}${opt.name}  (${opt.type})${selTag}`, { x: 0.9, y: y + 0.05, w: textW - 0.4, h: 0.32, fontSize: 13, fontFace: FONT_SANS, color: C.ink, bold: isSelected });
        if (opt.address) slide.addText(`📍 ${opt.address}`, { x: 0.9, y: y + 0.35, w: textW - 0.4, h: 0.25, fontSize: 10, fontFace: FONT_SANS, color: C.inkLight });

        const ratingStr = opt.rating ? `⭐ ${opt.rating}` : '';
        const amenStr = opt.amenities ? opt.amenities.slice(0, 4).join(' · ') : '';
        slide.addText(`${fmtPrice(opt.estimatedPricePerNight)}/notte   ·   ${ratingStr}${amenStr ? '   ·   ' + amenStr : ''}`, { x: 0.9, y: y + 0.6, w: textW - 0.4, h: 0.28, fontSize: 10, fontFace: FONT_SANS, color: C.inkMuted });
        if (opt.reviewSummary) slide.addText(`"${opt.reviewSummary}"`, { x: 0.9, y: y + 0.85, w: textW - 0.4, h: 0.25, fontSize: 10, fontFace: FONT_SANS, color: C.inkMuted, italic: true });

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

        // Restaurant image
        const hasImg = !!r.imageUrl;
        if (hasImg) {
          safeImage(slide, { path: r.imageUrl!, x: 8.5, y: y - 0.05, w: 0.9, h: 0.6, sizing: { type: 'cover', w: 0.9, h: 0.6 }, rounding: true });
        }

        const ratingStr = r.rating ? ` · ⭐${r.rating}` : '';
        const mustTryStr = r.mustTry ? ` · 🍽 ${r.mustTry}` : '';
        const textW = hasImg ? 7.7 : 8.6;
        slide.addText(`${r.name}  ·  ${r.cuisineType}${r.priceRange ? ' · ' + r.priceRange : ''}${ratingStr}${mustTryStr}`, { x: 0.8, y, w: textW, h: 0.28, fontSize: 11, fontFace: FONT_SANS, color: C.ink });
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
  }

  // ── BUDGET DETAIL TABLES (one slide per category, all items) ─────────────
  if (costTable && costTable.length > 0) {
    let currentSlide: PptxGenJS.Slide | null = null;
    let y = 0.3;

    costTable.forEach((cat, catIdx) => {
      const items = cat.items || [];
      // Estimate height needed: header + all items
      const neededHeight = 0.35 + items.length * 0.27 + 0.2;
      const needsNewSlide = !currentSlide || (y + neededHeight > 5.0);

      if (needsNewSlide) {
        currentSlide = pres.addSlide({ masterName: 'CONTENT' });
        currentSlide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });
        currentSlide.addText('💰 Dettaglio costi', { x: 0.6, y: 0.15, w: 9, h: 0.4, fontSize: 20, fontFace: FONT_SERIF, color: C.accent, bold: true });
        y = 0.65;
      }

      // Category header
      currentSlide!.addShape('rect', { x: 0.6, y, w: 8.8, h: 0.32, fill: { color: C.warmBg } });
      currentSlide!.addText(cat.category, { x: 0.7, y, w: 5, h: 0.32, fontSize: 11, fontFace: FONT_SANS, color: C.accent, bold: true, valign: 'middle' });
      currentSlide!.addText(fmtPrice(cat.subtotal), { x: 7.5, y, w: 1.8, h: 0.32, fontSize: 11, fontFace: FONT_SANS, color: C.accent, bold: true, align: 'right', valign: 'middle' });
      y += 0.35;

      // All items (no limit)
      items.forEach((item) => {
        if (y > 5.0) {
          // Overflow: new slide
          currentSlide = pres.addSlide({ masterName: 'CONTENT' });
          currentSlide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });
          currentSlide.addText('💰 Dettaglio costi (cont.)', { x: 0.6, y: 0.15, w: 9, h: 0.4, fontSize: 20, fontFace: FONT_SERIF, color: C.accent, bold: true });
          y = 0.65;
        }
        const dateStr = item.date ? fmtShortDate(item.date) + ' ' : '';
        const locStr = item.location ? `📍${item.location} ` : '';
        const descStr = item.description ? ` (${item.description})` : '';
        const hotelStr = item.hotelName ? `🏨${item.hotelName} ` : '';
        const nightStr = item.nights ? ` · ${item.nights} ${item.nights === 1 ? 'notte' : 'notti'}` : '';
        currentSlide!.addText(`${dateStr}${locStr}${hotelStr}${item.name}${descStr}${nightStr}`, { x: 0.8, y, w: 6, h: 0.26, fontSize: 9, fontFace: FONT_SANS, color: C.inkMuted, valign: 'middle' });
        currentSlide!.addText(fmtPrice(item.cost), { x: 7.5, y, w: 1.8, h: 0.26, fontSize: 9, fontFace: FONT_SANS, color: C.ink, align: 'right', valign: 'middle' });
        y += 0.27;
      });
      y += 0.15;
    });
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

  // ── SOURCES (with clickable links) ──────────────────────────────────────
  if (sources && sources.length > 0) {
    const MAX_SOURCES_PER_SLIDE = 10;
    for (let i = 0; i < sources.length; i += MAX_SOURCES_PER_SLIDE) {
      const chunk = sources.slice(i, i + MAX_SOURCES_PER_SLIDE);
      const slide = pres.addSlide({ masterName: 'CONTENT' });
      slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: C.accent } });
      slide.addText(i === 0 ? '📚 Fonti e ispirazioni' : '📚 Fonti e ispirazioni (cont.)', { x: 0.6, y: 0.3, w: 9, h: 0.55, fontSize: 28, fontFace: FONT_SERIF, color: C.accent, bold: true });

      let srcY = 1.0;
      chunk.forEach((s) => {
        if (srcY > 4.8) return;
        // Type label
        slide.addText(`${s.type}`, { x: 0.6, y: srcY, w: 1.4, h: 0.3, fontSize: 10, fontFace: FONT_SANS, color: C.accent, bold: true, valign: 'middle' });
        // Title as clickable link
        const linkOpts: any = { x: 2.0, y: srcY, w: 7.4, h: 0.3, fontSize: 11, fontFace: FONT_SANS, color: C.blue };
        if (s.url) {
          linkOpts.hyperlink = { url: s.url, tooltip: s.url };
        }
        slide.addText(s.title, linkOpts);
        srcY += 0.35;
      });

      if (i + MAX_SOURCES_PER_SLIDE >= sources.length) {
        slide.addText(`Generato da Vagabond · ${fmtDate(new Date().toISOString())}`, { x: 0.6, y: 4.9, w: 8.8, h: 0.3, fontSize: 10, fontFace: FONT_SANS, color: C.inkLight, align: 'center' });
      }
    }
  }

  // ── Write file ─────────────────────────────────────────────────────────
  const destination = inputs.destination || 'Viaggio';
  const startDate = inputs.startDate || new Date().toISOString().slice(0, 10);
  const fileName = `${destination.replace(/[^a-zA-Z0-9àèéìòù]/g, '_')}_${startDate}.pptx`;
  await pres.writeFile({ fileName });
}