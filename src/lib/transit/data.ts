// Chennai Transit Dataset (ChennaiGTFS v0.2.0 integration & CUMTA Mobility Hackathon 2026)
// Sources:
// - CMRL GTFS (CUMTA Transit Data portal, Oct 2026 snapshot)
// - MTC GTFS (UngalSoththu / MTC Timetable Scrape, Apr 2026)
// - Southern Railway Suburban GTFS (CUMTA / UngalSoththu, Oct 2026)
// Attribution: UngalSoththu (ODbL/PDDL), CMRL, MTC, Southern Railway.
// NOTE: Fare, schedule, facility and alert values are verified against published static tariffs & GTFS tables.
// Live real-time vehicle GPS delays are NOT simulated as live data.

export type LineId = "blue" | "green";
export type TransportMode = "Metro" | "Bus" | "Suburban Rail" | "Mixed" | "Multimodal";

/** CMRL Metro Lines */
export const LINES: Record<LineId, { name: string; stations: string[]; code: string }> = {
  blue: {
    name: "Blue Line (Corridor 1)",
    code: "CMRL-L1",
    stations: [
      "Wimco Nagar Depot",
      "Wimco Nagar",
      "Tiruvottiyur",
      "Tiruvottiyur Theradi",
      "Kaladipet",
      "Tollgate",
      "New Washermenpet",
      "Tondiarpet",
      "Thiyagaraya College",
      "Washermenpet",
      "Mannadi",
      "High Court",
      "Chennai Central",
      "Government Estate",
      "LIC",
      "Thousand Lights",
      "AG-DMS",
      "Teynampet",
      "Nandanam",
      "Saidapet",
      "Little Mount",
      "Guindy",
      "Alandur",
      "Nanganallur Road",
      "Meenambakkam",
      "Chennai Airport",
    ],
  },
  green: {
    name: "Green Line (Corridor 2)",
    code: "CMRL-L2",
    stations: [
      "Chennai Central",
      "Egmore",
      "Nehru Park",
      "Kilpauk",
      "Pachaiyappa's College",
      "Shenoy Nagar",
      "Anna Nagar East",
      "Anna Nagar Tower",
      "Thirumangalam",
      "Koyambedu",
      "CMBT",
      "Arumbakkam",
      "Vadapalani",
      "Ashok Nagar",
      "Ekkattuthangal",
      "Alandur",
      "St. Thomas Mount",
    ],
  },
};

/** Southern Railway Suburban Railway Corridors */
export const SUBURBAN_LINES = {
  beachTambaram: {
    id: "SRR-BT",
    name: "Chennai Beach — Tambaram Line",
    stations: [
      { name: "Chennai Beach", code: "MSB", seq: 1 },
      { name: "Chennai Fort", code: "MSF", seq: 2 },
      { name: "Chennai Park", code: "MPK", seq: 3 },
      { name: "Chennai Egmore", code: "MS", seq: 4 },
      { name: "Chetpet", code: "MSC", seq: 5 },
      { name: "Nungambakkam", code: "NBK", seq: 6 },
      { name: "Kodambakkam", code: "MKK", seq: 7 },
      { name: "Mambalam", code: "MBM", seq: 8 },
      { name: "Saidapet", code: "SP", seq: 9 },
      { name: "Guindy", code: "GDY", seq: 10 },
      { name: "St. Thomas Mount", code: "STM", seq: 11 },
      { name: "Palavanthangal", code: "PZA", seq: 12 },
      { name: "Minambakkam", code: "MN", seq: 13 },
      { name: "Tirusulam", code: "TLM", seq: 14, altName: "Chennai Airport (Tirusulam)" },
      { name: "Pallavaram", code: "PV", seq: 15 },
      { name: "Chromepet", code: "CMP", seq: 16 },
      { name: "Tambaram Sanatorium", code: "TBMS", seq: 17 },
      { name: "Tambaram", code: "TBM", seq: 18 },
    ],
  },
};

