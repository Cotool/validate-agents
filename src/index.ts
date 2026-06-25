import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import * as core from '@actions/core';

import { resolveAuthHeader } from './auth';
import { discoverFiles } from './discover';
import type { FileResult, ValidateFile, ValidateResponse } from './types';
import { callValidate, ValidateApiError } from './validate-client';

async function run(): Promise<void> {
    const apiUrl = core.getInput('api_url') || 'https://app.cotool.ai';
    const dir = core.getInput('dir') || 'cotool/agents';
    const file = core.getInput('file');
    const recursive = core.getBooleanInput('recursive');
    const failOnWarnings = core.getBooleanInput('fail_on_warnings');
    const audience = core.getInput('audience') || 'cotool-validate';

    const workspace = process.env.GITHUB_WORKSPACE || process.cwd();

    // 1. Discover the files to validate (repo-relative paths).
    const paths = await discoverFiles({ workspace, dir, file, recursive });
    if (paths.length === 0) {
        core.warning(
            `No agent files found in "${dir}" (looked for *.yaml/*.yml/*.md${recursive ? ', recursively' : ''}). Nothing to validate.`,
        );
        core.setOutput('valid', 'true');
        core.setOutput('error_count', '0');
        core.setOutput('warning_count', '0');
        return;
    }
    const source = file.trim().length > 0 ? 'the "file" input' : `"${dir}"`;
    core.info(`Validating ${paths.length} file(s) from ${source}:\n${paths.map((p) => `  - ${p}`).join('\n')}`);

    // 2. Read contents (utf8) into the request batch.
    const files = await readFiles(workspace, paths);

    // 3. Mint a GitHub OIDC token and call the validate endpoint.
    const auth = await resolveAuthHeader({ audience });
    core.info('Authenticating with GitHub OIDC.');

    const response = await callValidate({ apiUrl, authHeader: auth.header, files });

    // 4. Annotate + summarize + set outputs + decide pass/fail.
    annotate(response);
    const { errorCount, warningCount } = countDiagnostics(response.results);
    const valid = response.valid && errorCount === 0;
    await writeSummary(response, valid, errorCount, warningCount);

    core.setOutput('valid', String(valid));
    core.setOutput('error_count', String(errorCount));
    core.setOutput('warning_count', String(warningCount));

    if (!valid) {
        core.setFailed(`Validation failed: ${errorCount} error(s) across ${response.fileCount} file(s).`);
        return;
    }
    if (failOnWarnings && warningCount > 0) {
        core.setFailed(`Validation passed but fail_on_warnings is set and there are ${warningCount} warning(s).`);
        return;
    }
    core.info(`✓ All ${response.fileCount} file(s) valid (${response.agentCount} agent(s)).`);
}

async function readFiles(workspace: string, paths: string[]): Promise<ValidateFile[]> {
    return Promise.all(
        paths.map(async (p) => ({
            path: p,
            content: await fs.readFile(path.join(workspace, p), 'utf8'),
        })),
    );
}

function annotate(response: ValidateResponse): void {
    for (const fileResult of response.results) {
        for (const err of fileResult.errors) {
            core.error(err.message, {
                file: fileResult.path,
                ...(err.line !== undefined ? { startLine: err.line } : {}),
                ...(err.column !== undefined ? { startColumn: err.column } : {}),
                title: `Cotool ${err.code}`,
            });
        }
        for (const warn of fileResult.warnings) {
            core.warning(warn.message, {
                file: fileResult.path,
                ...(warn.line !== undefined ? { startLine: warn.line } : {}),
                ...(warn.column !== undefined ? { startColumn: warn.column } : {}),
                title: `Cotool ${warn.code}`,
            });
        }
    }
}

function countDiagnostics(results: FileResult[]): { errorCount: number; warningCount: number } {
    let errorCount = 0;
    let warningCount = 0;
    for (const r of results) {
        errorCount += r.errors.length;
        warningCount += r.warnings.length;
    }
    return { errorCount, warningCount };
}

async function writeSummary(
    response: ValidateResponse,
    valid: boolean,
    errorCount: number,
    warningCount: number,
): Promise<void> {
    const rows = response.results.map((r) => [
        r.path,
        r.valid ? '✓' : '✗',
        String(r.errors.length),
        String(r.warnings.length),
    ]);

    core.summary
        .addHeading('Cotool Agent Validation', 2)
        .addRaw(
            `**${valid ? '✓ valid' : '✗ invalid'}** — ${response.fileCount} file(s), ${response.agentCount} agent(s), ${errorCount} error(s), ${warningCount} warning(s).`,
        )
        .addTable([
            [
                { data: 'File', header: true },
                { data: 'Valid', header: true },
                { data: 'Errors', header: true },
                { data: 'Warnings', header: true },
            ],
            ...rows,
        ]);

    try {
        await core.summary.write();
    } catch {
        // Summary is best-effort (e.g. GITHUB_STEP_SUMMARY not set in local runs).
    }
}

run().catch((err) => {
    if (err instanceof ValidateApiError) {
        core.setFailed(err.message);
    } else {
        core.setFailed(err instanceof Error ? err.message : String(err));
    }
});
