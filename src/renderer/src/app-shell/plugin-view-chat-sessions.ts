import type { DashboardSnapshot } from '../../../shared/dashboard-snapshot'
import type { TuiAgent } from '../../../shared/tui-agent'
import { isNativeChatSupportedAgent } from '@/lib/native-chat-supported-agent'
import type { PluginViewSnapshot } from '../../../shared/plugins/plugin-view-api'
import type { PluginViewIdentityMap } from './plugin-view-snapshot'

export type PluginViewChatSession = {
  agentId: string
  agent: TuiAgent
  name: string
  sessionLabel: string
  status: PluginViewSnapshot['agents'][number]['status']
  worktreeId: string
  worktreeName: string
  model?: string
  tabId: string
  paneKey: string
  ptyId: string | null
}

export type PluginViewWorkerParents = Record<string, string>

function identityKey(id: string, hostId?: string | null): string {
  return `${hostId ?? 'unknown'}\u0000${id}`
}

export function projectPluginViewChatSessions(
  dashboard: DashboardSnapshot,
  snapshot: PluginViewSnapshot,
  identities: PluginViewIdentityMap
): { sessions: PluginViewChatSession[]; workerParents: PluginViewWorkerParents } {
  const displayAgents = new Map(snapshot.agents.map((agent) => [agent.id, agent]))
  const worktreeNames = new Map(snapshot.worktrees.map((worktree) => [worktree.id, worktree.name]))
  const sessions: PluginViewChatSession[] = []
  const workerParents: PluginViewWorkerParents = {}

  for (const card of dashboard.cards) {
    const key = identityKey(card.worktreeId, card.executionHostId)
    const worktreeId = identities.worktrees.get(key)
    const agentId = identities.agents.get(`agent:${card.repoId}\u0000${key}\u0000${card.paneKey}`)
    if (!worktreeId || !agentId) {
      continue
    }
    const agent = displayAgents.get(agentId)
    if (agent && isNativeChatSupportedAgent(card.agentType)) {
      sessions.push({
        agentId,
        agent: card.agentType,
        name: agent.name,
        sessionLabel: card.conversationName?.trim() || agent.name,
        status: agent.status,
        worktreeId,
        worktreeName: worktreeNames.get(worktreeId) ?? card.worktreeName,
        ...(agent.model ? { model: agent.model } : {}),
        tabId: card.tabId,
        paneKey: card.paneKey,
        ptyId: card.ptyId
      })
    }

    for (const child of card.subagents ?? []) {
      const workerId = identities.agents.get(
        `worker:${card.repoId}\u0000${key}\u0000${card.paneKey}:${child.id}`
      )
      if (workerId && agentId) {
        workerParents[workerId] = agentId
      }
    }
  }

  const counts = new Map<string, number>()
  for (const session of sessions) {
    const key = `${session.worktreeId}\u0000${session.sessionLabel}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const indices = new Map<string, number>()
  for (const session of sessions) {
    const key = `${session.worktreeId}\u0000${session.sessionLabel}`
    const index = (indices.get(key) ?? 0) + 1
    indices.set(key, index)
    if ((counts.get(key) ?? 0) > 1) {
      session.sessionLabel = `${session.sessionLabel} · ${index}`
    }
  }

  return { sessions, workerParents }
}
