const path = require("path");

const ROOT = process.cwd();

const PANEL_KEYS = {
  CLUSTERS: "clusters",
  PRIORITY: "priority",
  INTEL: "intel",
  OUTAGES: "outages"
};

const PANEL_DEFINITIONS = {
  [PANEL_KEYS.CLUSTERS]: {
    key: PANEL_KEYS.CLUSTERS,
    title: "Correlated Incidents",
    description: "Conservative multi-source clusters",
    limit: 48
  },
  [PANEL_KEYS.PRIORITY]: {
    key: PANEL_KEYS.PRIORITY,
    title: "Priority Vulnerabilities",
    description: "Actively exploited CVEs, NVD, and vendor advisories",
    limit: 160
  },
  [PANEL_KEYS.INTEL]: {
    key: PANEL_KEYS.INTEL,
    title: "Intel & Advisories",
    description: "Security reporting, CISA alerts, and analyst coverage",
    limit: 140
  },
  [PANEL_KEYS.OUTAGES]: {
    key: PANEL_KEYS.OUTAGES,
    title: "Service Disruptions",
    description: "Operational incidents and public outage feeds",
    limit: 120
  }
};

const OUTPUT_PATHS = {
  dataDir: path.resolve(ROOT, "data"),
  rawDir: path.resolve(ROOT, "data/raw"),
  normalizedDir: path.resolve(ROOT, "data/normalized"),
  correlatedDir: path.resolve(ROOT, "data/correlated"),
  legacy: {
    priority: path.resolve(ROOT, "data/kev.json"),
    intel: path.resolve(ROOT, "data/news.json"),
    outages: path.resolve(ROOT, "data/outages.json"),
    clusters: path.resolve(ROOT, "data/clusters.json"),
    map: path.resolve(ROOT, "data/map.correlated.json"),
    metadata: path.resolve(ROOT, "data/feed-metadata.json"),
    health: path.resolve(ROOT, "data/feed-health.json")
  },
  normalized: {
    events: path.resolve(ROOT, "data/normalized/events.json"),
    summary: path.resolve(ROOT, "data/normalized/summary.json")
  },
  correlated: {
    incidents: path.resolve(ROOT, "data/correlated/incidents.json"),
    map: path.resolve(ROOT, "data/correlated/map.json"),
    dashboard: path.resolve(ROOT, "data/correlated/dashboard.json"),
    dashboardSample: path.resolve(ROOT, "data/correlated/dashboard.sample.json")
  },
  samples: {
    priority: path.resolve(ROOT, "data/kev.sample.json"),
    intel: path.resolve(ROOT, "data/news.sample.json"),
    outages: path.resolve(ROOT, "data/outages.sample.json"),
    map: path.resolve(ROOT, "data/map.overlays.sample.json")
  }
};

