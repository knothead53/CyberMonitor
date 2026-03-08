const NEWS_FEEDS = [
  {
    source: "BleepingComputer",
    url: "https://www.bleepingcomputer.com/feed/",
    vendor: ""
  },
  {
    source: "Dark Reading",
    url: "https://www.darkreading.com/rss.xml",
    vendor: ""
  },
  {
    source: "Krebs on Security",
    url: "https://krebsonsecurity.com/feed/",
    vendor: ""
  },
  {
    source: "The Hacker News",
    url: "https://feeds.feedburner.com/TheHackersNews",
    vendor: ""
  },
  {
    source: "SANS ISC",
    url: "https://isc.sans.edu/rssfeed.xml",
    vendor: ""
  }
];

const OUTAGE_FEEDS = [
  {
    source: "GitHub Status",
    vendor: "GitHub",
    url: "https://www.githubstatus.com/history.rss"
  },
  {
    source: "OpenAI Status",
    vendor: "OpenAI",
    url: "https://status.openai.com/history.rss"
  },
  {
    source: "Discord Status",
    vendor: "Discord",
    url: "https://status.discord.com/history.rss"
  },
  {
    source: "Cloudflare Status",
    vendor: "Cloudflare",
    url: "https://www.cloudflarestatus.com/history.rss"
  },
  {
    source: "Slack Status",
    vendor: "Slack",
    url: "https://slack-status.com/feed/rss"
  },
  {
    source: "Atlassian Status",
    vendor: "Atlassian",
    url: "https://status.atlassian.com/history.rss"
  },
  {
    source: "Heroku Status",
    vendor: "Heroku",
    url: "https://status.heroku.com/history.rss"
  }
];

module.exports = {
  NEWS_FEEDS,
  OUTAGE_FEEDS
};
