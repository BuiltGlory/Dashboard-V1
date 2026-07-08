export type PropertyStatus =
  | 'available'
  | 'sold'
  | 'reserved'
  | 'under_construction'
  | 'draft'

export type PropertySource = 'acquired' | 'manual' | 'bulk_upload'

export type PropertyType =
  | 'plot'
  | 'apartment'
  | 'residential'
  | 'commercial'
  | 'organic_home'
  | '3d_printing'
  | 'fractional'
  | 'ceo_mansion'
  | 'holiday_home'
  | 'land'
  | 'farmhouse'
  | 'nri'
  | 'interior'
  | 'villa'

export interface PropertySpecs {
  [key: string]: unknown
  bhk?: string
  builtUpArea?: number
  carpetArea?: number
  plotArea?: number
  plotDimension?: string
  floor?: string
  totalFloors?: number
  facing?: string
  age?: string
  furnishing?: string
  parking?: string
  reraNumber?: string
  possession?: string
  vastuCompliant?: boolean
  transactionType?: string
  layoutName?: string
  roadWidth?: number
  approvalType?: string
  titleType?: string
  cornerPlot?: boolean
  builderName?: string
  towerName?: string
  unitNumber?: string
  superBuiltUp?: number
  uds?: number
  bedrooms?: number
  bathrooms?: number
  balcony?: number
  maintenancePerMonth?: number
  ocStatus?: string
  pricePerSqft?: number
  subType?: string
  suitableFor?: string
  frontageWidth?: number
  ceilingHeight?: number
  powerLoad?: string
}

export type NearbyPlaceType =
  | 'metro'
  | 'school'
  | 'hospital'
  | 'mall'
  | 'it_park'
  | 'airport'
  | 'highway'
  | 'restaurant'

export interface PropertyAdvantages {
  investment: string[]
  location: string[]
  connectivity: string[]
}

export interface NearbyPlace {
  name: string
  type: NearbyPlaceType
  distance: string
}

export interface Property {
  id: string
  referenceId: string
  title: string
  description: string
  type: PropertyType
  status: PropertyStatus
  source: PropertySource
  isFeatured: boolean
  isUpcoming: boolean
  isVisibleOnApp?: boolean
  address: string
  locality: string
  city: string
  state: string
  pincode: string
  latitude: number | null
  longitude: number | null
  price: number
  isNegotiable: boolean
  specs: PropertySpecs
  amenities: string[]
  photos: string[]
  coverPhoto: string | null
  videoUrl: string | null
  droneImageUrl: string | null
  tour3dUrl: string | null
  floorPlanUrl: string | null
  savedCount: number
  savedByUsers: string[]
  assignedTo: string
  source_sheet: string | null
  acquisitionId: string | null
  addedAt: string
  updatedAt: string
  soldAt: string | null
  views: number
  enquiries: number
  visits: number
  compareCount: number
  isDeleted?: boolean
  deletedAt?: string | null
  deletedBy?: string | null
  launchDate: string | null
  advantages: PropertyAdvantages | null
  nearbyPlaces: NearbyPlace[]
  possessionDate: string | null
  highlights: string[]
}

const TYPE_LABELS: Record<PropertyType, string> = {
  plot: 'Plot',
  apartment: 'Apartment',
  residential: 'Residential',
  commercial: 'Commercial',
  organic_home: 'Organic Home',
  '3d_printing': '3D Printing',
  fractional: 'Fractional',
  ceo_mansion: 'CEO Mansion',
  holiday_home: 'Holiday Home',
  land: 'Land',
  farmhouse: 'Farmhouse',
  nri: 'NRI',
  interior: 'Interior',
  villa: 'Villa',
}

/** Maps app slugs, labels, and aliases to canonical backend property types. */
export const PROPERTY_TYPE_SLUG_TO_BACKEND: Record<string, PropertyType> = {
  plot: 'plot',
  apartment: 'apartment',
  residential: 'residential',
  commercial: 'commercial',
  villa: 'villa',
  land: 'land',
  fractional: 'fractional',
  '3d-print': '3d_printing',
  '3d-printing-home': '3d_printing',
  organic: 'organic_home',
  'organic-home': 'organic_home',
  'ceo-mansion': 'ceo_mansion',
  holiday: 'holiday_home',
  'holiday-home': 'holiday_home',
  farmhouse: 'farmhouse',
  'farm-house': 'farmhouse',
  nri: 'nri',
  'nri-services': 'nri',
  interior: 'interior',
  'fractional-ownership': 'fractional',
  'land-landbank': 'land',
}

const PROPERTY_TYPE_ALIASES: Record<string, PropertyType> = {
  ...PROPERTY_TYPE_SLUG_TO_BACKEND,
  plots: 'plot',
  apartments: 'apartment',
  flat: 'apartment',
  flats: 'apartment',
  villas: 'villa',
  house: 'residential',
  organic_home: 'organic_home',
  'organic home': 'organic_home',
  '3d_printing': '3d_printing',
  '3d_print': '3d_printing',
  '3d printing': '3d_printing',
  '3d printing home': '3d_printing',
  fractional_ownership: 'fractional',
  'fractional ownership': 'fractional',
  ceo_mansion: 'ceo_mansion',
  ceo: 'ceo_mansion',
  'ceo mansion': 'ceo_mansion',
  holiday_home: 'holiday_home',
  'holiday home': 'holiday_home',
  farm: 'farmhouse',
  'farm house': 'farmhouse',
  'nri services': 'nri',
  'land and landbank': 'land',
  'land & landbank': 'land',
}

