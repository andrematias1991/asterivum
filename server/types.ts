import type { Request } from 'express';

export type Role = 'USER' | 'ADMIN';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
  sessionTokenHash?: string;
  csrfHash?: string;
}

export interface BirthData {
  name: string;
  birthDate: string;
  birthTime: string;
  place: string;
  latitude: number;
  longitude: number;
  timezone: number;
  timezoneId?: string | null;
  houseSystem?: 'PLACIDUS' | 'WHOLE_SIGN' | 'EQUAL';
  zodiac?: 'TROPICAL' | 'SIDEREAL';
}
