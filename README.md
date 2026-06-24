# Cotool Validate Agents — GitHub Action

Validate your [Cotool Response-Agents-as-Code](https://app.cotool.ai) YAML on every pull
request. The action discovers your agent files, posts them to the Cotool validate API
(`POST /api/agent-sync/validate`) — the same parse, schema, and cross-file graph checks the
GitOps sync engine runs — and reports any problems as inline PR annotations.

## Usage

### Recommended: GitHub OIDC (no stored secret)

The job mints a short-lived GitHub OIDC token; Cotool verifies it and maps the repository to
your org via your GitOps sync configuration. Nothing to store or rotate.

```yaml
# .github/workflows/validate-agents.yml
on:
  pull_request:
    paths: ['cotool/agents/**']
permissions:
  contents: read
  id-token: write          # lets the job mint the OIDC token
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: cotool/validate-agents@v1
        with:
          dir: cotool/agents
```

> Requires that this repository is configured as your org's agents source in Cotool
> (Settings → Agents → GitOps sync). That registration is what authorizes the repo.

This action authenticates **only** via GitHub OIDC — it never takes an API key. The job
must grant `permissions: id-token: write`. (The Cotool validate endpoint itself also
accepts an API key, but only for programmatic or self-hosted callers hitting
`POST /api/agent-sync/validate` directly — not through this action.)

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `api_url` | `https://app.cotool.ai` | Base URL of the Cotool API. |
| `dir` | `cotool/agents` | Directory to scan for agent YAML (and referenced prompt `.md`). Matches the GitOps sync `path` default. |
| `file` | — | Comma-separated explicit file list. Overrides directory discovery. |
| `recursive` | `true` | Recurse into subdirectories of `dir`. |
| `audience` | `cotool-validate` | OIDC audience requested from GitHub and verified by the API. |
| `fail_on_warnings` | `false` | Fail the check when warnings are present (errors always fail). |

## Outputs

| Output | Description |
|--------|-------------|
| `valid` | `true` when every validated YAML file has no errors. |
| `error_count` | Total error-severity diagnostics. |
| `warning_count` | Total warning-severity diagnostics. |

## How it works

1. **Discover** — globs `dir` for `*.yaml`/`*.yml` (plus every `*.md`, so `systemPrompt.file`
   references resolve). Mirrors the sync engine's discovery. `file` overrides this.
2. **Post once** — sends all files in a single request so cross-file checks (duplicate
   `sync_key`, `agentTools` references, dependency cycles) work.
3. **Annotate** — emits `::error`/`::warning` per diagnostic, at the file's line when the API
   provides one (`yaml_error` positions). Writes a summary table.
4. **Fail** — non-zero exit when any file is invalid, or on warnings if `fail_on_warnings`.
   An empty discovery warns and exits 0 (a misconfigured `dir` shouldn't hard-fail CI).

Warnings are checks that need live org state the request can't see (an unprovided
`systemPrompt.file`, or an `agentTools` sync_key not in the posted set) and never fail the run.

## Development

```bash
npm install
npm test          # vitest units (discover, auth, validate-client)
npm run typecheck
npm run build     # bundles src → dist/index.js via ncc (commit the result)
npm run all       # typecheck + test + build
```

`dist/index.js` is committed — GitHub runs the action from it. CI fails if it drifts from a
fresh build.

### Local testing

GitHub only mints OIDC tokens inside real Actions runs, so the action's OIDC auth path
can't be driven locally. You can still exercise the full bundle offline — the bundled
smoke stub stands in for both the validate API and GitHub's OIDC token service, so the
real `core.getIDToken` code path runs with no secret and no network:

```bash
node test/smoke/stub-server.mjs 7799 &
GITHUB_WORKSPACE="$PWD/test/fixtures/repo" \
INPUT_API_URL=http://127.0.0.1:7799 INPUT_DIR=cotool/agents \
INPUT_RECURSIVE=true INPUT_FAIL_ON_WARNINGS=false \
ACTIONS_ID_TOKEN_REQUEST_URL='http://127.0.0.1:7799/oidc?stub=1' \
ACTIONS_ID_TOKEN_REQUEST_TOKEN=stub \
node dist/index.js
```

The suite also includes an optional end-to-end test that runs only when `E2E_API_URL` and
`E2E_API_KEY` are set (pointing at a reachable Cotool API); it is skipped otherwise.

## Releasing

`dist/index.js` is committed and CI enforces it matches a fresh build, so a release is just a tag:

1. Merge to `master` with a green CI (build + tests + dist drift check).
2. Tag an immutable `v1.0.0` and move the `v1` major tag to it; reference `@v1` from docs.
   ```bash
   git tag v1.0.0 && git tag -f v1 && git push origin v1.0.0 && git push -f origin v1
   ```
3. Consumers pin `uses: cotool/validate-agents@v1` and grant `permissions: id-token: write`.
