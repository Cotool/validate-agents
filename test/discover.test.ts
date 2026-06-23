import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { discoverFiles } from '../src/discover';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.join(here, 'fixtures', 'repo');

describe('discoverFiles', () => {
    it('recursively finds yaml/yml/md under dir and excludes files outside it', async () => {
        const files = await discoverFiles({ workspace, dir: 'cotool/agents', file: '', recursive: true });

        expect(files).toEqual([
            'cotool/agents/README.md',
            'cotool/agents/broken-unknown-key.yaml',
            'cotool/agents/nested/dag.yml',
            'cotool/agents/prompts/responder.md',
            'cotool/agents/responder.yaml',
            'cotool/agents/triage.yaml',
        ]);
        // Sanity: the file outside the agents dir is never included.
        expect(files).not.toContain('other/thing.yaml');
    });

    it('includes .md files (so systemPrompt.file references resolve)', async () => {
        const files = await discoverFiles({ workspace, dir: 'cotool/agents', file: '', recursive: true });
        expect(files).toContain('cotool/agents/prompts/responder.md');
        expect(files).toContain('cotool/agents/README.md');
    });

    it('does not recurse when recursive is false', async () => {
        const files = await discoverFiles({ workspace, dir: 'cotool/agents', file: '', recursive: false });

        expect(files).toEqual([
            'cotool/agents/README.md',
            'cotool/agents/broken-unknown-key.yaml',
            'cotool/agents/responder.yaml',
            'cotool/agents/triage.yaml',
        ]);
        expect(files.some((f) => f.includes('/nested/') || f.includes('/prompts/'))).toBe(false);
    });

    it('honors an explicit comma-separated file list, overriding discovery', async () => {
        const files = await discoverFiles({
            workspace,
            dir: 'cotool/agents',
            file: 'cotool/agents/triage.yaml, cotool/agents/responder.yaml',
            recursive: true,
        });
        expect(files).toEqual(['cotool/agents/responder.yaml', 'cotool/agents/triage.yaml']);
    });

    it('tolerates a trailing slash on dir', async () => {
        const files = await discoverFiles({ workspace, dir: 'cotool/agents/', file: '', recursive: true });
        expect(files).toContain('cotool/agents/triage.yaml');
    });

    it('returns an empty array for an empty/missing directory', async () => {
        const files = await discoverFiles({ workspace, dir: 'cotool/does-not-exist', file: '', recursive: true });
        expect(files).toEqual([]);
    });
});
