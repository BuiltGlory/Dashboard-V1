import { Link } from 'react-router'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface SlaItem {
  name: string
  timeLabel: string
  urgency: 'red' | 'orange' | 'green'
}

interface SlaTrackerCardProps {
  title: string
  progressPercent: number
  items: SlaItem[]
  viewAllPath: string
}

const urgencyColors = {
  red: 'text-red-600',
  orange: 'text-orange-600',
  green: 'text-green-600',
}

export function SlaTrackerCard({ title, progressPercent, items, viewAllPath }: SlaTrackerCardProps) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Time remaining</span>
            <span>{progressPercent}% within SLA</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-green-500 via-amber-500 to-red-500 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 pt-0">
        {items.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium">{item.name}</span>
            <span className={cn('shrink-0 text-xs font-medium', urgencyColors[item.urgency])}>{item.timeLabel}</span>
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <Link
          to={viewAllPath}
          className="inline-flex h-8 w-full items-center justify-center rounded-md border border-border bg-card text-xs font-medium hover:bg-muted"
        >
          View All
        </Link>
      </CardFooter>
    </Card>
  )
}
