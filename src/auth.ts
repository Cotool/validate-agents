import * as core from '@actions/core';

export interface AuthInputs {
    /** OIDC audience requested from GitHub and verified by the Cotool API. */
    audience: string;
}

export interface AuthResult {
    /** Full value for the `Authorization` header. */
    header: string;
}

/** Injectable for tests; defaults to GitHub's runtime OIDC minting. */
export interface AuthDeps {
    getIdToken: (audience: string) => Promise<string>;
    /** True when the workflow granted `permissions: id-token: write`. */
    oidcAvailable: () => boolean;
}

const defaultDeps: AuthDeps = {
    getIdToken: (audience) => core.getIDToken(audience),
    oidcAvailable: () =>
        Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_URL) &&
        Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN),
};

/**
 * Resolve the Authorization header.
 *
 * The action authenticates exclusively via GitHub OIDC: it mints a short-lived,
 * repo-scoped token (no stored secret) that the Cotool API verifies. The validate
 * endpoint also accepts API keys, but only for programmatic / self-hosted callers
 * hitting it directly — never through this action.
 */
export async function resolveAuthHeader(
    inputs: AuthInputs,
    deps: AuthDeps = defaultDeps,
): Promise<AuthResult> {
    if (!deps.oidcAvailable()) {
        throw new Error(
            "This action authenticates via GitHub OIDC, but no OIDC token is available. Add `permissions: id-token: write` to the job and run it on GitHub-hosted CI.",
        );
    }
    const token = await deps.getIdToken(inputs.audience);
    return { header: `Bearer ${token}` };
}
