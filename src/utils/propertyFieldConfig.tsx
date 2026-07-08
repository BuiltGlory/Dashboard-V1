import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { formatPrice } from '@/api/adminAcquisitions'
import { normalizePropertyTypeKey } from '@/domain/properties'
import { cn } from '@/lib/utils'

export type PropertyFieldGroup = {
  title: string
  screenId: string
  fields: string[]
}

export const PROPERTY_TYPE_FIELDS: Record<
  string,
  { groups: PropertyFieldGroup[] }
> = {
  plot: {
    groups: [
      {
        title: 'Basic Information',
        screenId: 'SL-02A-1',
        fields: ['plotType', 'totalArea', 'areaUnit', 'description'],
      },
      {
        title: 'Dimensions & Layout',
        screenId: 'SL-02A-2',
        fields: [
          'dimensions',
          'facing',
          'cornerPlot',
          'roadWidth',
          'layoutName',
          'plotNumber',
          'surveyNumber',
        ],
      },
      {
        title: 'Legal & Approvals',
        screenId: 'SL-02A-3',
        fields: [
          'dtcpApproved',
          'cmdaApproved',
          'approvalNumber',
          'reraNumber',
          'pattaAvailable',
          'ecAvailable',
          'legalIssues',
          'legalIssueDetails',
        ],
      },
      {
        title: 'Utilities & Features',
        screenId: 'SL-02A-4',
        fields: [
          'waterConnection',
          'waterSource',
          'ebConnection',
          'compoundWall',
          'propertyAge',
        ],
      },
    ],
  },
  apartment: {
    groups: [
      {
        title: 'Basic Details',
        screenId: 'SL-02B-1',
        fields: ['bhkConfig', 'superBuiltUp', 'builtUp', 'carpetArea'],
      },
      {
        title: 'Floor & Unit',
        screenId: 'SL-02B-2',
        fields: [
          'floorNumber',
          'totalFloors',
          'unitNumber',
          'towerName',
          'facing',
          'bedrooms',
          'bathrooms',
          'balconies',
          'servantRoom',
        ],
      },
      {
        title: 'Builder & Project',
        screenId: 'SL-02B-3',
        fields: [
          'builderName',
          'projectName',
          'propertyAge',
          'possessionStatus',
          'reraNumber',
          'ocReceived',
        ],
      },
      {
        title: 'Parking & Furnishing',
        screenId: 'SL-02B-4',
        fields: [
          'furnishing',
          'parking',
          'parkingType',
          'parkingCount',
          'maintenanceCharges',
          'societyName',
        ],
      },
    ],
  },
  residential: {
    groups: [
      {
        title: 'Basic Details',
        screenId: 'SL-02C-1',
        fields: ['subType', 'bhkConfig', 'plotArea', 'builtUpArea'],
      },
      {
        title: 'Room Configuration',
        screenId: 'SL-02C-2',
        fields: [
          'floors',
          'bedrooms',
          'bathrooms',
          'facing',
          'pujaRoom',
          'servantRoom',
          'terrace',
          'terraceArea',
        ],
      },
      {
        title: 'Outdoor & Amenities',
        screenId: 'SL-02C-3',
        fields: [
          'compoundWall',
          'garden',
          'gardenArea',
          'swimmingPool',
          'carParking',
          'generator',
          'security',
        ],
      },
      {
        title: 'Legal & Furnishing',
        screenId: 'SL-02C-4',
        fields: ['propertyAge', 'furnishing', 'ownershipType', 'khataType', 'loanOnProperty'],
      },
    ],
  },
  commercial: {
    groups: [
      {
        title: 'Basic Details',
        screenId: 'SL-02D-1',
        fields: ['commercialType', 'totalArea', 'floorNumber', 'totalFloors'],
      },
      {
        title: 'Interior Setup',
        screenId: 'SL-02D-2',
        fields: [
          'furnishing',
          'cabins',
          'meetingRooms',
          'washrooms',
          'pantry',
          'falseCeiling',
          'floorType',
        ],
      },
      {
        title: 'Power & Parking',
        screenId: 'SL-02D-3',
        fields: ['powerLoad', 'powerBackup', 'dedicatedParking', 'lift', 'loadingBay'],
      },
      {
        title: 'Lease & Legal',
        screenId: 'SL-02D-4',
        fields: [
          'currentlyLeased',
          'tenantName',
          'rentalIncome',
          'leaseExpiry',
          'propertyAge',
          'reraNumber',
        ],
      },
    ],
  },
  organic_home: {
    groups: [
      {
        title: 'Basic Details',
        screenId: 'SL-02E-1',
        fields: ['bhkConfig', 'plotArea', 'builtUpArea', 'floors'],
      },
      {
        title: 'Eco Materials',
        screenId: 'SL-02E-2',
        fields: [
          'constructionMaterial',
          'greenCertification',
          'certificationNumber',
          'ventilationType',
          'naturalLighting',
        ],
      },
      {
        title: 'Sustainability',
        screenId: 'SL-02E-3',
        fields: [
          'solarPanels',
          'solarCapacity',
          'solarType',
          'rainwaterHarvesting',
          'organicGarden',
          'composting',
          'evCharging',
          'propertyAge',
        ],
      },
    ],
  },
  '3d_printing': {
    groups: [
      {
        title: 'Basic Details',
        screenId: 'SL-02F-1',
        fields: ['bhkConfig', 'builtUpArea', 'floors'],
      },
      {
        title: 'Technology',
        screenId: 'SL-02F-2',
        fields: [
          'printTechnology',
          'constructionMaterial',
          'constructionYear',
          'structuralWarranty',
          'seismicZone',
          'energyRating',
        ],
      },
      {
        title: 'Smart Features',
        screenId: 'SL-02F-3',
        fields: [
          'smartHomeSystem',
          'voiceControl',
          'autoLighting',
          'smartSecurity',
          'evCharging',
          'propertyAge',
        ],
      },
    ],
  },
  fractional: {
    groups: [
      {
        title: 'Property Details',
        screenId: 'SL-02G-1',
        fields: ['underlyingPropertyType', 'propertyLocation', 'totalPropertyValue'],
      },
      {
        title: 'Share Details',
        screenId: 'SL-02G-2',
        fields: [
          'sharePercentage',
          'shareValue',
          'minimumInvestment',
          'totalUnits',
          'unitsAvailable',
          'legalStructure',
        ],
      },
      {
        title: 'Returns & Exit',
        screenId: 'SL-02G-3',
        fields: [
          'expectedROI',
          'monthlyRentalIncome',
          'rentalIncomeShare',
          'exitOption',
          'lockInPeriod',
          'buybackGuarantee',
        ],
      },
    ],
  },
  ceo_mansion: {
    groups: [
      {
        title: 'Basic Details',
        screenId: 'SL-02H-1',
        fields: ['bhkConfig', 'plotArea', 'builtUpArea', 'floors'],
      },
      {
        title: 'Room Configuration',
        screenId: 'SL-02H-2',
        fields: [
          'bedrooms',
          'bathrooms',
          'staffQuarters',
          'homeOffice',
          'homeTheatre',
          'gym',
          'wineCellar',
          'bar',
        ],
      },
      {
        title: 'Premium Amenities',
        screenId: 'SL-02H-3',
        fields: [
          'swimmingPool',
          'poolType',
          'elevator',
          'liftCapacity',
          'jacuzzi',
          'parkingCapacity',
          'gardenArea',
        ],
      },
      {
        title: 'Smart & Security',
        screenId: 'SL-02H-4',
        fields: [
          'smartHomeBrand',
          'automationLevel',
          'securitySystem',
          'generatorBackup',
          'ownershipType',
          'propertyAge',
        ],
      },
    ],
  },
  holiday_home: {
    groups: [
      {
        title: 'Basic Details',
        screenId: 'SL-02I-1',
        fields: ['holidayHomeType', 'bhkConfig', 'plotArea', 'builtUpArea'],
      },
      {
        title: 'Location & Views',
        screenId: 'SL-02I-2',
        fields: [
          'viewType',
          'distanceFromBangalore',
          'nearestCity',
          'roadType',
          'accessibility',
          'nearestAirport',
        ],
      },
      {
        title: 'Rental & Management',
        screenId: 'SL-02I-3',
        fields: [
          'furnishing',
          'rentalPlatform',
          'monthlyRentalIncome',
          'occupancyRate',
          'managedProperty',
          'managementFee',
          'propertyAge',
        ],
      },
    ],
  },
  land: {
    groups: [
      {
        title: 'Basic Details',
        screenId: 'SL-02J-1',
        fields: ['landType', 'totalArea', 'areaUnit'],
      },
      {
        title: 'Survey & Revenue',
        screenId: 'SL-02J-2',
        fields: [
          'surveyNumber',
          'khataNumber',
          'pattaNumber',
          'revenueVillage',
          'taluk',
          'naConversion',
          'naOrderNumber',
        ],
      },
      {
        title: 'Access & Utilities',
        screenId: 'SL-02J-3',
        fields: ['roadAccess', 'roadWidth', 'waterSource', 'ebConnection', 'fencing'],
      },
      {
        title: 'Soil & Topography',
        screenId: 'SL-02J-4',
        fields: [
          'soilType',
          'topography',
          'plantation',
          'plantationType',
          'govtAcquisitionThreat',
        ],
      },
    ],
  },
  farmhouse: {
    groups: [
      {
        title: 'Basic Details',
        screenId: 'SL-02K-1',
        fields: ['totalLandArea', 'areaUnit', 'mainHouseBHK', 'mainHouseArea', 'numberOfBuildings'],
      },
      {
        title: 'Water & Power',
        screenId: 'SL-02K-2',
        fields: [
          'waterSource',
          'borewellDepth',
          'borewellYield',
          'electricity',
          'solarCapacity',
        ],
      },
      {
        title: 'Crops & Agriculture',
        screenId: 'SL-02K-3',
        fields: [
          'cultivated',
          'cropType',
          'numberOfTrees',
          'annualCropIncome',
          'caretaker',
          'animalHusbandry',
        ],
      },
      {
        title: 'Access & Legal',
        screenId: 'SL-02K-4',
        fields: [
          'roadType',
          'roadWidth',
          'distanceFromCity',
          'titleType',
          'naConversion',
          'legalIssues',
        ],
      },
    ],
  },
  nri: {
    groups: [
      {
        title: 'Property & Seller',
        screenId: 'SL-02L-1',
        fields: ['actualPropertyType', 'nriSellerType', 'countryOfResidence', 'cityOfResidence'],
      },
      {
        title: 'Legal & Compliance',
        screenId: 'SL-02L-2',
        fields: [
          'femaCompliance',
          'powerOfAttorney',
          'poaHolderName',
          'poaHolderPhone',
          'poaRegistered',
          'tdsAcknowledged',
          'taxAdvisor',
        ],
      },
      {
        title: 'Communication & Inspection',
        screenId: 'SL-02L-3',
        fields: [
          'preferredContactTime',
          'timeZone',
          'inspectionMode',
          'virtualTourAvailable',
          'currencyPreference',
          'paymentMode',
          'docsInIndia',
        ],
      },
    ],
  },
  interior: {
    groups: [
      {
        title: 'Project & Property',
        screenId: 'SL-02M-1',
        fields: ['propertyType', 'totalArea', 'possessionStatus', 'expectedStartDate'],
      },
      {
        title: 'Scope & Style',
        screenId: 'SL-02M-2',
        fields: [
          'scopeOfWork',
          'designStyle',
          'colorPreference',
          'flooringRequired',
          'falseCeiling',
          'modularKitchen',
          'kitchenStyle',
        ],
      },
      {
        title: 'Budget & References',
        screenId: 'SL-02M-3',
        fields: [
          'budgetRange',
          'timeline',
          'existingFurniture',
          'brandPreferences',
          'specialRequirements',
        ],
      },
    ],
  },
}
export function normalizePropertyType(propertyType: string): string | null {
  const key = normalizePropertyTypeKey(propertyType)
  if (!key) return null
  if (key === 'villa') return 'residential'
  if (key in PROPERTY_TYPE_FIELDS) return key
  return null
}

