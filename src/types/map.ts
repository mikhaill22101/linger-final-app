// Тип провайдера карты (в текущей версии используется только OSM)
export type MapProvider = 'osm';

export interface GeoLocation {
  lat: number;
  lng: number;
}

export interface ImpulseLocation {
  id: number;
  content: string;
  category: string;
  author_name?: string;
  location_lat: number;
  location_lng: number;
  created_at?: string;
  address?: string;
  event_date?: string | null;
  event_time?: string | null;
}

export interface MapInstance {
  destroy: () => void;
  setMarkers: (impulses: ImpulseLocation[], onClick: (impulse: ImpulseLocation) => void, activeCategory?: string | null, nearestEventId?: number, onLongPress?: (impulse: ImpulseLocation) => void) => void;
  setActiveCategory?: (category: string | null) => void;
  setUserLocation?: (location: GeoLocation | null) => void; // Установка локации пользователя
  flyTo: (location: GeoLocation, zoom?: number, duration?: number) => void;
  getBounds: () => { north: number; south: number; east: number; west: number } | null;
  invalidateSize?: () => void;
  setLocationSelectMode?: (enabled: boolean, onSelect: (location: GeoLocation) => void) => void;
}

export interface MapAdapter {
  initMap: (container: HTMLDivElement, center: GeoLocation, zoom?: number) => Promise<MapInstance>;
}
