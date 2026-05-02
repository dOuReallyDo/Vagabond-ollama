import React, { useEffect, useState } from 'react';
import type { ItineraryDraft } from '../shared/step1-contract';
import type { AccommodationTransport } from '../shared/step2-contract';
import type { BudgetCalculation } from '../shared/step3-contract';
import type { TravelInputs } from '../shared/contract';

// ─── Static map URL builder (OpenStreetMap static tiles) ───────────────────
// Uses a lightweight static map image from OpenStreetMap-based services
function getStaticMapUrl(points: { lat: number; lng: number; label?: string; type?: string }[], width = 800, height = 400): string {
  if (!points.length) return '';
  // Use Nominatim/OSM tile approach — compute bbox center and zoom
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const latSpread = maxLat - minLat;
  const lngSpread = maxLng - minLng;
  const spread = Math.max(latSpread, lngSpread, 0.05);
  const zoom = spread > 10 ? 4 : spread > 5 ? 5 : spread > 2 ? 6 : spread > 1 ? 7 : spread > 0.5 ? 8 : spread > 0.2 ? 9 : 10;

  // Use OpenStreetMap static map via map tile approach
  // We'll use the export-osm approach: render a static image URL
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng - spread * 0.2},${minLat - spread * 0.2},${maxLng + spread * 0.2},${maxLat + spread * 0.2}&layer=mapnik&marker=${centerLat},${centerLng}`;
}

// Simplified static map: use a screenshot-like URL from OSM static tile service
function getStaticMapImageUrl(points: { lat: number; lng: number }[], width = 800, height = 400): string {
  if (!points.length) return '';
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const centerLat = ((minLat + maxLat) / 2).toFixed(4);
  const centerLng = ((minLng + maxLng) / 2).toFixed(4);
  const latSpread = maxLat - minLat;
  const lngSpread = maxLng - minLng;
  const spread = Math.max(latSpread, lngSpread, 0.05);
  const zoom = spread > 10 ? 4 : spread > 5 ? 5 : spread > 2 ? 6 : spread > 1 ? 7 : spread > 0.5 ? 8 : spread > 0.2 ? 9 : spread > 0.1 ? 10 : 11;

  // Use staticmap.de service for static map images (free, no API key)
  const markers = points.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)},red-pushpin`).join('|');
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${centerLat},${centerLng}&zoom=${zoom}&size=${width}x${height}&maptype=mapnik&markers=${markers}`;
}

// ─── Date formatting helpers ─────────────────────────────────────────────
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return dateStr; }
}

function formatPrice(n: number): string {
  return `€${n.toLocaleString('it-IT')}`;
}

function formatPriceRange(s: string): string {
  return s;
}

// ─── Type emoji for map points ─────────────────────────────────────────────
const typeEmoji: Record<string, string> = {
  city: '🏙️', beach: '🏖️', nature: '🌿', port: '⚓', museum: '🏛️',
  monument: '🏛️', mountain: '⛰️', lake: '🏞️', airport: '✈️',
};

function getTypeEmoji(t?: string): string {
  return typeEmoji[t || ''] || '📍';
}

// ─── Props ──────────────────────────────────────────────────────────────────
interface TripPDFViewProps {
  inputs: TravelInputs;
  step1Data: ItineraryDraft;
  step2Data: AccommodationTransport;
  step3Data: BudgetCalculation;
}

export function TripPDFView({ inputs, step1Data, step2Data, step3Data }: TripPDFViewProps) {
  const [mapImageUrl, setMapImageUrl] = useState<string>('');
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [heroError, setHeroError] = useState(false);
  const [activityImages, setActivityImages] = useState<Record<number, boolean>>({});
  const [hotelImages, setHotelImages] = useState<Record<string, boolean>>({});

  // Collect all map points for static map
  useEffect(() => {
    const points: { lat: number; lng: number }[] = [];
    if (step1Data.mapPoints) {
      step1Data.mapPoints.forEach(p => points.push({ lat: p.lat, lng: p.lng }));
    }
    if (points.length >= 2) {
      setMapImageUrl(getStaticMapImageUrl(points, 800, 360));
    } else if (step1Data.destinationOverview?.attractions) {
      step1Data.destinationOverview.attractions.forEach(a => {
        if (a.lat != null && a.lng != null) points.push({ lat: a.lat, lng: a.lng });
      });
      if (points.length >= 2) setMapImageUrl(getStaticMapImageUrl(points, 800, 360));
    }
  }, [step1Data]);

  const { destinationOverview, weatherInfo, safetyAndHealth, itinerary, localTips, transportInfo, travelHighlights, mapPoints, sources } = step1Data;
  const { accommodations, bestRestaurants, flights } = step2Data;
  const { budgetBreakdown, costTable, budgetWarning } = step3Data;
  const dayCount = Math.round((new Date(inputs.endDate).getTime() - new Date(inputs.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const totalPeople = inputs.people.adults + inputs.people.children.length;

  const heroUrl = destinationOverview?.heroImageUrl;

  // ─── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div className="pdf-container" style={{ fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif', color: '#1a1a1a', fontSize: '11pt', lineHeight: 1.5, maxWidth: '210mm', margin: '0 auto', background: '#fff' }}>

      {/* ── COVER ─────────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', minHeight: '260px', overflow: 'hidden', borderRadius: '16px', marginBottom: '24px' }}>
        {heroUrl && !heroError ? (
          <img
            src={heroUrl}
            alt={destinationOverview?.title || inputs.destination}
            style={{ width: '100%', height: '280px', objectFit: 'cover', borderRadius: '16px' }}
            onLoad={() => setHeroLoaded(true)}
            onError={() => setHeroError(true)}
          />
        ) : (
          <div style={{ width: '100%', height: '280px', background: 'linear-gradient(135deg, #5a5a40 0%, #8b8b6a 100%)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: '48pt', fontFamily: '"Cormorant Garamond", Georgia, serif' }}>{inputs.destination}</span>
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(26,26,26,0.85))', padding: '40px 32px 24px', borderRadius: '0 0 16px 16px' }}>
          <h1 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '28pt', color: '#fff', margin: 0, lineHeight: 1.2 }}>
            {destinationOverview?.title || inputs.destination}
          </h1>
          {destinationOverview?.tagline && (
            <p style={{ fontSize: '13pt', color: 'rgba(255,255,255,0.9)', margin: '4px 0 0', fontStyle: 'italic' }}>{destinationOverview.tagline}</p>
          )}
        </div>
      </div>

      {/* ── TRIP SUMMARY BAR ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px', padding: '16px 20px', background: '#f5f4f0', borderRadius: '12px' }}>
        <span style={{ fontSize: '10pt', color: '#5a5a40' }}>📍 {inputs.destination}{inputs.country ? `, ${inputs.country}` : ''}</span>
        <span style={{ fontSize: '10pt', color: '#5a5a40' }}>📅 {formatDate(inputs.startDate)} → {formatDate(inputs.endDate)}</span>
        <span style={{ fontSize: '10pt', color: '#5a5a40' }}>👥 {totalPeople} {totalPeople === 1 ? 'persona' : 'persone'}</span>
        <span style={{ fontSize: '10pt', color: '#5a5a40' }}>💰 Budget: {formatPrice(inputs.budget)}</span>
        {inputs.departureCity && <span style={{ fontSize: '10pt', color: '#5a5a40' }}>✈️ Da: {inputs.departureCity}</span>}
        {inputs.flightPreference && <span style={{ fontSize: '10pt', color: '#5a5a40' }}>🚗 {inputs.flightPreference}</span>}
      </div>

      {/* ── OVERVIEW ──────────────────────────────────────────────────────── */}
      {destinationOverview?.description && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '16pt', color: '#5a5a40', borderBottom: '2px solid #e8e6df', paddingBottom: '8px', marginBottom: '12px' }}>Panoramica</h2>
          <p style={{ fontSize: '11pt', lineHeight: 1.7, color: '#333' }}>{destinationOverview.description}</p>
        </div>
      )}

      {/* ── MAP ──────────────────────────────────────────────────────────── */}
      {mapImageUrl && mapPoints && mapPoints.length > 1 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '16pt', color: '#5a5a40', borderBottom: '2px solid #e8e6df', paddingBottom: '8px', marginBottom: '12px' }}>Mappa del viaggio</h2>
          <img src={mapImageUrl} alt="Mappa" style={{ width: '100%', borderRadius: '12px', border: '1px solid #e8e6df' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
            {(mapPoints || []).map((p, i) => (
              <span key={i} style={{ fontSize: '9pt', background: '#f5f4f0', padding: '4px 10px', borderRadius: '20px', color: '#555' }}>
                {getTypeEmoji(p.type)} {p.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── WEATHER ──────────────────────────────────────────────────────── */}
      {weatherInfo && (
        <div style={{ marginBottom: '24px', padding: '16px 20px', background: '#f0f7ff', borderRadius: '12px' }}>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '16pt', color: '#3a6ea5', marginBottom: '8px' }}>🌤️ Meteo</h2>
          <p style={{ fontSize: '11pt', margin: '4px 0' }}><strong>{weatherInfo.summary}</strong></p>
          {weatherInfo.averageTemp && <p style={{ fontSize: '10pt', color: '#555' }}>Temperatura media: {weatherInfo.averageTemp}</p>}
          {weatherInfo.pros && <p style={{ fontSize: '10pt', color: '#555' }}>✅ {weatherInfo.pros}</p>}
          {weatherInfo.cons && <p style={{ fontSize: '10pt', color: '#555' }}>⚠️ {weatherInfo.cons}</p>}
          {weatherInfo.packingTips && <p style={{ fontSize: '10pt', color: '#555' }}>🧳 {weatherInfo.packingTips}</p>}
        </div>
      )}

      {/* ── SAFETY ────────────────────────────────────────────────────────── */}
      {safetyAndHealth && (safetyAndHealth.safetyWarnings || safetyAndHealth.vaccinationsRequired) && (
        <div style={{ marginBottom: '24px', padding: '16px 20px', background: '#fff8f0', borderRadius: '12px' }}>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '16pt', color: '#b8860b', marginBottom: '8px' }}>🛡️ Sicurezza e Salute</h2>
          {safetyAndHealth.safetyLevel && <p style={{ fontSize: '10pt', color: '#555' }}>Livello sicurezza: <strong>{safetyAndHealth.safetyLevel}</strong></p>}
          {safetyAndHealth.safetyWarnings && <p style={{ fontSize: '10pt', color: '#555' }}>{safetyAndHealth.safetyWarnings}</p>}
          {safetyAndHealth.vaccinationsRequired && <p style={{ fontSize: '10pt', color: '#555' }}>💉 {safetyAndHealth.vaccinationsRequired}</p>}
          {safetyAndHealth.emergencyNumbers && <p style={{ fontSize: '10pt', color: '#555' }}>📞 {safetyAndHealth.emergencyNumbers}</p>}
        </div>
      )}

      {/* ── ITINERARY ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '20pt', color: '#5a5a40', borderBottom: '3px solid #5a5a40', paddingBottom: '8px', marginBottom: '16px' }}>
          📋 Itinerario — {dayCount} giorn{dayCount === 1 ? 'o' : 'i'}
        </h2>

        {(itinerary || []).map((day, dayIdx) => (
          <div key={dayIdx} style={{ marginBottom: '20px', pageBreakInside: 'avoid', border: '1px solid #e8e6df', borderRadius: '12px', overflow: 'hidden' }}>
            {/* Day header */}
            <div style={{ background: 'linear-gradient(135deg, #5a5a40, #8b8b6a)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '14pt', color: '#fff', margin: 0 }}>
                Giorno {day.day}: {day.title}
              </h3>
              {day.theme && <span style={{ fontSize: '9pt', color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.2)', padding: '3px 12px', borderRadius: '20px' }}>{day.theme}</span>}
            </div>

            {/* Activities */}
            <div style={{ padding: '12px 20px' }}>
              {(day.activities || []).map((act, actIdx) => {
                const imgKey = `${dayIdx}-${actIdx}`;
                const imgLoaded = activityImages[imgKey];
                return (
                  <div key={actIdx} style={{ display: 'flex', gap: '12px', marginBottom: '12px', padding: '8px 0', borderBottom: actIdx < (day.activities || []).length - 1 ? '1px solid #f0ede6' : 'none' }}>
                    {/* Activity image */}
                    {act.imageUrl && (
                      <div style={{ flexShrink: 0, width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden' }}>
                        {imgLoaded !== false && (
                          <img
                            src={act.imageUrl}
                            alt={act.name || ''}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={() => setActivityImages(prev => ({ ...prev, [imgKey]: false }))}
                          />
                        )}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                        {act.time && <span style={{ fontSize: '9pt', color: '#5a5a40', fontWeight: 600, background: '#f5f4f0', padding: '2px 8px', borderRadius: '4px' }}>{act.time}</span>}
                        <strong style={{ fontSize: '11pt' }}>{act.name || act.location || 'Attività'}</strong>
                        {act.duration && <span style={{ fontSize: '9pt', color: '#888' }}>⏱ {act.duration}</span>}
                        {act.costEstimate != null && <span style={{ fontSize: '9pt', color: '#5a5a40', fontWeight: 600 }}>{formatPrice(act.costEstimate)}</span>}
                      </div>
                      <p style={{ fontSize: '10pt', color: '#555', margin: '4px 0 0' }}>{act.description}</p>
                      {act.location && <p style={{ fontSize: '9pt', color: '#888', margin: '2px 0 0' }}>📍 {act.location}</p>}
                      {act.tips && <p style={{ fontSize: '9pt', color: '#5a5a40', fontStyle: 'italic', margin: '2px 0 0' }}>💡 {act.tips}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── ATTRACTIONS ───────────────────────────────────────────────────── */}
      {destinationOverview?.attractions && destinationOverview.attractions.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '16pt', color: '#5a5a40', borderBottom: '2px solid #e8e6df', paddingBottom: '8px', marginBottom: '12px' }}>🎯 Attrazioni principali</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
            {destinationOverview.attractions.map((attr, i) => (
              <div key={i} style={{ background: '#f5f4f0', borderRadius: '10px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <strong style={{ fontSize: '11pt' }}>{attr.name}</strong>
                  {attr.category && <span style={{ fontSize: '9pt', color: '#888' }}>{attr.category}</span>}
                </div>
                <p style={{ fontSize: '10pt', color: '#555', margin: '4px 0 0' }}>{attr.description}</p>
                {attr.estimatedVisitTime && <p style={{ fontSize: '9pt', color: '#888', margin: '2px 0 0' }}>⏱ {attr.estimatedVisitTime}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TRANSPORT ─────────────────────────────────────────────────────── */}
{(transportInfo?.localTransport || (transportInfo?.bestApps && transportInfo.bestApps.length > 0)) && (
        <div style={{ marginBottom: '24px', padding: '16px 20px', background: '#f0f5f0', borderRadius: '12px' }}>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '16pt', color: '#4a7a4a', marginBottom: '8px' }}>🚌 Trasporti locali</h2>
          {transportInfo.localTransport && <p style={{ fontSize: '11pt', margin: '4px 0' }}>{transportInfo.localTransport}</p>}
          {transportInfo.estimatedLocalCost && <p style={{ fontSize: '10pt', color: '#555' }}>💰 Costo stimato: {transportInfo.estimatedLocalCost}</p>}
          {transportInfo.bestApps && transportInfo.bestApps.length > 0 && (
            <p style={{ fontSize: '10pt', color: '#555' }}>📱 App consigliate: {transportInfo.bestApps.join(', ')}</p>
          )}
          {transportInfo.privateTransferLinks && transportInfo.privateTransferLinks.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              {transportInfo.privateTransferLinks.map((link, i) => (
                <p key={i} style={{ fontSize: '10pt', color: '#5a5a40' }}>
                  🚗 {link.provider}: {link.description || link.url}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ACCOMMODATIONS ─────────────────────────────────────────────────── */}
      {accommodations && accommodations.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontFamily: '"Cormoront Garamond", Georgia, serif', fontSize: '20pt', color: '#5a5a40', borderBottom: '3px solid #5a5a40', paddingBottom: '8px', marginBottom: '16px' }}>
            🏨 Alloggi
          </h2>
          {accommodations.map((stop, stopIdx) => {
            const selectedOption = stop.options[stop.selectedIndex ?? 0];
            const allOptions = stop.options;
            return (
              <div key={stopIdx} style={{ marginBottom: '16px', border: '1px solid #e8e6df', borderRadius: '12px', overflow: 'hidden', pageBreakInside: 'avoid' }}>
                <div style={{ background: '#f5f4f0', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '13pt', fontFamily: '"Cormorant Garamond", Georgia, serif' }}>{stop.stopName}</strong>
                  <span style={{ fontSize: '10pt', color: '#888' }}>{stop.nights} {stop.nights === 1 ? 'notte' : 'notti'}</span>
                </div>
                <div style={{ padding: '12px 20px' }}>
                  {allOptions.map((opt, optIdx) => {
                    const isSelected = optIdx === (stop.selectedIndex ?? 0);
                    const imgKey = `acc-${stopIdx}-${optIdx}`;
                    const showImg = opt.imageUrl && hotelImages[imgKey] !== false;
                    return (
                      <div key={optIdx} style={{ 
                        display: 'flex', gap: '12px', padding: '10px', marginBottom: '8px', 
                        borderRadius: '10px', border: isSelected ? '2px solid #5a5a40' : '1px solid #eee',
                        background: isSelected ? '#faf9f5' : '#fff'
                      }}>
                        {showImg && (
                          <div style={{ flexShrink: 0, width: '90px', height: '70px', borderRadius: '8px', overflow: 'hidden' }}>
                            <img src={opt.imageUrl} alt={opt.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={() => setHotelImages(prev => ({ ...prev, [imgKey]: false }))}
                            />
                          </div>
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <strong style={{ fontSize: '11pt' }}>{opt.name}</strong>
                            {isSelected && <span style={{ fontSize: '8pt', background: '#5a5a40', color: '#fff', padding: '2px 8px', borderRadius: '10px' }}>Selezionato</span>}
                            {opt.stars && <span style={{ fontSize: '9pt' }}>{'⭐'.repeat(opt.stars)}</span>}
                            {opt.type && <span style={{ fontSize: '9pt', color: '#888' }}>{opt.type}</span>}
                          </div>
                          {opt.address && <p style={{ fontSize: '9pt', color: '#888', margin: '2px 0 0' }}>📍 {opt.address}</p>}
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
                            <span style={{ fontSize: '11pt', fontWeight: 600, color: '#5a5a40' }}>{formatPrice(opt.estimatedPricePerNight)}/notte</span>
                            {opt.rating && <span style={{ fontSize: '9pt', color: '#888' }}>⭐ {opt.rating}</span>}
                          </div>
                          {opt.amenities && opt.amenities.length > 0 && (
                            <p style={{ fontSize: '9pt', color: '#888', margin: '4px 0 0' }}>{opt.amenities.join(' · ')}</p>
                          )}
                          {opt.reviewSummary && <p style={{ fontSize: '9pt', color: '#666', margin: '4px 0 0', fontStyle: 'italic' }}>"{opt.reviewSummary}"</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── RESTAURANTS ────────────────────────────────────────────────────── */}
      {bestRestaurants && bestRestaurants.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '16pt', color: '#5a5a40', borderBottom: '2px solid #e8e6df', paddingBottom: '8px', marginBottom: '12px' }}>🍽️ Ristoranti consigliati</h2>
          {bestRestaurants.map((stop, stopIdx) => (
            <div key={stopIdx} style={{ marginBottom: '12px' }}>
              <h4 style={{ fontSize: '11pt', color: '#5a5a40', marginBottom: '6px' }}>{stop.stopName}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                {(stop.options || []).map((r, ri) => (
                  <div key={ri} style={{ background: '#f5f4f0', borderRadius: '10px', padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <strong style={{ fontSize: '10pt' }}>{r.name}</strong>
                      {r.rating && <span style={{ fontSize: '9pt', color: '#888' }}>⭐ {r.rating}</span>}
                    </div>
                    <p style={{ fontSize: '9pt', color: '#888', margin: '2px 0 0' }}>{r.cuisineType}{r.priceRange ? ` · ${r.priceRange}` : ''}</p>
                    {r.mustTry && <p style={{ fontSize: '9pt', color: '#5a5a40', fontStyle: 'italic', margin: '2px 0 0' }}>🍽 {r.mustTry}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── FLIGHTS / TRANSPORT ────────────────────────────────────────────── */}
      {flights && flights.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '16pt', color: '#5a5a40', borderBottom: '2px solid #e8e6df', paddingBottom: '8px', marginBottom: '12px' }}>✈️ Trasporti</h2>
          {flights.map((seg, segIdx) => {
            const selectedOpt = seg.options[seg.selectedIndex ?? 0];
            return (
              <div key={segIdx} style={{ marginBottom: '12px', border: '1px solid #e8e6df', borderRadius: '10px', padding: '12px 16px', pageBreakInside: 'avoid' }}>
                <h4 style={{ fontSize: '11pt', color: '#5a5a40', marginBottom: '8px' }}>{seg.segmentName}</h4>
                {seg.options.map((opt, optIdx) => {
                  const isSelected = optIdx === (seg.selectedIndex ?? 0);
                  return (
                    <div key={optIdx} style={{ 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                      padding: '8px 12px', marginBottom: '4px', borderRadius: '8px',
                      background: isSelected ? '#f5f4f0' : 'transparent',
                      border: isSelected ? '1px solid #5a5a40' : '1px solid transparent'
                    }}>
                      <div>
                        <strong style={{ fontSize: '10pt' }}>{opt.airline}</strong>
                        <span style={{ fontSize: '9pt', color: '#555', marginLeft: '8px' }}>{opt.route}</span>
                        {opt.departureTime && opt.arrivalTime && (
                          <span style={{ fontSize: '9pt', color: '#888', marginLeft: '8px' }}>{opt.departureTime} → {opt.arrivalTime}</span>
                        )}
                        {opt.duration && <span style={{ fontSize: '9pt', color: '#888', marginLeft: '8px' }}>⏱ {opt.duration}</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isSelected && <span style={{ fontSize: '8pt', background: '#5a5a40', color: '#fff', padding: '2px 8px', borderRadius: '10px' }}>Selezionato</span>}
                        <span style={{ fontSize: '11pt', fontWeight: 600, color: '#5a5a40' }}>{formatPrice(opt.estimatedPrice)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ── HIGHLIGHTS & TIPS ──────────────────────────────────────────────── */}
      {travelHighlights && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '16pt', color: '#5a5a40', borderBottom: '2px solid #e8e6df', paddingBottom: '8px', marginBottom: '12px' }}>✨ Perché questo viaggio</h2>
          {travelHighlights.whyChosen && <p style={{ fontSize: '11pt', lineHeight: 1.7 }}>{travelHighlights.whyChosen}</p>}
          {travelHighlights.mainStops && travelHighlights.mainStops.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              {travelHighlights.mainStops.map((s, i) => (
                <p key={i} style={{ fontSize: '10pt', color: '#555' }}><strong>{s.name}</strong> — {s.reason}</p>
              ))}
            </div>
          )}
          {travelHighlights.whyUnforgettable && <p style={{ fontSize: '10pt', color: '#888', fontStyle: 'italic', marginTop: '8px' }}>{travelHighlights.whyUnforgettable}</p>}
        </div>
      )}

      {localTips && localTips.length > 0 && (
        <div style={{ marginBottom: '24px', padding: '16px 20px', background: '#faf9f5', borderRadius: '12px' }}>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '16pt', color: '#5a5a40', marginBottom: '8px' }}>💡 Consigli locali</h2>
          <ul style={{ paddingLeft: '20px', margin: 0 }}>
            {localTips.map((tip, i) => (
              <li key={i} style={{ fontSize: '10pt', color: '#555', marginBottom: '4px' }}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── BUDGET ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '24px', pageBreakInside: 'avoid' }}>
        <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '20pt', color: '#5a5a40', borderBottom: '3px solid #5a5a40', paddingBottom: '8px', marginBottom: '16px' }}>
          💰 Budget stimato
        </h2>

        {/* Budget summary boxes */}
        {budgetBreakdown && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', marginBottom: '16px' }}>
            {budgetBreakdown.flights > 0 && (
              <div style={{ background: '#f0f5f0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '9pt', color: '#888' }}>✈️ Trasporti</div>
                <div style={{ fontSize: '16pt', fontWeight: 700, color: '#5a5a40', fontFamily: '"Cormorant Garamond", Georgia, serif' }}>{formatPrice(budgetBreakdown.flights)}</div>
              </div>
            )}
            {budgetBreakdown.accommodation > 0 && (
              <div style={{ background: '#f5f4f0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '9pt', color: '#888' }}>🏨 Alloggi</div>
                <div style={{ fontSize: '16pt', fontWeight: 700, color: '#5a5a40', fontFamily: '"Cormorant Garamond", Georgia, serif' }}>{formatPrice(budgetBreakdown.accommodation)}</div>
              </div>
            )}
            {budgetBreakdown.activities > 0 && (
              <div style={{ background: '#f0f0f5', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '9pt', color: '#888' }}>🎯 Attività</div>
                <div style={{ fontSize: '16pt', fontWeight: 700, color: '#5a5a40', fontFamily: '"Cormorant Garamond", Georgia, serif' }}>{formatPrice(budgetBreakdown.activities)}</div>
              </div>
            )}
            {budgetBreakdown.food > 0 && (
              <div style={{ background: '#fff8f0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '9pt', color: '#888' }}>🍽️ Cibo</div>
                <div style={{ fontSize: '16pt', fontWeight: 700, color: '#5a5a40', fontFamily: '"Cormorant Garamond", Georgia, serif' }}>{formatPrice(budgetBreakdown.food)}</div>
              </div>
            )}
            {budgetBreakdown.misc != null && budgetBreakdown.misc > 0 && (
              <div style={{ background: '#f5f5f0', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '9pt', color: '#888' }}>📦 Extra</div>
                <div style={{ fontSize: '16pt', fontWeight: 700, color: '#5a5a40', fontFamily: '"Cormorant Garamond", Georgia, serif' }}>{formatPrice(budgetBreakdown.misc)}</div>
              </div>
            )}
            <div style={{ background: 'linear-gradient(135deg, #5a5a40, #8b8b6a)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '9pt', color: 'rgba(255,255,255,0.85)' }}>TOTALE</div>
              <div style={{ fontSize: '18pt', fontWeight: 700, color: '#fff', fontFamily: '"Cormorant Garamond", Georgia, serif' }}>{formatPrice(budgetBreakdown.totalEstimated)}</div>
            </div>
          </div>
        )}

        {budgetBreakdown?.perPersonPerDay && (
          <p style={{ fontSize: '10pt', color: '#888', textAlign: 'center', marginBottom: '16px' }}>
            ≈ {formatPrice(budgetBreakdown.perPersonPerDay)}/persona/giorno
          </p>
        )}

        {budgetWarning && (
          <div style={{ background: '#fff8f0', border: '1px solid #e6d5b8', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '10pt', color: '#8b6914' }}>
            ⚠️ {budgetWarning}
          </div>
        )}

        {/* Cost detail table */}
        {costTable && costTable.length > 0 && (
          <div>
            {costTable.map((cat, catIdx) => (
              <div key={catIdx} style={{ marginBottom: '12px', pageBreakInside: 'avoid' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f5f4f0', padding: '8px 14px', borderRadius: '8px 8px 0 0', fontWeight: 600, fontSize: '10pt', color: '#5a5a40' }}>
                  <span>{cat.category}</span>
                  <span>{formatPrice(cat.subtotal)}</span>
                </div>
                <div style={{ border: '1px solid #f0ede6', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                  {(cat.items || []).map((item, itemIdx) => (
                    <div key={itemIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 14px', borderBottom: itemIdx < (cat.items || []).length - 1 ? '1px solid #f5f4f0' : 'none', fontSize: '9pt' }}>
                      <div style={{ flex: 1 }}>
                        <span>{item.name}</span>
                        {item.description && <span style={{ color: '#888', marginLeft: '6px' }}>({item.description})</span>}
                        {item.location && <span style={{ color: '#888', marginLeft: '6px' }}>📍{item.location}</span>}
                        {item.date && <span style={{ color: '#888', marginLeft: '6px' }}>{formatDate(item.date)}</span>}
                      </div>
                      <span style={{ fontWeight: 600, color: '#5a5a40' }}>{formatPrice(item.cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SOURCES ────────────────────────────────────────────────────────── */}
      {sources && sources.length > 0 && (
        <div style={{ marginBottom: '24px', padding: '12px 16px', background: '#faf9f5', borderRadius: '10px' }}>
          <h3 style={{ fontSize: '10pt', color: '#888', marginBottom: '6px' }}>Fonti e ispirazioni</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {sources.map((s, i) => (
              <span key={i} style={{ fontSize: '8pt', background: '#e8e6df', padding: '3px 10px', borderRadius: '12px', color: '#555' }}>
                {s.type}: {s.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #e8e6df', textAlign: 'center', color: '#aaa', fontSize: '8pt' }}>
        <p>Generato da Vagabond · {formatDate(new Date().toISOString())}</p>
        <p>{inputs.destination} · {formatDate(inputs.startDate)} → {formatDate(inputs.endDate)} · Budget {formatPrice(inputs.budget)}</p>
      </div>
    </div>
  );
}