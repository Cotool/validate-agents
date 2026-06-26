# Cotool Validate Agents — GitHub Action

A GitHub Action that validates your [Cotool Response-Agents-as-Code](https://app.cotool.ai) YAML on every pull request and reports errors as inline PR annotations. <!-- test: member fork PR -->

## Usage

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

> **Prerequisite:** this repository must be configured as your org's agents source in Cotool
> (Settings → Agents → GitOps sync). That registration is what authorizes the repo — no API
> key to store or rotate.

## AI editor setup (optional)

If you use Claude Code or Cursor, you can install a `/setup-validate-agents` slash command
that wires up the workflow file for you automatically.

**Claude Code**

```bash
mkdir -p .claude/commands && curl -fsSL \
  https://raw.githubusercontent.com/Cotool/validate-agents/master/.claude/commands/setup-validate-agents.md \
  -o .claude/commands/setup-validate-agents.md
```

**Cursor**

```bash
mkdir -p .cursor/commands && curl -fsSL \
  https://raw.githubusercontent.com/Cotool/validate-agents/master/.cursor/commands/setup-validate-agents.md \
  -o .cursor/commands/setup-validate-agents.md
```

Run one of the above in your repo, then type `/setup-validate-agents` in the editor chat.
The agent will find your agent directory, create the workflow file, and remind you about the
GitOps sync prerequisite.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `dir` | No | `cotool/agents` | Directory to scan for agent YAML (and referenced prompt `.md`). Matches the GitOps sync `path` default. |
| `file` | No | — | Comma-separated explicit file list. Overrides directory discovery. |
| `recursive` | No | `true` | Recurse into subdirectories of `dir`. |
| `fail_on_warnings` | No | `false` | Fail the check when warnings are present (errors always fail). |
| `api_url` | No | `https://app.cotool.ai` | Base URL of the Cotool API. |
| `audience` | No | `cotool-validate` | OIDC audience requested from GitHub and verified by the API. |

### Discovering files

If neither `file` nor `dir` is specified the action falls back to scanning `cotool/agents`
recursively — the same default the GitOps sync engine uses, so no extra configuration is
needed for the common layout.

Use `file` when you want to validate a specific subset:

```yaml
- uses: cotool/validate-agents@v1
  with:
    file: cotool/agents/my-agent.yaml,cotool/agents/other-agent.yaml
```

Warnings surface checks that require live org state the action can't see (a missing
`systemPrompt.file`, or an `agentTools` reference to a sync_key outside the posted set) and
never fail the run on their own. Set `fail_on_warnings: true` to treat them as errors.

## Outputs

| Output | Description |
|--------|-------------|
| `valid` | `true` when every validated YAML file has no errors. |
| `error_count` | Total error-severity diagnostics. |
| `warning_count` | Total warning-severity diagnostics. |

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

## Contributing

This repository does not accept external contributions — pull requests are limited to the
Cotool team, and PRs opened from outside the org are closed automatically. If you've found a
bug or have a request, please [open an issue](https://github.com/Cotool/validate-agents/issues).

## Releasing

`dist/index.js` is committed and CI enforces it matches a fresh build, so a release is just a tag:

1. Merge to `master` with a green CI (build + tests + dist drift check).
2. Tag an immutable `v1.0.0` and move the `v1` major tag to it; reference `@v1` from docs.
   ```bash
   git tag v1.0.0 && git tag -f v1 && git push origin v1.0.0 && git push -f origin v1
   ```
3. Consumers pin `uses: cotool/validate-agents@v1` and grant `permissions: id-token: write`.

## How it works

The action discovers agent files by globbing `dir` for `*.yaml`/`*.yml` plus every `*.md`
(so `systemPrompt.file` references resolve), then sends them in a single request to the
Cotool validate API — the same parse, schema, and cross-file graph checks the GitOps sync
engine runs on merge. Bundling everything into one request is what makes cross-file checks
work (duplicate `sync_key`, `agentTools` references, dependency cycles).

Per-diagnostic `::error` and `::warning` annotations are emitted for each finding, at the
file's line when the API provides one. The action exits non-zero when any file is invalid,
or when warnings are present and `fail_on_warnings` is set. An empty discovery warns and
exits 0 — a misconfigured `dir` shouldn't hard-fail CI.

## License

Licensed under the [Apache License 2.0](LICENSE).
