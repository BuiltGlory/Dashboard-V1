import { adminApiRequest } from './admin'

export type DashboardDocument = {
  id: string
  name: string
}

export type DashboardDocumentCategory = {
  id: string
  title: string
  documents: readonly DashboardDocument[]
}

export type DashboardOptions = {
  visits?: {
    rescheduleReasons?: string[]
    cancelReasons?: string[]
    physicalChecklist?: string[]
  }
  legalDocuments?: {
    categories?: readonly DashboardDocumentCategory[]
    saleCategories?: readonly DashboardDocumentCategory[]
    categoryIdsByPropertyType?: Record<string, string[]>
  }
  properties?: {
    options?: Record<string, string[]>
    importSheets?: Array<{ label: string; type: string }>
  }
}

type PublicAppConfig = {
  dashboardOptions?: DashboardOptions
}

let dashboardOptionsPromise: Promise<DashboardOptions | null> | null = null

export async function getDashboardOptions() {
  dashboardOptionsPromise ??= adminApiRequest<PublicAppConfig>('/app/config')
    .then((config) => config.dashboardOptions ?? null)
    .catch(() => null)

  return dashboardOptionsPromise
}