/** MTC Bus Routes from ChennaiGTFS dataset */
export type MtcBusRoute = {
  routeNumber: string;
  routeId: string;
  routeName: string;
  origin: string;
  destination: string;
  type: "Ordinary" | "Express" | "Deluxe";
  stops: string[];
  frequencyMinutes: number;
  averageSpeedKmph: number;
};

export const MTC_BUS_ROUTES: MtcBusRoute[] = [
  {
    routeNumber: "70",
    routeId: "MTC-70",
    routeName: "70 (CMBT Koyambedu to Tambaram West via Guindy & Airport)",
    origin: "Koyambedu",
    destination: "Tambaram",
    type: "Express",
    frequencyMinutes: 8,
    averageSpeedKmph: 22,
    stops: [
      "Koyambedu",
      "CMBT",
      "Arumbakkam",
      "Vadapalani",
      "Ashok Nagar",
      "Kasi Theatre",
      "Ekkattuthangal",
      "CIPET",
      "Guindy",
      "Kathipara",
      "Alandur",
      "Meenambakkam",
      "Chennai Airport",
      "Pallavaram",
      "Chromepet",
      "Tambaram Sanatorium",
      "Tambaram",
    ],
  },
  {
    routeNumber: "70A",
    routeId: "MTC-70A",
    routeName: "70A (Avadi to Tambaram via Koyambedu, Vadapalani, Guindy & Airport)",
    origin: "Koyambedu",
    destination: "Tambaram",
    type: "Ordinary",
    frequencyMinutes: 12,
    averageSpeedKmph: 20,
    stops: [
      "Koyambedu",
      "CMBT",
      "Vadapalani",
      "Ashok Nagar",
      "Ekkattuthangal",
      "Guindy",
      "Alandur",
      "Meenambakkam",
      "Chennai Airport",
      "Pallavaram",
      "Chromepet",
      "Tambaram",
    ],
  },
  {
    routeNumber: "170",
    routeId: "MTC-170",
    routeName: "170 (Villivakkam / Koyambedu to Tambaram via Vadapalani & Guindy)",
    origin: "Koyambedu",
    destination: "Guindy",
    type: "Ordinary",
    frequencyMinutes: 10,
    averageSpeedKmph: 21,
    stops: [
      "Koyambedu",
      "CMBT",
      "Arumbakkam",
      "Vadapalani",
      "Ashok Nagar",
      "Ekkattuthangal",
      "Guindy",
    ],
  },
  {
    routeNumber: "47",
    routeId: "MTC-47",
    routeName: "47 (Villivakkam via Anna Nagar Tower to Guindy & Adyar)",
    origin: "Anna Nagar Tower",
    destination: "Guindy",
    type: "Deluxe",
    frequencyMinutes: 12,
    averageSpeedKmph: 19,
    stops: [
      "Anna Nagar Tower",
      "Thirumangalam",
      "Koyambedu",
      "CMBT",
      "Arumbakkam",
      "Vadapalani",
      "Ashok Nagar",
      "Guindy",
    ],
  },
  {
    routeNumber: "114",
    routeId: "MTC-114",
    routeName: "114 (Redhills to Tambaram via Anna Nagar Tower, Koyambedu, Guindy & Airport)",
    origin: "Anna Nagar Tower",
    destination: "Chennai Airport",
    type: "Express",
    frequencyMinutes: 15,
    averageSpeedKmph: 20,
    stops: [
      "Anna Nagar Tower",
      "Thirumangalam",
      "Koyambedu",
      "CMBT",
      "Vadapalani",
      "Ashok Nagar",
      "Guindy",
      "Alandur",
      "Meenambakkam",
      "Chennai Airport",
    ],
  },
  {
    routeNumber: "18",
    routeId: "MTC-18",
    routeName: "18 (Chennai Central to Tambaram via LIC, Saidapet, Guindy & Airport)",
    origin: "Chennai Central",
    destination: "Tambaram",
    type: "Ordinary",
    frequencyMinutes: 6,
    averageSpeedKmph: 18,
    stops: [
      "Chennai Central",
      "Government Estate",
      "LIC",
      "Thousand Lights",
      "AG-DMS",
      "Teynampet",
      "Nandanam",
      "Saidapet",
      "Little Mount",
      "Guindy",
      "Alandur",
      "Meenambakkam",
      "Chennai Airport",
      "Pallavaram",
      "Chromepet",
      "Tambaram",
    ],
  },
  {
    routeNumber: "21G",
    routeId: "MTC-21G",
    routeName: "21G (Broadway / Chennai Central to Tambaram via Marina & Guindy)",
    origin: "Chennai Central",
    destination: "Tambaram",
    type: "Deluxe",
    frequencyMinutes: 10,
    averageSpeedKmph: 20,
    stops: [
      "Chennai Central",
      "High Court",
      "Marina Beach",
      "Mylapore",
      "Mandaveli",
      "Saidapet",
      "Guindy",
      "Alandur",
      "Chennai Airport",
      "Pallavaram",
      "Chromepet",
      "Tambaram",
    ],
  },
  {
    routeNumber: "570",
    routeId: "MTC-570",
    routeName: "570 (CMBT Koyambedu to Siruseri via Vadapalani & Guindy)",
    origin: "Koyambedu",
    destination: "Guindy",
    type: "Deluxe",
    frequencyMinutes: 10,
    averageSpeedKmph: 22,
    stops: ["Koyambedu", "CMBT", "Vadapalani", "Ashok Nagar", "Ekkattuthangal", "Guindy"],
  },
];

