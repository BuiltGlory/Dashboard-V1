import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Home,
  MessageSquare,
  Phone,
  Search,
  User,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CHAT_STATUS_LABELS as STATUS_LABELS,
  formatINR,
  formatINRShort,
  formatMessageTime,
  formatThreadTime,
  getTotalUnread,
  isDeadlineSoon,
  isLongNegotiation,
  listAdminChatThreads,
  sendAdminChatMessage,
  type ChatMessage,
  type ChatStatus,
  type ChatThread,
  type OfferStatus,
} from '@/api/adminEnquiries'
import { readAdminSession } from '@/api/admin'
import { bindToast } from '@/utils/adminActions'
import { hoursSince } from '@/utils/timer'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | ChatStatus

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'deal_agreed', label: 'Deal Agreed' },
  { key: 'lost', label: 'Lost' },
  { key: 'inactive', label: 'Inactive' },
]

const QUICK_REPLIES = [
  'We can offer ₹X — please share your best number.',
  "Let's schedule a visit this week.",
  'Our best price is ₹X for this unit.',
  'Are you still interested in this property?',
]

const FOLLOW_UP_TEMPLATE =
  'Hi, just checking if you are still interested in this property. Happy to help!'

function isThreadInactive(thread: ChatThread) {
  return (
    hoursSince(thread.lastMessageAt) / 24 > 7 &&
    thread.status !== 'deal_agreed' &&
    thread.status !== 'lost'
  )
}

