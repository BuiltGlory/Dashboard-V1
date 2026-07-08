import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  Building2,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Cross,
  GraduationCap,
  MapPin,
  Navigation,
  Plane,
  Road,
  Share2,
  ShoppingBag,
  FileText,
  Play,
  Star,
  Train,
  Heart,
  TrendingUp,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatPrice,
  getPropertyTypeLabel,
  getSourceLabel,
  getStatusBadgeColor,
  type NearbyPlaceType,
  type Property,
  type PropertyStatus,
} from '@/domain/properties'
import { readAdminSession } from '@/api/admin'
import {
  getAdminProperty,
  updateAdminProperty,
  updateAdminPropertyStatus,
} from '@/api/adminProperties'
import NotificationPreview from '@/components/NotificationPreview'
import { cn } from '@/lib/utils'
import {
  claimConcurrentEditing,
  getConcurrentEditingWarning,
  releaseConcurrentEditing,
} from '@/utils/edgeCases'
import { NOTIFICATION_TEMPLATES, sendPushNotification } from '@/utils/notifications'
import { getCustomerPropertyUrl } from '@/lib/customerApp'

function isImageUrl(url: string) {
  return /\.(jpe?g|png|gif|webp|svg)(\?.*)?$/i.test(url)
}

const STATUSES: PropertyStatus[] = [
  'available',
  'reserved',
  'sold',
  'under_construction',
  'draft',
]

