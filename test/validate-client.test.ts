import { describe, expect, it, vi } from 'vitest';

import { callValidate, normalizeResponse, ValidateApiError } from '../src/validate-client';

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('callValidate', () => {
    it('posts files as a single batch to the validate path with the auth header', async () => {
        const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) =>
            jsonResponse({
                valid: true,
                fileCount: 1,
                agentCount: 1,
                results: [{ path: 'cotool/agents/a.yaml', valid: true, errors: [], warnings: [] }],
            }),
        );

        await callValidate({
            apiUrl: 'https://app.cotool.ai/',
            authHeader: 'Bearer token-123',
            files: [{ path: 'cotool/agents/a.yaml', content: 'x' }],
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0]!;
        expect(url).toBe('https://app.cotool.ai/api/agent-sync/validate');
        expect(init.method).toBe('POST');
        const headers = init.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer token-123');
        expect(JSON.parse(init.body as string)).toEqual({
            files: [{ path: 'cotool/agents/a.yaml', content: 'x' }],
        });
    });

    it('passes through line/column on diagnostics when present', async () => {
        const fetchImpl = vi.fn(async () =>
            jsonResponse({
                valid: false,
                fileCount: 1,
                agentCount: 0,
                results: [
                    {
                        path: 'cotool/agents/bad.yaml',
                        valid: false,
                        errors: [{ code: 'yaml_error', message: 'bad indent', line: 3, column: 5 }],
                        warnings: [],
                    },
                ],
            }),
        );

        const res = await callValidate({
            apiUrl: 'https://app.cotool.ai',
            authHeader: 'Bearer t',
            files: [{ path: 'cotool/agents/bad.yaml', content: 'x' }],
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });

        expect(res.results[0]!.errors[0]).toEqual({
            code: 'yaml_error',
            message: 'bad indent',
            line: 3,
            column: 5,
        });
    });

    it('throws an auth-specific error on 401', async () => {
        const fetchImpl = vi.fn(async () => new Response('nope', { status: 401 }));
        await expect(
            callValidate({
                apiUrl: 'https://app.cotool.ai',
                authHeader: 'Bearer bad',
                files: [{ path: 'a.yaml', content: 'x' }],
                fetchImpl: fetchImpl as unknown as typeof fetch,
            }),
        ).rejects.toMatchObject({ status: 401, name: 'ValidateApiError' });
    });

    it('throws with a body excerpt on 5xx', async () => {
        const fetchImpl = vi.fn(async () => new Response('boom', { status: 503 }));
        await expect(
            callValidate({
                apiUrl: 'https://app.cotool.ai',
                authHeader: 'Bearer t',
                files: [{ path: 'a.yaml', content: 'x' }],
                fetchImpl: fetchImpl as unknown as typeof fetch,
            }),
        ).rejects.toThrow(/503.*boom/);
    });

    it('wraps network failures in a ValidateApiError', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new Error('ECONNREFUSED');
        });
        await expect(
            callValidate({
                apiUrl: 'http://localhost:9999',
                authHeader: 'Bearer t',
                files: [{ path: 'a.yaml', content: 'x' }],
                fetchImpl: fetchImpl as unknown as typeof fetch,
            }),
        ).rejects.toThrow(ValidateApiError);
    });
});

describe('normalizeResponse', () => {
    it('tolerates unknown extra fields and missing optional fields', () => {
        const res = normalizeResponse({
            valid: false,
            fileCount: 2,
            agentCount: 1,
            futureField: 'ignored',
            results: [
                {
                    path: 'a.yaml',
                    valid: false,
                    errors: [{ code: 'schema_error', message: 'oops', somethingNew: true }],
                    // warnings omitted entirely
                },
                { path: 'b.yaml', valid: true },
            ],
        });

        expect(res.valid).toBe(false);
        expect(res.results[0]!.errors[0]).toEqual({ code: 'schema_error', message: 'oops' });
        expect(res.results[0]!.warnings).toEqual([]);
        expect(res.results[1]!.errors).toEqual([]);
    });

    it('derives valid/fileCount when the top-level fields are missing', () => {
        const res = normalizeResponse({
            results: [{ path: 'a.yaml', valid: true, errors: [], warnings: [] }],
        });
        expect(res.valid).toBe(true);
        expect(res.fileCount).toBe(1);
    });

    it('throws on a non-object response', () => {
        expect(() => normalizeResponse('not json')).toThrow(ValidateApiError);
    });

    it('throws when the response has no per-file results', () => {
        expect(() => normalizeResponse({ valid: true, fileCount: 1, agentCount: 1, results: [] })).toThrow(
            ValidateApiError,
        );
    });
});
