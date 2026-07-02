import { useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { SellRequest } from '@/api/adminEnquiries'
import { cn } from '@/lib/utils'

interface ListingPreviewModalProps {
  request: SellRequest
  open: boolean
  onClose: () => void
  onAccept?: () => void
  showAccept?: boolean
}

export function ListingPreviewModal({
  request,
  open,
  onClose,
  onAccept,
  showAccept = false,
}: ListingPreviewModalProps) {
  const [photoIndex, setPhotoIndex] = useState(0)
  if (!open) return null

  const photos = request.photos.length > 0 ? request.photos : []
  const mainPhoto = photos[photoIndex]

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/60">
      <div className="flex shrink-0 items-center justify-between bg-card px-4 py-3">
        <h2 className="text-lg font-semibold">Listing Preview — How buyers see this</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-5" />
        </Button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
        <div className="w-full max-w-[375px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="relative h-56 bg-muted">
            {mainPhoto ? (
              <img src={mainPhoto} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                No photos
              </div>
            )}
            {photos.length > 1 && (
              <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPhotoIndex(i)}
                    className={cn(
                      'size-2 rounded-full',
                      i === photoIndex ? 'bg-primary' : 'bg-white/70',
                    )}
                    aria-label={`Photo ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3 p-4">
            <p className="text-xl font-bold text-primary">{request.askingPrice}</p>
            <h3 className="font-semibold">{request.propertyTitle}</h3>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-4" />
              {request.location}, {request.city}
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {request.specifications.bhk && (
                <div className="rounded bg-muted p-2">
                  <p className="text-xs text-muted-foreground">BHK</p>
                  <p className="font-medium">{request.specifications.bhk}</p>
                </div>
              )}
              {request.specifications.builtUpArea && (
                <div className="rounded bg-muted p-2">
                  <p className="text-xs text-muted-foreground">Area</p>
                  <p className="font-medium">{request.specifications.builtUpArea}</p>
                </div>
              )}
              {request.specifications.floor && (
                <div className="rounded bg-muted p-2">
                  <p className="text-xs text-muted-foreground">Floor</p>
                  <p className="font-medium">{request.specifications.floor}</p>
                </div>
              )}
              {request.specifications.facing && (
                <div className="rounded bg-muted p-2">
                  <p className="text-xs text-muted-foreground">Facing</p>
                  <p className="font-medium">{request.specifications.facing}</p>
                </div>
              )}
            </div>
            {request.amenities.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {request.amenities.map((a) => (
                  <Badge key={a} variant="blue" className="text-xs">
                    {a}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {request.description || 'No description provided'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-border bg-card p-4">
        <p className="w-full text-center text-sm text-muted-foreground">
          This is a preview. Listing is not live yet.
        </p>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        {showAccept && onAccept && (
          <Button onClick={onAccept}>Accept for Acquisition</Button>
        )}
      </div>
    </div>
  )
}