const SELL_SPEC_ALIAS_GROUPS: string[][] = [
  ['bhkConfig', 'bhk'],
  ['builtUp', 'builtUpArea'],
  ['carpetArea', 'carpet'],
  ['floorNumber', 'floor'],
  ['unitNumber', 'unitNo', 'unit'],
  ['propertyAge', 'age'],
  ['reraNumber', 'rera'],
  ['plotArea', 'area', 'totalArea'],
  ['totalFloors', 'floors'],
  ['furnishing', 'furnish'],
]

function firstNonEmptyValue(
  source: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    const value = source[key]
    if (!isFieldEmpty(value)) return value
  }
  return undefined
}

function formatBhkConfig(value: unknown): string {
  const raw = String(value).trim()
  if (!raw) return raw
  return raw.toLowerCase().includes('bhk') ? raw : `${raw} BHK`
}

/** Maps seller-app `specifications` keys to dashboard field-config keys. */
export function normalizeSellPropertyDetails(
  specifications?: Record<string, unknown> | null,
  extras?: Record<string, unknown> | null,
): Record<string, unknown> {
  const raw = { ...(specifications ?? {}), ...(extras ?? {}) }
  const details: Record<string, unknown> = { ...raw }

  for (const group of SELL_SPEC_ALIAS_GROUPS) {
    const value = firstNonEmptyValue(raw, group)
    if (isFieldEmpty(value)) continue
    for (const key of group) {
      if (isFieldEmpty(details[key])) {
        details[key] = key === 'bhkConfig' ? formatBhkConfig(value) : value
      }
    }
  }

  return details
}

