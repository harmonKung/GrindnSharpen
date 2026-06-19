import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || 'change-me-access-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret';

export interface JwtPayload {
  userId: string;
  email:  string;
}

export const signAccessToken = (payload: JwtPayload): string =>
  jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });

export const signRefreshToken = (payload: JwtPayload): string =>
  jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });

export const verifyAccessToken = (token: string): JwtPayload =>
  jwt.verify(token, ACCESS_SECRET) as JwtPayload;

export const verifyRefreshToken = (token: string): JwtPayload =>
  jwt.verify(token, REFRESH_SECRET) as JwtPayload;

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

export const refreshTokenExpiresAt = (): Date => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
};