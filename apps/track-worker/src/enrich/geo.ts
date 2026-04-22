export interface GeoData {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

function clamp(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  if (value < min || value > max) return undefined;
  return value;
}

export function extractGeo(request: Request): GeoData {
  const cf = (request as unknown as { cf?: Record<string, unknown> }).cf ?? {};
  const lat = typeof cf.latitude === "string" ? parseFloat(cf.latitude) : undefined;
  const lon = typeof cf.longitude === "string" ? parseFloat(cf.longitude) : undefined;
  return {
    country: typeof cf.country === "string" ? cf.country : undefined,
    region: typeof cf.region === "string" ? cf.region : undefined,
    city: typeof cf.city === "string" ? cf.city : undefined,
    latitude: clamp(lat, -90, 90),
    longitude: clamp(lon, -180, 180),
  };
}
