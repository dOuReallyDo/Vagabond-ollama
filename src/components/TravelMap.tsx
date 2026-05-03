import React, { useEffect, useRef, useMemo } from 'react';

interface MapPoint {
  lat: number;
  lng: number;
  label: string;
  type?: 'attraction' | 'hotel' | 'restaurant' | 'activity' | 'city' | 'beach' | 'nature' | 'port' | 'museum' | 'monument' | 'mountain' | 'lake' | string;
}

interface TravelMapProps {
  points: MapPoint[];
  destination: string;
}

const CITY_COLOR = '#7c3aed';
const CITY_BG = '#7c3aed';

export const TravelMap: React.FC<TravelMapProps> = ({ points, destination }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  // Filter to city-type stops only (main itinerary stops)
  const cityPoints = useMemo(
    () => points.filter(
      (p) => p.lat !== 0 && p.lng !== 0 && !isNaN(p.lat) && !isNaN(p.lng) && (p.type === 'city' || !p.type)
    ),
    [points]
  );

  // If no city-type points, fall back to all valid points
  const validPoints = useMemo(
    () => cityPoints.length > 0 ? cityPoints : points.filter(
      (p) => p.lat !== 0 && p.lng !== 0 && !isNaN(p.lat) && !isNaN(p.lng)
    ),
    [cityPoints, points]
  );

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    let isCancelled = false;

    if (validPoints.length === 0) return;

    import('leaflet').then((L) => {
      if (isCancelled || mapInstance.current) return;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // @ts-expect-error -- Leaflet internal
      if (mapRef.current?._leaflet_id) return;

      try {
        const center: [number, number] = [
          validPoints.reduce((s, p) => s + p.lat, 0) / validPoints.length,
          validPoints.reduce((s, p) => s + p.lng, 0) / validPoints.length,
        ];

        const map = L.map(mapRef.current!, {
          center,
          zoom: cityPoints.length > 0 ? 6 : 13,
          zoomControl: true,
          scrollWheelZoom: true,
        });

        mapInstance.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        const markers: any[] = [];

        // Draw route with arrows between city stops
        if (cityPoints.length >= 2) {
          const routeCoords: [number, number][] = cityPoints.map(p => [p.lat, p.lng]);

          // Solid line connecting all stops
          L.polyline(routeCoords, {
            color: CITY_COLOR,
            weight: 3,
            opacity: 0.7,
            dashArray: '0',
          }).addTo(map);

          // Arrow heads at midpoint of each segment
          for (let i = 0; i < routeCoords.length - 1; i++) {
            const from = routeCoords[i];
            const to = routeCoords[i + 1];
            const midLat = (from[0] + to[0]) / 2;
            const midLng = (from[1] + to[1]) / 2;
            const angle = Math.atan2(to[1] - from[1], to[0] - from[0]) * (180 / Math.PI);

            const arrowIcon = L.divIcon({
              html: `<div style="
                transform: rotate(${angle}deg);
                color: ${CITY_COLOR};
                font-size: 18px;
                line-height: 1;
                text-shadow: 0 0 3px white, 0 0 3px white;
              ">➤</div>`,
              className: '',
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            });
            L.marker([midLat, midLng], { icon: arrowIcon, interactive: false }).addTo(map);
          }

          // Numbered city markers
          cityPoints.forEach((point, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === cityPoints.length - 1;
            const numLabel = isFirst ? '🛫' : isLast ? '🏠' : `${idx + 1}`;

            const icon = L.divIcon({
              html: `
                <div style="
                  background: ${isFirst ? '#059669' : isLast ? '#dc2626' : CITY_BG};
                  color: white;
                  border-radius: 50%;
                  width: 32px;
                  height: 32px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                  border: 3px solid white;
                  font-size: ${isFirst || isLast ? '14px' : '13px'};
                  font-weight: bold;
                  font-family: Inter, sans-serif;
                ">${numLabel}</div>
              `,
              className: '',
              iconSize: [32, 32],
              iconAnchor: [16, 16],
              popupAnchor: [0, -18],
            });

            const marker = L.marker([point.lat, point.lng], { icon })
              .addTo(map)
              .bindPopup(`
                <div style="font-family: Inter, sans-serif; min-width: 140px; text-align: center;">
                  <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 2px;">
                    ${isFirst ? 'Partenza' : isLast ? 'Ritorno' : 'Tappa ' + (idx + 1)}
                  </div>
                  <strong style="font-size: 15px; color: #1a1a1a;">${point.label}</strong>
                </div>
              `);
            markers.push(marker);
          });
        } else {
          // Fallback: show all valid points as generic markers
          validPoints.forEach((point, idx) => {
            const icon = L.divIcon({
              html: `<div style="
                background: ${CITY_BG};
                color: white;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                border: 2px solid white;
                font-size: 13px;
              "><span style="transform: rotate(45deg); display:block;">📍</span></div>`,
              className: '',
              iconSize: [32, 32],
              iconAnchor: [16, 32],
              popupAnchor: [0, -34],
            });

            const marker = L.marker([point.lat, point.lng], { icon })
              .addTo(map)
              .bindPopup(`
                <div style="font-family: Inter, sans-serif; min-width: 160px;">
                  <strong style="font-size: 14px; color: #1a1a1a;">${point.label}</strong>
                </div>
              `);
            markers.push(marker);
          });

          // Simple polyline for fallback
          if (validPoints.length > 1) {
            L.polyline(validPoints.map(p => [p.lat, p.lng]), {
              color: CITY_COLOR,
              weight: 2.5,
              opacity: 0.6,
              dashArray: '6, 10',
            }).addTo(map);
          }
        }

        // Fit bounds
        if (markers.length > 1) {
          const group = L.featureGroup(markers);
          map.fitBounds(group.getBounds().pad(0.15));
        }
      } catch (e) {
        console.error('Error initializing map:', e);
      }
    });

    return () => {
      isCancelled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [points, destination]);

  return (
    <div className="relative">
      <div ref={mapRef} style={{ height: '480px', width: '100%', borderRadius: '1.5rem', overflow: 'hidden' }} />
      {/* Legend for city stops route */}
      {cityPoints.length >= 2 && (
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur px-4 py-3 rounded-2xl shadow-lg border border-white/50 text-xs space-y-1.5 z-[1000]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: '#059669' }} />
            <span className="text-gray-600">🛫 Partenza</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: CITY_COLOR }} />
            <span className="text-gray-600">🏙️ Tappa intermedia</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: '#dc2626' }} />
            <span className="text-gray-600">🏠 Ritorno</span>
          </div>
          {cityPoints.length > 2 && (
            <div className="flex items-center gap-2">
              <div style={{ width: '24px', height: '2px', background: CITY_COLOR }} />
              <span className="text-gray-600">➤ Percorso</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};