import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string
  subtitle: string
  subtitleClassName?: string
  icon: LucideIcon
  gradient: string
}

export function StatCard({
  title,
  value,
  subtitle,
  subtitleClassName,
  icon: Icon,
  gradient,
}: StatCardProps) {
  return (
    <Card className="h-full overflow-hidden rounded-2xl border-border/80 transition-all duration-200 group-hover:border-primary/20 group-hover:shadow-lg">
      <CardContent className="relative flex h-full min-h-[132px] items-stretch justify-between gap-4 p-5">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/40 via-primary/10 to-transparent" />
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-bold leading-none tracking-tight md:text-3xl">{value}</p>
          </div>
          <p className={cn('mt-3 min-h-4 text-xs leading-snug', subtitleClassName ?? 'text-muted-foreground')}>
            {subtitle}
          </p>
        </div>
        <div className={cn('flex size-12 shrink-0 items-center justify-center self-start rounded-2xl text-white shadow-lg transition-transform duration-200 group-hover:scale-105', gradient)}>
          <Icon className="size-6" />
        </div>
      </CardContent>
    </Card>
  )
}