function inactiveDays(thread: ChatThread) {
  return Math.floor(hoursSince(thread.lastMessageAt) / 24)
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function phoneForTel(phone: string) {
  return phone.replace(/\D/g, '')
}

function StatusBadge({ status }: { status: ChatStatus }) {
  const styles: Record<ChatStatus, string> = {
    active: 'bg-blue-100 text-blue-700',
    deal_agreed: 'bg-green-100 text-green-700',
    lost: 'bg-red-100 text-red-700',
    inactive: 'bg-muted text-muted-foreground',
  }
  return (
    <Badge variant="default" className={styles[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

function OfferStatusBadge({ status }: { status?: OfferStatus }) {
  if (!status) return null
  const styles: Record<OfferStatus, string> = {
    pending: 'bg-amber-100 text-amber-800',
    accepted: 'bg-green-100 text-green-800',
    countered: 'bg-blue-100 text-blue-800',
    declined: 'bg-red-100 text-red-800',
  }
  const labels: Record<OfferStatus, string> = {
    pending: 'Pending',
    accepted: 'Accepted',
    countered: 'Countered',
    declined: 'Declined',
  }
  return (
    <Badge variant="default" className={cn('text-[10px]', styles[status])}>
      {labels[status]}
    </Badge>
  )
}

function groupMessagesByDay(messages: ChatMessage[]) {
  const groups: { label: string; messages: ChatMessage[] }[] = []
  let currentLabel = ''
  for (const msg of messages) {
    const label = formatMessageTime(msg.timestamp)
    if (label !== currentLabel) {
      currentLabel = label
      groups.push({ label, messages: [msg] })
    } else {
      groups[groups.length - 1].messages.push(msg)
    }
  }
  return groups
}

export function ChatPage() {
  const navigate = useNavigate()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [chats, setChats] = useState<ChatThread[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [trackerOpen, setTrackerOpen] = useState(true)
  const [messageText, setMessageText] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [showDealModal, setShowDealModal] = useState(false)
  const [showOfferForm, setShowOfferForm] = useState(false)
  const [finalPrice, setFinalPrice] = useState('')
  const [offerAmount, setOfferAmount] = useState('')
  const [offerNote, setOfferNote] = useState('')
  const [deadlineInput, setDeadlineInput] = useState('')

  const toastApi = useMemo(() => bindToast(setToast), [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const loadChats = useCallback(async () => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setLoadError('Your admin session has expired. Please log in again.')
      setChats([])
      setSelectedId(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)
    try {
      const result = await listAdminChatThreads(session.accessToken)
      const sorted = [...result.data].sort(
        (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
      )
      setChats(sorted)
      setSelectedId(sorted[0]?.id ?? null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load chat threads.')
      setChats([])
      setSelectedId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadChats()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadChats])

  const selected = useMemo(
    () => chats.find((c) => c.id === selectedId) ?? null,
    [chats, selectedId],
  )

  const totalUnread = useMemo(() => getTotalUnread(chats), [chats])

  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase()
    return chats
      .filter((c) => {
        const matchesStatus = statusFilter === 'all' || c.status === statusFilter
        const matchesSearch =
          !q ||
          c.buyerName.toLowerCase().includes(q) ||
          c.propertyTitle.toLowerCase().includes(q)
        return matchesStatus && matchesSearch
      })
      .sort(
        (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
      )
  }, [chats, search, statusFilter])

  const updateChat = useCallback((id: string, patch: Partial<ChatThread>) => {
    setChats((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      return [...next].sort(
        (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
      )
    })
  }, [])

  const selectThread = (id: string) => {
    setSelectedId(id)
    updateChat(id, { unreadCount: 0 })
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selected?.messages.length, selectedId])

  const sendTextMessage = async () => {
    if (!selected || !messageText.trim()) return
    if (selected.status === 'deal_agreed' || selected.status === 'lost') return
    const session = readAdminSession()
    if (!session?.accessToken) {
      toastApi.error('Your admin session has expired. Please log in again.')
      return
    }
    try {
      const updated = await sendAdminChatMessage(session.accessToken, selected.id, {
        text: messageText.trim(),
        type: 'text',
      })
      updateChat(selected.id, updated)
      setMessageText('')
    } catch (error) {
      toastApi.error(error instanceof Error ? error.message : 'Unable to send message')
    }
  }

  const sendOffer = async () => {
    if (!selected || !offerAmount) return
    const amount = parseInt(offerAmount.replace(/\D/g, ''), 10)
    if (!amount) return
    const session = readAdminSession()
    if (!session?.accessToken) {
      toastApi.error('Your admin session has expired. Please log in again.')
      return
    }
    try {
      const updated = await sendAdminChatMessage(session.accessToken, selected.id, {
        text: offerNote || `Counter offer: ${formatINR(amount)}`,
        type: 'offer',
        offerAmount: amount,
      })
      updateChat(selected.id, updated)
      setShowOfferForm(false)
      setOfferAmount('')
      setOfferNote('')
    } catch (error) {
      toastApi.error(error instanceof Error ? error.message : 'Unable to send offer')
    }
  }

  const acceptOffer = (msgId: string, amount: number) => {
    if (!selected) return
    const now = new Date().toISOString()
    const updatedMessages = selected.messages.map((m) =>
      m.id === msgId ? { ...m, offerStatus: 'accepted' as const } : m,
    )
    updateChat(selected.id, {
      messages: updatedMessages,
      lastMessage: `Offer accepted: ${formatINRShort(amount)}`,
      lastMessageAt: now,
      negotiation: {
        ...selected.negotiation,
        agreedPrice: amount,
        buyerOffer: amount,
      },
    })
    toastApi.success(`Offer accepted at ${formatINR(amount)}`)
  }

  const startCounterOffer = (amount: number) => {
    setOfferAmount(String(Math.round(amount * 0.97)))
    setOfferNote('')
    setShowOfferForm(true)
  }

  const confirmDeal = () => {
    if (!selected) return
    const price = parseInt(finalPrice.replace(/\D/g, ''), 10) || selected.negotiation.counterOffer || selected.negotiation.listedPrice
    const msg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'admin',
      text: `Deal agreed at ${formatINR(price)}`,
      timestamp: new Date().toISOString(),
      type: 'deal_agreed',
      offerAmount: price,
    }
    updateChat(selected.id, {
      status: 'deal_agreed',
      messages: [...selected.messages, msg],
      lastMessage: msg.text,
      lastMessageAt: msg.timestamp,
      negotiation: {
        ...selected.negotiation,
        agreedPrice: price,
      },
    })
    setShowDealModal(false)
    navigate('/admin/sales/token')
  }

  const markLost = () => {
    if (!selected || !window.confirm('Mark this negotiation as failed?')) return
    updateChat(selected.id, { status: 'lost', lastMessage: 'Negotiation closed' })
  }

  const setDeadline = () => {
    if (!selected || !deadlineInput) return
    updateChat(selected.id, {
      negotiation: {
        ...selected.negotiation,
        deadline: new Date(deadlineInput).toISOString(),
      },
    })
    setDeadlineInput('')
  }

  const inputDisabled = selected?.status === 'deal_agreed' || selected?.status === 'lost'
  const discountWarn =
    selected &&
    selected.negotiation.discountPercent !== null &&
    selected.negotiation.discountPercent > 10

  const messageGroups = selected ? groupMessagesByDay(selected.messages) : []

  const selectedInactive = selected ? isThreadInactive(selected) : false
  const selectedInactiveDays = selected ? inactiveDays(selected) : 0

  return (
    <div className="-mx-4 flex flex-col md:-mx-6" style={{ height: 'calc(100svh - var(--header-height) - 44px - 3rem)' }}>
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* Page header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Chat</h2>
          <Badge variant="default" className="bg-muted text-muted-foreground">
            {chats.length} threads
          </Badge>
          {totalUnread > 0 && (
            <Badge variant="new">{totalUnread} unread</Badge>
          )}
        </div>
        <div className="relative w-full max-w-xs sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search threads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-input pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left panel */}
        <aside className="flex w-[320px] shrink-0 flex-col border-r border-border bg-card">
          <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  'shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  statusFilter === f.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            )}

            {!loading && loadError && (
              <div className="flex flex-col items-center px-4 py-16 text-center">
                <AlertTriangle className="mb-3 size-12 text-destructive/70" />
                <p className="text-sm font-medium">Could not load chats</p>
                <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
                <Button className="mt-4" size="sm" onClick={() => void loadChats()}>
                  Retry
                </Button>
              </div>
            )}

            {!loading && !loadError && filteredThreads.length === 0 && (
              <div className="flex flex-col items-center px-4 py-16 text-center">
                <MessageSquare className="mb-3 size-12 text-muted-foreground/40" />
                <p className="text-sm font-medium">No chats yet</p>
              </div>
            )}

            {!loading &&
              !loadError &&
              filteredThreads.map((thread) => {
                const isActive = thread.id === selectedId
                const longNeg = isLongNegotiation(thread.negotiationStartedAt)
                const inactive = isThreadInactive(thread)
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => selectThread(thread.id)}
                    className={cn(
                      'flex w-full gap-3 border-b border-border px-3 py-3 text-left transition-colors',
                      isActive && 'border-l-4 border-l-primary bg-sidebar-accent',
                      !isActive && thread.unreadCount > 0 && 'bg-blue-50/50',
                      !isActive && 'hover:bg-sidebar-accent/50',
                    )}
                  >
                    <div
                      className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-bold text-white',
                        thread.buyerInactive && 'opacity-50 grayscale',
                      )}
                    >
                      {getInitials(thread.buyerName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1">
                        <p
                          className={cn(
                            'truncate text-sm',
                            thread.unreadCount > 0 ? 'font-bold' : 'font-medium',
                          )}
                        >
                          {thread.buyerName}
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatThreadTime(thread.lastMessageAt)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{thread.propertyTitle}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {thread.lastMessage.slice(0, 40)}
                        {thread.lastMessage.length > 40 ? '…' : ''}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {inactive && (
                          <Badge
                            variant="default"
                            className="bg-orange-100 text-[10px] text-orange-800"
                          >
                            Inactive 7d+
                          </Badge>
                        )}
                        {thread.status === 'deal_agreed' && (
                          <span className="size-2 rounded-full bg-green-500" title="Deal agreed" />
                        )}
                        {thread.status === 'lost' && (
                          <span className="size-2 rounded-full bg-red-500" title="Lost" />
                        )}
                        {longNeg && thread.status === 'active' && (
                          <span className="text-[10px] text-orange-600">Long negotiation</span>
                        )}
                      </div>
                    </div>
                    {thread.unreadCount > 0 && (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                        {thread.unreadCount}
                      </span>
                    )}
                  </button>
                )
              })}
          </div>
        </aside>

        {/* Right panel */}
        <section className="flex min-w-0 flex-1 flex-col bg-background">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <MessageSquare className="mb-4 size-16 text-muted-foreground/30" />
              <p className="text-muted-foreground">Select a conversation</p>
            </div>
          ) : (
            <>
              {/* Conversation header */}
              <div className="shrink-0 border-b border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-bold text-white">
                      {getInitials(selected.buyerName)}
                    </div>
                    <div>
                      <p className="font-semibold">{selected.buyerName}</p>
                      <p className="text-sm text-muted-foreground">
                        {selected.propertyTitle} · {selected.propertyPrice}
                      </p>
                    </div>
                    <StatusBadge status={selected.status} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`tel:${phoneForTel(selected.buyerPhone)}`)}
                    >
                      <Phone className="size-4" /> Call
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/users/${selected.buyerUserId}`)}
                    >
                      <User className="size-4" /> View Profile
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/properties/${selected.propertyId}`)}
                    >
                      <Home className="size-4" /> View Property
                    </Button>
                  </div>
                </div>
                {selectedInactive && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-orange-200 bg-orange-50 px-4 py-2 text-sm text-orange-900">
                    <span>
                      ⚠️ No activity for {selectedInactiveDays} day
                      {selectedInactiveDays === 1 ? '' : 's'}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-orange-300"
                      onClick={() => setMessageText(FOLLOW_UP_TEMPLATE)}
                    >
                      Send Follow-up
                    </Button>
                  </div>
                )}
              </div>

              {/* Negotiation tracker */}
              {selected.status !== 'deal_agreed' && selected.status !== 'lost' && (
                <div className="shrink-0 border-b border-border bg-card px-4 py-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-sm font-medium"
                    onClick={() => setTrackerOpen((o) => !o)}
                  >
                    Negotiation tracker
                    {trackerOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>
                  {trackerOpen && (
                    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-sm">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-xs text-muted-foreground">Listed</p>
                          <p className="font-semibold">
                            {formatINRShort(selected.negotiation.listedPrice)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Buyer</p>
                          <p className="font-semibold text-primary">
                            {selected.negotiation.buyerOffer
                              ? formatINRShort(selected.negotiation.buyerOffer)
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Counter</p>
                          <p className="font-semibold">
                            {selected.negotiation.counterOffer
                              ? formatINRShort(selected.negotiation.counterOffer)
                              : '—'}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-muted-foreground">Negotiation in progress</p>
                      <p
                        className={cn(
                          'text-xs',
                          isDeadlineSoon(selected.negotiation.deadline)
                            ? 'font-medium text-red-700'
                            : 'text-muted-foreground',
                        )}
                      >
                        Deadline:{' '}
                        {new Date(selected.negotiation.deadline).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                      {discountWarn && (
                        <p className="mt-2 flex items-center gap-1 text-xs text-orange-800">
                          <AlertTriangle className="size-3" />
                          Large discount — confirm with management (
                          {selected.negotiation.discountPercent}%)
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => {
                            setFinalPrice(
                              String(
                                selected.negotiation.counterOffer ??
                                  selected.negotiation.buyerOffer ??
                                  selected.negotiation.listedPrice,
                              ),
                            )
                            setShowDealModal(true)
                          }}
                        >
                          Deal Agreed
                        </Button>
                        <Button variant="outline" size="sm" className="border-red-300 text-red-700" onClick={markLost}>
                          Negotiation Failed
                        </Button>
                        <input
                          type="date"
                          value={deadlineInput}
                          onChange={(e) => setDeadlineInput(e.target.value)}
                          className="h-8 rounded-md border border-border bg-card px-2 text-xs"
                        />
                        <Button variant="outline" size="sm" onClick={setDeadline}>
                          Set Deadline
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selected.status === 'deal_agreed' && (
                <div className="shrink-0 border-b border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
                  Deal closed — moved to Sales Pipeline
                </div>
              )}
              {selected.status === 'lost' && (
                <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
                  Negotiation closed
                </div>
              )}

              {/* Messages */}
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
                {selected.messages.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center">
                    <MessageSquare className="mb-2 size-10 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No messages yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messageGroups.map((group) => (
                      <div key={group.label}>
                        <p className="mb-3 text-center text-xs text-muted-foreground">{group.label}</p>
                        <div className="space-y-3">
                          {group.messages.map((msg) => {
                            if (msg.type === 'offer') {
                              const isBuyerOffer = msg.sender === 'buyer'
                              const canActOnOffer =
                                isBuyerOffer &&
                                msg.offerStatus === 'pending' &&
                                selected.status !== 'deal_agreed' &&
                                selected.status !== 'lost'
                              return (
                                <div key={msg.id} className="mx-auto max-w-sm">
                                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-xs font-medium text-blue-700">
                                          💰 {isBuyerOffer ? 'Buyer Offer' : 'Your Offer'}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                          {msg.propertyTitle ?? selected.propertyTitle}
                                        </p>
                                        <p className="mt-1 text-xl font-bold text-blue-900">
                                          {formatINR(msg.offerAmount ?? 0)}
                                        </p>
                                      </div>
                                      <OfferStatusBadge status={msg.offerStatus} />
                                    </div>
                                    {msg.offerMessage && (
                                      <p className="mt-2 text-sm text-blue-800">{msg.offerMessage}</p>
                                    )}
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      {isBuyerOffer ? selected.buyerName : 'You'} ·{' '}
                                      {new Date(msg.timestamp).toLocaleTimeString('en-IN', {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })}
                                    </p>
                                    {canActOnOffer && (
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <Button
                                          size="sm"
                                          className="bg-green-600 hover:bg-green-700"
                                          onClick={() =>
                                            acceptOffer(msg.id, msg.offerAmount ?? 0)
                                          }
                                        >
                                          Accept
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() =>
                                            startCounterOffer(msg.offerAmount ?? 0)
                                          }
                                        >
                                          Counter
                                        </Button>
                                      </div>
                                    )}
                                    {msg.offerStatus === 'accepted' && (
                                      <Button
                                        size="sm"
                                        className="mt-3 w-full bg-green-600 hover:bg-green-700"
                                        onClick={() => {
                                          setFinalPrice(String(msg.offerAmount ?? 0))
                                          setShowDealModal(true)
                                        }}
                                      >
                                        Move to Deal
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )
                            }
                            if (msg.type === 'deal_agreed') {
                              return (
                                <div
                                  key={msg.id}
                                  className="rounded-lg border border-green-200 bg-green-50 p-4 text-center text-green-900"
                                >
                                  <p className="font-semibold">
                                    🎉 Deal agreed at {formatINR(msg.offerAmount ?? 0)}
                                  </p>
                                  <p className="mt-1 text-xs">
                                    {new Date(msg.timestamp).toLocaleDateString('en-IN')}
                                  </p>
                                </div>
                              )
                            }
                            const isAdmin = msg.sender === 'admin'
                            return (
                              <div
                                key={msg.id}
                                className={cn('flex', isAdmin ? 'justify-end' : 'justify-start')}
                              >
                                <div className={cn('max-w-[75%]', isAdmin ? 'text-right' : '')}>
                                  {!isAdmin && (
                                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                                      {selected.buyerName}
                                    </p>
                                  )}
                                  {isAdmin && (
                                    <p className="mb-1 text-xs font-medium text-muted-foreground">You</p>
                                  )}
                                  <div
                                    className={cn(
                                      'inline-block rounded-2xl px-4 py-2 text-sm',
                                      isAdmin
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-muted text-foreground',
                                    )}
                                  >
                                    {msg.text}
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {new Date(msg.timestamp).toLocaleTimeString('en-IN', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                    })}
                                  </p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input area */}
              <div className="shrink-0 border-t border-border bg-card">
                {!inputDisabled && (
                  <>
                    <div className="flex gap-2 overflow-x-auto px-4 py-2">
                      {QUICK_REPLIES.map((tpl) => (
                        <button
                          key={tpl}
                          type="button"
                          onClick={() => setMessageText(tpl)}
                          className="shrink-0 rounded-full border border-border bg-muted px-3 py-1 text-xs hover:bg-sidebar-accent"
                        >
                          {tpl.length > 32 ? `${tpl.slice(0, 32)}…` : tpl}
                        </button>
                      ))}
                    </div>
                    {showOfferForm && (
                      <div className="border-b border-border bg-muted/30 px-4 py-3">
                        <p className="mb-2 text-sm font-medium">Send counter offer</p>
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-[140px] flex-1">
                            <label className="text-xs text-muted-foreground">Amount (₹)</label>
                            <input
                              type="text"
                              placeholder="e.g. 4350000"
                              value={offerAmount}
                              onChange={(e) => setOfferAmount(e.target.value)}
                              className="mt-1 h-8 w-full rounded-md border border-border bg-input px-3 text-sm"
                            />
                          </div>
                          <div className="min-w-[180px] flex-[2]">
                            <label className="text-xs text-muted-foreground">Note (optional)</label>
                            <input
                              type="text"
                              placeholder="Message with offer"
                              value={offerNote}
                              onChange={(e) => setOfferNote(e.target.value)}
                              className="mt-1 h-8 w-full rounded-md border border-border bg-input px-3 text-sm"
                            />
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowOfferForm(false)
                              setOfferAmount('')
                              setOfferNote('')
                            }}
                          >
                            Cancel
                          </Button>
                          <Button size="sm" disabled={!offerAmount} onClick={() => void sendOffer()}>
                            Send Offer
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="flex items-end gap-2 px-4 pb-4 pt-2">
                      <textarea
                        rows={2}
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        placeholder="Type a message..."
                        className="min-h-[48px] flex-1 resize-none rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            void sendTextMessage()
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setShowOfferForm((o) => !o)}
                      >
                        💰 Send Offer
                      </Button>
                      <Button size="sm" disabled={!messageText.trim()} onClick={() => void sendTextMessage()}>
                        Send
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Deal agreed modal */}
      {showDealModal && selected && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/50"
            aria-label="Close"
            onClick={() => setShowDealModal(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="font-semibold">Confirm deal agreed</h3>
            <label className="mt-3 block text-sm text-muted-foreground">Final price (₹)</label>
            <input
              type="text"
              value={finalPrice}
              onChange={(e) => setFinalPrice(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowDealModal(false)}>
                Cancel
              </Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={confirmDeal}>
                Confirm
              </Button>
            </div>
          </div>
        </>
      )}

    </div>
  )
}