export type SellCompletenessInput = {
  propertyType?: string
  specifications?: Record<string, unknown> | null
  ownershipType?: string
  possessionStatus?: string
  loanOnProperty?: boolean
  askingPrice?: number | string
  description?: string
  photos?: string[]
  photosCount?: number
  documents?: Array<{ status?: string; fileUrl?: string }>
  documentsCount?: number
  amenities?: string[]
  address?: {
    city?: string
    locality?: string
    pincode?: string
    street?: string
  }
  location?: string
}

export function computeSellCompletenessPercent(input: SellCompletenessInput): number {
  const propertyDetails = normalizeSellPropertyDetails(input.specifications, {
    ownershipType: input.ownershipType,
    possessionStatus: input.possessionStatus,
    loanOnProperty: input.loanOnProperty,
  })
  const fieldStats = countMissingTypeFields(input.propertyType ?? '', propertyDetails)
  const hasPropertyDetails =
    fieldStats.total > 0
      ? fieldStats.missing < fieldStats.total
      : Object.values(propertyDetails).some((value) => !isFieldEmpty(value))

  const photoCount = Math.max(
    input.photosCount ?? 0,
    input.photos?.length ?? 0,
    (input.documents ?? []).filter(
      (doc) => doc.fileUrl && !['rejected', 'missing'].includes(String(doc.status ?? '')),
    ).length,
  )
  const uploadedDocs = (input.documents ?? []).filter(
    (doc) => doc.status === 'uploaded' || Boolean(doc.fileUrl),
  ).length
  const hasDocuments = uploadedDocs > 0 || (input.documentsCount ?? 0) > 0
  const askingPrice =
    typeof input.askingPrice === 'number'
      ? input.askingPrice
      : Number(String(input.askingPrice ?? '').replace(/[^\d]/g, ''))
  const hasLocation = Boolean(
    input.address?.city &&
      input.address?.pincode &&
      (input.address.locality || input.address.street || input.location),
  )

  const checks = [
    hasPropertyDetails,
    photoCount > 0,
    Number.isFinite(askingPrice) && askingPrice > 0,
    hasDocuments,
    Boolean(input.description?.trim()),
    hasLocation,
    (input.amenities ?? []).length > 0,
  ]

  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

export function formatFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}

