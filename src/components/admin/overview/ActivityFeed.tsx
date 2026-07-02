import { useNavigate } from 'react-router'
import { Activity, Building2, CreditCard, MessageSquare, UserPlus } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ActivityItem {
  id: string
  description: string
  time: string
  route: string
  resourceType?: string
}

interface DecoratedActivityItem extends ActivityItem {
  icon: typeof MessageSquare
  description: string
  time: string
  iconBg: string
}

function relativeTime(value: string) {
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return value
  const diff = Math.max(0, Date.now() - then)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

function decorateActivity(item: ActivityItem): DecoratedActivityItem {
  const resourceType = item.resourceType?.toLowerCase() ?? ''
  if (resourceType.includes('user')) {
    return { ...item, icon: UserPlus, iconBg: 'bg-green-100 text-green-600' }
  }
  if (resourceType.includes('property') || resourceType.includes('sell')) {
    return { ...item, icon: Building2, iconBg: 'bg-amber-100 text-amber-600' }
  }
  if (resourceType.includes('sales') || resourceType.includes('payment')) {
    return { ...item, icon: CreditCard, iconBg: 'bg-purple-100 text-purple-600' }
  }
  if (resourceType.includes('enquiry') || resourceType.includes('support')) {
    return { ...item, icon: MessageSquare, iconBg: 'bg-blue-100 text-blue-600' }
  }
  return { ...item, icon: Activity, iconBg: 'bg-muted text-muted-foreground' }
}

export function ActivityFeed({ activities = [] }: { activities?: ActivityItem[] }) {
  const navigate = useNavigate()
  const decoratedActivities = activities.map(decorateActivity)

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Real-time App Activity</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-green-500" />
          </span>
          Live
        </span>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {decoratedActivities.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No recent audit activity yet
          </div>
        )}
        {decoratedActivities.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              className="flex w-full cursor-pointer gap-3 rounded-xl p-2 text-left transition-colors hover:bg-sidebar-accent"
              onClick={() => navigate(item.route)}
            >
              <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', item.iconBg)}>
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">{item.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{relativeTime(item.time)}</p>
              </div>
            </button>
          )
        })}
      </CardContent>
      <CardFooter className="border-t border-border">
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline"
          onClick={() => navigate('/admin/settings/audit')}
        >
          View All Events →
        </button>
      </CardFooter>
    </Card>
  )
}