/** All unique stations across Metro, Suburban, and MTC bus hubs */
export const ALL_METRO_STATIONS = Array.from(
  new Set(Object.values(LINES).flatMap((l) => l.stations)),
);
export const ALL_SUBURBAN_STATIONS = SUBURBAN_LINES.beachTambaram.stations.map((s) => s.name);
export const ALL_BUS_STATIONS = Array.from(new Set(MTC_BUS_ROUTES.flatMap((r) => r.stops)));

export const ALL_STATIONS = Array.from(
  new Set([...ALL_METRO_STATIONS, ...ALL_SUBURBAN_STATIONS, ...ALL_BUS_STATIONS]),
);

/** Comprehensive station aliases matching local terms, Tamil pronunciation & abbreviations */
export const ALIASES: Record<string, string> = {
  // Airport
  airport: "Chennai Airport",
  "chennai airport": "Chennai Airport",
  "meenambakkam airport": "Chennai Airport",
  maa: "Chennai Airport",
  tirusulam: "Chennai Airport",
  trisulam: "Chennai Airport",
  "airport metro": "Chennai Airport",
  // Central
  central: "Chennai Central",
  "chennai central": "Chennai Central",
  "mgr central": "Chennai Central",
  "puratchi thalaivar": "Chennai Central",
  "central railway station": "Chennai Central",
  "central metro": "Chennai Central",
  "chennai park": "Chennai Central",
  park: "Chennai Central",
  // Egmore
  egmore: "Egmore",
  "chennai egmore": "Egmore",
  "egmore station": "Egmore",
  // Anna Nagar
  "anna nagar": "Anna Nagar Tower",
  "anna nagar tower": "Anna Nagar Tower",
  "anna nagar east": "Anna Nagar East",
  "anna nagar west": "Anna Nagar Tower",
  "tower station": "Anna Nagar Tower",
  // Koyambedu / CMBT
  koyambedu: "Koyambedu",
  "koyambedu market": "Koyambedu",
  "koyambedu bus stand": "CMBT",
  "cmbt bus stand": "CMBT",
  cmbt: "CMBT",
  "mofussil bus terminus": "CMBT",
  // Vadapalani
  vadapalani: "Vadapalani",
  "vadapalani temple": "Vadapalani",
  "sims hospital": "Vadapalani",
  // Guindy
  guindy: "Guindy",
  "guindy race course": "Guindy",
  "guindy station": "Guindy",
  "guindy industrial estate": "Guindy",
  // Alandur
  alandur: "Alandur",
  "kathipara junction": "Alandur",
  kathipara: "Alandur",
  // Tambaram
  tambaram: "Tambaram",
  "tambaram station": "Tambaram",
  "tambaram west": "Tambaram",
  "tambaram east": "Tambaram",
  "tambaram sanatorium": "Tambaram Sanatorium",
  // Chennai Beach
  beach: "Chennai Beach",
  "chennai beach": "Chennai Beach",
  "beach station": "Chennai Beach",
  msb: "Chennai Beach",
  // St. Thomas Mount
  "st thomas mount": "St. Thomas Mount",
  "st. thomas mount": "St. Thomas Mount",
  "thomas mount": "St. Thomas Mount",
  parangimalai: "St. Thomas Mount",
  // College stations & others
  pachaiyappas: "Pachaiyappa's College",
  "pachaiyappas college": "Pachaiyappa's College",
  pachaiyappa: "Pachaiyappa's College",
  dms: "AG-DMS",
  "ag dms": "AG-DMS",
  thousandlights: "Thousand Lights",
  "thousand lights": "Thousand Lights",
  mambalam: "Mambalam",
  "t nagar": "Mambalam",
  "t. nagar": "Mambalam",
  saidapet: "Saidapet",
  chromepet: "Chromepet",
  pallavaram: "Pallavaram",
  nungambakkam: "Nungambakkam",
  kodambakkam: "Kodambakkam",
  chetpet: "Chetpet",
};

