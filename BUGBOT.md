# Bugbot review guidance

- Ignore `dist/`. It's a committed ncc bundle generated from `src/` — CI regenerates
  it and fails on drift, so there's nothing to review there. Review `src/` instead.
- This is a GitHub Action: the entrypoint runs once per CI job, auth is GitHub OIDC
  only (no stored secrets), and all agent files are posted in a single request so
  cross-file checks work. Flag deviations from that model.
