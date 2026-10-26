# VOXEL Office

3D office preview for Orca's experimental plugin main-area view. AgentVerse supplies the office, character geometry, materials, and deterministic character animations. Orca remains the source of truth for the project, worktrees, agents, workers, and their states.

The iframe receives only Orca's bounded `orca-project-snapshot` message. It does not connect to AgentVerse's event stream, create agents, or send instructions. Working, waiting, and blocked agents stay at their assigned desks; waiting includes a periodic hand-raise. A completed agent uses AgentVerse's local behavior engine to walk to a lounge spot after a short pause. This visual-only behavior continues across snapshot updates and filter changes, and restarts only when Orca reports a new status update for that agent. It is never sent back to Orca as an activity event. Staff are excluded. The view can filter agents by worktree and status; selecting a character highlights it and focuses the camera. Orca's native contextual sidebar shows safe agent details and offers a manual message composer only when `agents:send` is explicitly granted and the selected primary agent is currently working. Sending uses Orca's session routing; workers have no independent send target.

The snapshot also preserves the safe parent-to-worker relationship with an opaque `parentAgentId`. VOXEL treats an agent as a coordinator only when Orca reports at least one worker linked to it; it seats that coordinator first, places its workers at nearby free stations, and builds a glass cubicle around the coordinator's actual desk. This is a visual projection of Orca's existing hierarchy, not a new role or orchestration rule. Agents without a reported parent relationship stay ordinary agents, and worktree areas remain project context rather than agent-owned zones.

Orca also sends a lightweight `orca-plugin-view-heartbeat` every 10 seconds while the view is open. VOXEL uses it only to distinguish a live bridge from a paused connection; it does not infer agent activity from the heartbeat. If no project is associated with the active worktree, the view explains how to select one.

The read-only project snapshot may include a closed host-state category for each worktree and the active worktree. It contains no host IDs or connection details. For primary agents, the panel may show a sanitized model label and a closed activity category derived from Orca's current tool signal; tool names, inputs, commands, and output stay in Orca. Workers show status only because Orca does not currently attribute model/activity fields to them independently. Agent status age comes only from Orca's last accepted status update; the contextual panel flags working/waiting/blocked agents with no accepted update for more than five minutes as needing verification, not as definitively stale.

When the operating system requests reduced motion, character gestures and camera damping are reduced. A completed agent's transition to a lounge spot still proceeds at a slower pace. If WebGL initialization fails or its context is lost, the office shows a readable retry state with the current project counts; Orca's agent/session data is unaffected.

## Build the self-contained view

The plugin sandbox accepts one HTML entry with inline scripts and styles and blocks network access. Generate that entry from the AgentVerse source:

```sh
node examples/plugins/voxel-office/build.mjs /path/to/agentverse
```

This writes `office.html` beside this README. The build applies the VOXEL agent-motion lifecycle patch in `agent-motion-lifecycle.mjs`; it fails if the expected AgentVerse bundle anchors change. The bundle must remain under Orca's 10 MiB entry limit. The source template is `office.template.html`; `office.html` is generated and should be rebuilt after changing the AgentVerse adapter or its lifecycle patch.

## Try it in Orca

1. In Orca for macOS, open **Settings → Plugins → Developer**, add this directory as a local/developer plugin, then refresh discovery. Alternatively install the directory as a local plugin from the Plugins settings page.
2. Open the plugin's permission review. Grant `projects:read`, `worktrees:read`, and `agents:read` for the read-only preview. Grant `agents:send` only when you are ready to test manual sending; it is a separate permission. Never enable send tests against FILSER.
3. Open any disposable test worktree and select **VOXEL · Oficina 3D** in the workspace view selector. Confirm the project, all of its worktrees, and current agents appear. Select a character, use the filters with the keyboard, close and reopen the contextual panel, then return to **Orca** and confirm the traditional sidebar and workbench are restored.

### Local macOS development

Run these commands from the Orca checkout. Use the Node version pinned by Orca and enable Corepack/pnpm as the repository instructions specify.

```sh
pnpm install --frozen-lockfile
pnpm build:packages
pnpm exec oxlint src/renderer/src/app-shell/plugin-view-agent-metadata.ts src/renderer/src/components/plugin-views
pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/app-shell/plugin-view-agent-metadata.test.ts src/renderer/src/app-shell/plugin-view-snapshot.test.ts src/renderer/src/components/plugin-views/PluginViewContextSidebar.test.tsx
pnpm tc:web
ORCA_BACKGROUND_LAUNCH=1 pnpm exec playwright test tests/e2e/plugin-main-area-view.spec.ts --config tests/playwright.config.ts --project=electron-headless --workers=1
```

To rebuild the embedded scene after changing AgentVerse, pass its checkout to the builder:

```sh
node examples/plugins/voxel-office/build.mjs /path/to/agentverse
```

Then refresh or reinstall the local plugin in Orca. Switching back to **Orca** unloads the view iframe; the test workbench remains mounted in Orca and is restored when selected again.

### Recovery and updates

- If the view is missing, verify plugin-system availability, local plugin discovery, the `contributes.views` entry, and the three read capabilities; then refresh the plugin list.
- If the bridge reports no project, activate a worktree that belongs to a registered Orca project. The project header only expands/collapses its group.
- If a remote worktree reports a disconnected host, reconnect it in Orca and reopen the view. VOXEL displays the host category but cannot reconnect it.
- If WebGL fails, use the retry control; if the context stays lost, return to **Orca**. This releases the iframe and keeps the sessions under Orca's control.
- To roll back the preview, disable/remove the local plugin in **Settings → Plugins**. This removes only the plugin entry, not worktrees, sessions, or agent state.
- Before updating Orca, rebuild against the version's plugin API types, validate the local manifest, run the targeted checks above, and confirm the view still unloads cleanly. Main-area plugin views are an evolving Orca extension point; pin the tested Orca revision in local project notes.

### Resource and compatibility notes

The current self-contained HTML is about 1.2 MiB, below Orca's 10 MiB entry limit. The iframe and its WebGL canvas are destroyed when the view is left, and the canvas/bridge listeners have explicit cleanup. The scene uses a bounded device-pixel ratio and honors reduced-motion preferences. These are structural safeguards, not a substitute for host-specific CPU/GPU/memory measurements; those vary by Mac, graphics device, active window size, and agent count. The E2E fixture checks lifecycle and functionality in a disposable headless profile, not production rendering performance.

Keep VOXEL as a small integration layer while the extension APIs are experimental. The generic main-area view, read-only project/worktree/agent query, replacement snapshot event, and contextual-panel contracts are candidates for separate upstream proposals after the contracts stabilize. Keep the AgentVerse scene and VOXEL-specific adapter in this repo. Do not open or push an upstream proposal until the upstream repository's contribution and release process is reviewed.

The repo associated with the active worktree determines the project. All agents from its worktrees appear together, with the active worktree highlighted. Returning to **Orca** restores the traditional view; the terminal workbench remains mounted while hidden.

The automated tests verify routing eligibility and the composer without sending a message. Validate live delivery only with disposable test sessions; do not use FILSER for send tests.