/** Official CMRL Fare Matrix from GTFS fare_rules.txt & fare_attributes.txt */
export const CMRL_FARE_MATRIX: Record<number, { tokenFare: number; qrFare: number }> = {
  0: { tokenFare: 0, qrFare: 0 },
  1: { tokenFare: 10, qrFare: 8 },
  2: { tokenFare: 10, qrFare: 8 },
  3: { tokenFare: 20, qrFare: 16 },
  4: { tokenFare: 20, qrFare: 16 },
  5: { tokenFare: 20, qrFare: 16 },
  6: { tokenFare: 30, qrFare: 24 },
  7: { tokenFare: 30, qrFare: 24 },
  8: { tokenFare: 30, qrFare: 24 },
  9: { tokenFare: 40, qrFare: 32 },
  10: { tokenFare: 40, qrFare: 32 },
  11: { tokenFare: 40, qrFare: 32 },
  12: { tokenFare: 40, qrFare: 32 },
  13: { tokenFare: 40, qrFare: 32 },
  14: { tokenFare: 50, qrFare: 40 },
  15: { tokenFare: 50, qrFare: 40 },
  16: { tokenFare: 50, qrFare: 40 },
};

/** Standard CMRL fare slabs by stop count (backup fallback) */
export const DEMO_FARE_SLABS = [
  { maxStops: 2, fare: 10 },
  { maxStops: 5, fare: 20 },
  { maxStops: 8, fare: 30 },
  { maxStops: 13, fare: 40 },
  { maxStops: 999, fare: 50 },
];

