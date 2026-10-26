import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test('collapsed sidebar toggle stays clickable while a plugin view is active', async ({
  orcaPage
}) => {
  await orcaPage.addInitScript(() => {
    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146 Safari/537.36'
    Object.defineProperty(navigator, 'userAgent', {
      get: () => userAgent,
      configurable: true
    })
  })
  await orcaPage.reload({ waitUntil: 'domcontentloaded' })
  await orcaPage.waitForFunction(() => Boolean(window.__store), null, { timeout: 30_000 })
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)

  const tempRoot = await mkdtemp(join(tmpdir(), 'orca-plugin-sidebar-toggle-e2e-'))
  const pluginRoot = join(tempRoot, 'voxel-office')
  await cp(join(process.cwd(), 'examples', 'plugins', 'voxel-office'), pluginRoot, {
    recursive: true
  })

  let pluginKey: string | null = null
  let originalPluginSystemEnabled: boolean | null = null
  try {
    const setup = await orcaPage.evaluate(async (sourcePath) => {
      const state = window.__store?.getState()
      if (!state) {
        throw new Error('store unavailable')
      }
      const previousPluginSystemEnabled = state.settings?.pluginSystemEnabled ?? false
      const settings = await window.api.settings.set({ pluginSystemEnabled: true })
      window.__store?.setState({ settings })
      const installed = await window.api.plugins.install({ kind: 'local-path', path: sourcePath })
      if (!installed.ok) {
        throw new Error(installed.error)
      }
      const entry = (await window.api.plugins.refresh()).find(
        (candidate) => candidate.pluginKey === installed.pluginKey
      )
      if (!entry?.consentFingerprint) {
        throw new Error('installed plugin has no consent fingerprint')
      }
      await window.api.plugins.consent({
        pluginKey: installed.pluginKey,
        reviewedFingerprint: entry.consentFingerprint,
        decision: 'approve'
      })
      const current = window.__store?.getState()
      if (!current) {
        throw new Error('store unavailable after plugin approval')
      }
      current.closeSettingsPage()
      current.setActiveView('terminal')
      current.setRightSidebarOpen(false)
      current.setSidebarOpen(true)
      return { pluginKey: installed.pluginKey, previousPluginSystemEnabled }
    }, pluginRoot)
    pluginKey = setup.pluginKey
    originalPluginSystemEnabled = setup.previousPluginSystemEnabled

    const selector = orcaPage.getByRole('combobox', { name: 'Main workspace view' })
    await expect(selector).toBeVisible()
    await selector.selectOption(`${setup.pluginKey}:office`)
    await expect(orcaPage.locator('iframe[title="Oficina 3D"]')).toBeVisible()
    await expect(orcaPage.locator('[data-terminal-workbench-container]')).toHaveAttribute(
      'aria-hidden',
      'true'
    )

    const leftSidebarToggle = orcaPage.locator('.titlebar-left button.sidebar-toggle').first()
    await leftSidebarToggle.click()
    await expect
      .poll(() => orcaPage.evaluate(() => window.__store?.getState().sidebarOpen))
      .toBe(false)
    const floatingHeader = orcaPage.locator('.titlebar > .titlebar-left.titlebar-left-floating')
    await expect(floatingHeader).toBeVisible()
    await expect
      .poll(() => floatingHeader.evaluate((element) => getComputedStyle(element).webkitAppRegion))
      .toBe('no-drag')

    await leftSidebarToggle.click()
    await expect
      .poll(() => orcaPage.evaluate(() => window.__store?.getState().sidebarOpen))
      .toBe(true)
  } finally {
    if (pluginKey) {
      await orcaPage.evaluate((key) => window.api.plugins.remove({ pluginKey: key }), pluginKey)
    }
    if (originalPluginSystemEnabled !== null) {
      await orcaPage.evaluate(async (pluginSystemEnabled) => {
        const settings = await window.api.settings.set({ pluginSystemEnabled })
        window.__store?.setState({ settings })
      }, originalPluginSystemEnabled)
    }
    await rm(tempRoot, { recursive: true, force: true })
  }
})
