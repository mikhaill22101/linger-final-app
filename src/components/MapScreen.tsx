import { useEffect, useRef, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import type { GeoLocation, ImpulseLocation, MapInstance } from '../types/map';
import { osmMapAdapter } from '../lib/osmMap';

interface ImpulseRow {
  id: number;
  content: string;
  category: string;
  creator_id: number;
  created_at: string;
  location_lat: number | null;
  location_lng: number | null;
}

type MapStatus = 'loading' | 'ready' | 'error';

function getUserLocation(): Promise<GeoLocation | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        resolve(null);
      },
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}

async function loadImpulses(): Promise<ImpulseLocation[]> {
  const { data, error } = await supabase
    .from('impulses')
    .select('id, content, category, creator_id, created_at, location_lat, location_lng');

  if (error) {
    try {
      WebApp.showAlert(`Ошибка загрузки данных: ${error.message}`);
    } catch {
      // ignore
    }
    return [];
  }

  const rows = (data || []) as ImpulseRow[];

  const withLocation = rows.filter((row) => (
    typeof row.location_lat === 'number' &&
    typeof row.location_lng === 'number' &&
    row.location_lat >= -90 && row.location_lat <= 90 &&
    row.location_lng >= -180 && row.location_lng <= 180
  ));

  if (withLocation.length === 0) {
    return [];
  }

  const creatorIds = [...new Set(withLocation.map((r) => r.creator_id))];
  let profilesMap = new Map<number, string>();

  if (creatorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', creatorIds);

    if (!profilesError && profiles) {
      profilesMap = new Map(
        profiles.map((p: { id: number; full_name: string | null }) => [p.id, p.full_name ?? ''])
      );
    }
  }

  return withLocation.map((row) => ({
    id: row.id,
    content: row.content,
    category: row.category,
    author_name: profilesMap.get(row.creator_id) || undefined,
    location_lat: row.location_lat as number,
    location_lng: row.location_lng as number,
  }));
}

const MapScreen: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<MapInstance | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [selectedImpulse, setSelectedImpulse] = useState<ImpulseLocation | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();

    let cancelled = false;

    const init = async () => {
      try {
        console.log('Используется бесплатная карта OpenStreetMap');
        
        const userLocation = await getUserLocation();
        const center: GeoLocation = userLocation ?? { lat: 55.7558, lng: 37.6173 };

        if (!mapRef.current) {
          return;
        }

        const map = await osmMapAdapter.initMap(mapRef.current, center);
        if (cancelled) {
          map.destroy();
          return;
        }
        mapInstanceRef.current = map;

        const impulses = await loadImpulses();
        if (!cancelled && impulses.length > 0) {
          map.setMarkers(impulses, (impulse) => {
            setSelectedImpulse(impulse);
            try {
              WebApp.HapticFeedback?.impactOccurred('light');
            } catch {
              // ignore
            }
          });
        }

        if (!cancelled) {
          setStatus('ready');
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Не удалось инициализировать карту';
        setErrorMessage(msg);
        setStatus('error');
        try {
          WebApp.showAlert(`Ошибка карты: ${msg}`);
        } catch {
          // ignore
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const hideBalloon = () => {
    setSelectedImpulse(null);
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-white/60 mb-2">Загрузка карты...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black">
      <div id="map" ref={mapRef} style={{ width: '100%', height: '100vh' }} />

      {status === 'error' && errorMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/80 text-xs px-3 py-2 rounded-full z-40">
          {errorMessage}
        </div>
      )}

      {/* Баллун с информацией об импульсе */}
      <AnimatePresence>
        {selectedImpulse && (
          <div className="absolute bottom-0 left-0 right-0 p-4 z-50">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="bg-black/90 backdrop-blur-xl border border-white/20 rounded-2xl p-4 max-h-[200px] overflow-y-auto"
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-semibold text-purple-400 px-2 py-1 bg-purple-400/10 rounded-full">
                  {selectedImpulse.category}
                </span>
                <button
                  onClick={hideBalloon}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              <p className="text-sm text-white/90 leading-relaxed mb-2">
                {selectedImpulse.content}
              </p>
              {selectedImpulse.author_name && (
                <p className="text-xs text-white/50">
                  — {selectedImpulse.author_name}
                </p>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MapScreen;
