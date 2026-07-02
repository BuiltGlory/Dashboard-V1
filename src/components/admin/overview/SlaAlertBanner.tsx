import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dismissSlaBanner, isSlaBannerDismissed } from '@/utils/edgeCases'

export function SlaAlertBanner() {
  const [visible, setVisible] = useState(() => !isSlaBannerDismissed())

  const handleDismiss = () => {
    dismissSlaBanner()
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-orange-200 bg-gradient-to-r from-red-50 to-orange-50 px-4 py-3 shadow-sm">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-orange-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-orange-900">SLA alerts require attention</p>
        <ul className="mt-1 space-y-0.5 text-sm text-orange-800">
          <li>3 Interior inquiries need response within 2 hours</li>
          <li>1 Stage payment request overdue</li>
        </ul>
      </div>
      <Button variant="ghost" size="icon" className="shrink-0 text-orange-700 hover:bg-orange-100" onClick={handleDismiss} aria-label="Dismiss">
        <X className="size-4" />
      </Button>
    </div>
  )
}
