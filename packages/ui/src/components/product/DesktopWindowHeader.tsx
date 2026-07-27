/** Shared drag target and separator for frameless desktop product windows. */
export function DesktopWindowHeader() {
  return (
    <div
      aria-hidden
      data-desktop-window-header
      className="h-8 w-full shrink-0 select-none border-b border-border [-webkit-app-region:drag]"
    />
  )
}
