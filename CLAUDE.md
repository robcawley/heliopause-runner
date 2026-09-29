# Heliopause Runner

Read `PROJECT-BRIEF.md` before doing anything; it has the history, Rob's direction and the gotchas.
The game is in `docs/GAME-DESIGN.md`; the phases in `docs/PRODUCTION-PLAN.md`.

- Run: `npm run dev` (http://localhost:5173). Build: `npm run build`.
- Every feel number for the flight lives in `src/modes/belt-run/config.js`.
- Keep modes self-contained: they talk to the host only through their API and events
  (`docs/INTEGRATION.md`). Nothing in `src/engine/` may import from a mode.
- Git: this folder has its own repo. Never run git from the home directory, which is a separate repo.
- Log each tuning session in `docs/FEEL-LOG.md`; update `docs/PRODUCTION-PLAN.md` at the end of each phase.
