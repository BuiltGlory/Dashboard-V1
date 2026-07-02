import { findNavItemByPath } from '@/config/adminNavigation'
import { useLocation } from 'react-router'
import { Card, CardContent } from '@/components/ui/card'

export function PlaceholderPage() {
  const { pathname } = useLocation()
  const item = findNavItemByPath(pathname)

  if (!item) {
    return (
      <Card>
        <CardContent className="flex min-h-[320px] flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">Page not found</p>
        </CardContent>
      </Card>
    )
  }

  const Icon = item.icon

  return (
    <Card>
      <CardContent className="flex min-h-[400px] flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg">
          <Icon className="size-8" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{item.label}</h2>
          <p className="mt-2 text-muted-foreground">Coming Soon</p>
        </div>
        <p className="max-w-md text-sm text-muted-foreground">
          This section is ready for implementation. Connect your API and build out the full experience here.
        </p>
      </CardContent>
    </Card>
  )
}
