export function downloadTextReceipt(filename: string, lines: Array<string | number | null | undefined>) {
  const body = lines.filter((line) => line !== null && line !== undefined && String(line).trim() !== '').join('\n')
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
