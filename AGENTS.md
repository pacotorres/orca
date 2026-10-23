# Useful Commands

- **Typecheck**: `pnpm tc` (or `tc:node` / `tc:cli` / `tc:web`)
- **Test**: `pnpm test [path/to/file.test.ts]`
- **Lint**: `oxlint`, or `pnpm run check:code-quality:changed` for changed files (full `pnpm lint` is slow); format with `pnpm format`
- **Design system**: `pnpm run lint:design-system` for the full renderer report (not a gate); the changed-lines gate above is what CI enforces

# Design System

All UI work — layout, color, typography, spacing, component selection, UX behavior — must follow [`docs/STYLEGUIDE.md`](./docs/STYLEGUIDE.md). Use the tokens defined in `src/renderer/src/assets/main.css` (the canonical source) and the shadcn primitives in `src/renderer/src/components/ui/`. Don't invent new color values, font sizes, or shadow tiers when a documented one already covers the role. When STYLEGUIDE.md is silent, follow the resolution order in its final section.

# Electron UI Validation

Always run tests and agent-launched apps in the background with `ORCA_BACKGROUND_LAUNCH=1`.
Never steal monitor focus or reveal test windows: no `show()`, `showInactive()`, `bringToFront()`,
`app.focus()`, or OS activation. Use CDP screenshots of hidden renderers. Keep native-focus and visible-window tests paused on the user's desktop; run them on an isolated display or CI.
Rebuild modified launch-policy code before running an app; stale build wrappers are not safe.

Use the `$electron` skill and Playwright CDP for rendered Orca UI checks. Do not use computer-use for Orca UI validation.

# Code Style

## Reuse Before Reimplementing

Before writing new logic at any scale — a function, component, IPC channel, state store, or whole subsystem/flow — check whether an existing implementation already does the job. Extend or generalize it instead of building a parallel version.

## Avoid Comments

- Only use when code does not describe
- BE CONCISE. 1 LINE if possible (why not how)

## File and Module Naming

Never use vague names like `helpers`, `utils`, `common`, `misc`, or `shared-stuff` for files, folders, or modules. They carry zero info and tend to become dumping grounds. Name files after what they _actually_ contain — prefer the concrete domain concept (e.g. `tab-group-state.ts`, `terminal-orphan-cleanup.ts`) over the generic role (`tabs-helpers.ts`, `terminal-utils.ts`). If you find yourself reaching for `helpers`, the file probably has more than one responsibility and should be split, or there's a better name hiding in the code that describes what the functions operate on.

## Type Assertions: Prefer Checked Types

Avoid type assertions except `as const`. Unavoidable casts need a line-specific `SAFETY:` explanation:

# First Class Citizens

Every change must consider these areas:

## Cross-Platform Support

Support macOS, Linux, and Windows. Guard platform-specific behavior at runtime; use platform-aware shortcuts, paths, and existing process wrappers. Before changing platform-specific code, processes, shells, shortcuts, paths, or native modules, read [`docs/reference/cross-platform-support.md`](./docs/reference/cross-platform-support.md).

## Remote Use Case

Support remote execution as well as local. Clients and servers update independently; preserve compatibility across mixed versions.

## Mobile

Any feature should be considered for parity on mobile

## Folder Workspaces

All changes must consider folder workspaces as well as git worktrees. Don't assume every workspace is a git worktree.

# Git / GitHub

If changing code around `git`, `gh`, source-control, or review behavior read [`docs/reference/git-workflow.md`](./docs/reference/git-workflow.md).

For a failed GitHub Actions run, inspect the failed jobs and retry with `gh run rerun <run-id> --failed --repo stablyai/orca`. Preserve successful jobs; use a full rerun only when the failure requires revalidating them. A code fix needs a new push and fresh checks, not a retry of the old SHA.

# Tests

Avoid adding low-value tests. These might be fine for development but offer low value when checked in. [Anti-patterns](./docs/reference/test-antipatterns.md)

# Project Documentation

For substantial work in this repository, keep the Obsidian project notes for **ORCA OFFICE'S** current. This project documents the VOXEL virtual office built around Orca and AgentVerse; Orca itself remains the source of truth for its implementation and runtime behavior.

Before starting substantial analysis or implementation, read the project index and map:

- macOS: `/Users/pacotorres/Library/Mobile Documents/iCloud~md~obsidian/Documents/Mente/PROYECTOS/ORCA OFFICE'S/index.md`
- Windows: `C:\Users\paco\iCloudDrive\iCloud~md~obsidian\Documents\Mente\PROYECTOS\ORCA OFFICE'S\index.md`

Document information that will help future work: confirmed product requirements, important findings, architecture and integration contracts, meaningful implementation changes, validation results, limitations, and unresolved questions. Do not create a log entry for every routine code edit.

Use the project structure:

- `20_DOCUMENTACION/` for current context, architecture, and technical findings.
- `30_DECISIONES/` for decisions the user has confirmed; keep proposals and unresolved alternatives in documentation until then.
- `10_REUNIONES/` for meeting notes and agreements.
- `00_INBOX/` for unsorted links and incoming material.
- `90_ARCHIVO/` for superseded material; do not delete historical notes.

Use relative Obsidian links. Update the project index when adding or renaming important notes, add new projects to the vault's `PROYECTOS/index.md` only when appropriate, and append a dated entry to the vault's `20_WIKI/log.md` for significant documentation updates. Keep these notes concise and omit credentials, tokens, private prompts, transcripts, and raw terminal output. If the vault is unavailable, do not create a competing documentation copy in this repository; report what should be recorded and where.
