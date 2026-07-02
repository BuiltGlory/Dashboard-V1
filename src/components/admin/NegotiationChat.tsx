import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { readAdminSession } from '@/api/admin'
import { createWorkflowLog, listWorkflowLogs, type WorkflowLog } from '@/api/adminWorkflow'
import { formatPrice } from '@/domain/properties'
import { cn } from '@/lib/utils'

export interface NegotiationOffer {
  id: string
  offeredBy: 'admin' | 'seller' | 'buyer'
  offerType: 'initial' | 'counter' | 'final' | 'accepted' | 'declined'
  amount: number
  message: string
  createdAt: string
  status: 'pending' | 'accepted' | 'declined' | 'superseded'
}

export interface NegotiationChatProps {
  entityType: 'sell_request' | 'deal' | 'interior'
  entityId: string
  entityTitle: string
  currentPrice: number
  otherPartyName: string
  otherPartyPhone: string
  otherPartyType: 'seller' | 'buyer'
  minimumTargetPrice?: number
  negotiationStartedAt?: string
  onOfferAccepted?: (amount: number) => void
  onOfferDeclined?: () => void
  onSendOffer?: (offer: NegotiationOffer) => void
  toast?: (msg: string) => void
}

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function partyLabel(type: NegotiationOffer['offeredBy'], name: string) {
  if (type === 'admin') return 'You'
  return name
}

const OFFER_SUMMARY_PREFIX = 'Negotiation offer'
const ACCEPTED_SUMMARY_PREFIX = 'Negotiation accepted'
const DECLINED_SUMMARY = 'Negotiation declined'

function parseOfferLog(log: WorkflowLog): NegotiationOffer | null {
  if (!log.summary.startsWith(OFFER_SUMMARY_PREFIX)) return null
  try {
    const parsed = JSON.parse(log.body || '{}') as Partial<NegotiationOffer>
    if (!parsed.amount || !parsed.offeredBy) return null
    return {
      id: parsed.id || log.id,
      offeredBy: parsed.offeredBy,
      offerType: parsed.offerType || 'initial',
      amount: Number(parsed.amount),
      message: parsed.message || '',
      createdAt: parsed.createdAt || log.occurredAt,
      status: parsed.status || 'pending',
    }
  } catch {
    return null
  }
}

function hydrateNegotiationState(logs: WorkflowLog[]) {
  const offers = logs.map(parseOfferLog).filter((offer): offer is NegotiationOffer => Boolean(offer))
  const acceptedLog = logs.find((log) => log.summary.startsWith(ACCEPTED_SUMMARY_PREFIX))
  const declined = logs.some((log) => log.summary === DECLINED_SUMMARY)
  if (!acceptedLog) return { offers, agreedAmount: null as number | null, agreedAt: null as string | null, declined }

  const acceptedId = acceptedLog.summary.slice(ACCEPTED_SUMMARY_PREFIX.length).replace(/^:\s*/, '')
  const acceptedAmount = Number(acceptedLog.outcome)
  return {
    offers: offers.map((offer) =>
      offer.id === acceptedId
        ? { ...offer, status: 'accepted' as const, offerType: 'accepted' as const }
        : { ...offer, status: offer.status === 'pending' ? ('declined' as const) : offer.status },
    ),
    agreedAmount: Number.isFinite(acceptedAmount) ? acceptedAmount : null,
    agreedAt: acceptedLog.occurredAt,
    declined,
  }
}