export function formatFieldValue(
  key: string,
  value: unknown,
  details?: Record<string, unknown>,
): string {
  if (typeof value === 'boolean') return value ? 'Yes ✅' : 'No ❌'
  if (Array.isArray(value)) return value.join(', ')
  if (
    typeof value === 'number' &&
    /price|Income|Value|Amount|Charges|ROI|Investment|rental/i.test(key)
  ) {
    return formatPrice(value)
  }
  if (
    typeof value === 'number' &&
    (/Area|area|builtUp|plotArea|totalLand/i.test(key) || key === 'totalArea')
  ) {
    const unit = details?.areaUnit ? String(details.areaUnit) : 'sqft'
    return `${value} ${unit}`
  }
  return String(value)
}

export function isFieldEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

export function hasPropertyDetails(
  _propertyType: string,
  propertyDetails?: Record<string, unknown> | null,
): boolean {
  if (!propertyDetails || Object.keys(propertyDetails).length === 0) return false
  return Object.values(propertyDetails).some((v) => !isFieldEmpty(v))
}

export function countMissingTypeFields(
  propertyType: string,
  propertyDetails?: Record<string, unknown> | null,
): { missing: number; total: number } {
  const typeKey = normalizePropertyType(propertyType)
  if (!typeKey) return { missing: 0, total: 0 }
  const config = PROPERTY_TYPE_FIELDS[typeKey]
  let missing = 0
  let total = 0
  const details = propertyDetails ?? {}
  for (const group of config.groups) {
    for (const fieldKey of group.fields) {
      total++
      if (isFieldEmpty(details[fieldKey])) missing++
    }
  }
  return { missing, total }
}