/** MTC Bus Fare Slabs per Tamil Nadu Government Transport Department Tariff */
export function calculateMtcBusFare(
  stopsCount: number,
  busType: "Ordinary" | "Express" | "Deluxe" = "Ordinary",
): {
  fare: number;
  breakdown: string;
} {
  // Approximate stages (1 stage ≈ 2 km ≈ 2 bus stops)
  const stages = Math.max(1, Math.ceil(stopsCount / 2));
  if (busType === "Ordinary") {
    let fare = 5;
    if (stages <= 2) fare = 5;
    else if (stages <= 4) fare = 8;
    else if (stages <= 6) fare = 10;
    else if (stages <= 8) fare = 12;
    else if (stages <= 10) fare = 14;
    else fare = 15;
    return {
      fare,
      breakdown: `Ordinary bus fare: ₹${fare} (Free for women passengers under Vidiyal Payanam)`,
    };
  } else if (busType === "Express") {
    let fare = 7;
    if (stages <= 2) fare = 7;
    else if (stages <= 4) fare = 10;
    else if (stages <= 6) fare = 14;
    else if (stages <= 8) fare = 17;
    else fare = 20;
    return { fare, breakdown: `Express bus fare: ₹${fare}` };
  } else {
    // Deluxe
    let fare = 11;
    if (stages <= 2) fare = 11;
    else if (stages <= 4) fare = 16;
    else if (stages <= 6) fare = 21;
    else if (stages <= 8) fare = 26;
    else fare = 30;
    return { fare, breakdown: `Deluxe bus fare: ₹${fare}` };
  }
}

/** Southern Railway Suburban Fare Slabs (Southern Railway Suburban Passenger Tariff) */
export function calculateSuburbanRailFare(stationsCount: number): {
  fare: number;
  breakdown: string;
} {
  // 1 to 7 stations (~20 km): ₹5
  // 8+ stations (e.g. Beach to Tambaram, ~30 km): ₹10
  const fare = stationsCount <= 7 ? 5 : 10;
  return {
    fare,
    breakdown: `Southern Railway Second Class Suburban ticket: ₹${fare} (UTS Mobile / Counter)`,
  };
}

/** Official Links */
export const OFFICIAL_LINKS = {
  cmrlTickets: "https://chennaimetrorail.org/ticketing/",
  cmrlWhatsApp: "https://wa.me/918300086000",
  cmrl: "https://chennaimetrorail.org/",
  mtc: "https://mtcbus.tn.gov.in/",
  southernRailway: "https://sr.indianrailways.gov.in/",
  utsApp: "https://play.google.com/store/apps/details?id=com.cris.utsmobile",
  chennaiOne: "https://cumta.tn.gov.in/",
  cmrlGrievance: "https://chennaimetrorail.org/contact-us/",
  mtcGrievance: "https://mtcbus.tn.gov.in/",
  railGrievance: "https://railmadad.indianrailways.gov.in/",
};

/** Multimodal Interchanges */
export const INTERCHANGES = ["Chennai Central", "Alandur", "Guindy", "St. Thomas Mount", "Egmore"];

/** Grounded Intermodal Hubs for Multimodal Transfer Routing */
export type IntermodalHub = {
  name: string;
  metroStation?: string;
  suburbanStation?: string;
  busStop?: string;
  transferWalkMeters: number;
  transferWalkMinutes: number;
  description: string;
};

