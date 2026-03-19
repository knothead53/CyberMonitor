function decodeHtmlEntities(text) {
  const base = String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  return base
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function stripHtml(value) {
  return decodeHtmlEntities(String(value || ""))
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTagValue(block, tagName) {
  const escaped = String(tagName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i");
  const match = String(block || "").match(regex);
  return match ? stripHtml(match[1]) : "";
}

function extractTagValues(block, tagName) {
  const escaped = String(tagName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "gi");
  const matches = [];
  let match = regex.exec(String(block || ""));
  while (match) {
    matches.push(stripHtml(match[1]));
    match = regex.exec(String(block || ""));
  }
  return matches.filter(Boolean);
}

function extractAtomLink(block) {
  const hrefMatch = String(block || "").match(/<link\b[^>]*href="([^"]+)"/i);
  if (hrefMatch) {
    return stripHtml(hrefMatch[1]);
  }
  return extractTagValue(block, "link");
}

function extractAtomCategories(block) {
  const matches = [];
  const regex = /<category\b([^>]*)\/?>/gi;
  let match = regex.exec(String(block || ""));

  while (match) {
    const attrs = String(match[1] || "");
    const termMatch = attrs.match(/\bterm="([^"]+)"/i);
    const labelMatch = attrs.match(/\blabel="([^"]+)"/i);
    matches.push(stripHtml(termMatch?.[1] || labelMatch?.[1] || ""));
    match = regex.exec(String(block || ""));
  }

  return matches.filter(Boolean);
}

function parseRssItems(xml) {
  const itemMatches = String(xml || "").match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return itemMatches.map((itemXml) => ({
    title: extractTagValue(itemXml, "title"),
    link: extractTagValue(itemXml, "link"),
    guid: extractTagValue(itemXml, "guid"),
    published: extractTagValue(itemXml, "pubDate"),
    updated: extractTagValue(itemXml, "lastBuildDate"),
    summary: extractTagValue(itemXml, "description") || extractTagValue(itemXml, "content:encoded"),
    categories: [
      ...extractTagValues(itemXml, "category"),
      ...extractTagValues(itemXml, "dc:subject")
    ]
  }));
}

function parseAtomEntries(xml) {
  const entryMatches = String(xml || "").match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return entryMatches.map((entryXml) => ({
    title: extractTagValue(entryXml, "title"),
    link: extractAtomLink(entryXml),
    guid: extractTagValue(entryXml, "id"),
    published: extractTagValue(entryXml, "published") || extractTagValue(entryXml, "updated"),
    updated: extractTagValue(entryXml, "updated"),
    summary: extractTagValue(entryXml, "summary") || extractTagValue(entryXml, "content"),
    categories: extractAtomCategories(entryXml)
  }));
}

function parseFeed(xml) {
  const text = String(xml || "");
  if (/<feed\b/i.test(text)) {
    return parseAtomEntries(text);
  }
  return parseRssItems(text);
}

module.exports = {
  parseFeed,
  stripHtml
};
