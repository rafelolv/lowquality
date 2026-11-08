# AGENTS.md

LowQuality is a browser-only React 19 + TypeScript + Vite app. Keep changes small, verifiable, and consistent with the existing architecture.

## Token-efficient workflow

### Context
- Inspect only files relevant to the current task. Prefer targeted searches over reading whole directories or large files.
- Reuse information already gathered in the session. Do not re-read unchanged files unless verification is necessary.
- Read documentation only when it is relevant to the change.

### Changes
- Prefer minimal, targeted edits over broad rewrites.
- Preserve existing architecture, naming, conventions, and unrelated behavior.
- Avoid unsolicited refactors, formatting passes, dependency changes, and new abstractions.
- Do not add files or dependencies unless the task requires them.
- Never sacrifice correctness, security, accessibility, or maintainability to save tokens.

### Validation
- Run the checks relevant to the area changed:
  - `npm run typecheck` for TypeScript changes.
  - `npm test` for unit tests and pure processing logic.
  - `npm run test:e2e` for behavior or UI changes.
  - `npm run build` for production-build changes or when scope warrants it.
- Do not repeat checks when nothing relevant has changed. Run the full relevant suite when risk or scope justifies it.
- Never skip necessary validation to save tokens. Fix failures caused by the change and rerun the affected checks.

### Communication
- Keep progress updates brief and meaningful. Do not narrate routine commands, file reads, or obvious implementation steps.
- Do not dump complete files or large logs unless requested.
- Finish with a concise summary of changed files, validation results, and important caveats.

### Execution
- Implement straightforward tasks directly. Use a concise plan for complex tasks and then execute it.
- Avoid redundant tool calls, searches, and diagnostics.
- Use subagents only when parallel work provides a clear benefit.
- Do not browse external documentation unless current information or verification is necessary.

## Project notes

- `src/App.tsx` owns session state, loading, debounced previews, and exports.
- `src/components/` contains the UI; `src/styles/` contains layout and responsive rules.
- `src/lib/degradation.ts` is the shared destruction pipeline; `src/workers/destroy.worker.ts` decodes, processes, and exports off the main thread.
- `src/lib/presets.ts` defines quality curves and preset behavior.
- The app must stay local-only: do not add uploads, analytics, or remote runtime requests.
- Playwright starts Vite on port `4173`; the production config uses `4174`.
