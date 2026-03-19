const REGION_CATALOG = [
  {
    key: "global",
    label: "Global",
    lat: 18,
    lon: 0
  },
  {
    key: "north-america",
    label: "North America",
    lat: 39.8283,
    lon: -98.5795,
    keywords: ["north america", "usa", "u.s.", "united states", "canada"]
  },
  {
    key: "europe",
    label: "Europe",
    lat: 50.1109,
    lon: 8.6821,
    keywords: ["europe", "uk", "united kingdom", "germany", "france", "netherlands", "poland", "ukraine"]
  },
  {
    key: "apac",
    label: "APAC",
    lat: 1.3521,
    lon: 103.8198,
    keywords: ["asia", "apac", "japan", "singapore", "australia", "india", "china", "taiwan"]
  },
  {
    key: "latam",
    label: "LATAM",
    lat: -23.5505,
    lon: -46.6333,
    keywords: ["latam", "south america", "brazil", "mexico", "argentina", "colombia"]
  },
  {
    key: "middle-east-africa",
    label: "Middle East & Africa",
    lat: 25.2048,
    lon: 55.2708,
    keywords: ["middle east", "africa", "uae", "israel", "saudi", "qatar", "egypt"]
  }
];

const VENDOR_HQ = {
  Microsoft: { lat: 47.6426, lon: -122.1366, precision: "vendor-hq", region: "North America" },
  Google: { lat: 37.422, lon: -122.0841, precision: "vendor-hq", region: "North America" },
  Cloudflare: { lat: 37.7749, lon: -122.4194, precision: "vendor-hq", region: "North America" },
  Cisco: { lat: 37.3875, lon: -121.9636, precision: "vendor-hq", region: "North America" },
  Fortinet: { lat: 37.3875, lon: -121.9636, precision: "vendor-hq", region: "North America" },
  "Palo Alto Networks": { lat: 37.4419, lon: -122.143, precision: "vendor-hq", region: "North America" },
  VMware: { lat: 37.4043, lon: -122.0719, precision: "vendor-hq", region: "North America" },
  Broadcom: { lat: 37.4024, lon: -121.9797, precision: "vendor-hq", region: "North America" },
  GitHub: { lat: 37.7825, lon: -122.393, precision: "vendor-hq", region: "North America" },
  OpenAI: { lat: 37.7749, lon: -122.4194, precision: "vendor-hq", region: "North America" },
  Slack: { lat: 37.7749, lon: -122.4194, precision: "vendor-hq", region: "North America" },
  Discord: { lat: 37.7749, lon: -122.4194, precision: "vendor-hq", region: "North America" },
  Atlassian: { lat: -33.8688, lon: 151.2093, precision: "vendor-hq", region: "APAC" },
  Heroku: { lat: 37.7749, lon: -122.4194, precision: "vendor-hq", region: "North America" },
  Okta: { lat: 37.3349, lon: -121.8881, precision: "vendor-hq", region: "North America" },
  Ivanti: { lat: 40.7608, lon: -111.891, precision: "vendor-hq", region: "North America" },
  Citrix: { lat: 26.1224, lon: -80.1373, precision: "vendor-hq", region: "North America" },
  Zimbra: { lat: 37.3382, lon: -121.8863, precision: "vendor-hq", region: "North America" }
};

function inferVictimRegion(textValue) {
  const text = String(textValue || "").toLowerCase();
  const region = REGION_CATALOG.find((entry) => Array.isArray(entry.keywords) && entry.keywords.some((keyword) => text.includes(keyword)));
  return region ? region.label : "";
}

function resolveRegionProfile(victimRegion) {
  const normalized = String(victimRegion || "").toLowerCase();
  return REGION_CATALOG.find((entry) => String(entry.label).toLowerCase() === normalized) || REGION_CATALOG[0];
}

function resolveGeo({ vendor, victimRegion, latitude, longitude }) {
  const parsedLat = Number.parseFloat(latitude);
  const parsedLon = Number.parseFloat(longitude);
  if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon)) {
    return {
      latitude: parsedLat,
      longitude: parsedLon,
      geoPrecision: "reported"
    };
  }

  if (victimRegion) {
    const region = resolveRegionProfile(victimRegion);
    return {
      latitude: region.lat,
      longitude: region.lon,
      geoPrecision: "region"
    };
  }

  if (vendor && VENDOR_HQ[vendor]) {
    return {
      latitude: VENDOR_HQ[vendor].lat,
      longitude: VENDOR_HQ[vendor].lon,
      geoPrecision: VENDOR_HQ[vendor].precision
    };
  }

  const fallback = REGION_CATALOG[0];
  return {
    latitude: fallback.lat,
    longitude: fallback.lon,
    geoPrecision: "global"
  };
}

module.exports = {
  inferVictimRegion,
  resolveGeo
};
