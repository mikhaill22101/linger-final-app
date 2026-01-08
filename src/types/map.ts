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
}

export interface MapInstance {
  destroy: () => void;
  setMarkers: (impulses: ImpulseLocation[], onClick: (impulse: ImpulseLocation) => void, activeCategory?: string | null) => void;
  setActiveCategory?: (category: string | null) => void;
}

export interface MapAdapter {
  initMap: (container: HTMLDivElement, center: GeoLocation) => Promise<MapInstance>;
}
