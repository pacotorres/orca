/** Verifies the first read-only plugin view in Orca's main workspace area. */

import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { cleanupTestRepository } from './global-teardown'
import { createSeededTestRepo } from './helpers/seeded-test-repo'

async function openPluginSettings(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window.__store?.getState()
    if (!state) {
      throw new Error('store unavailable')
    }
    state.openSettingsTarget({ pane: 'plugins', repoId: null })
    state.openSettingsPage()
  })
  await expect(page.locator('[data-settings-section="plugins"]')).toBeVisible()
}

test('switches to a project-scoped plugin view and restores the mounted workbench', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'orca-plugin-view-e2e-'))
  const pluginRoot = join(tempRoot, 'voxel-office')
  await cp(join(process.cwd(), 'examples', 'plugins', 'voxel-office'), pluginRoot, {
    recursive: true
  })
  let pluginKey: string | null = null
  let secondaryRepoPath: string | null = null
  let originalSettings: { pluginSystemEnabled: boolean; devPluginPaths: string[] } | null = null
  let originalSidebar: { open: boolean; tab: string; width: number } | null = null
  try {
    const setup = await orcaPage.evaluate(async (sourcePath) => {
      const state = window.__store?.getState()
      if (!state) {
        throw new Error('store unavailable')
      }
      const previousSettings = {
        pluginSystemEnabled: state.settings?.pluginSystemEnabled ?? false,
        devPluginPaths: state.settings?.devPluginPaths ?? []
      }
      const previousSidebar = {
        open: state.rightSidebarOpen,
        tab: state.rightSidebarTab,
        width: state.rightSidebarWidth
      }
      const settings = await window.api.settings.set({ pluginSystemEnabled: true })
      window.__store?.setState({ settings })
      const result = await window.api.plugins.install({ kind: 'local-path', path: sourcePath })
      if (!result.ok) {
        throw new Error(result.error)
      }
      const entry = (await window.api.plugins.refresh()).find(
        (candidate) => candidate.pluginKey === result.pluginKey
      )
      if (!entry) {
        throw new Error('installed plugin was not listed')
      }
      return {
        pluginKey: result.pluginKey,
        status: entry.status,
        originalSettings: previousSettings,
        originalSidebar: previousSidebar
      }
    }, pluginRoot)
    pluginKey = setup.pluginKey
    originalSettings = setup.originalSettings
    originalSidebar = setup.originalSidebar
    expect(setup.status).toBe('pending')

    await openPluginSettings(orcaPage)
    await orcaPage.getByRole('tab', { name: /^Installed/ }).click()
    const row = orcaPage.locator(`[data-plugin-key="${setup.pluginKey}"]`)
    await row.getByRole('button', { name: 'Review & enable' }).click()
    const consent = orcaPage.getByRole('dialog', { name: /review permissions|revisar permisos/i })
    await expect(consent).toContainText('projects:read')
    await expect(consent).toContainText('worktrees:read')
    await expect(consent).toContainText('agents:read')
    await expect(consent).toContainText('agents:send')
    await consent.getByRole('button', { name: /enable|activar plugin/i }).click()
    await expect(consent).toBeHidden()

    const before = await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      if (!state) {
        throw new Error('store unavailable')
      }
      const worktree = state.getKnownWorktreeById(state.activeWorktreeId ?? '')
      const repo = worktree
        ? state.repos.find((candidate) => candidate.id === worktree.repoId)
        : null
      if (!state.activeWorktreeId || !repo) {
        throw new Error('an active project worktree is required')
      }
      state.setRightSidebarOpen(true)
      state.setRightSidebarTab('checks')
      state.setRightSidebarWidth(420)
      state.closeSettingsPage()
      state.setActiveView('terminal')
      const current = window.__store?.getState()
      if (!current) {
        throw new Error('store unavailable after returning to terminal')
      }
      const tabs = current.unifiedTabsByWorktree[current.activeWorktreeId ?? ''] ?? []
      return {
        projectName: current.repos.find((candidate) => candidate.id === repo.id)?.displayName,
        repoId: repo.id,
        worktreeCount: current.worktreesByRepo[repo.id]?.length ?? 0,
        activeWorktreeId: current.activeWorktreeId,
        activeView: current.activeView,
        tabIds: tabs.map((tab) => tab.id)
      }
    })

    const selector = orcaPage.getByRole('combobox', { name: 'Main workspace view' })
    await expect(selector).toBeVisible()
    await selector.selectOption(`${setup.pluginKey}:office`)
    const sidebarRight = await orcaPage
      .locator('.scrollbar-sleek-parent.bg-worktree-sidebar')
      .evaluate((element) => element.getBoundingClientRect().right)
    const pluginViewLeft = await orcaPage
      .locator('iframe[title="Oficina 3D"]')
      .evaluate((element) => element.getBoundingClientRect().left)
    expect(pluginViewLeft - sidebarRight).toBeLessThanOrEqual(2)
    const frame = orcaPage.frameLocator('iframe[title="Oficina 3D"]')
    const contextualSidebar = orcaPage.locator('[data-plugin-context-sidebar="true"]')
    await expect(frame.locator('.scene-project')).toHaveText(before.projectName)
    expect(before.worktreeCount).toBeGreaterThanOrEqual(2)
    await expect(frame.locator('.scene-summary')).toContainText(`${before.worktreeCount} worktrees`)
    await expect(frame.locator('.scene-summary')).toContainText(/worktrees?/)
    await expect(frame.locator('canvas')).toBeVisible()
    await expect(orcaPage.locator('[data-terminal-workbench-container]')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
    await contextualSidebar.getByRole('button', { name: 'Cerrar panel contextual' }).click()
    await expect(contextualSidebar).toHaveCount(0)
    expect(await orcaPage.evaluate(() => window.__store?.getState().rightSidebarOpen)).toBe(true)
    await orcaPage.getByRole('button', { name: 'Abrir panel contextual' }).last().click()
    await expect(orcaPage.locator('[data-plugin-context-sidebar="true"]')).toBeVisible()

    const livePane = await orcaPage.evaluate((worktreeId) => {
      const state = window.__store?.getState()
      if (!state) {
        throw new Error('store unavailable')
      }
      const terminal = (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
        (tab) => tab.contentType === 'terminal'
      )
      const layout = terminal && state.terminalLayoutsByTabId[terminal.id]
      const findLeaf = (node: unknown): string | null => {
        if (!node || typeof node !== 'object') {
          return null
        }
        if ('type' in node && node.type === 'leaf' && 'leafId' in node) {
          return typeof node.leafId === 'string' ? node.leafId : null
        }
        if ('children' in node && Array.isArray(node.children)) {
          for (const child of node.children) {
            const leafId = findLeaf(child)
            if (leafId) {
              return leafId
            }
          }
        }
        return null
      }
      const leafId = layout ? findLeaf(layout.root) : null
      if (!terminal || !leafId) {
        throw new Error('active terminal pane unavailable')
      }
      return { paneKey: `${terminal.id}:${leafId}`, worktreeId }
    }, before.activeWorktreeId)
    await orcaPage.evaluate(({ paneKey, worktreeId }) => {
      const store = window.__store
      const state = store?.getState()
      if (!state) {
        throw new Error('store unavailable')
      }
      state.setAgentStatus(
        paneKey,
        {
          state: 'working',
          agentType: 'codex',
          model: 'gpt-6-luna',
          toolName: 'Read',
          prompt: 'private test prompt',
          subagents: [
            {
              id: 'voxel-live-worker',
              description: 'Worker live',
              state: 'working',
              startedAt: Date.now()
            }
          ]
        },
        'Live test session',
        undefined,
        { worktreeId }
      )
    }, livePane)
    const workerAvatar = frame
      .locator('strong')
      .filter({ hasText: 'Worker live' })
      .locator('xpath=..')
    await expect(workerAvatar).toContainText('Trabajando')
    await expect(frame.locator('body')).not.toContainText('private test prompt')

    await orcaPage.evaluate(({ paneKey, worktreeId }) => {
      const state = window.__store?.getState()
      if (!state) {
        throw new Error('store unavailable')
      }
      state.setAgentStatus(
        paneKey,
        {
          state: 'working',
          agentType: 'codex',
          prompt: 'private test prompt',
          subagents: [
            {
              id: 'voxel-live-worker',
              description: 'Worker live',
              state: 'waiting',
              startedAt: Date.now()
            }
          ]
        },
        'Live test session',
        undefined,
        { worktreeId }
      )
    }, livePane)
    await expect(workerAvatar).toContainText('En espera')
    const workerId = await frame
      .locator('button[data-agent-id]')
      .filter({ hasText: 'Worker live' })
      .getAttribute('data-agent-id')
    if (!workerId) {
      throw new Error('worker identity unavailable')
    }

    secondaryRepoPath = createSeededTestRepo({ publishPath: false })
    registerPostElectronShutdownCleanup(async () => {
      if (secondaryRepoPath) {
        cleanupTestRepository(secondaryRepoPath)
      }
    })
    const secondaryRepoId = await orcaPage.evaluate(async (repoPath) => {
      const result = await window.api.repos.add({ path: repoPath })
      if ('error' in result) {
        throw new Error(result.error)
      }
      return result.repo.id
    }, secondaryRepoPath)
    await expect
      .poll(
        () =>
          orcaPage.evaluate(async (repoId) => {
            const store = window.__store
            if (!store) {
              return false
            }
            await store.getState().fetchRepos({ runtimeEnvironmentId: null, throwOnError: true })
            return store.getState().repos.some((repo) => repo.id === repoId)
          }, secondaryRepoId),
        { timeout: 30_000 }
      )
      .toBe(true)
    let secondaryWorktreeId: string | null = null
    await expect
      .poll(
        async () => {
          secondaryWorktreeId = await orcaPage.evaluate(async (repoId) => {
            const store = window.__store
            if (!store) {
              return null
            }
            const state = store.getState()
            await state.updateRepo(repoId, { externalWorktreeVisibility: 'show' })
            await state.fetchWorktrees(repoId)
            return (
              state.worktreesByRepo[repoId]?.find((worktree) => worktree.isMainWorktree)?.id ?? null
            )
          }, secondaryRepoId)
          return secondaryWorktreeId
        },
        { timeout: 30_000 }
      )
      .not.toBeNull()
    if (!secondaryWorktreeId) {
      throw new Error('secondary repo worktree unavailable')
    }
    await orcaPage.evaluate((worktreeId) => {
      window.__store?.getState().setActiveWorktree(worktreeId)
    }, secondaryWorktreeId)
    await expect(frame.locator('.scene-project')).not.toHaveText(before.projectName)
    const secondaryWorktreeCount = await orcaPage.evaluate(async (repoId) => {
      const state = window.__store?.getState()
      if (!state) {
        return 0
      }
      await state.fetchWorktrees(repoId)
      return state.worktreesByRepo[repoId]?.length ?? 0
    }, secondaryRepoId)
    expect(secondaryWorktreeCount).toBeGreaterThanOrEqual(2)
    await expect(frame.locator('.scene-summary')).toContainText(
      `${secondaryWorktreeCount} worktrees`
    )
    await expect(frame.locator('button[data-agent-id]')).toHaveCount(0)
    await orcaPage.evaluate((worktreeId) => {
      window.__store?.getState().setActiveWorktree(worktreeId)
    }, before.activeWorktreeId)
    await expect(frame.locator('.scene-project')).toHaveText(before.projectName)
    await expect(frame.locator(`button[data-agent-id="${workerId}"]`)).toContainText('En espera')

    const statusFilter = frame.getByRole('combobox', { name: 'Filtrar por estado' })
    await statusFilter.selectOption('waiting')
    await expect(frame.locator('.scene')).toHaveAttribute('data-visible-agent-count', '1')
    const workerButton = frame.locator('button[data-agent-id]').filter({ hasText: 'Worker live' })
    await expect(workerButton).toBeVisible()
    await expect(workerButton).toHaveAttribute('aria-pressed', 'false')
    const primaryAgentRow = contextualSidebar
      .locator('[data-context-agent-id]')
      .filter({ hasText: 'codex' })
      .first()
    await primaryAgentRow.click()
    await expect(contextualSidebar.locator('[data-selected-agent-id]')).toContainText(
      'Modelo: gpt-6-luna'
    )
    await expect(contextualSidebar.locator('[data-selected-agent-id]')).toContainText(
      'Actividad: En curso'
    )
    await expect(
      contextualSidebar.getByRole('textbox', { name: 'Enviar instrucción' })
    ).toBeVisible()
    await expect(contextualSidebar.getByRole('button', { name: 'Enviar a codex' })).toBeVisible()
    await workerButton.focus()
    await orcaPage.keyboard.press('Enter')
    await expect(contextualSidebar.locator(`[data-selected-agent-id="${workerId}"]`)).toContainText(
      'Worker live'
    )
    await expect(workerButton).toHaveAttribute('aria-pressed', 'true')
    await expect(
      contextualSidebar.locator(`[data-context-agent-id="${workerId}"]`)
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      contextualSidebar.getByText(/no tiene una sesión independiente direccionable/)
    ).toBeVisible()
    await contextualSidebar.getByRole('button', { name: 'Limpiar selección' }).click()
    await expect(workerButton).toHaveAttribute('aria-pressed', 'false')
    await contextualSidebar.locator(`[data-context-agent-id="${workerId}"]`).click()
    await expect(workerButton).toHaveAttribute('aria-pressed', 'true')
    await statusFilter.selectOption('blocked')
    await expect(frame.locator('.scene')).toHaveAttribute('data-visible-agent-count', '0')
    await expect(contextualSidebar.locator(`[data-selected-agent-id="${workerId}"]`)).toContainText(
      'Worker live'
    )
    await contextualSidebar.getByRole('button', { name: 'Limpiar selección' }).click()
    await statusFilter.selectOption('all')

    await contextualSidebar.locator(`[data-context-agent-id="${workerId}"]`).click()
    await contextualSidebar.getByRole('button', { name: 'Abrir sesión en Orca' }).click()
    await expect(orcaPage.locator('[data-terminal-workbench-container]')).toHaveAttribute(
      'aria-hidden',
      'false'
    )
    expect(
      await orcaPage.evaluate(() => ({
        activeWorktreeId: window.__store?.getState().activeWorktreeId,
        activeView: window.__store?.getState().activeView
      }))
    ).toEqual({ activeWorktreeId: before.activeWorktreeId, activeView: 'terminal' })
    await selector.selectOption(`${setup.pluginKey}:office`)
    await expect(orcaPage.locator('[data-plugin-context-sidebar="true"]')).toBeVisible()
    const restoredWorker = frame.locator(`button[data-agent-id="${workerId}"]`)
    await expect(restoredWorker).toHaveCount(1)
    await expect(restoredWorker).toContainText('En espera')

    const during = await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      if (!state) {
        throw new Error('store unavailable')
      }
      return {
        activeWorktreeId: state.activeWorktreeId,
        activeView: state.activeView,
        tabIds: (state.unifiedTabsByWorktree[state.activeWorktreeId ?? ''] ?? []).map(
          (tab) => tab.id
        )
      }
    })
    expect(during).toEqual({
      activeWorktreeId: before.activeWorktreeId,
      activeView: before.activeView,
      tabIds: before.tabIds
    })
    expect(
      await orcaPage.evaluate(() => {
        const state = window.__store?.getState()
        return state
          ? {
              open: state.rightSidebarOpen,
              tab: state.rightSidebarTab,
              width: state.rightSidebarWidth
            }
          : null
      })
    ).toEqual({ open: true, tab: 'checks', width: 420 })

    await selector.selectOption('traditional')
    await expect(orcaPage.locator('iframe[title="Oficina 3D"]')).toHaveCount(0)
    await expect(orcaPage.locator('[data-terminal-workbench-container]')).toHaveAttribute(
      'aria-hidden',
      'false'
    )
    await expect(orcaPage.locator('[data-plugin-context-sidebar="true"]')).toHaveCount(0)
    const nativeRightSidebar = orcaPage.locator('[data-native-right-sidebar="true"]')
    await expect(nativeRightSidebar).toBeVisible()
    expect(
      await nativeRightSidebar.evaluate((element) => element.getBoundingClientRect().width)
    ).toBeGreaterThanOrEqual(400)
    expect(
      await orcaPage.evaluate(() => ({
        activeWorktreeId: window.__store?.getState().activeWorktreeId,
        activeView: window.__store?.getState().activeView
      }))
    ).toEqual({ activeWorktreeId: before.activeWorktreeId, activeView: before.activeView })
  } finally {
    try {
      if (pluginKey) {
        await orcaPage.evaluate((key) => window.api.plugins.remove({ pluginKey: key }), pluginKey)
      }
      if (originalSettings) {
        await orcaPage.evaluate(async (settings) => {
          const updated = await window.api.settings.set(settings)
          window.__store?.setState({ settings: updated })
        }, originalSettings)
      }
      if (originalSidebar) {
        await orcaPage.evaluate((sidebar) => {
          const state = window.__store?.getState()
          if (!state) {
            return
          }
          state.setRightSidebarOpen(sidebar.open)
          state.setRightSidebarTab(sidebar.tab as never)
          state.setRightSidebarWidth(sidebar.width)
        }, originalSidebar)
      }
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  }
})
