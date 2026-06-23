import type {
    Diagnostic,
    FileResult,
    ValidateFile,
    ValidateResponse,
} from './types';

const VALIDATE_PATH = '/api/agent-sync/validate';

export class ValidateApiError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
        this.name = 'ValidateApiError';
    }
}

export interface ValidateClientOptions {
    apiUrl: string;
    /** Full `Authorization` header value (e.g. "Bearer ..."). */
    authHeader: string;
    files: ValidateFile[];
    /** Injectable for tests; defaults to the Node 20 global `fetch`. */
    fetchImpl?: typeof fetch;
}

/**
 * POST the files to the Cotool validate endpoint as a single batch.
 *
 * Posting everything in one request preserves cross-file checks (duplicate
 * `sync_key`, `agentTools` references, dependency cycles); chunking would weaken them.
 */
export async function callValidate(opts: ValidateClientOptions): Promise<ValidateResponse> {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const url = joinUrl(opts.apiUrl, VALIDATE_PATH);

    let res: Response;
    try {
        res = await fetchImpl(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: opts.authHeader,
            },
            body: JSON.stringify({ files: opts.files }),
        });
    } catch (err) {
        throw new ValidateApiError(
            `Could not reach the Cotool API at ${url}: ${err instanceof Error ? err.message : String(err)}. Check the \`api_url\` input and network access.`,
        );
    }

    if (!res.ok) {
        await throwForStatus(res, url);
    }

    let raw: unknown;
    try {
        raw = await res.json();
    } catch {
        throw new ValidateApiError(`The Cotool API returned a non-JSON response from ${url}.`, res.status);
    }

    return normalizeResponse(raw);
}

async function throwForStatus(res: Response, url: string): Promise<never> {
    const bodyExcerpt = (await safeReadBody(res)).slice(0, 500);

    if (res.status === 401 || res.status === 403) {
        throw new ValidateApiError(
            `Authentication failed (${res.status}). Ensure the job has \`permissions: id-token: write\`, the \`audience\` matches the Cotool API, and this repo is configured as your org's GitOps sync source in Cotool (that registration is what authorizes the repo). API URL: ${url}.`,
            res.status,
        );
    }
    if (res.status >= 500) {
        throw new ValidateApiError(
            `The Cotool API returned ${res.status} from ${url}. Response: ${bodyExcerpt}`,
            res.status,
        );
    }
    throw new ValidateApiError(
        `The Cotool API returned ${res.status} from ${url}. Response: ${bodyExcerpt}`,
        res.status,
    );
}

async function safeReadBody(res: Response): Promise<string> {
    try {
        return await res.text();
    } catch {
        return '<unreadable body>';
    }
}

/**
 * Coerce the API response into our shape, tolerating unknown extra fields and
 * missing optional fields (forward-compat with the additive-only contract).
 */
export function normalizeResponse(raw: unknown): ValidateResponse {
    if (!isRecord(raw)) {
        throw new ValidateApiError('The Cotool API returned an unexpected response shape.');
    }

    const results = Array.isArray(raw.results)
        ? raw.results.map(normalizeFileResult)
        : [];

    return {
        valid: typeof raw.valid === 'boolean' ? raw.valid : results.every((r) => r.valid),
        fileCount: typeof raw.fileCount === 'number' ? raw.fileCount : results.length,
        agentCount: typeof raw.agentCount === 'number' ? raw.agentCount : 0,
        results,
    };
}

function normalizeFileResult(raw: unknown): FileResult {
    const rec = isRecord(raw) ? raw : {};
    const errors = Array.isArray(rec.errors) ? rec.errors.map(normalizeDiagnostic) : [];
    const warnings = Array.isArray(rec.warnings) ? rec.warnings.map(normalizeDiagnostic) : [];
    return {
        path: typeof rec.path === 'string' ? rec.path : '',
        valid: typeof rec.valid === 'boolean' ? rec.valid : errors.length === 0,
        errors,
        warnings,
    };
}

function normalizeDiagnostic(raw: unknown): Diagnostic {
    const rec = isRecord(raw) ? raw : {};
    const diag: Diagnostic = {
        code: typeof rec.code === 'string' ? rec.code : 'unknown',
        message: typeof rec.message === 'string' ? rec.message : '',
    };
    if (typeof rec.line === 'number') diag.line = rec.line;
    if (typeof rec.column === 'number') diag.column = rec.column;
    return diag;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function joinUrl(base: string, suffix: string): string {
    return `${base.replace(/\/+$/, '')}${suffix}`;
}
