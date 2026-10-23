import type {
  DashboardRevealAgentArgs,
  DashboardSnapshot
} from '../../../shared/dashboard-snapshot'
import {
  pluginViewSnapshotSchema,
  type PluginViewSnapshot
} from '../../../shared/plugins/plugin-view-api'
import type { PluginViewHostState } from './plugin-view-connection-state'
import {
  safePluginViewActivity,
  safePluginViewModel,
  type PluginViewStatusMetadata
} from './plugin-view-agent-metadata'

export type PluginViewIdentityMap = {
  worktrees: Map<string, string>
  agents: Map<string, string>
  agentRoutes: Map<string, DashboardRevealAgentArgs>
  nextWorktree: number
  nextAgent: number
}

export function createPluginViewIdentityMap(): PluginViewIdentityMap {
  return {
    worktrees: new Map(),
    agents: new Map(),
    agentRoutes: new Map(),
    nextWorktree: 1,
    nextAgent: 1
  }
}

function opaqueId(
  map: Map<string, string>,
  key: string,
  prefix: string,
  next: () => number
): string {
  let value = map.get(key)
  if (!value) {
    value = `${prefix}:${next()}`
    map.set(key, value)
  }
  return value
}

function safeDisplayLabel(value: string, fallback: string): string {
  const trimmed = value.trim()
  const pathLike =
    trimmed.startsWith('/') ||
    trimmed.startsWith('~/') ||
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith('\\\\')
  let pathLabel = fallback
  for (const segment of trimmed.split(/[\\/]/)) {
    if (segment) {
      pathLabel = segment
    }
  }
  const label = pathLike ? pathLabel : trimmed
  const cleaned = [...label]
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code > 31 && code !== 127
    })
    .join('')
    .slice(0, 512)
  return cleaned || fallback
}

/**
 * Project a full in-window dashboard snapshot down to the read-only fields a
 * plugin view may need. Internal routes and raw status details never cross the frame.
 */
