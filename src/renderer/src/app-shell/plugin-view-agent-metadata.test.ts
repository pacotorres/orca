import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import { safePluginViewActivity, safePluginViewModel } from './plugin-view-agent-metadata'

describe('plugin view agent metadata', () => {
  it('keeps a bounded model label and rejects path-like or control-bearing values', () => {
    expect(safePluginViewModel('anthropic/claude-sonnet-4-5')).toBe('anthropic/claude-sonnet-4-5')
    expect(safePluginViewModel('/Users/paco/secret')).toBeUndefined()
    expect(safePluginViewModel('model\nsecret')).toBeUndefined()
    expect(safePluginViewModel('x'.repeat(121))).toBeUndefined()
  })

  it('maps known tools to closed activity categories without forwarding tool text', () => {
    const entry = { state: 'working', toolName: 'Bash' } satisfies Pick<
      AgentStatusEntry,
      'state' | 'toolName'
    >
    expect(safePluginViewActivity(entry, 'working')).toBe('running')
    expect(safePluginViewActivity({ ...entry, toolName: 'UnknownSecretTool' }, 'working')).toBe(
      'other'
    )
    expect(safePluginViewActivity(entry, 'done')).toBeUndefined()
    expect(safePluginViewActivity(undefined, 'working')).toBeUndefined()
  })
})
