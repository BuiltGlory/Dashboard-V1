import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  formatChannel,
  formatMessageTimeAgo,
  type SentMessage,
} from '@/utils/messageLog'

export function SentMessagesCard({ messages }: { messages: SentMessage[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Sent Messages</CardTitle>
        <Badge variant="default">{messages.length}</Badge>
      </CardHeader>
      <CardContent>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages sent yet</p>
        ) : (
          <ul className="space-y-3">
            {messages.map((msg) => {
              const expanded = expandedId === msg.id
              return (
                <li key={msg.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"
                    onClick={() =>
                      setExpandedId((id) => (id === msg.id ? null : msg.id))
                    }
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium">
                        {formatChannel(msg.channel)}
                      </span>
                      {msg.subject && expanded && (
                        <span className="text-xs text-muted-foreground">
                          {msg.subject}
                        </span>
                      )}
                    </div>
                    <p
                      className={cn(
                        'mt-1 text-sm text-foreground',
                        !expanded && 'line-clamp-2',
                      )}
                    >
                      {msg.message}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {msg.sentBy} · {formatMessageTimeAgo(msg.sentAt)}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
