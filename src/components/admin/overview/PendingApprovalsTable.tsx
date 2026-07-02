import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export interface PendingApprovalRow {
  id: string
  seller: string
  title: string
  type: string
  submitted: string
  viewPath: string
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function PendingApprovalsTable({ approvals = [] }: { approvals?: PendingApprovalRow[] }) {
  const navigate = useNavigate()

  return (
    <Card className="h-full rounded-2xl border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Pending Approvals</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 px-5 pb-5">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="pb-3 pr-4">Seller</th>
              <th className="pb-3 pr-4">Property Title</th>
              <th className="pb-3 pr-4">Type</th>
              <th className="pb-3 pr-4">Submitted</th>
              <th className="pb-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {approvals.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No pending seller approvals
                </td>
              </tr>
            )}
            {approvals.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-sidebar-accent"
                onClick={() => navigate(row.viewPath)}
              >
                <td className="py-3 pr-4 font-medium">{row.seller}</td>
                <td className="py-3 pr-4">{row.title}</td>
                <td className="py-3 pr-4 text-muted-foreground">{row.type}</td>
                <td className="py-3 pr-4 text-muted-foreground">{formatDate(row.submitted)}</td>
                <td className="py-3" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(row.viewPath)}
                  >
                    Review →
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
          onClick={() => navigate('/admin/enquiries/sell')}
        >
          View All →
        </button>
      </CardFooter>
    </Card>
  )
}
