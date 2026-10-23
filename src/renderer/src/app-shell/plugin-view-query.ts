import {
  PLUGIN_VIEW_QUERY_RESULT_TYPE,
  type PluginViewQueryRequest,
  type PluginViewQueryResult,
  type PluginViewSnapshot
} from '../../../shared/plugins/plugin-view-api'

const capabilityByQuery = {
  'projects.getActive': 'projects:read',
  'worktrees.list': 'worktrees:read',
  'agents.snapshot': 'agents:read'
} as const satisfies Record<PluginViewQueryRequest['query'], string>

export function resolvePluginViewQuery(
  request: PluginViewQueryRequest,
  snapshot: PluginViewSnapshot,
  grantedCapabilities: readonly string[]
): PluginViewQueryResult {
  const base = {
    type: PLUGIN_VIEW_QUERY_RESULT_TYPE,
    requestId: request.requestId
  } as const
  if (!grantedCapabilities.includes(capabilityByQuery[request.query])) {
    return { ...base, query: request.query, ok: false, error: 'permission-denied' }
  }
  if (request.query === 'projects.getActive') {
    return { ...base, query: 'projects.getActive', ok: true, data: snapshot.project }
  }
  if (request.projectId !== 'project:active' || !snapshot.project) {
    return { ...base, query: request.query, ok: false, error: 'project-unavailable' }
  }
  return request.query === 'worktrees.list'
    ? { ...base, query: 'worktrees.list', ok: true, data: snapshot.worktrees }
    : { ...base, query: 'agents.snapshot', ok: true, data: snapshot.agents }
}