function getStatusLabel(status: PropertyStatus) {
  const labels: Record<PropertyStatus, string> = {
    available: 'Available',
    reserved: 'Reserved',
    sold: 'Sold',
    under_construction: 'Under Construction',
    draft: 'Draft',
  }
  return labels[status]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatLaunchDate(iso: string | null) {
  if (!iso) return 'Not specified'
  return formatDate(iso)
}

function daysUntil(iso: string | null) {
  if (!iso) return null
  const diff = new Date(`${iso}T12:00:00`).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function specValue(v: string | number | boolean | undefined | null): string {
  if (v == null || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

function getSpecRows(property: Property): { label: string; value: string }[] {
  const s = property.specs
  const rows: { label: string; value: string }[] = []

  const add = (label: string, value: string | number | boolean | undefined | null) => {
    if (value != null && value !== '') rows.push({ label, value: specValue(value) })
  }

  switch (property.type) {
    case 'apartment':
    case 'nri':
      add('BHK', s.bhk)
      add('Built-up Area', s.builtUpArea ? `${s.builtUpArea} sqft` : null)
      add('Carpet Area', s.carpetArea ? `${s.carpetArea} sqft` : null)
      add('Floor', s.floor)
      add('Total Floors', s.totalFloors)
      add('Facing', s.facing)
      add('Age', s.age)
      add('Furnishing', s.furnishing)
      add('Parking', s.parking)
      add('Builder Name', s.builderName)
      add('RERA', s.reraNumber)
      add('Maintenance/mo', s.maintenancePerMonth ? formatPrice(s.maintenancePerMonth) : null)
      break
    case 'plot':
    case 'land':
      add('Plot Area', s.plotArea ? `${s.plotArea} sqft` : null)
      add('Dimensions', s.plotDimension)
      add('Layout Name', s.layoutName)
      add('Facing', s.facing)
      add('Road Width', s.roadWidth ? `${s.roadWidth} ft` : null)
      add('Approval Type', s.approvalType)
      add('Title Type', s.titleType)
      add('Corner Plot', s.cornerPlot)
      add('RERA', s.reraNumber)
      add('Possession', s.possession ?? property.possessionDate)
      break
    case 'residential':
    case 'farmhouse':
    case 'holiday_home':
    case 'ceo_mansion':
      add('BHK', s.bhk)
      add('Land Area', s.plotArea ? `${s.plotArea} sqft` : null)
      add('Built-up', s.builtUpArea ? `${s.builtUpArea} sqft` : null)
      add('Floors', s.floor)
      add('Facing', s.facing)
      add('Furnishing', s.furnishing)
      add('Parking', s.parking)
      add('Age', s.age)
      add('Vastu', s.vastuCompliant)
      add('Transaction Type', s.transactionType)
      break
    case 'commercial':
      add('Sub-type', s.subType)
      add('Built-up Area', s.builtUpArea ? `${s.builtUpArea} sqft` : null)
      add('Floor', s.floor)
      add('Frontage Width', s.frontageWidth ? `${s.frontageWidth} ft` : null)
      add('Ceiling Height', s.ceilingHeight ? `${s.ceilingHeight} ft` : null)
      add('Power Load', s.powerLoad)
      add('Parking', s.parking)
      add('RERA', s.reraNumber)
      break
    default:
      add('BHK', s.bhk)
      add('Built-up Area', s.builtUpArea ? `${s.builtUpArea} sqft` : null)
      add('Floor', s.floor)
      add('Facing', s.facing)
      add('Furnishing', s.furnishing)
      add('Possession', s.possession ?? property.possessionDate)
  }

  return rows
}

function NearbyIcon({ type }: { type: NearbyPlaceType }) {
  const cls = 'size-4 shrink-0 text-muted-foreground'
  switch (type) {
    case 'metro':
      return <Train className={cls} />
    case 'school':
      return <GraduationCap className={cls} />
    case 'hospital':
      return <Cross className={cls} />
    case 'mall':
      return <ShoppingBag className={cls} />
    case 'it_park':
      return <Building2 className={cls} />
    case 'airport':
      return <Plane className={cls} />
    case 'highway':
      return <Road className={cls} />
    case 'restaurant':
      return <UtensilsCrossed className={cls} />
    default:
      return <MapPin className={cls} />
  }
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-[1100px] animate-pulse space-y-6 px-4 py-6">
      <div className="h-6 w-64 rounded bg-muted" />
      <div className="h-10 w-full rounded bg-muted" />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="h-64 rounded-xl bg-muted" />
          <div className="h-48 rounded-xl bg-muted" />
        </div>
        <div className="h-80 rounded-xl bg-muted" />
      </div>
    </div>
  )
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <h4 className="font-semibold">{title}</h4>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

function PropertyBreadcrumb({ property }: { property: Property }) {
  const navigate = useNavigate()
  const typeLabel = getPropertyTypeLabel(property.type)

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumb">
      <Button
        variant="ghost"
        size="icon"
        className="mr-1 size-8 shrink-0"
        onClick={() => navigate(-1)}
        aria-label="Back"
      >
        <ChevronLeft className="size-4" />
      </Button>
      {[
        { label: 'Properties', path: '/admin/properties/all' },
        {
          label: typeLabel,
          path: `/admin/properties/all?type=${property.type}`,
        },
        { label: property.title, path: null },
      ].map((item, index) => (
        <span key={item.label} className="flex items-center gap-1">
          {index > 0 && <ChevronRight className="size-4 text-muted-foreground" />}
          {item.path ? (
            <button
              type="button"
              onClick={() => navigate(item.path!)}
              className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </button>
          ) : (
            <span className="max-w-[200px] truncate font-medium text-foreground sm:max-w-none">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [property, setProperty] = useState<Property | null>(null)
  const [mainPhotoIndex, setMainPhotoIndex] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [mediaPreview, setMediaPreview] = useState<{
    name: string
    url: string | null
    statusLabel: string
  } | null>(null)
  const [confirm, setConfirm] = useState<{
    title: string
    message: string
    confirmLabel: string
    onConfirm: () => void
    destructive?: boolean
  } | null>(null)
  const [isVerified, setIsVerified] = useState(false)
  const [priceEditOpen, setPriceEditOpen] = useState(false)
  const [editPriceValue, setEditPriceValue] = useState('')
  const [priceDropNotify, setPriceDropNotify] = useState(true)
  const [upcomingLaunchDate, setUpcomingLaunchDate] = useState('')
  const [showUpcomingModal, setShowUpcomingModal] = useState(false)
  const [propertyEditOpen, setPropertyEditOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editingWarning, setEditingWarning] = useState<string | null>(null)
  const [editingDismissed, setEditingDismissed] = useState(false)

  const savedUsersCount = useMemo(() => {
    if (!property) return 0
    return property.savedCount ?? 0
  }, [property])

  useEffect(() => {
    if (!id || loading) return
    setEditingWarning(getConcurrentEditingWarning('property', id))
    setEditingDismissed(false)
    claimConcurrentEditing('property', id)
    return () => releaseConcurrentEditing('property', id)
  }, [id, loading])

  useEffect(() => {
    setLoading(true)
    const session = readAdminSession()
    if (!id || !session?.accessToken) {
      setProperty(null)
      setLoading(false)
      return
    }
    let cancelled = false
    getAdminProperty(session.accessToken, id)
      .then((found) => {
        if (cancelled) return
        setProperty(found)
        setIsVerified(false)
        setEditPriceValue(String(found.price))
        setEditTitle(found.title)
        setEditDescription(found.description)
        setPropertyEditOpen(false)
        setUpcomingLaunchDate(found.launchDate?.slice(0, 10) ?? '')
        setMainPhotoIndex(0)
      })
      .catch(() => {
        if (!cancelled) setProperty(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const updateProperty = useCallback(async (patch: Partial<Property>): Promise<boolean> => {
    const session = readAdminSession()
    if (!property || !session?.accessToken) {
      showToast('Login required to update property')
      return false
    }
    try {
      let updated = property
      if (patch.status && patch.status !== property.status) {
        updated = await updateAdminPropertyStatus(session.accessToken, property.id, patch.status)
      }
      const hasPatchFields = Object.keys(patch).some((key) => key !== 'status' && key !== 'soldAt')
      if (hasPatchFields) {
        updated = await updateAdminProperty(session.accessToken, property.id, {
          title: patch.title,
          description: patch.description,
          isFeatured: patch.isFeatured,
          isUpcoming: patch.isUpcoming,
          launchDate: patch.launchDate,
          price: patch.price,
          media:
            patch.photos ||
            patch.coverPhoto !== undefined ||
            patch.videoUrl !== undefined ||
            patch.droneImageUrl !== undefined ||
            patch.tour3dUrl !== undefined ||
            patch.floorPlanUrl !== undefined
              ? {
                  photos: patch.photos,
                  coverPhoto: patch.coverPhoto,
                  videoUrl: patch.videoUrl,
                  droneImageUrl: patch.droneImageUrl,
                  tour3dUrl: patch.tour3dUrl,
                  floorPlanUrl: patch.floorPlanUrl,
                }
              : undefined,
        })
      }
      setProperty({
        ...updated,
        ...(patch.soldAt !== undefined ? { soldAt: patch.soldAt } : {}),
      })
      return true
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update property')
      return false
    }
  }, [property, showToast])

  const openEditForm = useCallback(() => {
    if (!property) return
    navigate(`/admin/properties/add?edit=${property.id}`)
  }, [navigate, property])

  const openAppPreview = useCallback(() => {
    if (!property) return
    setShowPreview(true)
  }, [property])

  const openPropertyInCustomerApp = useCallback(() => {
    if (!property) return
    window.open(getCustomerPropertyUrl(property.id), '_blank', 'noopener,noreferrer')
  }, [property])

  const handleStatusChange = useCallback(
    async (next: PropertyStatus) => {
      if (!property || next === property.status) return
      const patch: Partial<Property> = { status: next }
      if (next === 'sold') {
        patch.soldAt = new Date().toISOString()
        patch.isFeatured = false
        patch.isUpcoming = false
      }
      const ok = await updateProperty(patch)
      if (ok) showToast(`Status changed to ${getStatusLabel(next)}`)
    },
    [property, showToast, updateProperty],
  )

  const photos = property?.photos ?? []
  const hasPhotos = photos.length > 0 || !!property?.coverPhoto
  const displayPhotos = useMemo(() => {
    if (!property) return []
    const list = [...property.photos]
    if (property.coverPhoto && !list.includes(property.coverPhoto)) {
      list.unshift(property.coverPhoto)
    }
    return list
  }, [property])

  const visibilityChecks = useMemo(() => {
    if (!property) return []
    const locationComplete =
      property.locality.trim() && property.city.trim() && property.pincode.trim()
    const needsRera =
      property.type === 'apartment' || property.type === 'nri'
    return [
      {
        label: 'Status is Active',
        ok: property.status === 'available' || property.status === 'reserved',
      },
      { label: 'Photos uploaded (min 1)', ok: hasPhotos },
      { label: 'Price set', ok: property.price > 0 },
      { label: 'Location complete', ok: !!locationComplete },
      {
        label: 'Description added',
        ok: property.description.trim().length > 0,
      },
      {
        label: 'RERA number (apartments)',
        ok: !needsRera || !!property.specs.reraNumber?.trim(),
      },
    ]
  }, [property, hasPhotos])

  const visibilityScore = visibilityChecks.filter((c) => c.ok).length
  const canPublish = hasPhotos && property && property.price > 0

  const warnings = useMemo(() => {
    if (!property) return []
    const list: { text: string; tone: 'orange' | 'red' | 'yellow' }[] = []
    if (property.status === 'draft' && property.isFeatured) {
      list.push({ text: 'Draft cannot be featured on app', tone: 'orange' })
    }
    if (property.status === 'sold' && property.isFeatured) {
      list.push({ text: 'Sold property — remove from featured', tone: 'orange' })
    }
    if (!hasPhotos) {
      list.push({
        text: 'No photos — not visible on app',
        tone: 'red',
      })
    }
    if (
      (property.type === 'apartment' || property.type === 'nri') &&
      !property.specs.reraNumber?.trim()
    ) {
      list.push({ text: 'RERA number missing', tone: 'yellow' })
    }
    if (property.price <= 0) {
      list.push({ text: 'Invalid price', tone: 'red' })
    }
    if (!property.locality.trim() || !property.city.trim()) {
      list.push({ text: 'Incomplete location', tone: 'orange' })
    }
    if (
      property.status === 'under_construction' &&
      !property.possessionDate?.trim()
    ) {
      list.push({ text: 'Add possession date', tone: 'orange' })
    }
    if (property.isUpcoming && !property.launchDate) {
      list.push({ text: 'Add launch date', tone: 'orange' })
    }
    if (!property.description.trim()) {
      list.push({ text: 'Add description to improve app visibility', tone: 'yellow' })
    }
    if (property.isFeatured && property.isUpcoming) {
      list.push({
        text: 'Cannot be featured AND upcoming. Pick one.',
        tone: 'orange',
      })
    }
    return list
  }, [property, hasPhotos])

  const toggleFeatured = () => {
    if (!property) return
    if (!property.isFeatured && property.isUpcoming) {
      updateProperty({ isFeatured: true, isUpcoming: false })
      showToast('Marked as featured (removed from upcoming)')
      return
    }
    const next = !property.isFeatured
    updateProperty({ isFeatured: next })
    showToast(next ? 'Marked as featured' : 'Removed from featured')
  }

  const toggleUpcoming = () => {
    if (!property) return
    if (!property.isUpcoming) {
      setShowUpcomingModal(true)
      setUpcomingLaunchDate(property.launchDate?.slice(0, 10) ?? '')
      return
    }
    updateProperty({ isUpcoming: false })
    showToast('Removed from upcoming')
  }

  const confirmMarkUpcoming = () => {
    if (!property) return
    if (!upcomingLaunchDate.trim()) {
      showToast('Launch date required')
      return
    }
    const launchMs = new Date(`${upcomingLaunchDate}T12:00:00`).getTime()
    if (launchMs < Date.now() - 86400000) {
      if (!window.confirm('Launch date is in the past. Continue anyway?')) return
    }
    const patch: Partial<Property> = {
      isUpcoming: true,
      isFeatured: false,
      launchDate: upcomingLaunchDate,
    }
    updateProperty(patch)
    setShowUpcomingModal(false)
    showToast('Marked as upcoming (removed from featured)')

    const hoursUntilLaunch = (launchMs - Date.now()) / (1000 * 60 * 60)
    if (hoursUntilLaunch <= 24 && hoursUntilLaunch >= 0) {
      const template = NOTIFICATION_TEMPLATES.N15_UPCOMING_LAUNCH(property.title)
      const msg = sendPushNotification('All users', template, 'N-15', {
        dedupeKey: `N-15:${property.id}`,
        relatedTo: { type: 'property', id: property.id },
      })
      showToast(`📱 Launching soon notification N-15 will be sent to all users — ${msg}`)
    }
  }

  const openPriceEdit = () => {
    if (!property) return
    setEditPriceValue(String(property.price))
    setPriceDropNotify(true)
    setPriceEditOpen(true)
  }

  const savePriceEdit = () => {
    if (!property) return
    const newPrice = Number(editPriceValue.replace(/,/g, ''))
    if (!Number.isFinite(newPrice) || newPrice <= 0) {
      showToast('Invalid price')
      return
    }
    const originalPrice = property.price
    if (newPrice >= originalPrice) {
      updateProperty({ price: newPrice })
      setPriceEditOpen(false)
      showToast('Price updated')
      return
    }

    const priceDrop = originalPrice - newPrice
    const dropPercent = ((priceDrop / originalPrice) * 100).toFixed(1)
    const largeDrop = Number(dropPercent) > 20

    const applyPrice = () => {
      updateProperty({ price: newPrice })
      setPriceEditOpen(false)
      if (priceDropNotify) {
        const template = NOTIFICATION_TEMPLATES.N16_PRICE_DROP(
          property.title,
          formatPrice(originalPrice),
          formatPrice(newPrice),
        )
        if (
          window.confirm(
            `This will send ${savedUsersCount} push notifications to users who saved this property. Confirm?`,
          )
        ) {
          const msg = sendPushNotification('All saved users', template, 'N-16', {
            dedupeKey: `N-16:${property.id}:${newPrice}`,
            relatedTo: { type: 'property', id: property.id },
          })
          showToast(
            `📱 Price drop notification N-16 will be sent to ${savedUsersCount} users — ${msg}`,
          )
        }
      }
      showToast('Price updated')
    }

    if (largeDrop) {
      setConfirm({
        title: 'Large price drop',
        message: `Large price drop (${dropPercent}%). Confirm this is intentional?\n\nReduced by ${formatPrice(priceDrop)} (${dropPercent}%).`,
        confirmLabel: 'Confirm drop',
        destructive: true,
        onConfirm: () => {
          setConfirm(null)
          applyPrice()
        },
      })
      return
    }

    setConfirm({
      title: 'Confirm price reduction',
      message: `Price reduced by ${formatPrice(priceDrop)} (${dropPercent}%)\n\nNotify saved users? (${savedUsersCount} users have saved this property)`,
      confirmLabel: 'Save price',
      onConfirm: () => {
        setConfirm(null)
        applyPrice()
      },
    })
  }

  const markVerified = () => {
    if (!property) return
    if (property.status === 'draft') {
      showToast('Publish property before verifying')
      return
    }
    setIsVerified(true)
    showToast(
      "✅ Property verified. Green 'Verified' badge now shows on app B-04 Property Detail",
    )
  }

  const markSold = () => {
    if (!property) return
    const wasFeatured = property.isFeatured
    const wasUpcoming = property.isUpcoming
    updateProperty({
      status: 'sold',
      soldAt: new Date().toISOString(),
      isFeatured: false,
      isUpcoming: false,
    })
    if (wasFeatured) showToast('Removed from Featured listings')
    if (wasUpcoming) showToast('Removed from Upcoming')
    if (property.enquiries > 0) {
      showToast(
        `${property.enquiries} active enquiries — notify buyers that ${property.title} is sold`,
      )
    }
  }

  if (loading) return <DetailSkeleton />

  if (!property) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 px-4">
        <Building2 className="size-16 text-muted-foreground" />
        <p className="font-medium text-foreground">Property not found</p>
        <Button type="button" onClick={() => navigate('/admin/properties/all')}>
          Back to Properties
        </Button>
      </div>
    )
  }

  const mainPhoto = displayPhotos[mainPhotoIndex] ?? null
  const launchDays = daysUntil(property.launchDate)
  const specRows = getSpecRows(property)

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6">
      {editingWarning && !editingDismissed && (
        <div className="mb-4 flex items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
          <p className="text-sm text-amber-900">
            ⚠️ {editingWarning}
            <span className="mt-0.5 block text-xs">Another admin may be viewing this record</span>
          </p>
          <button type="button" onClick={() => setEditingDismissed(true)} aria-label="Dismiss">
            <X className="size-4 text-amber-800" />
          </button>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel ?? 'Confirm'}
        destructive={confirm?.destructive}
        onConfirm={() => {
          confirm?.onConfirm()
          setConfirm(null)
        }}
        onCancel={() => setConfirm(null)}
      />

      {priceEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h4 className="font-semibold">Update price</h4>
            <input
              type="number"
              value={editPriceValue}
              onChange={(e) => setEditPriceValue(e.target.value)}
              className="mt-3 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
            />
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={priceDropNotify}
                onChange={(e) => setPriceDropNotify(e.target.checked)}
              />
              Send price drop notification when price is lowered
            </label>
            {Number(editPriceValue) < property.price && priceDropNotify && (
              <NotificationPreview
                notificationId="N-16"
                title={NOTIFICATION_TEMPLATES.N16_PRICE_DROP(
                  property.title,
                  formatPrice(property.price),
                  formatPrice(Number(editPriceValue) || 0),
                ).title}
                body={NOTIFICATION_TEMPLATES.N16_PRICE_DROP(
                  property.title,
                  formatPrice(property.price),
                  formatPrice(Number(editPriceValue) || 0),
                ).body}
                deepLink="B-04 Property Detail"
                recipientLabel={`${savedUsersCount} saved users`}
              />
            )}
            <div className="mt-4 flex gap-2">
              <Button type="button" size="sm" onClick={savePriceEdit}>
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPriceEditOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {showUpcomingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h4 className="font-semibold">Mark as upcoming</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Launch date is required for upcoming properties
            </p>
            <input
              type="date"
              value={upcomingLaunchDate}
              onChange={(e) => setUpcomingLaunchDate(e.target.value)}
              className="mt-3 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
            />
            {upcomingLaunchDate &&
              (new Date(`${upcomingLaunchDate}T12:00:00`).getTime() - Date.now()) / 3600000 <=
                24 && (
                <NotificationPreview
                  notificationId="N-15"
                  title={NOTIFICATION_TEMPLATES.N15_UPCOMING_LAUNCH(property.title).title}
                  body={NOTIFICATION_TEMPLATES.N15_UPCOMING_LAUNCH(property.title).body}
                  deepLink="B-04 Property Detail"
                  recipientLabel="all users"
                  className="mt-3"
                />
              )}
            <div className="mt-4 flex gap-2">
              <Button type="button" size="sm" onClick={confirmMarkUpcoming}>
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowUpcomingModal(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {mediaPreview && (
        <div
          className="fixed inset-0 z-[60] bg-black/70"
          onClick={() => setMediaPreview(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="mx-auto mt-20 max-w-[600px] rounded-xl bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative mb-4">
              <div className="pr-10">
                <h3 className="text-lg font-semibold text-foreground">{mediaPreview.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{mediaPreview.statusLabel}</p>
              </div>
              <button
                type="button"
                className="absolute right-0 top-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
                onClick={() => setMediaPreview(null)}
                aria-label="Close preview"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mb-6">
              {mediaPreview.url && isImageUrl(mediaPreview.url) ? (
                <img
                  src={mediaPreview.url}
                  alt={mediaPreview.name}
                  className="max-h-[400px] w-full rounded-lg object-contain bg-muted"
                />
              ) : mediaPreview.url ? (
                <a
                  href={mediaPreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary underline"
                >
                  Open in new tab
                </a>
              ) : (
                <>
                  <div className="flex flex-col items-center justify-center rounded-lg bg-muted py-12">
                    <FileText className="size-16 text-muted-foreground" strokeWidth={1.25} />
                    <p className="mt-3 font-medium text-foreground">Document Preview</p>
                  </div>
                  <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                    📄 In production, the actual document uploaded by the buyer/seller appears here.
                    Files are stored in cloud storage (S3/Cloudinary) and displayed via secure URL.
                  </div>
                  <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                    <p>Document: {mediaPreview.name}</p>
                    <p>Status: {mediaPreview.statusLabel}</p>
                    <p>
                      Uploaded:{' '}
                      {new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (mediaPreview.url) {
                    window.open(mediaPreview.url, '_blank', 'noopener,noreferrer')
                  } else {
                    showToast('Download available when backend is connected')
                  }
                }}
              >
                📥 Download
              </Button>
              <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">
                ✅ Verified
              </span>
              <Button type="button" onClick={() => setMediaPreview(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 p-4">
          <div className="mb-4 flex w-full max-w-[375px] items-center justify-between gap-3 rounded-xl border border-white/20 bg-black/40 px-3 py-2 backdrop-blur-sm">
            <span className="text-sm font-medium text-white">App preview (B-04)</span>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/50 bg-white text-foreground hover:bg-white/90"
                onClick={openPropertyInCustomerApp}
              >
                Open in app
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/50 bg-white text-foreground hover:bg-white/90"
                onClick={() => setShowPreview(false)}
              >
                Close
              </Button>
            </div>
          </div>
          <div className="w-[375px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="relative h-48 bg-muted">
              {mainPhoto ? (
                <img src={mainPhoto} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <Building2 className="size-12 text-muted-foreground" />
                </div>
              )}
              <span className="absolute left-3 top-3 rounded-full bg-black/50 p-1 text-white">
                ←
              </span>
              <Share2 className="absolute right-3 top-3 size-5 text-white" />
            </div>
            <div className="space-y-3 p-4">
              <div>
                <p className="font-semibold">{property.title}</p>
                <p className="text-lg font-bold text-primary">{formatPrice(property.price)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">{getPropertyTypeLabel(property.type)}</Badge>
                <span className="text-xs text-muted-foreground">{property.locality}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {property.specs.bhk && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {property.specs.bhk}
                  </span>
                )}
                {property.specs.builtUpArea && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {property.specs.builtUpArea} sqft
                  </span>
                )}
              </div>
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {property.description || 'No description'}
              </p>
              <div className="flex flex-wrap gap-1">
                {property.amenities.slice(0, 6).map((a) => (
                  <span key={a} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    {a}
                  </span>
                ))}
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Preview only — actual app may vary
              </p>
            </div>
          </div>
        </div>
      )}

      <PropertyBreadcrumb property={property} />

      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-foreground">{property.title}</h1>
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-medium',
              getStatusBadgeColor(property.status),
            )}
          >
            {getStatusLabel(property.status)}
          </span>
          {property.isFeatured && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              ⭐ Featured
            </span>
          )}
          {property.isUpcoming && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
              🕐 Upcoming
            </span>
          )}
          {isVerified && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              ✅ Verified
            </span>
          )}
        </div>
        {property.status === 'draft' && (
          <p className="mt-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            ⚠️ Draft — not visible on app
          </p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          {property.referenceId} • {getPropertyTypeLabel(property.type)} •{' '}
          {getSourceLabel(property.source)} • Added: {formatDate(property.addedAt)} •{' '}
          {property.views} views
        </p>

        {warnings.length > 0 && (
          <div className="mt-2 space-y-1">
            {warnings.map((w) => (
              <p
                key={w.text}
                className={cn(
                  'text-sm',
                  w.tone === 'red' && 'text-red-700',
                  w.tone === 'orange' && 'text-orange-700',
                  w.tone === 'yellow' && 'text-yellow-800',
                )}
              >
                {w.text}
              </p>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={openPriceEdit}>
            💰 Update Price
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={openEditForm}>
            ✏️ Edit Property
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={isVerified ? 'border-green-300 bg-green-50' : ''}
            onClick={markVerified}
            disabled={isVerified || property.status === 'draft'}
            title={property.status === 'draft' ? 'Publish first' : undefined}
          >
            {isVerified ? '✅ Verified' : '✓ Mark as Verified'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleFeatured}
            className={property.isFeatured ? 'border-amber-300 bg-amber-50' : ''}
          >
            <Star
              className={cn('mr-1 size-4', property.isFeatured && 'fill-amber-500 text-amber-500')}
            />
            Toggle Featured
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={toggleUpcoming}>
            🕐 Toggle Upcoming
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={openAppPreview}>
            📱 View on App
          </Button>
          <select
            value={property.status}
            onChange={(e) => {
              void handleStatusChange(e.target.value as PropertyStatus)
            }}
            className="h-8 rounded-md border border-border bg-input px-2 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {getStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="p-4">
              {hasPhotos && mainPhoto ? (
                <>
                  <img
                    src={mainPhoto}
                    alt=""
                    className="h-64 w-full rounded-xl object-cover"
                  />
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {displayPhotos.slice(0, 4).map((src, i) => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => setMainPhotoIndex(i)}
                        className={cn(
                          'overflow-hidden rounded-lg border-2',
                          mainPhotoIndex === i ? 'border-primary' : 'border-transparent',
                        )}
                      >
                        <img src={src} alt="" className="h-20 w-full object-cover" />
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {displayPhotos.length} photos
                  </p>
                </>
              ) : (
                <>
                  <div className="flex h-64 items-center justify-center rounded-xl bg-muted">
                    <Building2 className="size-12 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-sm text-red-700">
                    No photos — add photos to make this property visible on app
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Media & Virtual Tour</CardTitle>
              <p className="text-xs text-muted-foreground">
                Photos, walkthrough, drone, 3D tour, and floor plan for NRI buyers
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Photos ({Math.min(property.photos.length, 10)}/10)
                  </p>
                  {property.photos.length < 10 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const url = window.prompt('Image URL')
                        if (url?.trim()) {
                          updateProperty({ photos: [...property.photos, url.trim()].slice(0, 10) })
                          showToast('Photo added')
                        }
                      }}
                    >
                      + Add Photo URL
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {property.photos.slice(0, 10).map((src, i) => (
                    <div key={`${src}-${i}`} className="relative">
                      <img src={src} alt="" className="h-24 w-full rounded-lg object-cover" />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                        onClick={() => {
                          updateProperty({
                            photos: property.photos.filter((_, j) => j !== i),
                          })
                        }}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {(
                [
                  {
                    key: 'videoUrl' as const,
                    label: 'Video Walkthrough',
                    screen: 'B-04',
                    value: property.videoUrl,
                  },
                  {
                    key: 'droneImageUrl' as const,
                    label: 'Drone/Aerial View',
                    screen: 'B-08',
                    value: property.droneImageUrl,
                  },
                  {
                    key: 'tour3dUrl' as const,
                    label: '3D Virtual Tour',
                    screen: 'B-07',
                    nri: true,
                    value: property.tour3dUrl,
                  },
                  {
                    key: 'floorPlanUrl' as const,
                    label: 'Floor Plan',
                    screen: 'B-05',
                    view: true,
                    value: property.floorPlanUrl,
                  },
                ] as const
              ).map((field) => (
                <div key={field.key} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{field.label}</p>
                      <p className="text-xs text-muted-foreground">📱 {field.screen}</p>
                      {'nri' in field && field.nri && (
                        <Badge className="mt-1 bg-purple-100 text-purple-800">
                          Essential for NRI buyers
                        </Badge>
                      )}
                    </div>
                    <Badge
                      variant="default"
                      className={
                        field.value
                          ? 'bg-green-100 text-green-800'
                          : 'bg-muted text-muted-foreground'
                      }
                    >
                      {field.value ? '✅ Added' : 'Not added'}
                    </Badge>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="url"
                      defaultValue={field.value ?? ''}
                      placeholder="https://…"
                      className="h-9 min-w-0 flex-1 rounded-md border border-border bg-input px-3 text-sm"
                      onBlur={(e) => {
                        const v = e.target.value.trim() || null
                        if (v !== field.value) {
                          updateProperty({ [field.key]: v })
                          showToast(`${field.label} saved`)
                        }
                      }}
                    />
                    {field.value && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setMediaPreview({
                            name: field.label,
                            url: field.value,
                            statusLabel: '✅ Added',
                          })
                        }
                      >
                        <Play className="size-3" />
                        {'view' in field && field.view ? 'View' : 'Preview'}
                      </Button>
                    )}
                    {field.value && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          updateProperty({ [field.key]: null })
                          showToast(`${field.label} cleared`)
                        }}
                      >
                        <X className="size-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {(() => {
                const checks = [
                  { ok: property.photos.length > 0, label: `Photos (${property.photos.length})` },
                  { ok: !!property.videoUrl, label: 'Video walkthrough' },
                  { ok: !!property.droneImageUrl, label: 'Drone view' },
                  { ok: !!property.tour3dUrl, label: '3D tour' },
                  { ok: !!property.floorPlanUrl, label: 'Floor plan' },
                  { ok: !!property.specs.reraNumber, label: 'RERA number' },
                  { ok: property.price > 0, label: 'Price set' },
                ]
                const score = checks.filter((c) => c.ok).length
                return (
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-sm font-medium">NRI Readiness Score</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {checks.map((c) => (
                        <li key={c.label}>
                          {c.ok ? '☑' : '☐'} {c.label}
                        </li>
                      ))}
                    </ul>
                    <p
                      className={cn(
                        'mt-3 text-sm font-semibold',
                        score >= 5 ? 'text-green-700' : 'text-orange-700',
                      )}
                    >
                      {score}/7 NRI Ready
                      {score >= 5 ? ' ✅' : ''}
                    </p>
                  </div>
                )
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Property Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-2xl font-bold text-primary">{formatPrice(property.price)}</p>
                {property.isNegotiable && (
                  <Badge variant="blue" className="mt-1">
                    Negotiable
                  </Badge>
                )}
                {property.specs.pricePerSqft != null && (
                  <p className="text-sm text-muted-foreground">
                    ₹{property.specs.pricePerSqft.toLocaleString('en-IN')}/sqft
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {specRows.map((row) => (
                  <div key={row.label} className="rounded-lg bg-muted p-2">
                    <p className="text-xs uppercase text-muted-foreground">{row.label}</p>
                    <p className="font-medium text-sm">{row.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              {propertyEditOpen ? (
                <div className="space-y-3">
                  <label className="block text-sm font-medium">
                    Title
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Description
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={5}
                      className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        updateProperty({
                          title: editTitle.trim() || property.title,
                          description: editDescription,
                        })
                        setPropertyEditOpen(false)
                        showToast('Property updated')
                      }}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditTitle(property.title)
                        setEditDescription(property.description)
                        setPropertyEditOpen(false)
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : property.description.trim() ? (
                <p className="text-sm whitespace-pre-wrap">{property.description}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">No description added</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Highlights</CardTitle>
            </CardHeader>
            <CardContent>
              {property.highlights.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {property.highlights.map((h) => (
                    <span
                      key={h}
                      className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-sm text-green-800"
                    >
                      <CheckCircle className="size-3.5" />
                      {h}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No highlights added</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Amenities ({property.amenities.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {property.amenities.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {property.amenities.map((a) => (
                    <span
                      key={a}
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                    >
                      <CheckCircle className="size-3.5 text-green-600" />
                      {a}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No amenities added</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Why Buy This Property?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {property.advantages ? (
                <>
                  <div>
                    <p className="mb-2 flex items-center gap-2 font-medium text-blue-700">
                      <TrendingUp className="size-4" />
                      Investment Potential
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                      {property.advantages.investment.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 flex items-center gap-2 font-medium text-green-700">
                      <MapPin className="size-4" />
                      Location Advantages
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                      {property.advantages.location.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 flex items-center gap-2 font-medium text-orange-700">
                      <Navigation className="size-4" />
                      Connectivity
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                      {property.advantages.connectivity.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No advantages added</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nearby Places</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {property.nearbyPlaces.length > 0 ? (
                property.nearbyPlaces.map((place) => (
                  <div
                    key={`${place.name}-${place.type}`}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <NearbyIcon type={place.type} />
                      <span className="text-sm font-medium">{place.name}</span>
                    </div>
                    <Badge variant="default">{place.distance}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">None added</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span>👁️ Views</span>
                <span className="font-semibold text-blue-600">{property.views}</span>
              </div>
              <div className="flex justify-between">
                <span>💬 Enquiries</span>
                <span className="font-semibold text-green-600">{property.enquiries}</span>
              </div>
              <div className="flex justify-between">
                <span>📅 Visits</span>
                <span className="font-semibold text-purple-600">{property.visits}</span>
              </div>
              <div className="flex justify-between">
                <span>🔄 Comparisons</span>
                <span className="font-semibold text-orange-600">{property.compareCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Heart className="size-4" /> Saves
                </span>
                <span className="font-semibold">{property.savedCount}</span>
              </div>
              {property.savedCount > 20 && (
                <Badge className="bg-orange-100 text-orange-800">🔥 Popular property</Badge>
              )}
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() =>
                  navigate(`/admin/enquiries/buy?property=${property.id}`)
                }
              >
                View All Enquiries →
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Listing Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <span
                className={cn(
                  'inline-flex rounded-lg px-3 py-1.5 text-sm font-semibold',
                  getStatusBadgeColor(property.status),
                )}
              >
                {getStatusLabel(property.status)}
              </span>
              <p className="text-sm text-muted-foreground">
                👥 {property.savedCount} users have saved this property
              </p>
              {property.status === 'available' && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      setConfirm({
                        title: 'Pause listing?',
                        message: 'Mark this property as reserved?',
                        confirmLabel: 'Pause',
                        onConfirm: () => {
                          updateProperty({ status: 'reserved' })
                          showToast('Listing paused (reserved)')
                        },
                      })
                    }
                  >
                    ⏸️ Pause Listing
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-green-300 text-green-800"
                    onClick={() =>
                      setConfirm({
                        title: 'Mark as sold?',
                        message: 'This will mark the property as sold.',
                        confirmLabel: 'Mark Sold',
                        onConfirm: () => {
                          markSold()
                        },
                      })
                    }
                  >
                    ✅ Mark as Sold
                  </Button>
                </>
              )}
              {property.status === 'reserved' && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      updateProperty({ status: 'available' })
                      showToast('Made available')
                    }}
                  >
                    ▶️ Make Available
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-green-300 text-green-800"
                    onClick={() =>
                      setConfirm({
                        title: 'Mark as sold?',
                        message: 'Confirm sale of this property.',
                        confirmLabel: 'Mark Sold',
                        onConfirm: () => {
                          markSold()
                        },
                      })
                    }
                  >
                    ✅ Mark as Sold
                  </Button>
                </>
              )}
              {property.status === 'draft' && (
                <Button
                  type="button"
                  className="w-full"
                  disabled={!canPublish}
                  title={!canPublish ? 'Add photos and valid price to publish' : undefined}
                  onClick={() =>
                    setConfirm({
                      title: 'Publish property?',
                      message: 'Property will be visible on the app.',
                      confirmLabel: 'Publish',
                      onConfirm: () => {
                        updateProperty({ status: 'available' })
                        showToast('Property published!')
                      },
                    })
                  }
                >
                  ▶️ Publish
                </Button>
              )}
              {property.status === 'sold' && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    updateProperty({ status: 'available', soldAt: null })
                    showToast('Property relisted')
                  }}
                >
                  ♻️ Relist Property
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>App Visibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {visibilityChecks.map((c) => (
                <p key={c.label} className="text-sm">
                  {c.ok ? '✅' : '❌'} {c.label}
                </p>
              ))}
              <p
                className={cn(
                  'mt-2 text-sm font-medium',
                  property.status === 'draft' && 'text-red-700',
                  property.status !== 'draft' &&
                    visibilityScore === visibilityChecks.length &&
                    'text-green-700',
                  property.status !== 'draft' &&
                    visibilityScore < visibilityChecks.length &&
                    'text-orange-700',
                )}
              >
                {property.status === 'draft'
                  ? 'Status is Draft — not visible'
                  : visibilityScore === visibilityChecks.length
                    ? `${visibilityScore} of ${visibilityChecks.length} complete — visible on app`
                    : `${visibilityScore} of ${visibilityChecks.length} — not fully optimized`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Promotions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center justify-between gap-2">
                <span className="text-sm">⭐ Show in Featured Section</span>
                <input
                  type="checkbox"
                  checked={property.isFeatured}
                  onChange={toggleFeatured}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                {property.isFeatured
                  ? 'Showing on home screen'
                  : 'Not in featured section'}
              </p>
              <label className="flex items-center justify-between gap-2">
                <span className="text-sm">🕐 Show in Upcoming Section</span>
                <input
                  type="checkbox"
                  checked={property.isUpcoming}
                  onChange={toggleUpcoming}
                />
              </label>
              {property.isUpcoming && (
                <div>
                  <label className="text-xs font-medium">Launch Date</label>
                  <input
                    type="date"
                    value={property.launchDate?.slice(0, 10) ?? ''}
                    onChange={(e) =>
                      updateProperty({ launchDate: e.target.value || null })
                    }
                    className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Showing in upcoming section
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Source Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {property.source === 'acquired' && property.acquisitionId && (
                <>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() =>
                      navigate(`/admin/acquisition/${property.acquisitionId}`)
                    }
                  >
                    View Acquisition →
                  </button>
                  <p>Final price: {formatPrice(property.price)}</p>
                  <p className="text-muted-foreground">
                    Acquired on: {formatDate(property.addedAt)}
                  </p>
                </>
              )}
              {property.source === 'bulk_upload' && (
                <>
                  <p>Uploaded via Master Sheet</p>
                  {property.source_sheet && (
                    <Badge variant="default">{property.source_sheet}</Badge>
                  )}
                </>
              )}
              {property.source === 'manual' && (
                <p>Manually added by {property.assignedTo}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Possession Date</p>
                <p className="font-medium">
                  {property.possessionDate ?? 'Not specified'}
                </p>
                {property.status === 'under_construction' && property.possessionDate && (
                  <p className="mt-1 text-orange-700">Under construction — target possession</p>
                )}
              </div>
              {property.isUpcoming && (
                <div>
                  <p className="text-xs text-muted-foreground">Launch Date</p>
                  <p className="font-medium">{formatLaunchDate(property.launchDate)}</p>
                  {launchDays != null && (
                    <p className="text-muted-foreground">Launches in {launchDays} days</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
