import type { Request } from 'express';

export type Role = 'USER' | 'ADMIN';
export type AccountType = 'NORMAL' | 'PROFESSIONAL' | 'CLINIC';
export type VerificationStatus = 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  accountType: AccountType;
  verificationStatus: VerificationStatus;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
  sessionTokenHash?: string;
  csrfHash?: string;
  authMode?: 'cookie' | 'bearer';
}

export interface BirthData {
  name: string;
  birthDate: string;
  birthTime: string;
  place: string;
  latitude: number;
  longitude: number;
  timezone?: number;
  timezoneId?: string | null;
  houseSystem?: 'PLACIDUS' | 'WHOLE_SIGN' | 'EQUAL';
  zodiac?: 'TROPICAL' | 'SIDEREAL';
}
