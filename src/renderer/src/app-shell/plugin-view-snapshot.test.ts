import { describe, expect, it } from 'vitest'
import type { DashboardSnapshot } from '../../../shared/dashboard-snapshot'
import { createPluginViewIdentityMap, projectPluginViewSnapshot } from './plugin-view-snapshot'

describe('projectPluginViewSnapshot', () => {
  it('limits agents to the selected project and strips paths and conversation content', () => {
    const internalRepo = '/Users/paco/private/FILSER'
    const snapshot = {
      generatedAt: 20,
      workspaces: [
        {
          repoId: internalRepo,
          worktreeId: `${internalRepo}/.orca/worktrees/main`,
          repoName: 'FILSER',
          worktreeName: 'main'
        },
        {
          repoId: internalRepo,
          worktreeId: `${internalRepo}/.orca/worktrees/worker`,
          repoName: 'FILSER',
          worktreeName: `${internalRepo}/.orca/worktrees/worker`
        },
        {
          repoId: '/Users/paco/other',
          worktreeId: '/Users/paco/other/main',
          repoName: 'Other',
          worktreeName: 'main'
        }
      ],
      cards: [
        {
          paneKey: 'pane-secret',
          ptyId: 'pty-secret',
          agentType: 'codex',
          bucket: 'working',
          dotState: 'working',
          task: 'private prompt',
          lastUserMessage: 'private message',
          repoId: internalRepo,
          worktreeId: `${internalRepo}/.orca/worktrees/worker`,
          tabId: 'tab-secret',
          leafId: 'leaf-secret',
          repoName: 'FILSER',
          worktreeName: 'worker',
          startedAt: 1,
          finishedAt: null,
          stateChangedAt: 2,
          statusUpdatedAt: 15,
          unseen: false,
          subagents: [{ id: 'child-secret', name: 'worker one', dotState: 'waiting' }]
        },
        {
          paneKey: 'other-pane',
          ptyId: null,
          agentType: 'claude',
          bucket: 'working',
          dotState: 'working',
          task: 'other project',
          repoId: '/Users/paco/other',
          worktreeId: '/Users/paco/other/main',
          tabId: 'tab-other',
          leafId: null,
          repoName: 'Other',
          worktreeName: 'main',
          startedAt: 1,
          finishedAt: null,
          stateChangedAt: 2,
          unseen: false
        }
      ]
    } as unknown as DashboardSnapshot

    const identities = createPluginViewIdentityMap()
    const result = projectPluginViewSnapshot(
      snapshot,
      `${internalRepo}/.orca/worktrees/main`,
      7,
      identities,
      undefined,
      undefined,
      {
        'pane-secret': { state: 'working', model: 'anthropic/claude-sonnet-4-5', toolName: 'Read' }
      }
    )

    expect(result.project).toEqual({ id: 'project:active', name: 'FILSER' })
    expect(result.worktrees).toEqual([
      { id: 'worktree:1', name: 'main', active: true },
      { id: 'worktree:2', name: 'worker', active: false }
    ])
    expect(result.agents).toMatchObject([
      {
        name: 'codex',
        status: 'working',
        worktreeId: 'worktree:2',
        activeWorktree: false,
        worker: false,
        attention: false,
        statusUpdatedAt: 15,
        model: 'anthropic/claude-sonnet-4-5',
        activity: 'reading'
      },
      {
        name: 'worker one',
        status: 'waiting',
        worktreeId: 'worktree:2',
        activeWorktree: false,
        worker: true,
        attention: true,
        statusUpdatedAt: null
      }
    ])
    const wire = JSON.stringify(result)
    for (const privateValue of [
      internalRepo,
      'pane-secret',
      'pty-secret',
      'tab-secret',
      'private prompt',
      'private message'
    ]) {
      expect(wire).not.toContain(privateValue)
    }
    expect(identities.agentRoutes.get(result.agents[0].id)).toEqual({
      repoId: internalRepo,
      worktreeId: `${internalRepo}/.orca/worktrees/worker`,
      executionHostId: undefined,
      tabId: 'tab-secret',
      leafId: 'leaf-secret'
    })
    expect(identities.agentRoutes.get(result.agents[1].id)).toEqual(
      identities.agentRoutes.get(result.agents[0].id)
    )
    expect(wire).not.toContain('leaf-secret')
    const nextRevision = projectPluginViewSnapshot(
      {
        ...snapshot,
        cards: snapshot.cards.map((card, index) =>
          index === 0 ? { ...card, dotState: 'done' } : card
        )
      } as DashboardSnapshot,
      `${internalRepo}/.orca/worktrees/main`,
      8,
      identities
    )
    expect(nextRevision.agents.map((agent) => agent.id)).toEqual(
      result.agents.map((agent) => agent.id)
    )
    expect(nextRevision.agents[0]?.status).toBe('done')
    expect(nextRevision.agents.some((agent) => identities.agentRoutes.has(agent.id))).toBe(true)
  })

  it('returns an empty snapshot when the selected worktree has no project context', () => {
    expect(projectPluginViewSnapshot({ generatedAt: 1, cards: [] }, null, 2)).toEqual({
      revision: 2,
      selectedAgentId: null,
      project: null,
      activeWorktreeId: null,
      worktrees: [],
      agents: []
    })
  })

  it('keeps host-colliding worktree ids distinct and highlights the active owner', () => {
    const snapshot = {
      generatedAt: 10,
      workspaces: [
        {
          repoId: 'repo-id',
          worktreeId: 'shared-id',
          repoName: 'Project',
          worktreeName: 'Local',
          executionHostId: 'local'
        },
        {
          repoId: 'repo-id',
          worktreeId: 'shared-id',
          repoName: 'Project',
          worktreeName: 'Remote',
          executionHostId: 'ssh:host'
        }
      ],
      cards: [
        {
          paneKey: 'same-pane',
          ptyId: null,
          agentType: 'codex',
          bucket: 'working',
          dotState: 'working',
          task: '',
          repoId: 'repo-id',
          worktreeId: 'shared-id',
          tabId: 'same-tab',
          leafId: null,
          repoName: 'Project',
          worktreeName: 'Remote',
          executionHostId: 'ssh:host',
          startedAt: 1,
          finishedAt: null,
          stateChangedAt: 2,
          unseen: false
        }
      ]
    } as unknown as DashboardSnapshot
    const result = projectPluginViewSnapshot(snapshot, 'shared-id', 1, undefined, 'ssh:host')
    expect(result.worktrees).toHaveLength(2)
    expect(new Set(result.worktrees.map((worktree) => worktree.id)).size).toBe(2)
    expect(
      result.worktrees.filter((worktree) => worktree.active).map((worktree) => worktree.name)
    ).toEqual(['Remote'])
    expect(result.agents).toMatchObject([
      { worktreeId: result.activeWorktreeId, activeWorktree: true }
    ])
  })
})