function normalizePropertyTypeToken(type: string) {
  return type.trim().toLowerCase().replace(/&/g, 'and').replace(/[\s-]+/g, '_')
}

export function normalizePropertyTypeKey(type?: string | null): PropertyType | null {
  const raw = String(type ?? '').trim()
  if (!raw) return null

  const underscored = normalizePropertyTypeToken(raw)
  if (underscored in TYPE_LABELS) return underscored as PropertyType

  const aliased =
    PROPERTY_TYPE_ALIASES[underscored] ??
    PROPERTY_TYPE_ALIASES[raw.toLowerCase()] ??
    PROPERTY_TYPE_ALIASES[normalizePropertyTypeToken(raw.replace(/_/g, ' '))]
  if (aliased) return aliased

  return null
}

export function toBackendPropertyType(type?: string | null): PropertyType | null {
  return normalizePropertyTypeKey(type)
}

const STATUS_COLORS: Record<PropertyStatus, string> = {
  available: 'bg-green-100 text-green-700',
  sold: 'bg-muted text-muted-foreground',
  reserved: 'bg-blue-100 text-blue-700',
  under_construction: 'bg-orange-100 text-orange-700',
  draft: 'bg-amber-100 text-amber-800',
}

const SOURCE_LABELS: Record<PropertySource, string> = {
  acquired: 'Acquired',
  manual: 'Manual Entry',
  bulk_upload: 'Bulk Upload',
}

export const AMENITIES_BY_TYPE: Record<PropertyType, string[]> = {
  plot: [
    'Gated Community',
    'Black Top Road',
    'Street Lights',
    'Underground Drainage',
    'Water Connection',
    'BESCOM Provision',
  ],
  apartment: [
    'Swimming Pool',
    'Gym',
    'Lift',
    'Parking',
    'Clubhouse',
    'Children Play Area',
    'Security',
    'Power Backup',
  ],
  residential: [
    'Private Garden',
    'Car Porch',
    'Solar Ready',
    'Rainwater Harvesting',
    'Modular Kitchen',
    'CCTV',
  ],
  commercial: [
    '24Hr Security',
    'Power Backup',
    'CCTV',
    'Fire Safety',
    'Visitor Parking',
    'High Speed Lifts',
  ],
  villa: [
    'Private Garden',
    'Car Porch',
    'Security',
    'Power Backup',
    'Modular Kitchen',
  ],
  organic_home: [
    'Organic Garden',
    'Compost Pit',
    'Natural Ventilation',
    'Low VOC Materials',
    'Solar Panels',
  ],
  '3d_printing': [
    'Smart Home Ready',
    'Precision Build',
    'Energy Efficient Shell',
    'Custom Floor Plan',
  ],
  fractional: [
    'Managed Letting',
    'Shared Amenities',
    'Quarterly Reports',
    'Legal Clear Title',
  ],
  ceo_mansion: [
    'Home Theatre',
    'Wine Cellar',
    'Private Lift',
    'Landscaped Garden',
    'Smart Home',
    'Staff Quarters',
  ],
  holiday_home: [
    'Pool Access',
    'Concierge',
    'Fully Furnished',
    'Wi-Fi',
    'Housekeeping',
  ],
  land: [
    'Clear Title',
    'Survey Done',
    'Agricultural Convertible',
    'Road Access',
  ],
  farmhouse: [
    'Borewell',
    'Fencing',
    'Farm Shed',
    'Mango Orchard',
    'Guest Cottage',
  ],
  nri: [
    'RERA Registered',
    'NRI-Friendly Payment Plan',
    'Property Management',
    'Rental Guarantee Option',
  ],
  interior: [
    'Design Consultation',
    'Modular Kitchen',
    'Wardrobes',
    'False Ceiling',
    'Lighting Package',
  ],
}

export function getPropertyTypeLabel(type?: string | null): string {
  const canonical = normalizePropertyTypeKey(type)
  if (canonical) return TYPE_LABELS[canonical]

  const normalized = String(type || '').trim()
  if (!normalized) return 'Property'
  return normalized
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.toUpperCase() === 'NRI' ? 'NRI' : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getStatusBadgeColor(status: PropertyStatus): string {
  return STATUS_COLORS[status] ?? 'bg-muted text-muted-foreground'
}

export function getSourceLabel(source: PropertySource): string {
  return SOURCE_LABELS[source] ?? source
}

export function formatPrice(amount: number): string {
  if (amount >= 10_000_000) {
    return `₹${(amount / 10_000_000).toFixed(2)}Cr`
  }
  if (amount >= 100_000) {
    return `₹${(amount / 100_000).toFixed(2)}L`
  }
  if (amount >= 1_000) {
    return `₹${(amount / 1_000).toFixed(2)}K`
  }
  return `₹${amount.toLocaleString('en-IN')}`
}
