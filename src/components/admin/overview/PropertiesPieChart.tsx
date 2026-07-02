import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#6366f1',
  '#14b8a6',
  '#a855f7',
  '#ef4444',
  '#64748b',
]

function labelOf(value: string) {
  const normalized = value.replace(/_/g, ' ').trim()
  if (!normalized) return 'Other'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function PropertiesPieChart({
  data = [],
}: {
  data?: Array<{ value?: string; count: number }>
}) {
  const chartData = data
    .filter((t) => t.count > 0)
    .map((item, index) => ({
      name: labelOf(item.value ?? 'Other'),
      value: item.count,
      color: COLORS[index % COLORS.length],
    }))
  const singleType = chartData.length === 1
  const total = chartData.reduce((sum, item) => sum + item.value, 0)
  const summary =
    chartData.length === 0
      ? 'No active property type data is available.'
      : `Active property mix totals ${total} properties: ${chartData
          .map((item) => `${item.name} ${item.value}`)
          .join(', ')}.`

  return (
    <Card className="h-full rounded-2xl border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Properties by Type</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="sr-only">{summary}</p>
        {chartData.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            No active property mix yet
          </div>
        ) : (
          <div
            className="h-[280px] w-full [&_*:focus]:outline-none [&_*:focus-visible]:outline-none"
            role="img"
            aria-label={summary}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="35%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={singleType ? 0 : 2}
                  dataKey="value"
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${value ?? 0} properties`]}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '11px', paddingLeft: '16px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
