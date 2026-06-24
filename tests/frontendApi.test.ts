import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureAuthSession, getProfile } from '../frontend/src/api';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('frontend API session refresh', () => {
  it('rotates tokens and retries a protected request once', async () => {
    const onRefreshed = vi.fn();
    const onExpired = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Invalid or expired token' }, 401))
      .mockResolvedValueOnce(jsonResponse({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      }))
      .mockResolvedValueOnce(jsonResponse({
        displayName: 'Example Lifter',
        unitPreference: 'kg',
      }));
    vi.stubGlobal('fetch', fetchMock);
    const cleanup = configureAuthSession({
      getRefreshToken: () => 'stored-refresh-token',
      onRefreshed,
      onExpired,
    });

    try {
      const profile = await getProfile('expired-access-token');

      expect(profile.displayName).toBe('Example Lifter');
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[1][0]).toContain('/api/auth/refresh');
      expect(fetchMock.mock.calls[1][1]).toMatchObject({
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'stored-refresh-token' }),
      });
      const retryHeaders = fetchMock.mock.calls[2][1]?.headers as Headers;
      expect(retryHeaders.get('Authorization')).toBe('Bearer new-access-token');
      expect(onRefreshed).toHaveBeenCalledWith({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
      expect(onExpired).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('expires the local session when refresh is rejected', async () => {
    const onExpired = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Invalid or expired token' }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: 'Invalid refresh token' }, 401));
    vi.stubGlobal('fetch', fetchMock);
    const cleanup = configureAuthSession({
      getRefreshToken: () => 'expired-refresh-token',
      onRefreshed: vi.fn(),
      onExpired,
    });

    try {
      await expect(getProfile('expired-access-token')).rejects.toThrow('Session expired');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(onExpired).toHaveBeenCalledOnce();
    } finally {
      cleanup();
    }
  });
});
