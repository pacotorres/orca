import { describe, expect, it } from 'vitest'
import type { SshConnectionState } from '../../../shared/ssh-types'
import {
  pluginViewExecutionHostState,
  pluginViewRuntimeHostState,
  pluginViewSshHostState
} from './plugin-view-connection-state'

describe('plugin view host-state projection', () => {
  it('maps local, unknown, reconnecting, unavailable, and disconnected hosts', () => {
    expect(
      pluginViewExecutionHostState({
        executionHostId: 'local',
        runtimeStatusByEnvironmentId: new Map(),
        sshConnectionStates: new Map()
      })
    ).toBe('connected')
    expect(pluginViewRuntimeHostState(undefined)).toBe('connecting')
    expect(pluginViewRuntimeHostState({ status: null, checkedAt: 0 })).toBe('disconnected')
    expect(pluginViewSshHostState({ status: 'reconnecting' } as SshConnectionState)).toBe(
      'connecting'
    )
    expect(pluginViewSshHostState({ status: 'connected' } as SshConnectionState)).toBe('connected')
    expect(pluginViewSshHostState({ status: 'reconnection-failed' } as SshConnectionState)).toBe(
      'disconnected'
    )
  })
})