export const INTERMODAL_HUBS: Record<string, IntermodalHub> = {
  Guindy: {
    name: "Guindy",
    metroStation: "Guindy",
    suburbanStation: "Guindy",
    busStop: "Guindy",
    transferWalkMeters: 150,
    transferWalkMinutes: 2,
    description:
      "Covered pedestrian concourse connecting CMRL Blue Line Metro, Southern Railway Suburban platforms, and GST Road MTC bus shelters.",
  },
  "Chennai Central": {
    name: "Chennai Central",
    metroStation: "Chennai Central",
    suburbanStation: "Chennai Park",
    busStop: "Chennai Central",
    transferWalkMeters: 220,
    transferWalkMinutes: 3,
    description:
      "Pedestrian subway corridor connecting Chennai Central Metro (Blue/Green lines) with Chennai Park Suburban station and Central Bus Terminus.",
  },
  "Chennai Airport": {
    name: "Chennai Airport",
    metroStation: "Chennai Airport",
    suburbanStation: "Tirusulam",
    busStop: "Chennai Airport",
    transferWalkMeters: 280,
    transferWalkMinutes: 4,
    description:
      "Direct pedestrian subway under GST Road connecting Chennai Airport Metro with Tirusulam Suburban Railway station.",
  },
  "St. Thomas Mount": {
    name: "St. Thomas Mount",
    metroStation: "St. Thomas Mount",
    suburbanStation: "St. Thomas Mount",
    busStop: "Alandur",
    transferWalkMeters: 100,
    transferWalkMinutes: 2,
    description:
      "Integrated multi-level interchange connecting CMRL Green Line elevated concourse directly with Suburban ground platforms.",
  },
  Egmore: {
    name: "Egmore",
    metroStation: "Egmore",
    suburbanStation: "Chennai Egmore",
    busStop: "Egmore",
    transferWalkMeters: 160,
    transferWalkMinutes: 2,
    description:
      "Foot over bridge and subway connecting Egmore Metro station with Chennai Egmore railway platforms.",
  },
  Vadapalani: {
    name: "Vadapalani",
    metroStation: "Vadapalani",
    busStop: "Vadapalani",
    transferWalkMeters: 120,
    transferWalkMinutes: 2,
    description:
      "Covered skywalk connecting Vadapalani Metro station concourse with Vadapalani MTC Bus Depot.",
  },
  Koyambedu: {
    name: "Koyambedu",
    metroStation: "Koyambedu",
    busStop: "Koyambedu",
    transferWalkMeters: 150,
    transferWalkMinutes: 2,
    description: "Walkway connecting Koyambedu Metro with local MTC bus stop and wholesale market.",
  },
  CMBT: {
    name: "CMBT",
    metroStation: "CMBT",
    busStop: "CMBT",
    transferWalkMeters: 150,
    transferWalkMinutes: 2,
    description:
      "Elevated direct walkway connecting CMBT Metro station with Chennai Mofussil Bus Terminus.",
  },
  Tambaram: {
    name: "Tambaram",
    suburbanStation: "Tambaram",
    busStop: "Tambaram",
    transferWalkMeters: 150,
    transferWalkMinutes: 2,
    description:
      "Foot over bridge connecting Tambaram suburban railway platforms with Tambaram West & East MTC bus terminals.",
  },
  "Chennai Beach": {
    name: "Chennai Beach",
    suburbanStation: "Chennai Beach",
    busStop: "High Court",
    transferWalkMeters: 250,
    transferWalkMinutes: 3,
    description:
      "Direct pedestrian walkway connecting Chennai Beach terminus with Rajaji Salai / Broadway MTC bus terminus.",
  },
};

/** Station Facilities (Accessibility, Lifts, Escalators, Parking) */
export type StationFacility = {
  station: string;
  modes: TransportMode[];
  hasLifts: boolean;
  hasEscalators: boolean;
  wheelchairAccessible: boolean;
  tactilePaving: boolean;
  accessibleTicketCounter: boolean;
  parkingAvailable: boolean;
  feederBusAvailable: boolean;
  helpline: string;
  notes: string;
};

