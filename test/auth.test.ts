import { describe, expect, it, vi } from 'vitest';

import { resolveAuthHeader, type AuthDeps } from '../src/auth';

function deps(overrides: Partial<AuthDeps> = {}): AuthDeps {
    return {
        getIdToken: vi.fn(async () => 'oidc-jwt-token'),
        oidcAvailable: () => true,
        ...overrides,
    };
}

describe('resolveAuthHeader', () => {
    it('mints a GitHub OIDC token for the requested audience', async () => {
        const d = deps();
        const result = await resolveAuthHeader({ audience: 'cotool-validate' }, d);
        expect(result).toEqual({ header: 'Bearer oidc-jwt-token' });
        expect(d.getIdToken).toHaveBeenCalledWith('cotool-validate');
    });

    it('throws a helpful error when no OIDC token is available', async () => {
        const d = deps({ oidcAvailable: () => false });
        await expect(resolveAuthHeader({ audience: 'a' }, d)).rejects.toThrow(/id-token: write/);
        expect(d.getIdToken).not.toHaveBeenCalled();
    });
});
