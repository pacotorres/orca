import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { ActivePluginView } from '@/store/plugin-panels'
import { useAppStore } from '@/store'
import { useLiveDashboardSnapshot } from '../components/dashboard/useLiveDashboardSnapshot'
import { PluginMainAreaView } from '../components/plugin-views/PluginMainAreaView'
import { createPluginViewIdentityMap, projectPluginViewSnapshot } from './plugin-view-snapshot'
import { usePluginPanelsStore } from '@/store/plugin-panels'
import type {
  PluginViewQueryRequest,
  PluginViewQueryResult,
  PluginViewSnapshot
} from '../../../shared/plugins/plugin-view-api'
import { revealDashboardAgent } from '../components/dashboard/reveal-dashboard-agent'
import { resolvePluginViewAgentMessageTarget } from './plugin-view-agent-send'
import { sendMessageToAgent } from '@/lib/agent-message-send'
import type { ActiveAgentNotesSendResult } from '@/lib/active-agent-note-send'
import { selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { pluginViewExecutionHostState } from './plugin-view-connection-state'
import { resolvePluginViewQuery } from './plugin-view-query'

export function PluginViewPage({
  view,
  selectedAgentId,
  onAgentSelection,
  onSnapshotChange,
  onRevealAgentHandlerChange,
  onSendAgentHandlerChange
}: {
  view: ActivePluginView
  selectedAgentId: string | null
  onAgentSelection: (agentId: string | null) => void
  onSnapshotChange: (snapshot: PluginViewSnapshot) => void
  onRevealAgentHandlerChange: (handler: ((agentId: string) => boolean) | null) => void
  onSendAgentHandlerChange: (
    handler: ((agentId: string, prompt: string) => Promise<ActiveAgentNotesSendResult>) | null
  ) => void
}): React.JSX.Element {
  const source = useLiveDashboardSnapshot()
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeExecutionHostId = useAppStore((state) => state.activeWorkspaceExecutionHostId)
  const worktreesByRepo = useAppStore((state) => selectWorktreesByRepo(state))
  const runtimeStatusByEnvironmentId = useAppStore((state) => state.runtimeStatusByEnvironmentId)
  const sshConnectionStates = useAppStore((state) => state.sshConnectionStates)
  const agentStatusByPaneKey = useAppStore((state) => state.agentStatusByPaneKey)
  const identities = useRef(createPluginViewIdentityMap())
  const plugin = usePluginPanelsStore((state) =>
    state.plugins.find((entry) => entry.pluginKey === view.pluginKey)
  )
  const sourceSnapshot = useMemo(
    () =>
      projectPluginViewSnapshot(
        source,
        activeWorktreeId,
        source.generatedAt,
        identities.current,
        activeExecutionHostId,
        (workspace) => {
          const worktree = worktreesByRepo[workspace.repoId]?.find(
            (candidate) => candidate.id === workspace.worktreeId
          )
          return pluginViewExecutionHostState({
            executionHostId: workspace.executionHostId,
            runtimeOwnerEnvironmentId: worktree?.runtimeOwnerEnvironmentId,
            runtimeStatusByEnvironmentId,
            sshConnectionStates
          })
        },
        agentStatusByPaneKey
      ),
    [
      activeExecutionHostId,
      activeWorktreeId,
      agentStatusByPaneKey,
      runtimeStatusByEnvironmentId,
      source,
      sshConnectionStates,
      worktreesByRepo
    ]
  )
  const snapshot = useMemo(
    () => ({ ...sourceSnapshot, selectedAgentId }),
    [selectedAgentId, sourceSnapshot]
  )
  useEffect(() => onSnapshotChange(snapshot), [onSnapshotChange, snapshot])
  useEffect(() => {
    const revealAgent = (agentId: string): boolean => {
      if (!snapshot.agents.some((agent) => agent.id === agentId)) {
        return false
      }
      const route = identities.current.agentRoutes.get(agentId)
      if (!route) {
        return false
      }
      const stillPresent = source.cards.some(
        (card) =>
          card.repoId === route.repoId &&
          card.worktreeId === route.worktreeId &&
          card.executionHostId === route.executionHostId &&
          card.tabId === route.tabId &&
          card.leafId === route.leafId
      )
      return stillPresent && revealDashboardAgent(route)
    }
    onRevealAgentHandlerChange(revealAgent)
    return () => onRevealAgentHandlerChange(null)
  }, [onRevealAgentHandlerChange, snapshot, source.cards])
  const granted = plugin?.grantedCapabilities ?? []
  useEffect(() => {
    const sendAgentMessage = async (
      agentId: string,
      prompt: string
    ): Promise<ActiveAgentNotesSendResult> => {
      const latestPlugin = usePluginPanelsStore
        .getState()
        .plugins.find((entry) => entry.pluginKey === view.pluginKey)
      if (!latestPlugin?.grantedCapabilities?.includes('agents:send')) {
        return { status: 'permission' }
      }
      const route = identities.current.agentRoutes.get(agentId)
      const target = resolvePluginViewAgentMessageTarget({
        agentId,
        snapshot,
        route,
        cards: source.cards,
        state: useAppStore.getState()
      })
      if (!route || !target) {
        return { status: 'not-ready', code: 'session-send-refused' }
      }
      return sendMessageToAgent({ worktreeId: route.worktreeId, target, prompt })
    }
    onSendAgentHandlerChange(sendAgentMessage)
    return () => onSendAgentHandlerChange(null)
  }, [onSendAgentHandlerChange, snapshot, source.cards, view.pluginKey])
  const allowed = ['projects:read', 'worktrees:read', 'agents:read'].every((capability) =>
    granted.includes(capability)
  )
  const onQuery = useCallback(
    (request: PluginViewQueryRequest): PluginViewQueryResult => {
      const latestPlugin = usePluginPanelsStore
        .getState()
        .plugins.find((entry) => entry.pluginKey === view.pluginKey)
      return resolvePluginViewQuery(request, snapshot, latestPlugin?.grantedCapabilities ?? [])
    },
    [snapshot, view.pluginKey]
  )
  return (
    <PluginMainAreaView
      view={view}
      snapshot={snapshot}
      allowed={allowed}
      onAgentSelection={onAgentSelection}
      onQuery={onQuery}
    />
  )
}
