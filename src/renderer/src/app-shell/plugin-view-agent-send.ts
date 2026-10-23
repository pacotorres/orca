import type { DashboardCard, DashboardRevealAgentArgs } from '../../../shared/dashboard-snapshot'
import { makePaneKey } from '../../../shared/stable-pane-id'
import { isStructuredTab } from '../../../shared/structured-agent-session-tab'
import { structuredAgentSessionPaneKey } from '../../../shared/structured-agent-session-projection'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import {
  resolveRunningAgentSendTarget,
  runningAgentMessageTarget
} from '@/lib/running-agent-targets'
import { structuredAgentSessionOwnerForTab } from '@/runtime/structured-agent-session-owner'
import type { AppState } from '@/store/types'
import type { PluginViewSnapshot } from '../../../shared/plugins/plugin-view-api'
import type { AgentMessageTarget } from '@/lib/agent-message-send'

/**
 * Re-resolve the selected opaque view identity against Orca's current store.
 * Workers deliberately have no independent target: their card points to a
 * parent pane for navigation, which is insufficient authority for sending.
 */
export function resolvePluginViewAgentMessageTarget(args: {
  agentId: string
  snapshot: PluginViewSnapshot
  route: DashboardRevealAgentArgs | undefined
  cards: readonly DashboardCard[]
  state: AppState
}): AgentMessageTarget | null {
  const { agentId, snapshot, route, cards, state } = args
  const agent = snapshot.agents.find((entry) => entry.id === agentId)
  if (!agent || agent.worker || agent.status !== 'working' || !route?.executionHostId) {
    return null
  }

  const card = cards.find(
    (entry) =>
      entry.repoId === route.repoId &&
      entry.worktreeId === route.worktreeId &&
      entry.executionHostId === route.executionHostId &&
      entry.tabId === route.tabId &&
      entry.leafId === route.leafId
  )
  if (!card || card.dotState !== 'working') {
    return null
  }

  // sendMessageToAgent resolves the runtime from the worktree. Confirm that
  // Orca's current owner still matches the host captured by this exact route.
  if (getExecutionHostIdForWorktree(state, route.worktreeId) !== route.executionHostId) {
    return null
  }

  const unifiedTab = (state.unifiedTabsByWorktree[route.worktreeId] ?? []).find(
    (tab) => tab.id === route.tabId
  )
  if (unifiedTab && isStructuredTab(unifiedTab)) {
    if (structuredAgentSessionOwnerForTab(state, unifiedTab) !== route.executionHostId) {
      return null
    }
    const paneKey = structuredAgentSessionPaneKey(unifiedTab.id, unifiedTab.entityId)
    const target = resolveRunningAgentSendTarget(state, route.worktreeId, paneKey)
    return target?.kind === 'structured-session' && target.status === 'eligible'
      ? runningAgentMessageTarget(target)
      : null
  }

  if (!route.leafId) {
    return null
  }
  let paneKey: string
  try {
    paneKey = makePaneKey(route.tabId, route.leafId)
  } catch {
    return null
  }
  const target = resolveRunningAgentSendTarget(state, route.worktreeId, paneKey)
  if (
    !target ||
    target.kind !== 'terminal' ||
    target.status !== 'eligible' ||
    target.tab.id !== route.tabId
  ) {
    return null
  }
  return runningAgentMessageTarget(target)
}
