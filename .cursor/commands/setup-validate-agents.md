# Set Up Validate Agents

Wire up the `cotool/validate-agents` GitHub Action in the current repository.

## Instructions

1. **Find the agent directory.** Look for a directory containing Cotool agent YAML files
   (`*.yaml` or `*.yml` that have a `sync_key:` field). Common locations are `cotool/agents`,
   `agents/`, or a path referenced in an existing `.github/workflows/` file. If you can't
   find one, ask the user where their agent files live before continuing.

2. **Check for an existing workflow.** If `.github/workflows/validate-agents.yml` already
   exists, read it and report what's there rather than overwriting.

3. **Create `.github/workflows/` if it doesn't exist.**

4. **Write `.github/workflows/validate-agents.yml`** with the following content, substituting
   the real agent directory for `<dir>`:

   ```yaml
   on:
     pull_request:
       paths: ['<dir>/**']
   permissions:
     contents: read
     id-token: write
   jobs:
     validate:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v5
         - uses: cotool/validate-agents@v1
           with:
             dir: <dir>
   ```

   If the agent directory is the default (`cotool/agents`) you can omit the `dir:` line
   entirely — the action defaults to it.

5. **Tell the user what you did** and remind them of the one prerequisite: this repository
   must be registered as the org's agents source in Cotool under
   Settings → Agents → GitOps sync. That's what authorizes the OIDC token — no API key
   is needed.