export function buildRequestDetailsMessage(
  sellerName: string,
  propertyTitle: string,
  propertyType: string,
  propertyDetails?: Record<string, unknown> | null,
): string {
  const { missing } = countMissingTypeFields(propertyType, propertyDetails)
  if (missing === 0) return ''
  const typeKey = normalizePropertyType(propertyType)
  if (!typeKey) return ''
  const missingLabels: string[] = []
  const details = propertyDetails ?? {}
  for (const group of PROPERTY_TYPE_FIELDS[typeKey].groups) {
    for (const fieldKey of group.fields) {
      if (isFieldEmpty(details[fieldKey])) {
        missingLabels.push(formatFieldLabel(fieldKey))
      }
    }
  }
  return `Hi ${sellerName}, please complete the following details for your listing "${propertyTitle}":\n\n${missingLabels.map((l) => `• ${l}`).join('\n')}\n\nThank you,\nTeam Builtglory`
}

export function renderFieldGroups(
  propertyType: string,
  propertyDetails?: Record<string, unknown> | null,
) {
  const typeKey = normalizePropertyType(propertyType)
  if (!typeKey) return null
  const typeConfig = PROPERTY_TYPE_FIELDS[typeKey]
  const details = propertyDetails ?? {}

  return typeConfig.groups.map((group) => (
    <div key={group.screenId} className="mb-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-foreground">{group.title}</h4>
        <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          📱 {group.screenId}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/30 p-3">
        {group.fields.map((fieldKey) => {
          const value = details[fieldKey]
          return (
            <div key={fieldKey}>
              <p className="text-xs capitalize text-muted-foreground">{formatFieldLabel(fieldKey)}</p>
              <p className="mt-0.5 text-sm font-medium">
                {!isFieldEmpty(value) ? (
                  formatFieldValue(fieldKey, value, details)
                ) : (
                  <span className="text-xs italic text-muted-foreground">Not provided</span>
                )}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  ))
}

export function getSpecificationFields(
  propertyType: string,
  propertyDetails?: Record<string, unknown> | null,
) {
  const typeKey = normalizePropertyType(propertyType)
  if (!typeKey || !propertyDetails) return []
  const config = PROPERTY_TYPE_FIELDS[typeKey]
  const fields: { key: string; label: string; value: string }[] = []
  for (const group of config.groups) {
    for (const fieldKey of group.fields) {
      const value = propertyDetails[fieldKey]
      if (!isFieldEmpty(value)) {
        fields.push({
          key: fieldKey,
          label: formatFieldLabel(fieldKey),
          value: formatFieldValue(fieldKey, value, propertyDetails),
        })
      }
    }
  }
  return fields
}

export function PropertyDetailsAccordion({
  propertyType,
  propertyDetails,
}: {
  propertyType: string
  propertyDetails?: Record<string, unknown> | null
}) {
  const [open, setOpen] = useState(false)
  if (!hasPropertyDetails(propertyType, propertyDetails)) return null
  const groups = renderFieldGroups(propertyType, propertyDetails)
  if (!groups) return null
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        View Property Details
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {open && <div className="border-t border-border px-4 pb-4 pt-2">{groups}</div>}
    </div>
  )
}

export function ExpectedSpecificationsPanel({
  propertyType,
  propertyDetails,
  verified,
  onToggleVerified,
}: {
  propertyType: string
  propertyDetails?: Record<string, unknown> | null
  verified: Record<string, boolean>
  onToggleVerified: (key: string) => void
}) {
  const fields = getSpecificationFields(propertyType, propertyDetails)
  if (fields.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        No specifications submitted by seller
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">Expected Specifications</p>
      <p className="text-xs text-muted-foreground">Verify each item during site inspection</p>
      <div className="space-y-2 rounded-lg border border-border p-3">
        {fields.map((field) => (
          <label
            key={field.key}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm transition-colors',
              verified[field.key] && 'border-green-300 bg-green-50/50',
            )}
          >
            <input
              type="checkbox"
              checked={!!verified[field.key]}
              onChange={() => onToggleVerified(field.key)}
              className="mt-0.5 size-4"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{field.label}</p>
              <p className="text-muted-foreground">{field.value}</p>
            </div>
            {verified[field.key] && (
              <span className="shrink-0 text-xs font-medium text-green-700">Verified on site ✓</span>
            )}
          </label>
        ))}
      </div>
    </div>
  )
}