const SOURCE_REGISTRY = [
  {
    key: "cisa_kev",
    label: "CISA KEV",
    adapter: "cisaKev",
    panel: PANEL_KEYS.PRIORITY,
    category: "vulnerability",
    sourceType: "official-catalog",
    url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    freshnessHours: 48,
    enabled: true
  },
  {
    key: "nvd_recent",
    label: "NVD Recent CVEs",
    adapter: "nvdRecent",
    panel: PANEL_KEYS.PRIORITY,
    category: "vulnerability",
    sourceType: "national-vulnerability-database",
    url: "https://services.nvd.nist.gov/rest/json/cves/2.0",
    freshnessHours: 24,
    enabled: true
  },
  {
    key: "msrc_updates",
    label: "Microsoft Security Update Guide",
    adapter: "msrcUpdates",
    panel: PANEL_KEYS.PRIORITY,
    category: "advisory",
    sourceType: "vendor-advisory",
    url: "https://api.msrc.microsoft.com/cvrf/v3.0/updates/",
    freshnessHours: 720,
    enabled: true
  },
  {
    key: "fortinet_psirt",
    label: "Fortinet PSIRT",
    adapter: "genericRss",
    panel: PANEL_KEYS.PRIORITY,
    category: "advisory",
    sourceType: "vendor-advisory",
    url: "https://fortiguard.fortinet.com/rss/ir.xml",
    freshnessHours: 72,
    enabled: true,
    vendor: "Fortinet"
  },
  {
    key: "paloalto_advisories",
    label: "Palo Alto Security Advisories",
    adapter: "paloAltoJson",
    panel: PANEL_KEYS.PRIORITY,
    category: "advisory",
    sourceType: "vendor-advisory",
    url: "https://security.paloaltonetworks.com/json?severity=CRITICAL&severity=HIGH&sort=-updated",
    freshnessHours: 72,
    enabled: true,
    vendor: "Palo Alto Networks"
  },
  {
    key: "cisco_openvuln",
    label: "Cisco PSIRT openVuln",
    adapter: "stub",
    panel: PANEL_KEYS.PRIORITY,
    category: "advisory",
    sourceType: "vendor-advisory",
    url: "https://developer.cisco.com/docs/psirt/",
    freshnessHours: 72,
    enabled: false,
    stubReason: "Cisco openVuln is intentionally disabled by default because it requires API credentials."
  },
  {
    key: "broadcom_vmware",
    label: "Broadcom / VMware Advisories",
    adapter: "stub",
    panel: PANEL_KEYS.PRIORITY,
    category: "advisory",
    sourceType: "vendor-advisory",
    url: "https://broadcom.com/support/security-center",
    freshnessHours: 168,
    enabled: false,
    stubReason: "Broadcom / VMware advisory collection is stubbed because public machine-readable access is inconsistent."
  },
  {
    key: "cisa_advisories",
    label: "CISA Alerts & Advisories",
    adapter: "genericRss",
    panel: PANEL_KEYS.INTEL,
    category: "advisory",
    sourceType: "official-advisory",
    url: "https://www.cisa.gov/cybersecurity-advisories/all.xml",
    freshnessHours: 48,
    enabled: true
  },
  {
    key: "bleepingcomputer",
    label: "BleepingComputer",
    adapter: "genericRss",
    panel: PANEL_KEYS.INTEL,
    category: "news",
    sourceType: "security-news",
    url: "https://www.bleepingcomputer.com/feed/",
    freshnessHours: 12,
    enabled: true
  },
  {
    key: "darkreading",
    label: "Dark Reading",
    adapter: "genericRss",
    panel: PANEL_KEYS.INTEL,
    category: "news",
    sourceType: "security-news",
    url: "https://www.darkreading.com/rss.xml",
    freshnessHours: 12,
    enabled: true
  },
  {
    key: "krebs",
    label: "Krebs on Security",
    adapter: "genericRss",
    panel: PANEL_KEYS.INTEL,
    category: "news",
    sourceType: "security-news",
    url: "https://krebsonsecurity.com/feed/",
    freshnessHours: 24,
    enabled: true
  },
  {
    key: "the_hacker_news",
    label: "The Hacker News",
    adapter: "genericRss",
    panel: PANEL_KEYS.INTEL,
    category: "news",
    sourceType: "security-news",
    url: "https://feeds.feedburner.com/TheHackersNews",
    freshnessHours: 12,
    enabled: true
  },
  {
    key: "sans_isc",
    label: "SANS ISC",
    adapter: "genericRss",
    panel: PANEL_KEYS.INTEL,
    category: "analysis",
    sourceType: "security-research",
    url: "https://isc.sans.edu/rssfeed.xml",
    freshnessHours: 12,
    enabled: true
  },
  {
    key: "cloudflare_status",
    label: "Cloudflare Status",
    adapter: "statusRss",
    panel: PANEL_KEYS.OUTAGES,
    category: "outage",
    sourceType: "status-feed",
    url: "https://www.cloudflarestatus.com/history.rss",
    freshnessHours: 12,
    enabled: true,
    vendor: "Cloudflare"
  },
  {
    key: "github_status",
    label: "GitHub Status",
    adapter: "statusRss",
    panel: PANEL_KEYS.OUTAGES,
    category: "outage",
    sourceType: "status-feed",
    url: "https://www.githubstatus.com/history.rss",
    freshnessHours: 12,
    enabled: true,
    vendor: "GitHub"
  },
  {
    key: "openai_status",
    label: "OpenAI Status",
    adapter: "statusRss",
    panel: PANEL_KEYS.OUTAGES,
    category: "outage",
    sourceType: "status-feed",
    url: "https://status.openai.com/history.rss",
    freshnessHours: 12,
    enabled: true,
    vendor: "OpenAI"
  },
  {
    key: "discord_status",
    label: "Discord Status",
    adapter: "statusRss",
    panel: PANEL_KEYS.OUTAGES,
    category: "outage",
    sourceType: "status-feed",
    url: "https://status.discord.com/history.rss",
    freshnessHours: 12,
    enabled: true,
    vendor: "Discord"
  },
  {
    key: "slack_status",
    label: "Slack Status",
    adapter: "statusRss",
    panel: PANEL_KEYS.OUTAGES,
    category: "outage",
    sourceType: "status-feed",
    url: "https://slack-status.com/feed/rss",
    freshnessHours: 12,
    enabled: true,
    vendor: "Slack"
  },
  {
    key: "atlassian_status",
    label: "Atlassian Status",
    adapter: "statusRss",
    panel: PANEL_KEYS.OUTAGES,
    category: "outage",
    sourceType: "status-feed",
    url: "https://status.atlassian.com/history.rss",
    freshnessHours: 12,
    enabled: true,
    vendor: "Atlassian"
  },
  {
    key: "heroku_status",
    label: "Heroku Status",
    adapter: "statusRss",
    panel: PANEL_KEYS.OUTAGES,
    category: "outage",
    sourceType: "status-feed",
    url: "https://status.heroku.com/history.rss",
    freshnessHours: 12,
    enabled: true,
    vendor: "Heroku"
  }
];

module.exports = {
  OUTPUT_PATHS,
  PANEL_DEFINITIONS,
  PANEL_KEYS,
  SOURCE_REGISTRY
};
