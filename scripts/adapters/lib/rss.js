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

function parseRssItems(xml) {
  const itemMatches = String(xml || "").match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return itemMatches.map((itemXml) => ({
    title: extractTagValue(itemXml, "title"),
    link: extractTagValue(itemXml, "link"),
    guid: extractTagValue(itemXml, "guid"),
    published: extractTagValue(itemXml, "pubDate"),
    summary: extractTagValue(itemXml, "description") || extractTagValue(itemXml, "content:encoded"),
    hasMaintenanceTag: /<maintenanceEndDate>/i.test(itemXml)
  }));
}

module.exports = {
  decodeHtmlEntities,
  extractTagValue,
  parseRssItems,
  stripHtml
};