export function projectPluginViewSnapshot(
  snapshot: DashboardSnapshot,
  activeWorktreeId: string | null,
  revision: number,
  identities = createPluginViewIdentityMap(),
  activeExecutionHostId?: string | null,
  hostStateForWorkspace?: (
    workspace: NonNullable<DashboardSnapshot['workspaces']>[number]
  ) => PluginViewHostState | undefined,
  agentStatusByPaneKey?: Record<string, PluginViewStatusMetadata>
): PluginViewSnapshot {
  const identityKey = (id: string, hostId?: string | null): string =>
    `${hostId ?? 'unknown'}\u0000${id}`
  const activeWorkspace = snapshot.workspaces?.find(
    (workspace) =>
      workspace.worktreeId === activeWorktreeId &&
      (activeExecutionHostId == null || workspace.executionHostId === activeExecutionHostId)
  )
  const activeRepoId =
    activeWorkspace?.repoId ??
    snapshot.cards.find(
      (card) =>
        card.worktreeId === activeWorktreeId &&
        (activeExecutionHostId == null || card.executionHostId === activeExecutionHostId)
    )?.repoId ??
    null
  if (!activeRepoId) {
    identities.agentRoutes.clear()
    return pluginViewSnapshotSchema.parse({
      revision,
      selectedAgentId: null,
      project: null,
      activeWorktreeId: null,
      worktrees: [],
      agents: []
    })
  }

  const workspaces = (snapshot.workspaces ?? [])
    .filter((workspace) => workspace.repoId === activeRepoId)
    .slice()
    .slice(0, 1000)
    .sort(
      (a, b) =>
        safeDisplayLabel(a.worktreeName, 'Worktree').localeCompare(
          safeDisplayLabel(b.worktreeName, 'Worktree')
        ) || a.worktreeId.localeCompare(b.worktreeId)
    )
  const ids = new Map<string, string>()
  for (const workspace of workspaces) {
    ids.set(
      identityKey(workspace.worktreeId, workspace.executionHostId),
      opaqueId(
        identities.worktrees,
        identityKey(workspace.worktreeId, workspace.executionHostId),
        'worktree',
        () => identities.nextWorktree++
      )
    )
  }
  const activeIdentityKey = activeWorktreeId
    ? identityKey(activeWorktreeId, activeExecutionHostId)
    : null
  if (activeWorktreeId && activeIdentityKey && !ids.has(activeIdentityKey)) {
    const activeCard = snapshot.cards.find(
      (card) =>
        card.worktreeId === activeWorktreeId &&
        card.repoId === activeRepoId &&
        (activeExecutionHostId == null || card.executionHostId === activeExecutionHostId)
    )
    if (activeCard) {
      ids.set(
        activeIdentityKey,
        opaqueId(
          identities.worktrees,
          identityKey(activeWorktreeId, activeExecutionHostId),
          'worktree',
          () => identities.nextWorktree++
        )
      )
    }
  }
  const worktrees = workspaces.map((workspace) => {
    const hostState = hostStateForWorkspace?.(workspace)
    return {
      id: ids.get(identityKey(workspace.worktreeId, workspace.executionHostId))!,
      name: safeDisplayLabel(workspace.worktreeName, 'Worktree'),
      active:
        workspace.worktreeId === activeWorktreeId &&
        (activeExecutionHostId == null || workspace.executionHostId === activeExecutionHostId),
      ...(hostState ? { hostState } : {})
    }
  })
  const agents: PluginViewSnapshot['agents'] = []
  identities.agentRoutes.clear()
  const cards = snapshot.cards
    .filter((card) => card.repoId === activeRepoId)
    .slice()
    .sort(
      (a, b) =>
        (ids.get(identityKey(a.worktreeId, a.executionHostId)) ?? '').localeCompare(
          ids.get(identityKey(b.worktreeId, b.executionHostId)) ?? ''
        ) ||
        a.agentType.localeCompare(b.agentType) ||
        a.dotState.localeCompare(b.dotState)
    )
  for (const card of cards) {
    const worktreeId = ids.get(identityKey(card.worktreeId, card.executionHostId))
    if (!worktreeId) {
      continue
    }
    const agentId = opaqueId(
      identities.agents,
      `agent:${card.repoId}\u0000${identityKey(card.worktreeId, card.executionHostId)}\u0000${card.paneKey}`,
      'agent',
      () => identities.nextAgent++
    )
    const route: DashboardRevealAgentArgs = {
      repoId: card.repoId,
      worktreeId: card.worktreeId,
      executionHostId: card.executionHostId,
      tabId: card.tabId,
      leafId: card.leafId
    }
    identities.agentRoutes.set(agentId, route)
    const statusEntry = agentStatusByPaneKey?.[card.paneKey]
    const model = safePluginViewModel(statusEntry?.model)
    const activity = safePluginViewActivity(statusEntry, card.dotState)
    agents.push({
      id: agentId,
      name: safeDisplayLabel(card.agentType, 'Agent'),
      status: card.dotState,
      worktreeId,
      activeWorktree:
        card.worktreeId === activeWorktreeId &&
        (activeExecutionHostId == null || card.executionHostId === activeExecutionHostId),
      worker: false,
      attention: card.bucket === 'attention',
      statusUpdatedAt:
        card.statusUpdatedAt && card.statusUpdatedAt > 0 ? card.statusUpdatedAt : null,
      ...(model ? { model } : {}),
      ...(activity ? { activity } : {})
    })
    for (const child of card.subagents ?? []) {
      const workerId = opaqueId(
        identities.agents,
        `worker:${card.repoId}\u0000${identityKey(card.worktreeId, card.executionHostId)}\u0000${card.paneKey}:${child.id}`,
        'agent',
        () => identities.nextAgent++
      )
      // A worker has no pane of its own in Orca. Its safe reveal target is the
      // owning agent's pane, matching the dashboard's existing navigation.
      identities.agentRoutes.set(workerId, route)
      agents.push({
        id: workerId,
        name: safeDisplayLabel(child.name, 'Worker'),
        status: child.dotState,
        worktreeId,
        activeWorktree:
          card.worktreeId === activeWorktreeId &&
          (activeExecutionHostId == null || card.executionHostId === activeExecutionHostId),
        worker: true,
        parentAgentId: agentId,
        attention: child.dotState === 'blocked' || child.dotState === 'waiting',
        statusUpdatedAt: null
      })
    }
  }
  const activeHostState = activeWorkspace ? hostStateForWorkspace?.(activeWorkspace) : undefined
  return pluginViewSnapshotSchema.parse({
    revision,
    selectedAgentId: null,
    project: {
      id: 'project:active',
      name: safeDisplayLabel(
        activeWorkspace?.repoName ?? cards[0]?.repoName ?? 'Project',
        'Project'
      )
    },
    activeWorktreeId: activeWorkspace
      ? (ids.get(identityKey(activeWorkspace.worktreeId, activeWorkspace.executionHostId)) ?? null)
      : activeIdentityKey
        ? (ids.get(activeIdentityKey) ?? null)
        : null,
    ...(activeHostState ? { activeHostState } : {}),
    worktrees,
    agents: agents.slice(0, 5000)
  })
}