export function NegotiationChat({
  entityType,
  entityId,
  entityTitle,
  currentPrice,
  otherPartyName,
  otherPartyPhone,
  otherPartyType,
  minimumTargetPrice,
  negotiationStartedAt,
  onOfferAccepted,
  onOfferDeclined,
  onSendOffer,
  toast,
}: NegotiationChatProps) {
  const party = otherPartyType === 'seller' ? 'seller' : 'buyer'

  const [offers, setOffers] = useState<NegotiationOffer[]>([])
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [agreedAmount, setAgreedAmount] = useState<number | null>(null)
  const [agreedAt, setAgreedAt] = useState<string | null>(null)
  const [declined, setDeclined] = useState(false)
  const [acceptWarning, setAcceptWarning] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const session = readAdminSession()
    if (!session?.accessToken || !entityId) {
      setOffers([])
      setAgreedAmount(null)
      setAgreedAt(null)
      setDeclined(false)
      return
    }
    let cancelled = false
    void listWorkflowLogs(session.accessToken, entityType, entityId, 'message')
      .then((result) => {
        if (cancelled) return
        const hydrated = hydrateNegotiationState(result.data)
        setOffers(hydrated.offers)
        setAgreedAmount(hydrated.agreedAmount)
        setAgreedAt(hydrated.agreedAt)
        setDeclined(hydrated.declined)
      })
      .catch((error) => {
        if (!cancelled) toast?.(error instanceof Error ? error.message : 'Could not load negotiation history')
      })
    return () => {
      cancelled = true
    }
  }, [entityId, entityType, toast])

  const persistNegotiationLog = async (summary: string, body: string, outcome?: string | null) => {
    const session = readAdminSession()
    if (!session?.accessToken) throw new Error('Admin session expired. Please sign in again.')
    return createWorkflowLog(session.accessToken, entityType, entityId, {
      channel: 'message',
      direction: 'outbound',
      summary,
      body,
      outcome,
    })
  }

  const sorted = useMemo(
    () => [...offers].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [offers],
  )

  const pendingPartyOffers = offers.filter(
    (o) => o.offeredBy === party && o.status === 'pending',
  )
  const pendingPartyOffer = pendingPartyOffers[0]
  const simultaneousPending =
    pendingPartyOffers.length >= 2 &&
    Math.abs(
      new Date(pendingPartyOffers[0].createdAt).getTime() -
        new Date(pendingPartyOffers[1].createdAt).getTime(),
    ) < 120000

  const lastOffer = sorted[0]
  const prefillAmount = lastOffer
    ? Math.round(lastOffer.amount * (otherPartyType === 'seller' ? 0.95 : 1.02))
    : Math.round(currentPrice * 0.97)

  const negotiationDays = negotiationStartedAt
    ? Math.floor(
        (Date.now() - new Date(negotiationStartedAt).getTime()) / 86400000,
      )
    : 4

  const lastPartyOfferAt = offers
    .filter((o) => o.offeredBy === party)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    ?.createdAt
  const sellerGhostHours = lastPartyOfferAt
    ? (Date.now() - new Date(lastPartyOfferAt).getTime()) / 3600000
    : 50

  const statusLabel = agreedAmount
    ? 'Agreed'
    : declined
      ? 'Declined'
      : 'Ongoing'

  const sendOffer = async () => {
    if (agreedAmount || declined || saving) return
    const num = Number(amount.replace(/,/g, ''))
    if (!Number.isFinite(num) || num <= 0) return
    const offerType: NegotiationOffer['offerType'] =
      offers.length === 0 ? 'initial' : 'counter'
    const offer: NegotiationOffer = {
      id: `offer-${Date.now()}`,
      offeredBy: 'admin',
      offerType,
      amount: num,
      message: message.trim(),
      createdAt: new Date().toISOString(),
      status: 'pending',
    }
    setSaving(true)
    try {
      await persistNegotiationLog(
        `${OFFER_SUMMARY_PREFIX}: ${formatPrice(num)}`,
        JSON.stringify(offer),
        String(num),
      )
      setOffers((prev) =>
        prev.map((o) =>
          o.offeredBy === 'admin' && o.status === 'pending'
            ? { ...o, status: 'superseded' as const }
            : o,
        ).concat(offer),
      )
      setAmount('')
      setMessage('')
      onSendOffer?.(offer)
      toast?.(`Offer sent to ${otherPartyName}`)
    } catch (error) {
      toast?.(error instanceof Error ? error.message : 'Could not save offer')
    } finally {
      setSaving(false)
    }
  }

  const acceptOffer = async (offer: NegotiationOffer, force = false) => {
    const min = minimumTargetPrice ?? currentPrice * 0.85
    if (!force && offer.amount < min) {
      const pct = (((min - offer.amount) / currentPrice) * 100).toFixed(1)
      setAcceptWarning(offer.amount)
      toast?.(`This is ${pct}% below our minimum target price`)
      return
    }
    if (
      !window.confirm(
        `Accept offer of ${formatPrice(offer.amount)} from ${otherPartyName}?`,
      )
    ) {
      return
    }
    setSaving(true)
    try {
      const occurredAt = new Date().toISOString()
      await persistNegotiationLog(
        `${ACCEPTED_SUMMARY_PREFIX}: ${offer.id}`,
        JSON.stringify({ offerId: offer.id, amount: offer.amount, acceptedAt: occurredAt }),
        String(offer.amount),
      )
      setOffers((prev) =>
        prev.map((o) =>
          o.id === offer.id
            ? { ...o, status: 'accepted' as const, offerType: 'accepted' as const }
            : { ...o, status: o.status === 'pending' ? ('declined' as const) : o.status },
        ),
      )
      setAgreedAmount(offer.amount)
      setAgreedAt(occurredAt)
      setAcceptWarning(null)
      onOfferAccepted?.(offer.amount)
      toast?.(`Offer accepted! ${formatPrice(offer.amount)} agreed`)
    } catch (error) {
      toast?.(error instanceof Error ? error.message : 'Could not accept offer')
    } finally {
      setSaving(false)
    }
  }

  const declineNegotiation = async () => {
    if (saving || !window.confirm(`End negotiation with ${otherPartyName}?`)) return
    setSaving(true)
    try {
      await persistNegotiationLog(
        DECLINED_SUMMARY,
        JSON.stringify({ declinedAt: new Date().toISOString() }),
      )
      setDeclined(true)
      setOffers((prev) =>
        prev.map((o) =>
          o.status === 'pending' ? { ...o, status: 'declined' as const } : o,
        ),
      )
      onOfferDeclined?.()
      toast?.('Negotiation ended')
    } catch (error) {
      toast?.(error instanceof Error ? error.message : 'Could not end negotiation')
    } finally {
      setSaving(false)
    }
  }

  const pickSimultaneousOffer = (offerId: string) => {
    setOffers((prev) =>
      prev.map((o) =>
        o.id === offerId
          ? o
          : o.offeredBy === party && o.status === 'pending'
            ? { ...o, status: 'declined' as const }
            : o,
      ),
    )
    toast?.('Selected offer — other pending offer declined')
  }

  const quickPct = (pct: number) => {
    setAmount(String(Math.round(currentPrice * (1 - pct / 100))))
  }

  const screenLabel =
    entityType === 'sell_request'
      ? 'SL-12'
      : entityType === 'deal'
        ? 'SL-12'
        : 'INT-05'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Price Negotiation</CardTitle>
        <p className="text-xs text-muted-foreground">📱 App screen: {screenLabel}</p>
        <p className="text-sm">
          Current asking price:{' '}
          <span className="font-semibold text-primary">{formatPrice(currentPrice)}</span>
        </p>
        <Badge
          className={cn(
            'w-fit',
            statusLabel === 'Agreed' && 'bg-green-100 text-green-800',
            statusLabel === 'Declined' && 'bg-red-100 text-red-800',
            statusLabel === 'Ongoing' && 'bg-blue-100 text-blue-800',
          )}
        >
          {statusLabel}
        </Badge>
        <p className="text-xs text-muted-foreground truncate">{entityTitle}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {agreedAmount != null && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
            <p className="font-semibold">✅ Deal agreed at {formatPrice(agreedAmount)}</p>
            {agreedAt && (
              <p className="mt-1 text-xs">
                Agreed on{' '}
                {new Date(agreedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
              </p>
            )}
          </div>
        )}

        {!agreedAmount && !declined && negotiationDays >= 7 && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
            <p>
              Negotiation stalled for {negotiationDays} days. Consider closing.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 border-orange-300"
              onClick={() => toast?.('Escalated to senior admin')}
            >
              Escalate
            </Button>
          </div>
        )}

        {!agreedAmount && !declined && sellerGhostHours >= 48 && otherPartyType === 'seller' && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
            <p>No seller response in 48 hours</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => {
                window.open(
                  `https://wa.me/${otherPartyPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${otherPartyName}, following up on our price discussion for ${entityTitle}.`)}`,
                  '_blank',
                )
                toast?.('Reminder sent via WhatsApp')
              }}
            >
              Send reminder
            </Button>
          </div>
        )}

        {simultaneousPending && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-medium">Simultaneous offers — resolve manually</p>
            <div className="mt-2 space-y-2">
              {pendingPartyOffers.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-2 rounded border border-amber-200 bg-white/80 px-2 py-1"
                >
                  <span>{formatPrice(o.amount)}</span>
                  <Button type="button" size="sm" onClick={() => pickSimultaneousOffer(o.id)}>
                    Pick this
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!agreedAmount && !declined && (
          <>
            <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-border p-2">
              {sorted.map((offer) => {
                const isAdmin = offer.offeredBy === 'admin'
                return (
                  <div
                    key={offer.id}
                    className={cn(
                      'max-w-[90%] rounded-lg px-3 py-2 text-sm',
                      isAdmin
                        ? 'ml-auto bg-blue-100 text-blue-900'
                        : 'mr-auto bg-muted text-foreground',
                    )}
                  >
                    <p className="font-medium">
                      {isAdmin
                        ? `You offered ${formatPrice(offer.amount)}`
                        : `${partyLabel(offer.offeredBy, otherPartyName)} offered ${formatPrice(offer.amount)}`}
                    </p>
                    {!isAdmin &&
                      (offer.offeredBy === 'seller' || offer.offeredBy === 'buyer') &&
                      offer.amount > currentPrice && (
                        <p className="mt-1 text-xs font-medium text-amber-800">
                          Counter higher than asking price
                        </p>
                      )}
                    {offer.message && (
                      <p className="mt-1 text-xs opacity-90">{offer.message}</p>
                    )}
                    <p className="mt-1 text-[10px] opacity-70">{formatTimeAgo(offer.createdAt)}</p>
                    <p className="text-[10px] capitalize opacity-70">{offer.status}</p>
                    {!isAdmin && offer.status === 'pending' && !simultaneousPending && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 bg-green-600 text-xs hover:bg-green-700"
                          disabled={saving}
                          onClick={() => void acceptOffer(offer)}
                        >
                          Accept
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            setAmount(String(Math.round(offer.amount * 0.97)))
                            toast?.('Enter counter amount and send')
                          }}
                        >
                          Counter
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 border-red-200 text-xs text-red-700"
                          onClick={() =>
                            setOffers((prev) =>
                              prev.map((o) =>
                                o.id === offer.id ? { ...o, status: 'declined' as const } : o,
                              ),
                            )
                          }
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {pendingPartyOffer && !simultaneousPending && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-sm font-medium text-green-900">
                  {otherPartyName} offered {formatPrice(pendingPartyOffer.amount)}
                </p>
                {acceptWarning === pendingPartyOffer.amount && minimumTargetPrice && (
                  <div className="mt-2 flex items-start gap-2 text-xs text-orange-800">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>
                      Below minimum target ({formatPrice(minimumTargetPrice)}).{' '}
                      <button
                        type="button"
                        className="font-medium underline"
                        onClick={() => void acceptOffer(pendingPartyOffer, true)}
                      >
                        Accept anyway
                      </button>
                    </span>
                  </div>
                )}
                <Button
                  type="button"
                  className="mt-3 w-full bg-green-600 hover:bg-green-700"
                  disabled={saving}
                  onClick={() => void acceptOffer(pendingPartyOffer)}
                >
                  ✅ Accept This Offer
                </Button>
              </div>
            )}

            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-sm font-medium">Make offer</p>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={String(prefillAmount)}
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              <div className="flex gap-2">
                {([5, 10, 15] as const).map((pct) => (
                  <Button
                    key={pct}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => quickPct(pct)}
                  >
                    -{pct}%
                  </Button>
                ))}
              </div>
              <textarea
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add note to your offer..."
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
              <Button type="button" className="w-full" disabled={saving} onClick={() => void sendOffer()}>
                {saving ? 'Saving…' : 'Send Offer'}
              </Button>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full border-red-200 text-red-700"
              disabled={saving}
              onClick={() => void declineNegotiation()}
            >
              ❌ Decline & End Negotiation
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function parseNegotiationPrice(price: string | number): number {
  if (typeof price === 'number') return price
  const n = parseInt(price.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}
