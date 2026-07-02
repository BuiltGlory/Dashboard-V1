import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface NotificationPreviewProps {
  title: string
  body: string
  deepLink: string
  notificationId: string
  recipientLabel?: string
  className?: string
}

export default function NotificationPreview({
  title,
  body,
  deepLink,
  notificationId,
  recipientLabel = 'user',
  className,
}: NotificationPreviewProps) {
  return (
    <div
      className={cn(
        'mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3',
        className,
      )}
    >
      <p className="mb-2 flex items-center gap-1 text-xs font-medium text-blue-700">
        <span aria-hidden>📱</span>
        Notification {notificationId} will be sent to {recipientLabel}
      </p>
      <div className="rounded bg-white p-2 shadow-sm">
        <div className="mb-1 flex items-center gap-1">
          <Bell className="size-2.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Builtglory</span>
        </div>
        <p className="line-clamp-1 text-sm font-medium">{title}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{body}</p>
      </div>
      <p className="mt-1 text-xs italic text-muted-foreground">Opens: {deepLink}</p>
    </div>
  )
}

export { NotificationPreview }
