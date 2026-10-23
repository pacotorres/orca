import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardCard, DashboardRevealAgentArgs } from '../../../shared/dashboard-snapshot'
import type { AppState } from '@/store/types'
import type { PluginViewSnapshot } from '../../../shared/plugins/plugin-view-api'

const mocks = vi.hoisted(() => ({
  getExecutionHostIdForWorktree: vi.fn(),
  resolveRunningAgentSendTarget: vi.fn()
}))

vi.mock('@/lib/worktree-runtime-owner', () => ({
  getExecutionHostIdForWorktree: mocks.getExecutionHostIdForWorktree
}))
vi.mock('@/lib/running-agent-targets', () => ({
  resolveRunningAgentSendTarget: mocks.resolveRunningAgentSendTarget,
  runningAgentMessageTarget: (target: { tabId: string; leafId: string }) => ({
    kind: 'terminal',
    tabId: target.tabId,
    leafId: target.leafId
  })
}))
vi.mock('@/runtime/structured-agent-session-owner', () => ({
  structuredAgentSessionOwnerForTab: vi.fn()
}))

import { resolvePluginViewAgentMessageTarget } from './plugin-view-agent-send'

const route: DashboardRevealAgentArgs = {
  repoId: 'repo-1',
  worktreeId: 'worktree-1',
  executionHostId: 'local',
  tabId: 'tab-1',
  leafId: '11111111-1111-4111-8111-111111111111'
}
const agent = {
  id: 'agent:1',
  name: 'codex',
  status: 'working',
  worktreeId: 'worktree:1',
  activeWorktree: true,
  worker: false,
  attention: false,
  statusUpdatedAt: Date.now()
}
const snapshot = { agents: [agent] } as PluginViewSnapshot
const card = { ...route, dotState: 'working', executionHostId: 'local' } as DashboardCard
const state = { unifiedTabsByWorktree: {} } as unknown as AppState

describe('resolvePluginViewAgentMessageTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getExecutionHostIdForWorktree.mockReturnValue('local')
    mocks.resolveRunningAgentSendTarget.mockReturnValue({
      kind: 'terminal',
      status: 'eligible',
      tab: { id: route.tabId },
      tabId: route.tabId,
      leafId: route.leafId
    })
  })

  it('resolves only the exact current primary agent route', () => {
    expect(
      resolvePluginViewAgentMessageTarget({
        agentId: agent.id,
        snapshot,
        route,
        cards: [card],
        state
      })
    ).toEqual({ kind: 'terminal', tabId: route.tabId, leafId: route.leafId })
    expect(mocks.resolveRunningAgentSendTarget).toHaveBeenCalledWith(
      state,
      route.worktreeId,
      `${route.tabId}:${route.leafId}`
    )
  })

  it('rejects workers, stale cards, non-running agents, and changed host ownership', () => {
    expect(
      resolvePluginViewAgentMessageTarget({
        agentId: 'missing',
        snapshot,
        route,
        cards: [card],
        state
      })
    ).toBeNull()

    expect(
      resolvePluginViewAgentMessageTarget({
        agentId: agent.id,
        snapshot: { agents: [{ ...agent, worker: true }] } as PluginViewSnapshot,
        route,
        cards: [card],
        state
      })
    ).toBeNull()

    expect(
      resolvePluginViewAgentMessageTarget({
        agentId: agent.id,
        snapshot: { agents: [{ ...agent, status: 'done' }] } as PluginViewSnapshot,
        route,
        cards: [card],
        state
      })
    ).toBeNull()

    expect(
      resolvePluginViewAgentMessageTarget({
        agentId: agent.id,
        snapshot,
        route,
        cards: [],
        state
      })
    ).toBeNull()

    mocks.getExecutionHostIdForWorktree.mockReturnValue('remote:other-host')
    expect(
      resolvePluginViewAgentMessageTarget({
        agentId: agent.id,
        snapshot,
        route,
        cards: [card],
        state
      })
    ).toBeNull()
  })

  it('rejects a pane that Orca no longer considers eligible', () => {
    mocks.resolveRunningAgentSendTarget.mockReturnValue({ kind: 'terminal', status: 'disabled' })
    expect(
      resolvePluginViewAgentMessageTarget({
        agentId: agent.id,
        snapshot,
        route,
        cards: [card],
        state
      })
    ).toBeNull()
  })
})
