import * as path from 'node:path';

import * as glob from '@actions/glob';

export interface DiscoverOptions {
    /** Absolute repo root (GITHUB_WORKSPACE). Discovered paths are returned relative to this. */
    workspace: string;
    /** Repo-relative directory to scan (e.g. "cotool/agents"). */
    dir: string;
    /** Optional comma-separated explicit file list; when non-empty, overrides directory discovery. */
    file: string;
    /** Recurse into subdirectories of `dir`. */
    recursive: boolean;
}

/**
 * Discover the files to post to the validate endpoint.
 *
 * Mirrors the GitOps sync engine's `github-source.ts listYamlKeys` (which globs
 * `${path}/**` for `/\.ya?ml$/`), and additionally includes every `.md` under `dir`.
 * The endpoint only uses `.md` files to resolve `systemPrompt.file` references and
 * ignores them for `fileCount`, so over-including them is safe and avoids a fragile
 * per-YAML pre-parse to figure out which prompt files are referenced.
 *
 * Returned paths are repo-relative (POSIX separators) so they match GitHub annotation
 * paths and the engine's cross-file keys.
 */
export async function discoverFiles(opts: DiscoverOptions): Promise<string[]> {
    const explicit = opts.file
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

    if (explicit.length > 0) {
        return dedupeSorted(explicit.map(toPosix));
    }

    // Build absolute patterns rooted at the workspace so discovery is independent
    // of process.cwd() (in real Actions cwd is GITHUB_WORKSPACE, but not in tests).
    const base = `${stripTrailingSlash(toPosix(opts.workspace))}/${stripTrailingSlash(toPosix(opts.dir))}`;
    const depth = opts.recursive ? '**/' : '';
    const patterns = [
        `${base}/${depth}*.yaml`,
        `${base}/${depth}*.yml`,
        `${base}/${depth}*.md`,
    ].join('\n');

    const globber = await glob.create(patterns, {
        matchDirectories: false,
        implicitDescendants: false,
    });
    const absolute = await globber.glob();

    const relative = absolute.map((abs) => toPosix(path.relative(opts.workspace, abs)));
    return dedupeSorted(relative);
}

function toPosix(p: string): string {
    return p.split(path.sep).join('/');
}

function stripTrailingSlash(p: string): string {
    return p.endsWith('/') ? p.slice(0, -1) : p;
}

function dedupeSorted(paths: string[]): string[] {
    return Array.from(new Set(paths)).sort();
}
