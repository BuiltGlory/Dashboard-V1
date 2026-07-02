import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const fallbackData = [
  { day: 'Mon', count: 142 },
  { day: 'Tue', count: 168 },
  { day: 'Wed', count: 155 },
  { day: 'Thu', count: 189 },
  { day: 'Fri', count: 201 },
  { day: 'Sat', count: 178 },
  { day: 'Sun', count: 151 },
]

export function EnquiriesChart({
  data = fallbackData,
}: {
  data?: Array<{ day: string; count: number }>
}) {
  const allZero = data.every((d) => d.count === 0)
  const chartData = allZero
    ? data.map((d) => ({ ...d, count: 0 }))
    : data
  const total = data.reduce((sum, item) => sum + item.count, 0)
  const peak = data.reduce<Array<{ day: string; count: number }>>((items, item) => {
    if (!items.length || item.count > items[0].count) return [item]
    if (item.count === items[0].count) return [...items, item]
    return items
  }, [])
  const summary =
    data.length === 0
      ? 'No enquiry trend data is available.'
      : allZero
        ? 'No enquiries were recorded in the last 7 days.'
        : `${total} enquiries were recorded in the last 7 days. Peak day: ${peak.map((item) => `${item.day} with ${item.count}`).join(', ')}.`

  return (
    <Card className="h-full rounded-2xl border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Enquiries Over Last 7 Days</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="sr-only">{summary}</p>
        {data.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            No enquiry trend data yet
          </div>
        ) : (
          <>
        {allZero && (
          <p className="mb-2 text-center text-xs text-muted-foreground">No enquiries this week</p>
        )}
        <div
          className="h-[280px] w-full [&_*:focus]:outline-none [&_*:focus-visible]:outline-none"
          role="img"
          aria-label={summary}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ fill: '#2563eb', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
