const { maxSeverity, severityWeight, slugify, stableId, tokenize } = require("./normalize");

class UnionFind {
  constructor(size) {
    this.parent = Array.from({ length: size }, (_value, index) => index);
    this.rank = Array.from({ length: size }, () => 0);
  }

  find(value) {
    if (this.parent[value] !== value) {
      this.parent[value] = this.find(this.parent[value]);
    }
    return this.parent[value];
  }

  union(left, right) {
    const rootA = this.find(left);
    const rootB = this.find(right);
    if (rootA === rootB) {
      return false;
    }
    if (this.rank[rootA] < this.rank[rootB]) {
      this.parent[rootA] = rootB;
      return true;
    }
    if (this.rank[rootA] > this.rank[rootB]) {
      this.parent[rootB] = rootA;
      return true;
    }
    this.parent[rootB] = rootA;
    this.rank[rootA] += 1;
    return true;
  }
}

function jaccard(left, right) {
  const a = new Set(Array.isArray(left) ? left : []);
  const b = new Set(Array.isArray(right) ? right : []);
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  a.forEach((value) => {
    if (b.has(value)) {
      intersection += 1;
    }
  });
  return intersection / new Set([...a, ...b]).size;
}

function overlap(left, right) {
  return (Array.isArray(left) ? left : []).some((value) => (Array.isArray(right) ? right : []).includes(value));
}

function sameDomain(left, right) {
  const outage = new Set(["outage"]);
  const leftOutage = outage.has(left.category);
  const rightOutage = outage.has(right.category);
  return leftOutage === rightOutage;
}

function buildPreparedEvent(event) {
  return {
    ...event,
    titleTokens: tokenize(event.title),
    summaryTokens: tokenize(event.summary),
    vendorKey: slugify(event.vendor),
    productKey: slugify(event.product),
    actorKey: slugify(event.actor),
    campaignKey: slugify(event.campaign),
    publishedTime: Date.parse(event.published_at || event.discovered_at || "")
  };
}

function calculateScore(left, right) {
  if (!sameDomain(left, right)) {
    return 0;
  }

  const cveOverlap = overlap(left.cve_ids, right.cve_ids);
  const vendorMatch = left.vendorKey && left.vendorKey === right.vendorKey;
  const productMatch = left.productKey && left.productKey === right.productKey;
  const actorMatch = left.actorKey && left.actorKey === right.actorKey;
  const campaignMatch = left.campaignKey && left.campaignKey === right.campaignKey;
  const titleSimilarity = jaccard(left.titleTokens, right.titleTokens);
  const summarySimilarity = jaccard(left.summaryTokens, right.summaryTokens);
  const deltaMs = Math.abs(left.publishedTime - right.publishedTime);
  const deltaHours = Number.isFinite(deltaMs) ? deltaMs / (60 * 60 * 1000) : Number.POSITIVE_INFINITY;

  if (!cveOverlap && !vendorMatch && !actorMatch && !campaignMatch && titleSimilarity < 0.34) {
    return 0;
  }

  if (!cveOverlap && deltaHours > 24 * 21 && !vendorMatch) {
    return 0;
  }

  let score = 0;
  if (cveOverlap) {
    score += 0.64;
  }
  if (vendorMatch) {
    score += 0.14;
  }
  if (productMatch) {
    score += 0.12;
  }
  if (actorMatch) {
    score += 0.16;
  }
  if (campaignMatch) {
    score += 0.16;
  }
  if (titleSimilarity >= 0.3) {
    score += Math.min(0.22, titleSimilarity * 0.36);
  }
  if (summarySimilarity >= 0.18) {
    score += Math.min(0.12, summarySimilarity * 0.22);
  }

  if (deltaHours <= 48) {
    score += 0.08;
  } else if (deltaHours <= 24 * 7) {
    score += 0.05;
  } else if (deltaHours <= 24 * 21) {
    score += 0.02;
  }

  if (left.vendorKey && right.vendorKey && left.vendorKey !== right.vendorKey && !cveOverlap && !actorMatch && !campaignMatch) {
    score -= 0.18;
  }

  return score;
}

function getThreshold(left, right) {
  if (overlap(left.cve_ids, right.cve_ids)) {
    return 0.6;
  }
  if (left.category === "outage") {
    return 0.72;
  }
  return 0.76;
}

