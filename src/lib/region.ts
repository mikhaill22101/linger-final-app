import type { GeoLocation, MapProvider } from '../types/map';

// Очень грубые bounding boxes для стран СНГ. Этого достаточно для разделения провайдера карт.
// Координаты в формате [minLat, minLng, maxLat, maxLng]
const CIS_BOUNDS: Array<[number, number, number, number]> = [
  // Russia (очень крупный прямоугольник)
  [41, 19, 82, 191],
  // Belarus
  [51, 23, 56, 33],
  // Kazakhstan
  [40, 46, 56, 88],
  // Ukraine
  [44, 22, 53, 41],
  // Armenia
  [38, 43, 42, 47],
  // Azerbaijan
  [38, 44, 42, 51],
  // Georgia
  [41, 40, 44, 47],
  // Kyrgyzstan
  [39, 69, 44, 81],
  // Tajikistan
  [36, 67, 41, 75],
  // Uzbekistan
  [37, 55, 46, 74],
  // Moldova
  [45, 26, 49, 31],
];

export function isInCIS(location: GeoLocation): boolean {
  const { lat, lng } = location;
  return CIS_BOUNDS.some(([minLat, minLng, maxLat, maxLng]) => (
    lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng
  ));
}

export function getMapProvider(_location: GeoLocation | null): MapProvider {
  // Всегда используем OSM для всех регионов
  return 'osm';
}
