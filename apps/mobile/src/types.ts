export type Language = 'en' | 'pt-PT';

export type User = {
  id: number;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  status?: string;
};

export type Profile = {
  id?: number;
  name: string;
  birthDate: string;
  birthTime: string;
  place: string;
  latitude: number;
  longitude: number;
  timezone: number;
  timezoneId?: string | null;
  houseSystem: 'PLACIDUS' | 'WHOLE_SIGN' | 'EQUAL';
  zodiac: 'TROPICAL' | 'SIDEREAL';
  notes: string;
  isPrimary: boolean | number;
};

export type Planet = {
  name: string;
  glyph: string;
  longitude: number;
  sign: string;
  signIndex: number;
  degree: number;
  minute: number;
  retrograde: boolean;
};

export type Aspect = {
  from: string;
  to: string;
  type: string;
  glyph: string;
  angle: number;
  orb: number;
};

export type Chart = {
  mode: string;
  chartDate: string;
  natalDate: string;
  planets: Planet[];
  natal: Planet[];
  houses: { number: number; longitude: number; sign: string }[];
  aspects: Aspect[];
  natalAspects: Aspect[];
  angles: { ascendant: Planet; midheaven: Planet };
  settings: { zodiac: string; houseSystem: string; houseAccuracy: string };
};

export type LocationResult = {
  id: number;
  name: string;
  label: string;
  latitude: number;
  longitude: number;
  timezone: string | null;
};

export type EphemerisRow = { date: string; planets: Planet[] };
export type AuthResponse = { user: User; sessionToken: string };

