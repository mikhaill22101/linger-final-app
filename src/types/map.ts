export type MapProvider = '2gis' | 'osm';

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
}

export interface MapInstance {
  destroy: () => void;
  setMarkers: (impulses: ImpulseLocation[], onClick: (impulse: ImpulseLocation) => void, activeCategory?: string | null, nearestEventId?: number) => void;
  setActiveCategory?: (category: string | null) => void;
  flyTo: (location: GeoLocation, zoom?: number) => void;
  getBounds: () => { north: number; south: number; east: number; west: number } | null;
  invalidateSize?: () => void;
  setLocationSelectMode?: (enabled: boolean, onSelect: (location: GeoLocation) => void) => void;
}

export interface MapAdapter {
  initMap: (container: HTMLDivElement, center: GeoLocation, zoom?: number) => Promise<MapInstance>;
}
