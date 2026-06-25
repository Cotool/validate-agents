import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { discoverFiles } from '../src/discover';
import { callValidate } from '../src/validate-client';
import type { ValidateFile } from '../src/types';

// End-to-end against a real `make dev` backend, exercising discovery + the validate
// client (the action's internals) over the live endpoint. The action authenticates
// only via OIDC — which GitHub mints solely inside real Actions runs — so this drives
// the endpoint directly with an API-key Bearer (the endpoint still accepts keys for
// programmatic callers). Skipped unless both env vars are set:
//
//   E2E_API_URL=http://localhost:3000 E2E_API_KEY=<cotool-api-key> npm test
const apiUrl = process.env.E2E_API_URL;
const apiKey = process.env.E2E_API_KEY;
const enabled = Boolean(apiUrl && apiKey);

const workspace = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'repo');
const authHeader = `Bearer ${apiKey}`;

async function readBatch(paths: string[]): Promise<ValidateFile[]> {
    return Promise.all(
        paths.map(async (p) => ({ path: p, content: await fs.readFile(path.join(workspace, p), 'utf8') })),
    );
}

describe.skipIf(!enabled)('local e2e against a real backend', () => {
    it('reports the valid fixtures as valid', async () => {
        const paths = await discoverFiles({
            workspace,
            dir: 'cotool/agents',
            file: 'cotool/agents/triage.yaml,cotool/agents/responder.yaml,cotool/agents/nested/dag.yml',
            recursive: true,
        });
        const files = await readBatch(paths);
        const response = await callValidate({ apiUrl: apiUrl!, authHeader, files });
        expect(response.valid).toBe(true);
    });

    it('reports the broken fixture as invalid with an error', async () => {
        const paths = await discoverFiles({ workspace, dir: 'cotool/agents', file: '', recursive: true });
        const files = await readBatch(paths);
        const response = await callValidate({ apiUrl: apiUrl!, authHeader, files });
        expect(response.valid).toBe(false);
        const broken = response.results.find((r) => r.path.includes('broken-unknown-key.yaml'));
        expect(broken?.errors.length ?? 0).toBeGreaterThan(0);
    });
});