function selectPrimaryEvent(clusterEvents) {
  return [...clusterEvents].sort((left, right) => {
    const rightScore = severityWeight(right.severity) * 10 + (right.cve_ids.length > 0 ? 5 : 0) + right.confidence;
    const leftScore = severityWeight(left.severity) * 10 + (left.cve_ids.length > 0 ? 5 : 0) + left.confidence;
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }
    return Date.parse(right.published_at || "") - Date.parse(left.published_at || "");
  })[0];
}

function buildClusterSummary(clusterEvents, edges) {
  const primary = selectPrimaryEvent(clusterEvents);
  const cves = Array.from(new Set(clusterEvents.flatMap((event) => event.cve_ids))).sort();
  const sources = Array.from(new Set(clusterEvents.map((event) => event.source))).sort();
  const vendors = Array.from(new Set(clusterEvents.map((event) => event.vendor).filter(Boolean))).sort();
  const products = Array.from(new Set(clusterEvents.map((event) => event.product).filter(Boolean))).sort();
  const severities = clusterEvents.map((event) => event.severity);
  const times = clusterEvents.map((event) => Date.parse(event.published_at || event.discovered_at || "")).filter(Number.isFinite);
  const confidence = edges.length > 0
    ? Number((edges.reduce((sum, edge) => sum + edge.score, 0) / edges.length).toFixed(2))
    : Number(primary.confidence.toFixed(2));

  return {
    cluster_id: stableId("cluster", [primary.incident_key, primary.correlation_key, clusterEvents.length]),
    cluster_type: primary.category === "outage" ? "outage" : "incident",
    primary_headline: primary.title,
    merged_summary: primary.summary,
    severity: severities.reduce((current, value) => maxSeverity(current, value), "LOW"),
    source_count: sources.length,
    event_count: clusterEvents.length,
    first_seen: new Date(Math.min(...times)).toISOString(),
    last_seen: new Date(Math.max(...times)).toISOString(),
    related_sources: sources,
    related_cves: cves,
    related_vendors: vendors,
    related_products: products,
    confidence,
    latitude: primary.latitude,
    longitude: primary.longitude,
    geo_precision: primary.geo_precision,
    url: primary.url,
    category: primary.category,
    vendor: primary.vendor,
    product: primary.product,
    actor: primary.actor,
    campaign: primary.campaign,
    victim_region: primary.victim_region,
    is_kev_linked: clusterEvents.some((event) => event.source_key === "cisa_kev"),
    primary_event_id: primary.id,
    event_ids: clusterEvents.map((event) => event.id)
  };
}

function correlateEvents(events) {
  const prepared = events.map((event) => buildPreparedEvent(event));
  const unionFind = new UnionFind(prepared.length);
  const edges = [];

  for (let leftIndex = 0; leftIndex < prepared.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < prepared.length; rightIndex += 1) {
      const left = prepared[leftIndex];
      const right = prepared[rightIndex];
      const score = calculateScore(left, right);
      if (score < getThreshold(left, right)) {
        continue;
      }
      unionFind.union(leftIndex, rightIndex);
      edges.push({
        left: left.id,
        right: right.id,
        score: Number(score.toFixed(3))
      });
    }
  }

  const grouped = new Map();
  prepared.forEach((event, index) => {
    const root = unionFind.find(index);
    if (!grouped.has(root)) {
      grouped.set(root, []);
    }
    grouped.get(root).push(event);
  });

  const clusters = [];
  const clusterByEventId = new Map();

  Array.from(grouped.values()).forEach((clusterEvents) => {
    const clusterEdges = edges.filter((edge) => clusterEvents.some((event) => event.id === edge.left || event.id === edge.right));
    const summary = buildClusterSummary(clusterEvents, clusterEdges);
    clusters.push(summary);
    clusterEvents.forEach((event) => {
      clusterByEventId.set(event.id, summary);
    });
  });

  const enrichedEvents = prepared.map((event) => {
    const {
      titleTokens,
      summaryTokens,
      vendorKey,
      productKey,
      actorKey,
      campaignKey,
      publishedTime,
      ...baseEvent
    } = event;
    const cluster = clusterByEventId.get(event.id);
    const relatedEvents = cluster.event_ids.filter((id) => id !== event.id);
    return {
      ...baseEvent,
      cluster_id: cluster.cluster_id,
      cluster_confidence: cluster.confidence,
      related_sources: cluster.related_sources.filter((value) => value !== event.source),
      related_event_ids: relatedEvents,
      is_correlated: cluster.event_count > 1,
      source_count: cluster.source_count
    };
  });

  return {
    clusters: clusters.sort((left, right) => Date.parse(right.last_seen || "") - Date.parse(left.last_seen || "")),
    events: enrichedEvents
  };
}

module.exports = {
  correlateEvents
};