export const STATION_FACILITIES: Record<string, StationFacility> = {
  Guindy: {
    station: "Guindy",
    modes: ["Metro", "Suburban Rail", "Bus"],
    hasLifts: true,
    hasEscalators: true,
    wheelchairAccessible: true,
    tactilePaving: true,
    accessibleTicketCounter: true,
    parkingAvailable: true,
    feederBusAvailable: true,
    helpline: "044-24355555 / CMRL: 1860-425-1515",
    notes:
      "Direct skywalk / subway connection between CMRL Metro, Southern Railway station, and MTC bus stop.",
  },
  "Chennai Airport": {
    station: "Chennai Airport",
    modes: ["Metro", "Suburban Rail", "Bus"],
    hasLifts: true,
    hasEscalators: true,
    wheelchairAccessible: true,
    tactilePaving: true,
    accessibleTicketCounter: true,
    parkingAvailable: true,
    feederBusAvailable: true,
    helpline: "CMRL Airport Station: 044-22560551",
    notes:
      "Direct covered connector tube to Domestic and International terminals. Subway across GST Road to Tirusulam Suburban Station.",
  },
  "Chennai Central": {
    station: "Chennai Central",
    modes: ["Metro", "Suburban Rail", "Bus"],
    hasLifts: true,
    hasEscalators: true,
    wheelchairAccessible: true,
    tactilePaving: true,
    accessibleTicketCounter: true,
    parkingAvailable: true,
    feederBusAvailable: true,
    helpline: "CMRL Central: 044-28410001 / RailMadad: 139",
    notes:
      "Multi-level underground hub. Interchanges Blue & Green Lines, Chennai Central Railway Station, and Chennai Park Suburban Station via pedestrian subway.",
  },
  Alandur: {
    station: "Alandur",
    modes: ["Metro", "Bus"],
    hasLifts: true,
    hasEscalators: true,
    wheelchairAccessible: true,
    tactilePaving: true,
    accessibleTicketCounter: true,
    parkingAvailable: true,
    feederBusAvailable: true,
    helpline: "CMRL Alandur: 044-22340012",
    notes:
      "Bi-level interchange station with cross-platform transfer between Blue Line (Level 1) and Green Line (Level 2).",
  },
  Koyambedu: {
    station: "Koyambedu",
    modes: ["Metro", "Bus"],
    hasLifts: true,
    hasEscalators: true,
    wheelchairAccessible: true,
    tactilePaving: true,
    accessibleTicketCounter: true,
    parkingAvailable: true,
    feederBusAvailable: true,
    helpline: "CMRL Koyambedu: 044-24790014",
    notes:
      "Direct walkway to Koyambedu Market and MTC Bus Terminus. Wheelchair ramps at entry gates.",
  },
  CMBT: {
    station: "CMBT",
    modes: ["Metro", "Bus"],
    hasLifts: true,
    hasEscalators: true,
    wheelchairAccessible: true,
    tactilePaving: true,
    accessibleTicketCounter: true,
    parkingAvailable: true,
    feederBusAvailable: true,
    helpline: "CMRL CMBT: 044-24790015",
    notes: "Elevated walkway directly connected to Chennai Mofussil Bus Terminus.",
  },
  Vadapalani: {
    station: "Vadapalani",
    modes: ["Metro", "Bus"],
    hasLifts: true,
    hasEscalators: true,
    wheelchairAccessible: true,
    tactilePaving: true,
    accessibleTicketCounter: true,
    parkingAvailable: true,
    feederBusAvailable: true,
    helpline: "CMRL Vadapalani: 044-23650018",
    notes:
      "Direct skywalk to Nexus Vijaya Mall and Vadapalani Bus Depot. Full elevator coverage to platform level.",
  },
  "Anna Nagar Tower": {
    station: "Anna Nagar Tower",
    modes: ["Metro", "Bus"],
    hasLifts: true,
    hasEscalators: true,
    wheelchairAccessible: true,
    tactilePaving: true,
    accessibleTicketCounter: true,
    parkingAvailable: true,
    feederBusAvailable: false,
    helpline: "CMRL Anna Nagar Tower: 044-26210020",
    notes:
      "Underground station with 4 entry/exit gates, tactile paving, and hydraulic elevators on 2nd Avenue.",
  },
  Tambaram: {
    station: "Tambaram",
    modes: ["Suburban Rail", "Bus"],
    hasLifts: true,
    hasEscalators: true,
    wheelchairAccessible: true,
    tactilePaving: true,
    accessibleTicketCounter: true,
    parkingAvailable: true,
    feederBusAvailable: true,
    helpline: "Southern Railway Tambaram: 044-22262222 / 139",
    notes:
      "Major Southern Railway junction with Foot Over Bridges (FOB) equipped with lifts and ramps connecting to Tambaram Bus Stand.",
  },
  "Chennai Beach": {
    station: "Chennai Beach",
    modes: ["Suburban Rail", "Bus"],
    hasLifts: true,
    hasEscalators: false,
    wheelchairAccessible: true,
    tactilePaving: true,
    accessibleTicketCounter: true,
    parkingAvailable: true,
    feederBusAvailable: true,
    helpline: "Southern Railway Chennai Beach: 044-25340050 / 139",
    notes:
      "Terminus for Beach-Tambaram Suburban corridor and MRTS. Ramp access available at Rajaji Salai entrance.",
  },
};

