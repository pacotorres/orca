import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { PluginViewAgent } from '../../../shared/plugins/plugin-view-api'

export type PluginViewStatusMetadata = Pick<AgentStatusEntry, 'model' | 'state' | 'toolName'>

const TOOL_ACTIVITY = new Map<string, NonNullable<PluginViewAgent['activity']>>([
  ['read', 'reading'],
  ['glob', 'reading'],
  ['grep', 'reading'],
  ['webfetch', 'reading'],
  ['websearch', 'reading'],
  ['edit', 'editing'],
  ['write', 'editing'],
  ['notebookedit', 'editing'],
  ['apply_patch', 'editing'],
  ['bash', 'running'],
  ['exec_command', 'running'],
  ['terminal', 'running']
])

export function safePluginViewModel(model: string | undefined): string | undefined {
  if (!model || model.length > 120) {
    return undefined
  }
  const value = model.trim()
  if (!value || value.startsWith('/') || value.startsWith('~/') || /^[A-Za-z]:[\\/]/.test(value)) {
    return undefined
  }
  return /^[A-Za-z0-9][A-Za-z0-9._:/+ -]*$/.test(value) ? value : undefined
}

export function safePluginViewActivity(
  entry: PluginViewStatusMetadata | undefined,
  status: PluginViewAgent['status']
): PluginViewAgent['activity'] {
  if (status !== 'working' || entry?.state !== 'working' || !entry.toolName) {
    return undefined
  }
  return TOOL_ACTIVITY.get(entry.toolName.toLowerCase()) ?? 'other'
}
