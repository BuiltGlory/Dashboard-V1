// TODO: Replace with API GET /properties

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

export interface PropertySpecs {
  // Common
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
  // Plot specific
  layoutName?: string
  roadWidth?: number
  approvalType?: string
  titleType?: string
  cornerPlot?: boolean
  // Apartment specific
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
  // Commercial specific
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

const IMG_APT = 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400'
const IMG_VILLA = 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400'
const IMG_PLOT = 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400'
const IMG_COMMERCIAL = 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400'

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

export const MOCK_PROPERTIES: Property[] = [
  {
    id: 'PROP-201',
    referenceId: 'BG-PROP-2026-201',
    title: 'Corner Plot, Devanahalli BIAAPA',
    description:
      'East-facing corner plot in approved layout near airport corridor. Ideal for villa construction.',
    type: 'plot',
    status: 'available',
    source: 'acquired',
    isFeatured: true,
    isUpcoming: false,
    address: 'Plot 42, Greenfield Layout, Devanahalli',
    locality: 'Devanahalli',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '562110',
    latitude: 13.2467,
    longitude: 77.7111,
    price: 3200000,
    isNegotiable: true,
    specs: {
      plotArea: 2400,
      plotDimension: '40 x 60 ft',
      layoutName: 'Greenfield Layout',
      roadWidth: 40,
      approvalType: 'BIAAPA',
      titleType: 'A-Khata',
      cornerPlot: true,
      facing: 'East',
      vastuCompliant: true,
      transactionType: 'Sale',
    },
    amenities: AMENITIES_BY_TYPE.plot,
    photos: [IMG_PLOT, IMG_PLOT],
    coverPhoto: IMG_PLOT,
    videoUrl: null,
    droneImageUrl: null,
    tour3dUrl: null,
    floorPlanUrl: null,
    savedCount: 8,
    savedByUsers: [],
    assignedTo: 'Vikram Ops',
    source_sheet: null,
    acquisitionId: 'ACQ-006',
    addedAt: '2026-02-10T08:00:00Z',
    updatedAt: '2026-05-20T10:00:00Z',
    soldAt: null,
    views: 412,
    enquiries: 28,
    visits: 9,
    compareCount: 8,
    launchDate: null,
    advantages: {
      investment: [
        'High appreciation near airport corridor',
        'BIAAPA approved layout premium',
        'Strong rental demand from tech workforce',
      ],
      location: [
        '2 km from Kempegowda International Airport',
        'Near Devanahalli business district',
        'Peaceful suburban setting',
      ],
      connectivity: [
        'NH-44 expressway access',
        'Airport 15 mins',
        'Upcoming metro extension planned',
      ],
    },
    nearbyPlaces: [
      { name: 'Kempegowda Airport', type: 'airport', distance: '8 km' },
      { name: 'Devanahalli Fort', type: 'restaurant', distance: '3 km' },
      { name: 'Ryan International School', type: 'school', distance: '2.5 km' },
    ],
    possessionDate: 'Ready to Move',
    highlights: ['Corner plot', 'East facing', 'Vastu compliant'],
  },
  {
    id: 'PROP-202',
    referenceId: 'BG-PROP-2026-202',
    title: '3BHK Apartment, Whitefield',
    description:
      'Spacious 3BHK in gated community with clubhouse and metro connectivity.',
    type: 'apartment',
    status: 'reserved',
    source: 'manual',
    isFeatured: true,
    isUpcoming: false,
    address: 'Tower B, Unit 1204, Prestige Lakeside',
    locality: 'Whitefield',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560066',
    latitude: 12.9698,
    longitude: 77.7499,
    price: 8900000,
    isNegotiable: true,
    specs: {
      bhk: '3 BHK',
      builtUpArea: 1650,
      carpetArea: 1280,
      floor: '12',
      totalFloors: 18,
      bedrooms: 3,
      bathrooms: 3,
      balcony: 2,
      builderName: 'Prestige Group',
      towerName: 'Tower B',
      unitNumber: '1204',
      superBuiltUp: 1850,
      maintenancePerMonth: 4500,
      ocStatus: 'Received',
      pricePerSqft: 5394,
      facing: 'North-East',
      furnishing: 'Semi-furnished',
      parking: '2 covered',
      reraNumber: 'PRM/KA/RERA/1251/308/PR/180615/000123',
      possession: 'Ready to move',
    },
    amenities: AMENITIES_BY_TYPE.apartment,
    photos: [IMG_APT, IMG_APT, IMG_APT],
    coverPhoto: IMG_APT,
    videoUrl: 'https://www.youtube.com/watch?v=whitefield-walkthrough',
    droneImageUrl: 'https://www.youtube.com/watch?v=whitefield-drone',
    tour3dUrl: 'https://my.matterport.com/show/?m=whitefield-3d',
    floorPlanUrl: 'https://builtglory.example/floorplans/whitefield-3bhk.pdf',
    savedCount: 42,
    savedByUsers: ['usr_003', 'usr_005', 'usr_008'],
    assignedTo: 'Arjun Kapoor',
    source_sheet: null,
    acquisitionId: null,
    addedAt: '2026-03-05T08:00:00Z',
    updatedAt: '2026-05-28T14:00:00Z',
    soldAt: null,
    views: 892,
    enquiries: 64,
    visits: 22,
    compareCount: 14,
    launchDate: null,
    advantages: {
      investment: [
        'High appreciation in Whitefield corridor',
        'Near major IT parks',
        'Strong rental yield potential',
      ],
      location: [
        '2 km from Hope Farm metro',
        'Near international schools',
        'Walk to Phoenix Marketcity',
      ],
      connectivity: [
        'Purple Line metro nearby',
        'Outer Ring Road 5 mins',
        'ITPL 10 mins drive',
      ],
    },
    nearbyPlaces: [
      { name: 'Hope Farm Metro', type: 'metro', distance: '2 km' },
      { name: 'Vydehi Hospital', type: 'hospital', distance: '3 km' },
      { name: 'ITPL', type: 'it_park', distance: '6 km' },
    ],
    possessionDate: 'Ready to Move',
    highlights: ['North-East facing', 'OC received', 'Clubhouse access'],
  },
  {
    id: 'PROP-203',
    referenceId: 'BG-PROP-2026-203',
    title: '4BHK Independent Villa, Sarjapur',
    description:
      'Premium independent villa with private garden and servant quarters.',
    type: 'residential',
    status: 'available',
    source: 'manual',
    isFeatured: false,
    isUpcoming: true,
    address: 'Villa 7, Palm Grove, Sarjapur Road',
    locality: 'Sarjapur',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560035',
    latitude: 12.9102,
    longitude: 77.6856,
    price: 18500000,
    isNegotiable: true,
    specs: {
      bhk: '4 BHK',
      builtUpArea: 4200,
      plotArea: 3600,
      bedrooms: 4,
      bathrooms: 5,
      floor: 'Ground + 2',
      facing: 'East',
      age: '2 years',
      furnishing: 'Fully furnished',
      parking: '3 cars',
      vastuCompliant: true,
      possession: 'Immediate',
    },
    amenities: AMENITIES_BY_TYPE.residential,
    photos: [IMG_VILLA, IMG_VILLA, IMG_VILLA, IMG_VILLA],
    coverPhoto: IMG_VILLA,
    videoUrl: 'https://www.youtube.com/watch?v=sarjapur-villa-tour',
    droneImageUrl: 'https://www.youtube.com/watch?v=sarjapur-aerial',
    tour3dUrl: 'https://my.matterport.com/show/?m=sarjapur-villa-5bhk',
    floorPlanUrl: 'https://builtglory.example/floorplans/sarjapur-5bhk.pdf',
    savedCount: 28,
    savedByUsers: ['usr_nri_009'],
    assignedTo: 'Priya Admin',
    source_sheet: null,
    acquisitionId: null,
    addedAt: '2026-04-01T08:00:00Z',
    updatedAt: '2026-05-25T09:00:00Z',
    soldAt: null,
    views: 534,
    enquiries: 41,
    visits: 15,
    compareCount: 11,
    launchDate: '2026-09-01',
    advantages: {
      investment: [
        'Sarjapur Road price appreciation',
        'Premium villa segment demand',
        'Gated community resale value',
      ],
      location: [
        'Near Wipro corporate campus',
        'Top schools within 3 km',
        'Green belt surroundings',
      ],
      connectivity: [
        'Sarjapur-Attibele Road access',
        'Electronic City 20 mins',
        'ORR connectivity 8 mins',
      ],
    },
    nearbyPlaces: [
      { name: 'Wipro Campus', type: 'it_park', distance: '4 km' },
      { name: 'Oakridge International', type: 'school', distance: '2.8 km' },
      { name: 'Total Mall Sarjapur', type: 'mall', distance: '5 km' },
    ],
    possessionDate: 'March 2027',
    highlights: ['Private garden', 'Fully furnished', 'Servant quarters'],
  },
  {
    id: 'PROP-204',
    referenceId: 'BG-PROP-2026-204',
    title: 'Retail Space, Koramangala 5th Block',
    description: 'High street retail frontage on main road with strong footfall.',
    type: 'commercial',
    status: 'available',
    source: 'bulk_upload',
    isFeatured: true,
    isUpcoming: false,
    address: 'Shop 3, 5th Block, Koramangala',
    locality: 'Koramangala',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560095',
    latitude: 12.9352,
    longitude: 77.6245,
    price: 12500000,
    isNegotiable: false,
    specs: {
      builtUpArea: 2200,
      subType: 'Retail',
      suitableFor: 'Showroom, F&B, Banking',
      frontageWidth: 45,
      ceilingHeight: 14,
      powerLoad: '100 KVA',
      floor: 'Ground',
      transactionType: 'Lease/Sale',
    },
    amenities: AMENITIES_BY_TYPE.commercial,
    photos: [IMG_COMMERCIAL, IMG_COMMERCIAL],
    coverPhoto: IMG_COMMERCIAL,
    videoUrl: null,
    droneImageUrl: null,
    tour3dUrl: null,
    floorPlanUrl: null,
    savedCount: 8,
    savedByUsers: [],
    assignedTo: 'Vikram Ops',
    source_sheet: 'commercial_q2_2026.csv',
    acquisitionId: null,
    addedAt: '2026-01-20T08:00:00Z',
    updatedAt: '2026-05-18T11:00:00Z',
    soldAt: null,
    views: 678,
    enquiries: 52,
    visits: 18,
    compareCount: 12,
    launchDate: null,
    advantages: {
      investment: [
        'Koramangala retail capital appreciation',
        'High footfall rental income',
        'Commercial hub demand',
      ],
      location: [
        '5th Block prime high street',
        'Near restaurants and nightlife',
        'Central Bangalore address',
      ],
      connectivity: [
        'Koramangala BDA complex access',
        'Silk Board 15 mins',
        'MG Road 20 mins',
      ],
    },
    nearbyPlaces: [
      { name: 'Forum Mall', type: 'mall', distance: '1.5 km' },
      { name: 'Manipal Hospital', type: 'hospital', distance: '2 km' },
      { name: 'Sony World Signal', type: 'highway', distance: '0.5 km' },
    ],
    possessionDate: 'Immediate',
    highlights: ['45 ft frontage', 'High ceiling', 'Main road facing'],
  },
  {
    id: 'PROP-205',
    referenceId: 'BG-PROP-2026-205',
    title: 'Organic Eco Home, Yelahanka',
    description: 'Sustainable home built with natural materials and rooftop garden.',
    type: 'organic_home',
    status: 'under_construction',
    source: 'manual',
    isFeatured: false,
    isUpcoming: true,
    address: 'Survey 88/2, Yelahanka New Town',
    locality: 'Yelahanka',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560064',
    latitude: 13.1007,
    longitude: 77.5963,
    price: 7800000,
    isNegotiable: true,
    specs: {
      bhk: '3 BHK',
      builtUpArea: 2100,
      plotArea: 3000,
      bedrooms: 3,
      bathrooms: 3,
      facing: 'South',
      possession: 'Dec 2026',
      age: 'New construction',
    },
    amenities: AMENITIES_BY_TYPE.organic_home,
    photos: [IMG_VILLA, IMG_APT],
    coverPhoto: IMG_VILLA,
    videoUrl: null,
    droneImageUrl: null,
    tour3dUrl: null,
    floorPlanUrl: null,
    savedCount: 8,
    savedByUsers: [],
    assignedTo: 'Arjun Kapoor',
    source_sheet: null,
    acquisitionId: null,
    addedAt: '2026-05-01T08:00:00Z',
    updatedAt: '2026-05-29T08:00:00Z',
    soldAt: null,
    views: 198,
    enquiries: 14,
    visits: 4,
    compareCount: 3,
    launchDate: '2026-07-15',
    advantages: {
      investment: [
        'Eco-home premium in north Bangalore',
        'Yelahanka growth corridor',
        'Sustainable living demand',
      ],
      location: [
        'Near Yelahanka satellite town',
        'Lake view potential',
        'Low-density neighbourhood',
      ],
      connectivity: [
        'Bellary Road access',
        'Airport 25 mins',
        'Yelahanka Railway 10 mins',
      ],
    },
    nearbyPlaces: [
      { name: 'Yelahanka Railway Station', type: 'metro', distance: '3 km' },
      { name: 'Akash Hospital', type: 'hospital', distance: '4 km' },
      { name: 'RMZ Galleria', type: 'mall', distance: '6 km' },
    ],
    possessionDate: 'December 2026',
    highlights: ['Rooftop garden', 'Natural materials', 'Solar ready'],
  },
  {
    id: 'PROP-206',
    referenceId: 'BG-PROP-2026-206',
    title: '3D Printed Studio Home, Electronic City',
    description: 'Innovative 3D-printed shell with smart home integration package.',
    type: '3d_printing',
    status: 'draft',
    source: 'manual',
    isFeatured: false,
    isUpcoming: false,
    address: 'Phase 2, NeoBuild Park, Electronic City',
    locality: 'Electronic City',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560100',
    latitude: 12.8456,
    longitude: 77.6603,
    price: 4500000,
    isNegotiable: true,
    specs: {
      bhk: '2 BHK',
      builtUpArea: 1100,
      carpetArea: 950,
      bedrooms: 2,
      bathrooms: 2,
      floor: 'Ground',
      possession: 'Q3 2026',
    },
    amenities: AMENITIES_BY_TYPE['3d_printing'],
    photos: [IMG_APT],
    coverPhoto: IMG_APT,
    videoUrl: null,
    droneImageUrl: null,
    tour3dUrl: null,
    floorPlanUrl: null,
    savedCount: 8,
    savedByUsers: [],
    assignedTo: 'Priya Admin',
    source_sheet: null,
    acquisitionId: null,
    addedAt: '2026-05-25T08:00:00Z',
    updatedAt: '2026-05-29T12:00:00Z',
    soldAt: null,
    views: 45,
    enquiries: 3,
    visits: 0,
    compareCount: 1,
    launchDate: null,
    advantages: {
      investment: [
        'Innovation-led property segment',
        'Electronic City employment hub',
        'Lower cost per sqft vs traditional',
      ],
      location: [
        'Inside NeoBuild tech park',
        'Near Infosys campus',
        'Quiet industrial zone',
      ],
      connectivity: [
        'Electronic City metro 12 mins',
        'Hosur Road access',
        'Nice Road 15 mins',
      ],
    },
    nearbyPlaces: [
      { name: 'Infosys EC Campus', type: 'it_park', distance: '2 km' },
      { name: 'Biocon Park', type: 'it_park', distance: '5 km' },
      { name: 'Hebbagodi Metro', type: 'metro', distance: '4 km' },
    ],
    possessionDate: 'September 2026',
    highlights: ['Smart home ready', 'Precision build', 'Energy efficient'],
  },
  {
    id: 'PROP-207',
    referenceId: 'BG-PROP-2026-207',
    title: 'Fractional Share — Luxury Apt, Indiranagar',
    description: 'Fractional ownership in premium 2BHK with rental income share.',
    type: 'fractional',
    status: 'available',
    source: 'bulk_upload',
    isFeatured: false,
    isUpcoming: false,
    address: 'Embassy Habitat, 100 Feet Road, Indiranagar',
    locality: 'Indiranagar',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560038',
    latitude: 12.9784,
    longitude: 77.6408,
    price: 2500000,
    isNegotiable: false,
    specs: {
      bhk: '2 BHK',
      builtUpArea: 1150,
      bedrooms: 2,
      bathrooms: 2,
      builderName: 'Embassy Group',
      floor: '8',
      furnishing: 'Fully furnished',
      transactionType: 'Fractional sale',
    },
    amenities: AMENITIES_BY_TYPE.fractional,
    photos: [IMG_APT, IMG_APT],
    coverPhoto: IMG_APT,
    videoUrl: null,
    droneImageUrl: null,
    tour3dUrl: null,
    floorPlanUrl: null,
    savedCount: 8,
    savedByUsers: [],
    assignedTo: 'Arjun Kapoor',
    source_sheet: 'fractional_may2026.csv',
    acquisitionId: null,
    addedAt: '2026-04-18T08:00:00Z',
    updatedAt: '2026-05-22T10:00:00Z',
    soldAt: null,
    views: 321,
    enquiries: 47,
    visits: 11,
    compareCount: 6,
    launchDate: null,
    advantages: {
      investment: [
        'Fractional entry to prime Indiranagar',
        'Rental income share model',
        'Low capital high-yield option',
      ],
      location: [
        '100 Feet Road lifestyle hub',
        'Near cafes and boutiques',
        'Central east Bangalore',
      ],
      connectivity: [
        'Indiranagar metro 1 km',
        'CMH Road access',
        'Airport 45 mins',
      ],
    },
    nearbyPlaces: [
      { name: 'Indiranagar Metro', type: 'metro', distance: '1 km' },
      { name: 'CMH Hospital', type: 'hospital', distance: '1.5 km' },
      { name: '1 MG-Lido Mall', type: 'mall', distance: '2 km' },
    ],
    possessionDate: 'Ready to Move',
    highlights: ['Fully furnished', 'Managed letting', 'Premium address'],
  },
  {
    id: 'PROP-208',
    referenceId: 'BG-PROP-2026-208',
    title: 'CEO Mansion, Sadashivanagar',
    description: 'Ultra-luxury mansion with private amenities in prime north Bangalore.',
    type: 'ceo_mansion',
    status: 'sold',
    source: 'acquired',
    isFeatured: false,
    isUpcoming: false,
    address: '14 Palace Cross Road, Sadashivanagar',
    locality: 'Sadashivanagar',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560080',
    latitude: 13.0012,
    longitude: 77.5765,
    price: 25000000,
    isNegotiable: false,
    specs: {
      bhk: '6 BHK',
      builtUpArea: 12000,
      plotArea: 15000,
      bedrooms: 6,
      bathrooms: 8,
      floor: 'Ground + 3',
      facing: 'North',
      furnishing: 'Designer furnished',
      parking: '6 cars',
      possession: 'Sold',
    },
    amenities: AMENITIES_BY_TYPE.ceo_mansion,
    photos: [IMG_VILLA, IMG_VILLA, IMG_VILLA],
    coverPhoto: IMG_VILLA,
    videoUrl: null,
    droneImageUrl: null,
    tour3dUrl: null,
    floorPlanUrl: null,
    savedCount: 8,
    savedByUsers: [],
    assignedTo: 'Priya Admin',
    source_sheet: null,
    acquisitionId: 'ACQ-011',
    addedAt: '2025-11-01T08:00:00Z',
    updatedAt: '2026-05-10T10:00:00Z',
    soldAt: '2026-05-10T10:00:00Z',
    views: 1240,
    enquiries: 89,
    visits: 34,
    compareCount: 15,
    launchDate: null,
    advantages: {
      investment: [
        'Sadashivanagar ultra-prime holding',
        'Historic appreciation track record',
        'Limited supply luxury segment',
      ],
      location: [
        'Palace Road diplomatic zone',
        'Near Bangalore Golf Club',
        'North Bangalore elite address',
      ],
      connectivity: [
        'Bellary Road 5 mins',
        'MG Road 15 mins',
        'Airport 35 mins',
      ],
    },
    nearbyPlaces: [
      { name: 'Bangalore Golf Club', type: 'restaurant', distance: '1 km' },
      { name: 'MS Ramaiah Hospital', type: 'hospital', distance: '3 km' },
      { name: 'Hebbal Flyover', type: 'highway', distance: '4 km' },
    ],
    possessionDate: 'Ready to Move',
    highlights: ['Designer furnished', 'Private lift', 'Landscaped garden'],
  },
  {
    id: 'PROP-209',
    referenceId: 'BG-PROP-2026-209',
    title: 'Holiday Home, Nandi Hills',
    description: 'Weekend retreat with valley views and resort-style amenities.',
    type: 'holiday_home',
    status: 'available',
    source: 'manual',
    isFeatured: false,
    isUpcoming: false,
    address: 'Villa 3, Misty Ridge, Nandi Hills Road',
    locality: 'Nandi Hills',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '562103',
    latitude: 13.3702,
    longitude: 77.6835,
    price: 6200000,
    isNegotiable: true,
    specs: {
      bhk: '3 BHK',
      builtUpArea: 2400,
      plotArea: 5000,
      bedrooms: 3,
      bathrooms: 3,
      facing: 'Valley',
      furnishing: 'Holiday ready',
      possession: 'Immediate',
    },
    amenities: AMENITIES_BY_TYPE.holiday_home,
    photos: [IMG_VILLA, IMG_PLOT],
    coverPhoto: IMG_VILLA,
    videoUrl: null,
    droneImageUrl: null,
    tour3dUrl: null,
    floorPlanUrl: null,
    savedCount: 8,
    savedByUsers: [],
    assignedTo: 'Vikram Ops',
    source_sheet: null,
    acquisitionId: null,
    addedAt: '2026-02-28T08:00:00Z',
    updatedAt: '2026-05-24T16:00:00Z',
    soldAt: null,
    views: 445,
    enquiries: 36,
    visits: 12,
    compareCount: 4,
    launchDate: null,
    advantages: {
      investment: [
        'Weekend home rental potential',
        'Nandi Hills tourism growth',
        'Second-home market demand',
      ],
      location: [
        'Valley and hill views',
        'Cool climate retreat',
        'Away from city noise',
      ],
      connectivity: [
        'NH-44 to Nandi Hills',
        'Devanahalli 40 mins',
        'Bangalore city 60 mins',
      ],
    },
    nearbyPlaces: [
      { name: 'Nandi Hills Viewpoint', type: 'restaurant', distance: '5 km' },
      { name: 'Bhoga Nandeeshwara Temple', type: 'restaurant', distance: '8 km' },
      { name: 'Devanahalli Airport', type: 'airport', distance: '35 km' },
    ],
    possessionDate: 'Immediate',
    highlights: ['Valley facing', 'Holiday ready', 'Resort amenities'],
  },
  {
    id: 'PROP-210',
    referenceId: 'BG-PROP-2026-210',
    title: 'Agricultural Land, Kanakapura Road',
    description: 'Converted dry land parcel with road access and clear title.',
    type: 'land',
    status: 'available',
    source: 'acquired',
    isFeatured: false,
    isUpcoming: false,
    address: 'Sy No. 112/3, Kanakapura Road',
    locality: 'Kanakapura Road',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560082',
    latitude: 12.8021,
    longitude: 77.4123,
    price: 4800000,
    isNegotiable: true,
    specs: {
      plotArea: 43560,
      plotDimension: '2 acres',
      facing: 'West',
      titleType: 'Clear title',
      approvalType: 'DC conversion done',
      transactionType: 'Sale',
    },
    amenities: AMENITIES_BY_TYPE.land,
    photos: [IMG_PLOT, IMG_PLOT],
    coverPhoto: IMG_PLOT,
    videoUrl: null,
    droneImageUrl: null,
    tour3dUrl: null,
    floorPlanUrl: null,
    savedCount: 8,
    savedByUsers: [],
    assignedTo: 'Arjun Kapoor',
    source_sheet: null,
    acquisitionId: 'ACQ-008',
    addedAt: '2026-03-15T08:00:00Z',
    updatedAt: '2026-05-19T09:00:00Z',
    soldAt: null,
    views: 267,
    enquiries: 19,
    visits: 6,
    compareCount: 2,
    launchDate: null,
    advantages: {
      investment: [
        'Land banking on Kanakapura corridor',
        'DC converted clear title',
        'Future residential zoning upside',
      ],
      location: [
        'Kanakapura Road growth belt',
        'Near Art of Living ashram',
        'Scenic outskirts',
      ],
      connectivity: [
        'NH-948 access',
        'Nice Road 20 mins',
        'Jayanagar 45 mins',
      ],
    },
    nearbyPlaces: [
      { name: 'Art of Living Ashram', type: 'restaurant', distance: '6 km' },
      { name: 'Kanakapura Town', type: 'mall', distance: '12 km' },
      { name: 'Nice Road Junction', type: 'highway', distance: '8 km' },
    ],
    possessionDate: 'Ready to Move',
    highlights: ['2 acre parcel', 'Clear title', 'Road frontage'],
  },
  {
    id: 'PROP-211',
    referenceId: 'BG-PROP-2026-211',
    title: 'Farmhouse Estate, Bannerghatta',
    description: 'Sprawling farmhouse with orchard and weekend cottage.',
    type: 'farmhouse',
    status: 'reserved',
    source: 'manual',
    isFeatured: false,
    isUpcoming: false,
    address: 'Gollahalli Gate, Bannerghatta',
    locality: 'Bannerghatta',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560083',
    latitude: 12.8003,
    longitude: 77.577,
    price: 14200000,
    isNegotiable: true,
    specs: {
      builtUpArea: 3500,
      plotArea: 87120,
      plotDimension: '2 acres',
      bedrooms: 4,
      bathrooms: 4,
      facing: 'East',
      age: '5 years',
      furnishing: 'Partially furnished',
    },
    amenities: AMENITIES_BY_TYPE.farmhouse,
    photos: [IMG_VILLA, IMG_PLOT],
    coverPhoto: IMG_VILLA,
    videoUrl: null,
    droneImageUrl: null,
    tour3dUrl: null,
    floorPlanUrl: null,
    savedCount: 8,
    savedByUsers: [],
    assignedTo: 'Priya Admin',
    source_sheet: null,
    acquisitionId: null,
    addedAt: '2026-04-10T08:00:00Z',
    updatedAt: '2026-05-27T11:00:00Z',
    soldAt: null,
    views: 389,
    enquiries: 31,
    visits: 10,
    compareCount: 5,
    launchDate: null,
    advantages: {
      investment: [
        'Bannerghatta farmhouse premium',
        'Weekend rental and events market',
        'Land plus built-up value',
      ],
      location: [
        'Near Bannerghatta National Park',
        'Orchard and green cover',
        'Exclusive gated stretch',
      ],
      connectivity: [
        'Bannerghatta Road access',
        'Nice Road 25 mins',
        'JP Nagar 35 mins',
      ],
    },
    nearbyPlaces: [
      { name: 'Bannerghatta Zoo', type: 'restaurant', distance: '7 km' },
      { name: 'Jain Farms School', type: 'school', distance: '5 km' },
      { name: 'Hulimavu Metro', type: 'metro', distance: '12 km' },
    ],
    possessionDate: 'June 2026',
    highlights: ['Mango orchard', 'Guest cottage', '2 acre estate'],
  },
  {
    id: 'PROP-212',
    referenceId: 'BG-PROP-2026-212',
    title: 'NRI-Ready 2BHK, HSR Layout',
    description: 'RERA-registered apartment with NRI payment plan and PM support.',
    type: 'nri',
    status: 'available',
    source: 'bulk_upload',
    isFeatured: false,
    isUpcoming: false,
    address: 'Block C, Unit 502, Sobha Daffodil',
    locality: 'HSR Layout',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560102',
    latitude: 12.9116,
    longitude: 77.6474,
    price: 9500000,
    isNegotiable: true,
    specs: {
      bhk: '2 BHK',
      builtUpArea: 1280,
      carpetArea: 980,
      floor: '5',
      totalFloors: 12,
      bedrooms: 2,
      bathrooms: 2,
      builderName: 'Sobha Limited',
      towerName: 'Block C',
      unitNumber: '502',
      reraNumber: 'PRM/KA/RERA/1251/446/PR/171113/000891',
      possession: 'Ready to move',
      pricePerSqft: 7422,
      furnishing: 'Unfurnished',
      parking: '1 covered',
    },
    amenities: AMENITIES_BY_TYPE.nri,
    photos: [IMG_APT, IMG_APT],
    coverPhoto: IMG_APT,
    videoUrl: null,
    droneImageUrl: null,
    tour3dUrl: null,
    floorPlanUrl: null,
    savedCount: 8,
    savedByUsers: [],
    assignedTo: 'Arjun Kapoor',
    source_sheet: 'nri_inventory.csv',
    acquisitionId: null,
    addedAt: '2026-03-22T08:00:00Z',
    updatedAt: '2026-05-26T08:00:00Z',
    soldAt: null,
    views: 512,
    enquiries: 58,
    visits: 20,
    compareCount: 10,
    launchDate: null,
    advantages: {
      investment: [
        'HSR Layout steady appreciation',
        'NRI-friendly payment plans',
        'RERA registered security',
      ],
      location: [
        '2 km from HSR metro layout',
        'Near top schools and hospitals',
        'HSR startup ecosystem',
      ],
      connectivity: [
        'HSR BDA metro 2 km',
        'Outer Ring Road 8 mins',
        'Electronic City 25 mins',
      ],
    },
    nearbyPlaces: [
      { name: 'HSR Layout Metro', type: 'metro', distance: '2 km' },
      { name: 'Narayana Health', type: 'hospital', distance: '1.5 km' },
      { name: 'BDA Complex HSR', type: 'mall', distance: '1 km' },
    ],
    possessionDate: 'Ready to Move',
    highlights: ['RERA registered', 'Sobha quality', 'NRI payment plan'],
  },
  {
    id: 'PROP-213',
    referenceId: 'BG-PROP-2026-213',
    title: 'Interior Design Package — Bellandur Villa',
    description:
      'Turnkey interior package for 4BHK villa including modular kitchen and wardrobes.',
    type: 'interior',
    status: 'draft',
    source: 'manual',
    isFeatured: false,
    isUpcoming: false,
    address: 'Villa 12, Adarsh Palm Retreat, Bellandur',
    locality: 'Bellandur',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560103',
    latitude: 12.926,
    longitude: 77.6762,
    price: 2800000,
    isNegotiable: true,
    specs: {
      bhk: '4 BHK',
      builtUpArea: 3800,
      bedrooms: 4,
      bathrooms: 4,
      furnishing: 'Package scope',
      possession: '8 weeks timeline',
    },
    amenities: AMENITIES_BY_TYPE.interior,
    photos: [IMG_APT, IMG_VILLA],
    coverPhoto: IMG_APT,
    videoUrl: null,
    droneImageUrl: null,
    tour3dUrl: null,
    floorPlanUrl: null,
    savedCount: 8,
    savedByUsers: [],
    assignedTo: 'Priya Admin',
    source_sheet: null,
    acquisitionId: null,
    addedAt: '2026-05-15T08:00:00Z',
    updatedAt: '2026-05-28T10:00:00Z',
    soldAt: null,
    views: 156,
    enquiries: 22,
    visits: 5,
    compareCount: 0,
    launchDate: null,
    advantages: {
      investment: [
        'Interior package adds property value',
        'Bellandur rental demand',
        'Turnkey buyer appeal',
      ],
      location: [
        'Adarsh Palm Retreat community',
        'Near Bellandur Lake',
        'ORR tech corridor',
      ],
      connectivity: [
        'Bellandur ORR 5 mins',
        'Marathahalli 10 mins',
        'Kadubeesanahalli metro 8 mins',
      ],
    },
    nearbyPlaces: [
      { name: 'Bellandur Lake', type: 'restaurant', distance: '1 km' },
      { name: 'RMZ Ecospace', type: 'it_park', distance: '3 km' },
      { name: 'Oakridge Bellandur', type: 'school', distance: '2 km' },
    ],
    possessionDate: '8 weeks from booking',
    highlights: ['Modular kitchen', 'Full home package', 'Designer consultation'],
  },
]

export function getPropertyTypeLabel(type: PropertyType): string {
  return TYPE_LABELS[type]
}

export function getStatusBadgeColor(status: PropertyStatus): string {
  return STATUS_COLORS[status]
}

export function getSourceLabel(source: PropertySource): string {
  return SOURCE_LABELS[source]
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
