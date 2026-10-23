import { Minimize2, PanelRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TOGGLE_TERMINAL_PANE_EXPAND_EVENT } from '@/constants/terminal'
import { ActivityTitlebarControls } from '../components/activity/ActivityTitlebarControls'
import { useShortcutLabel } from '../hooks/useShortcutLabel'
import { useAppStore } from '../store'
import { hasCustomTitleBar } from './app-window-chrome'
import type { AppChromeLayout } from './use-app-chrome-layout'
import type { ActivePluginView } from '@/store/plugin-panels'

const EMPTY_PLUGIN_VIEWS: ActivePluginView[] = []

export function RightSidebarToggleButton({
  onToggle,
  ariaLabel
}: {
  onToggle?: () => void
  ariaLabel?: string
}): React.JSX.Element {
  const toggleRightSidebar = useAppStore((s) => s.toggleRightSidebar)
  const rightSidebarShortcutLabel = useShortcutLabel('sidebar.right.toggle')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="sidebar-toggle mr-2"
          onClick={onToggle ?? toggleRightSidebar}
          aria-label={ariaLabel ?? translate('auto.App.9e0b441a91', 'Toggle right sidebar')}
        >
          <PanelRight size={16} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {translate('auto.App.c184e056de', 'Toggle right sidebar ({{value0}})', {
          value0: rightSidebarShortcutLabel
        })}
      </TooltipContent>
    </Tooltip>
  )
}

/** The titlebar's center/right strip: the tab-strip portal slot and the trailing chrome buttons. */
export function TitlebarMainStrip({
  layout,
  pluginViews = EMPTY_PLUGIN_VIEWS,
  selectedPluginViewKey = 'traditional',
  onPluginViewChange,
  pluginViewActive = false,
  contextualSidebarOpen,
  onContextualSidebarToggle
}: {
  layout: AppChromeLayout
  pluginViews?: ActivePluginView[]
  selectedPluginViewKey?: string
  onPluginViewChange?: (key: string) => void
  pluginViewActive?: boolean
  contextualSidebarOpen?: boolean
  onContextualSidebarToggle?: () => void
}): React.JSX.Element {
  const handleToggleExpand = (): void => {
    if (!layout.effectiveActiveTabId) {
      return
    }
    window.dispatchEvent(
      new CustomEvent(TOGGLE_TERMINAL_PANE_EXPAND_EVENT, {
        detail: { tabId: layout.effectiveActiveTabId }
      })
    )
  }

  return (
    <>
      {layout.activeView === 'activity' ? (
        <ActivityTitlebarControls />
      ) : layout.creationLayoutActive ? null : (
        <div
          id="titlebar-tabs"
          className={`flex flex-1 min-w-0 self-stretch${!layout.workspaceChromeActive ? ' invisible pointer-events-none' : ''}`}
        />
      )}
      {layout.workspaceChromeActive && pluginViews.length > 0 && onPluginViewChange ? (
        <label
          className="mr-2 flex shrink-0 items-center"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="sr-only">Main workspace view</span>
          <select
            aria-label="Main workspace view"
            className="h-8 w-72 max-w-[40vw] min-w-56 rounded-md border border-border bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={selectedPluginViewKey}
            onChange={(event) => onPluginViewChange(event.currentTarget.value)}
          >
            <option value="traditional">Orca</option>
            {pluginViews.map((view) => (
              <option key={`${view.pluginKey}:${view.id}`} value={`${view.pluginKey}:${view.id}`}>
                {view.pluginName} · {view.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {layout.showTitlebarExpandButton && !pluginViewActive && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="titlebar-icon-button"
              onClick={handleToggleExpand}
              aria-label={translate('auto.App.c1cf0b0e4a', 'Collapse pane')}
              disabled={!layout.activeTabCanExpand}
            >
              <Minimize2 size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.App.c1cf0b0e4a', 'Collapse pane')}
          </TooltipContent>
        </Tooltip>
      )}
      {/* Why: the open right sidebar's header renders its own close button, so hide this duplicate. */}
      {layout.showRightSidebarControls &&
      (pluginViewActive ? !contextualSidebarOpen : !layout.rightSidebarOpen) ? (
        <RightSidebarToggleButton
          onToggle={pluginViewActive ? onContextualSidebarToggle : undefined}
          ariaLabel={pluginViewActive ? 'Abrir panel contextual' : undefined}
        />
      ) : null}
      {/* Why: reserve space so the Windows/Linux window-controls overlay doesn't obscure content. */}
      {hasCustomTitleBar && <div className="window-controls-titlebar-spacer" />}
    </>
  )
}
