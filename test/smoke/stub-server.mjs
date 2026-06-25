// Minimal offline stand-in for the Cotool validate endpoint, used by smoke.yml so
// the built action can be exercised end-to-end without a reachable API or secret.
//
// It mirrors the real response shape: any file whose path contains "broken" is
// reported invalid with a schema_error; everything else is valid.
//
// It also stubs GitHub's OIDC token service (a GET returning `{ value }`), so the
// action's real OIDC code path (`core.getIDToken`) can run offline when smoke.yml
// points ACTIONS_ID_TOKEN_REQUEST_URL at this server. The validate endpoint here
// doesn't check the token; OIDC verification is covered by the backend's own tests.
//
// Usage: node test/smoke/stub-server.mjs [port]
import http from 'node:http';

const port = Number(process.argv[2] || 7799);

const server = http.createServer((req, res) => {
    // Stub the GitHub OIDC token request (GET ...&audience=...).
    if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ value: 'stub-oidc-token' }));
        return;
    }

    if (req.method !== 'POST' || !req.url?.endsWith('/api/agent-sync/validate')) {
        res.writeHead(404).end();
        return;
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
        let files = [];
        try {
            files = JSON.parse(body).files ?? [];
        } catch {
            res.writeHead(400).end();
            return;
        }
        const yaml = files.filter((f) => /\.ya?ml$/.test(f.path));
        const results = yaml.map((f) =>
            /broken/.test(f.path)
                ? {
                      path: f.path,
                      valid: false,
                      errors: [{ code: 'schema_error', message: 'stub: intentionally broken fixture' }],
                      warnings: [],
                  }
                : { path: f.path, valid: true, errors: [], warnings: [] },
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
            JSON.stringify({
                valid: results.every((r) => r.valid),
                fileCount: yaml.length,
                agentCount: results.filter((r) => r.valid).length,
                results,
            }),
        );
    });
});

server.listen(port, () => console.error(`validate stub listening on ${port}`));
