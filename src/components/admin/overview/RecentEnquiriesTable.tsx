import { useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

type EnquiryRow = {
  id: string
  buyer: string
  property: string
  type: string
  date: string
  status: string
  viewPath: string
}

function badgeVariant(status: string) {
  if (status === 'new') return 'new'
  if (status === 'responded' || status === 'closed') return 'responded'
  return 'pending'
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function RecentEnquiriesTable({ enquiries = [] }: { enquiries?: EnquiryRow[] }) {
  const navigate = useNavigate()

  return (
    <Card className="h-full rounded-2xl border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Recent Enquiries</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 px-5 pb-5">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="pb-3 pr-4">Buyer Name</th>
              <th className="pb-3 pr-4">Property</th>
              <th className="pb-3 pr-4">Type</th>
              <th className="pb-3 pr-4">Date</th>
              <th className="pb-3 pr-4">Status</th>
              <th className="pb-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {enquiries.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No recent buy enquiries
                </td>
              </tr>
            )}
            {enquiries.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-sidebar-accent"
                onClick={() => navigate(row.viewPath)}
              >
                <td className="py-3 pr-4 font-medium">{row.buyer}</td>
                <td className="py-3 pr-4 text-muted-foreground">{row.property}</td>
                <td className="py-3 pr-4">{row.type}</td>
                <td className="py-3 pr-4 text-muted-foreground">{formatDate(row.date)}</td>
                <td className="py-3 pr-4">
                  <Badge variant={badgeVariant(row.status)}>{statusLabel(row.status)}</Badge>
                </td>
                <td className="py-3" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(row.viewPath)}
                  >
                    View →
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
      <CardFooter className="border-t border-border pt-4">
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline"
          onClick={() => navigate('/admin/enquiries/buy')}
        >
          View All →
        </button>
      </CardFooter>
    </Card>
  )
}
