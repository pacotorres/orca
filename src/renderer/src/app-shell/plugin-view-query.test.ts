import { describe, expect, it } from 'vitest'
import {
  pluginViewQueryRequestSchema,
  pluginViewQueryResultSchema,
  pluginViewEventSchema,
  type PluginViewQueryRequest,
  type PluginViewSnapshot
} from '../../../shared/plugins/plugin-view-api'
import { resolvePluginViewQuery } from './plugin-view-query'

const snapshot: PluginViewSnapshot = {
  revision: 4,
  selectedAgentId: null,
  project: { id: 'project:active', name: 'Project A' },
  activeWorktreeId: 'worktree:1',
  worktrees: [
    { id: 'worktree:1', name: 'main', active: true },
    { id: 'worktree:2', name: 'feature', active: false }
  ],
  agents: [
    {
      id: 'agent:1',
      name: 'codex',
      status: 'working',
      worktreeId: 'worktree:2',
      activeWorktree: false,
      worker: false,
      attention: false,
      statusUpdatedAt: 10
    }
  ]
}

describe('plugin view query contract', () => {
  it('validates sequenced full-snapshot update events', () => {
    expect(
      pluginViewEventSchema.safeParse({
        type: 'orca-plugin-view-event',
        event: 'snapshot.updated',
        sequence: 1,
        revision: snapshot.revision,
        snapshot
      }).success
    ).toBe(true)
    expect(
      pluginViewEventSchema.safeParse({
        type: 'orca-plugin-view-event',
        event: 'snapshot.updated',
        sequence: 0,
        revision: snapshot.revision,
        snapshot
      }).success
    ).toBe(false)
    expect(
      pluginViewEventSchema.safeParse({
        type: 'orca-plugin-view-event',
        event: 'snapshot.updated',
        sequence: 2,
        revision: snapshot.revision + 1,
        snapshot
      }).success
    ).toBe(false)
  })

  it('returns only the active project, its worktrees, or its agent projection', () => {
    expect(
      resolvePluginViewQuery(
        { type: 'orca-plugin-query', requestId: 'project-1', query: 'projects.getActive' },
        snapshot,
        ['projects:read']
      )
    ).toEqual({
      type: 'orca-plugin-query-result',
      requestId: 'project-1',
      query: 'projects.getActive',
      ok: true,
      data: snapshot.project
    })

    expect(
      resolvePluginViewQuery(
        {
          type: 'orca-plugin-query',
          requestId: 'worktrees-1',
          query: 'worktrees.list',
          projectId: 'project:active'
        },
        snapshot,
        ['worktrees:read']
      )
    ).toMatchObject({ ok: true, query: 'worktrees.list', data: snapshot.worktrees })

    expect(
      resolvePluginViewQuery(
        {
          type: 'orca-plugin-query',
          requestId: 'agents-1',
          query: 'agents.snapshot',
          projectId: 'project:active'
        },
        snapshot,
        ['agents:read']
      )
    ).toMatchObject({ ok: true, query: 'agents.snapshot', data: snapshot.agents })
  })

  it('checks the exact read capability for each query', () => {
    const request: PluginViewQueryRequest = {
      type: 'orca-plugin-query',
      requestId: 'agents-2',
      query: 'agents.snapshot',
      projectId: 'project:active'
    }
    expect(resolvePluginViewQuery(request, snapshot, ['projects:read'])).toEqual({
      type: 'orca-plugin-query-result',
      requestId: 'agents-2',
      query: 'agents.snapshot',
      ok: false,
      error: 'permission-denied'
    })
  })

  it('does not return worktrees or agents without an active project', () => {
    const noProject = {
      ...snapshot,
      project: null,
      activeWorktreeId: null,
      worktrees: [],
      agents: []
    }
    expect(
      resolvePluginViewQuery(
        {
          type: 'orca-plugin-query',
          requestId: 'worktrees-2',
          query: 'worktrees.list',
          projectId: 'project:active'
        },
        noProject,
        ['worktrees:read']
      )
    ).toMatchObject({ ok: false, error: 'project-unavailable' })
  })

  it('rejects malformed requests, cross-project scopes, and mismatched results', () => {
    expect(
      pluginViewQueryRequestSchema.safeParse({
        type: 'orca-plugin-query',
        requestId: 'bad-1',
        query: 'worktrees.list',
        projectId: '/private/repo'
      }).success
    ).toBe(false)
    expect(
      pluginViewQueryRequestSchema.safeParse({
        type: 'orca-plugin-query',
        requestId: 'bad-2',
        query: 'projects.getActive',
        projectId: 'project:active'
      }).success
    ).toBe(false)
    expect(
      pluginViewQueryResultSchema.safeParse({
        type: 'orca-plugin-query-result',
        requestId: 'bad-3',
        query: 'agents.snapshot',
        ok: true,
        data: snapshot.worktrees
      }).success
    ).toBe(false)

    const mismatchedScope = {
      type: 'orca-plugin-query',
      requestId: 'bad-4',
      query: 'agents.snapshot',
      projectId: 'project:another'
    } as unknown as PluginViewQueryRequest
    expect(resolvePluginViewQuery(mismatchedScope, snapshot, ['agents:read'])).toMatchObject({
      ok: false,
      error: 'project-unavailable'
    })
  })
})
