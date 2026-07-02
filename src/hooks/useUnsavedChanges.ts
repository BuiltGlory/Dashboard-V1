import { useEffect } from 'react'
import { createElement } from 'react'
import { useBlocker, type Blocker } from 'react-router'

export const useUnsavedChanges = (hasChanges: boolean) => {
  useEffect(() => {
    if (!hasChanges) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasChanges])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasChanges && currentLocation.pathname !== nextLocation.pathname,
  )

  return blocker
}

interface UnsavedChangesDialogProps {
  blocker: Blocker
}

export function UnsavedChangesDialog({ blocker }: UnsavedChangesDialogProps) {
  if (blocker.state !== 'blocked') return null

  return createElement(
    'div',
    { className: 'fixed inset-0 z-[200] flex items-center justify-center bg-black/50' },
    createElement(
      'div',
      { className: 'mx-4 max-w-sm rounded-xl bg-card p-6 shadow-xl' },
      createElement('h3', { className: 'text-lg font-semibold' }, 'Unsaved Changes'),
      createElement(
        'p',
        { className: 'mt-2 text-sm text-muted-foreground' },
        'You have unsaved changes. Are you sure you want to leave? Your changes will be lost.',
      ),
      createElement(
        'div',
        { className: 'mt-4 flex gap-3' },
        createElement(
          'button',
          {
            type: 'button',
            onClick: () => blocker.reset?.(),
            className:
              'flex-1 rounded-lg border border-border py-2 text-sm font-medium hover:bg-sidebar-accent',
          },
          'Stay',
        ),
        createElement(
          'button',
          {
            type: 'button',
            onClick: () => blocker.proceed?.(),
            className:
              'flex-1 rounded-lg bg-red-500 py-2 text-sm font-medium text-white hover:bg-red-600',
          },
          'Leave anyway',
        ),
      ),
    ),
  )
}