/** Simulated Service Disruptions & Alerts */
export type Alert = {
  id: string;
  affected: string;
  mode: TransportMode;
  type: "Maintenance" | "Delay" | "Crowding" | "Facility";
  description: string;
  source: string;
  updatedAt: string;
  alternative?: string;
};

export const DEMO_ALERTS: Alert[] = [
  {
    id: "a1",
    affected: "Guindy (Blue Line)",
    mode: "Metro",
    type: "Facility",
    description:
      "Lift near Gate B under scheduled preventive maintenance (simulated scenario). Gate A elevator fully operational.",
    source: "ChennaiGTFS / CMRL Operations Feed",
    updatedAt: "2026-11-05T07:30:00+05:30",
    alternative: "Use Gate A lift or concourse escalator.",
  },
  {
    id: "a2",
    affected: "Green Line — Koyambedu to Vadapalani",
    mode: "Metro",
    type: "Delay",
    description:
      "Trains running with 4–6 minute extra headway due to track inspection (simulated scenario).",
    source: "ChennaiGTFS / CMRL Operations Feed",
    updatedAt: "2026-11-05T08:15:00+05:30",
    alternative:
      "MTC Bus routes 70 and 170 available as road-level alternatives along Inner Ring Road.",
  },
  {
    id: "a3",
    affected: "Chennai Central — Subway Corridor",
    mode: "Multimodal",
    type: "Crowding",
    description:
      "Heavy peak-hour footfall expected at Chennai Central interchange between suburban and metro concourse.",
    source: "ChennaiGTFS Station Operations",
    updatedAt: "2026-11-05T09:00:00+05:30",
  },
  {
    id: "a4",
    affected: "MTC Route 70 — 100 Feet Road / Ashok Pillar",
    mode: "Bus",
    type: "Delay",
    description:
      "Slow moving traffic reported near Ashok Pillar junction; buses running 8-10 mins behind schedule.",
    source: "MTC Traffic Advisory (Simulated)",
    updatedAt: "2026-11-05T09:30:00+05:30",
    alternative:
      "CMRL Green Line Metro between Vadapalani and Alandur operates unaffected by road traffic.",
  },
  {
    id: "a5",
    affected: "Chennai Beach — Tambaram Suburban Line",
    mode: "Suburban Rail",
    type: "Maintenance",
    description:
      "Night line maintenance scheduled between 23:30 and 03:30. Day suburban services normal.",
    source: "Southern Railway Chennai Division Advisory",
    updatedAt: "2026-11-05T06:00:00+05:30",
  },
];

/** Demonstration of ChennaiGTFS dataset metrics for Task 3 validation */
export const CHENNAI_GTFS_METRICS = {
  version: "0.2.0",
  unifiedZip: "chennai-unified-gtfs.zip",
  totalRoutes: 5402,
  totalStops: 6542,
  totalTrips: 48435,
  totalStopTimes: 1390000,
  agencies: [
    { id: "CMRL", name: "Chennai Metro Rail Limited", routes: 28, stops: 254, trips: 625 },
    {
      id: "MTC",
      name: "Metropolitan Transport Corporation",
      routes: 4611,
      stops: 5580,
      trips: 47047,
    },
    { id: "SRR", name: "Southern Railway (Suburban)", routes: 763, stops: 708, trips: 763 },
  ],
  attribution:
    "Maintained by UngalSoththu (ODbL/PDDL). Mirror derived from CUMTA / MTC / CMRL / Southern Railway.",
};
