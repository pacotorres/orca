// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PluginViewSnapshot } from '../../../../shared/plugins/plugin-view-api'
import { PluginViewContextSidebar } from './PluginViewContextSidebar'

afterEach(cleanup)

const agent = {
  id: 'agent:1',
  name: 'codex',
  status: 'working',
  worktreeId: 'worktree:1',
  activeWorktree: true,
  worker: false,
  attention: false,
  statusUpdatedAt: Date.now(),
  model: 'anthropic/claude-sonnet-4-5',
  activity: 'editing'
}
const snapshot = {
  revision: 1,
  selectedAgentId: agent.id,
  project: { id: 'project:active', name: 'FILSER' },
  activeWorktreeId: agent.worktreeId,
  worktrees: [{ id: agent.worktreeId, name: 'main', active: true }],
  agents: [agent]
} as PluginViewSnapshot

describe('PluginViewContextSidebar agent composer', () => {
  it('shows only the projected model and activity category for a selected agent', () => {
    render(
      <PluginViewContextSidebar
        title="VOXEL Office"
        snapshot={snapshot}
        selectedAgentId={agent.id}
        open
        width={360}
        onSelectAgent={vi.fn()}
        onRevealAgent={vi.fn(() => true)}
        canSendAgentMessages={false}
        onSendAgent={null}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('Modelo: anthropic/claude-sonnet-4-5')).toBeVisible()
    expect(screen.getByText('Actividad: Modificando archivos')).toBeVisible()
  })

  it('blocks an accidental repeat after Orca cannot confirm delivery', async () => {
    const user = userEvent.setup()
    const onSendAgent = vi.fn().mockResolvedValue({ status: 'unconfirmed' })
    render(
      <PluginViewContextSidebar
        title="VOXEL Office"
        snapshot={snapshot}
        selectedAgentId={agent.id}
        open
        width={360}
        onSelectAgent={vi.fn()}
        onRevealAgent={vi.fn(() => true)}
        canSendAgentMessages
        onSendAgent={onSendAgent}
        onClose={vi.fn()}
      />
    )

    const message = screen.getByRole('textbox', { name: 'Enviar instrucción' })
    await user.type(message, 'Revisa el estado')
    await user.click(screen.getByRole('button', { name: 'Enviar a codex' }))

    expect(await screen.findByText(/Orca bloquea el reenvío del mismo texto/)).toBeVisible()
    expect(onSendAgent).toHaveBeenCalledTimes(1)
    expect(onSendAgent).toHaveBeenCalledWith(agent.id, 'Revisa el estado')
    expect(screen.getByRole('button', { name: 'Enviar a codex' })).toBeDisabled()

    await user.clear(message)
    await user.type(message, 'Revisa de nuevo el estado')
    expect(screen.getByRole('button', { name: 'Enviar a codex' })).toBeEnabled()
    expect(onSendAgent).toHaveBeenCalledTimes(1)
  })

  it('flags an old working status as unverified without changing the reported state', () => {
    render(
      <PluginViewContextSidebar
        title="VOXEL Office"
        snapshot={{
          ...snapshot,
          agents: snapshot.agents.map((candidate) => ({
            ...candidate,
            statusUpdatedAt: Date.now() - 6 * 60_000
          }))
        }}
        selectedAgentId={agent.id}
        open
        width={360}
        onSelectAgent={vi.fn()}
        onRevealAgent={vi.fn(() => true)}
        canSendAgentMessages={false}
        onSendAgent={null}
        onClose={vi.fn()}
      />
    )

    expect(screen.getAllByText('Trabajando')).toHaveLength(2)
    expect(screen.getByText(/Sin señal de estado reciente/)).toBeVisible()
  })
})
