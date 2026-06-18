"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshTokenExpiresAt = exports.hashToken = exports.verifyRefreshToken = exports.verifyAccessToken = exports.signRefreshToken = exports.signAccessToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'change-me-access-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret';
const signAccessToken = (payload) => jsonwebtoken_1.default.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
exports.signAccessToken = signAccessToken;
const signRefreshToken = (payload) => jsonwebtoken_1.default.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
exports.signRefreshToken = signRefreshToken;
const verifyAccessToken = (token) => jsonwebtoken_1.default.verify(token, ACCESS_SECRET);
exports.verifyAccessToken = verifyAccessToken;
const verifyRefreshToken = (token) => jsonwebtoken_1.default.verify(token, REFRESH_SECRET);
exports.verifyRefreshToken = verifyRefreshToken;
const hashToken = (token) => crypto_1.default.createHash('sha256').update(token).digest('hex');
exports.hashToken = hashToken;
const refreshTokenExpiresAt = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
};
exports.refreshTokenExpiresAt = refreshTokenExpiresAt;
