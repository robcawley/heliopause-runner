# Kuiper Blast 2

Read `PROJECT-BRIEF.md` before doing anything; it has the history, Rob's direction and the gotchas.

- Run: `npm run dev` (http://localhost:5173). Build: `npm run build`.
- Every feel number lives in `src/modes/belt-run/config.js`. Change numbers there, not in systems.
- Keep `src/modes/belt-run/` self-contained: it talks to the host only through its API and events
  (`docs/INTEGRATION.md`). Nothing in `src/engine/` may import from a mode.
- Git: this folder has its own repo. Never run git from the home directory, which is a separate repo.
- Log each tuning session in `docs/FEEL-LOG.md` with what Rob said and what changed.
