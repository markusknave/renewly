function M(key, name, category, aliases, domains, managePath = null) {
  return {
    key,
    name,
    category,
    aliases: aliases.map((a) => a.toUpperCase()),
    domains,
    site: `https://${domains[0]}`,
    managePath,
  };
}

// A curated catalog of the platforms people most commonly hold subscriptions
// with. Aliases are matched against bank descriptors (uppercased) and email
// sender/body text. Unknown merchants still work: they get a derived key.
export const MERCHANTS = [
  // Streaming & audio
  M('netflix', 'Netflix', 'Streaming', ['NETFLIX', 'NFLX'], ['netflix.com'], '/cancelplan'),
  M('disney-plus', 'Disney+', 'Streaming', ['DISNEY PLUS', 'DISNEY+', 'DISNEYPLUS', 'DISNEY'], ['disneyplus.com'], '/account'),
  M('hulu', 'Hulu', 'Streaming', ['HULU'], ['hulu.com'], '/account'),
  M('max', 'Max', 'Streaming', ['HBO MAX', 'HBO', 'MAX.COM', 'MAX STREAMING'], ['max.com'], '/account'),
  M('prime-video', 'Prime Video', 'Streaming', ['PRIME VIDEO', 'AMAZON PRIME VIDEO'], ['primevideo.com'], '/your-account'),
  M('apple-tv', 'Apple TV+', 'Streaming', ['APPLE TV', 'APPLETV'], ['tv.apple.com'], '/account'),
  M('paramount-plus', 'Paramount+', 'Streaming', ['PARAMOUNT PLUS', 'PARAMOUNT+', 'PARAMOUNT'], ['paramountplus.com'], '/account'),
  M('peacock', 'Peacock', 'Streaming', ['PEACOCK'], ['peacocktv.com'], '/account'),
  M('youtube-premium', 'YouTube Premium', 'Streaming', ['YOUTUBE PREMIUM', 'YOUTUBE'], ['youtube.com'], '/paid_memberships'),
  M('crunchyroll', 'Crunchyroll', 'Streaming', ['CRUNCHYROLL'], ['crunchyroll.com'], '/account'),
  M('discovery-plus', 'Discovery+', 'Streaming', ['DISCOVERY PLUS', 'DISCOVERY+', 'DISCOVERY'], ['discoveryplus.com'], '/account'),
  M('espn-plus', 'ESPN+', 'Streaming', ['ESPN PLUS', 'ESPN+', 'ESPN'], ['espn.com'], '/account'),
  M('starz', 'Starz', 'Streaming', ['STARZ'], ['starz.com'], '/account'),
  M('showtime', 'Showtime', 'Streaming', ['SHOWTIME'], ['showtime.com'], '/account'),
  M('amc-plus', 'AMC+', 'Streaming', ['AMC PLUS', 'AMC+'], ['amcplus.com'], '/account'),
  M('spotify', 'Spotify', 'Music', ['SPOTIFY'], ['spotify.com'], '/account/subscription'),
  M('apple-music', 'Apple Music', 'Music', ['APPLE MUSIC'], ['music.apple.com'], '/account'),
  M('youtube-music', 'YouTube Music', 'Music', ['YOUTUBE MUSIC'], ['music.youtube.com'], '/paid_memberships'),
  M('amazon-music', 'Amazon Music', 'Music', ['AMAZON MUSIC', 'AMZN MUSIC'], ['music.amazon.com'], '/account'),
  M('tidal', 'Tidal', 'Music', ['TIDAL'], ['tidal.com'], '/account'),
  M('deezer', 'Deezer', 'Music', ['DEEZER'], ['deezer.com'], '/account'),
  M('soundcloud', 'SoundCloud Go+', 'Music', ['SOUNDCLOUD'], ['soundcloud.com'], '/you/subscriptions'),
  M('audible', 'Audible', 'Books', ['AUDIBLE'], ['audible.com'], '/account'),
  M('kindle-unlimited', 'Kindle Unlimited', 'Books', ['KINDLE UNLIMITED', 'KINDLE'], ['amazon.com'], '/account'),
  M('scribd', 'Scribd', 'Books', ['SCRIBD', 'EVERAND'], ['scribd.com'], '/account'),
  M('blinkist', 'Blinkist', 'Books', ['BLINKIST'], ['blinkist.com'], '/account'),
  M('medium', 'Medium', 'News', ['MEDIUM MEMBERSHIP', 'MEDIUM.COM'], ['medium.com'], '/account'),
  M('substack', 'Substack', 'News', ['SUBSTACK'], ['substack.com'], '/account'),
  M('patreon', 'Patreon', 'Creator', ['PATREON'], ['patreon.com'], '/settings'),
  M('twitch', 'Twitch', 'Creator', ['TWITCH'], ['twitch.tv'], '/subscriptions'),

  // Productivity & software
  M('microsoft-365', 'Microsoft 365', 'Software', ['MICROSOFT 365', 'MICROSOFT', 'MSFT', 'OFFICE 365'], ['microsoft.com'], '/services'),
  M('adobe', 'Adobe Creative Cloud', 'Software', ['ADOBE'], ['adobe.com'], '/account/plans'),
  M('canva', 'Canva', 'Software', ['CANVA'], ['canva.com'], '/settings/billing'),
  M('notion', 'Notion', 'Software', ['NOTION'], ['notion.so'], '/settings/billing'),
  M('figma', 'Figma', 'Software', ['FIGMA'], ['figma.com'], '/settings/billing'),
  M('dropbox', 'Dropbox', 'Storage', ['DROPBOX'], ['dropbox.com'], '/account'),
  M('google-one', 'Google One', 'Storage', ['GOOGLE ONE', 'GOOGLE*ONE', 'GOOGLE STORAGE'], ['one.google.com', 'google.com'], '/'),
  M('icloud', 'iCloud+', 'Storage', ['ICLOUD', 'APPLE.COM/BILL', 'APPLE.COM'], ['icloud.com', 'apple.com'], '/account'),
  M('1password', '1Password', 'Security', ['1PASSWORD'], ['1password.com'], '/account'),
  M('lastpass', 'LastPass', 'Security', ['LASTPASS'], ['lastpass.com'], '/account'),
  M('bitwarden', 'Bitwarden', 'Security', ['BITWARDEN'], ['bitwarden.com'], '/account'),
  M('grammarly', 'Grammarly', 'Software', ['GRAMMARLY'], ['grammarly.com'], '/account'),
  M('zoom', 'Zoom', 'Software', ['ZOOM.US', 'ZOOM'], ['zoom.us'], '/billing'),
  M('slack', 'Slack', 'Software', ['SLACK'], ['slack.com'], '/account/billing'),
  M('github', 'GitHub', 'Developer', ['GITHUB'], ['github.com'], '/settings/billing'),
  M('gitlab', 'GitLab', 'Developer', ['GITLAB'], ['gitlab.com'], '/-/billing'),
  M('vercel', 'Vercel', 'Developer', ['VERCEL'], ['vercel.com'], '/account/billing'),
  M('netlify', 'Netlify', 'Developer', ['NETLIFY'], ['netlify.com'], '/app/billing'),
  M('cloudflare', 'Cloudflare', 'Developer', ['CLOUDFLARE'], ['cloudflare.com'], '/billing'),
  M('namecheap', 'Namecheap', 'Developer', ['NAMECHEAP'], ['namecheap.com'], '/account'),
  M('godaddy', 'GoDaddy', 'Developer', ['GODADDY'], ['godaddy.com'], '/billing'),
  M('linkedin-premium', 'LinkedIn Premium', 'Software', ['LINKEDIN PREMIUM', 'LINKEDIN'], ['linkedin.com'], '/premium'),
  M('chatgpt', 'ChatGPT Plus', 'AI', ['CHATGPT', 'OPENAI'], ['openai.com', 'chatgpt.com'], '/'),
  M('claude', 'Claude Pro', 'AI', ['CLAUDE', 'ANTHROPIC'], ['anthropic.com', 'claude.ai'], '/'),
  M('perplexity', 'Perplexity Pro', 'AI', ['PERPLEXITY'], ['perplexity.ai'], '/'),
  M('midjourney', 'Midjourney', 'AI', ['MIDJOURNEY'], ['midjourney.com'], '/account'),
  M('elevenlabs', 'ElevenLabs', 'AI', ['ELEVENLABS'], ['elevenlabs.io'], '/subscription'),
  M('jasper', 'Jasper', 'AI', ['JASPER AI', 'JASPER'], ['jasper.ai'], '/account'),

  // Gaming
  M('xbox-game-pass', 'Xbox Game Pass', 'Gaming', ['XBOX GAME PASS', 'XBOX', 'MICROSOFT GAME PASS'], ['xbox.com'], '/account'),
  M('playstation-plus', 'PlayStation Plus', 'Gaming', ['PLAYSTATION PLUS', 'PLAYSTATION', 'PSN'], ['playstation.com'], '/account'),
  M('nintendo-online', 'Nintendo Switch Online', 'Gaming', ['NINTENDO'], ['nintendo.com'], '/account'),
  M('ea-play', 'EA Play', 'Gaming', ['EA PLAY', 'ELECTRONIC ARTS'], ['ea.com'], '/account'),
  M('ubisoft-plus', 'Ubisoft+', 'Gaming', ['UBISOFT'], ['ubisoft.com'], '/account'),
  M('geforce-now', 'GeForce Now', 'Gaming', ['GEFORCE NOW', 'NVIDIA'], ['nvidia.com'], '/account'),
  M('discord-nitro', 'Discord Nitro', 'Gaming', ['DISCORD NITRO', 'DISCORD'], ['discord.com'], '/settings/subscriptions'),

  // Health, learning & lifestyle
  M('peloton', 'Peloton', 'Health', ['PELOTON'], ['onepeloton.com'], '/account'),
  M('headspace', 'Headspace', 'Health', ['HEADSPACE'], ['headspace.com'], '/account'),
  M('calm', 'Calm', 'Health', ['CALM.COM', 'CALM'], ['calm.com'], '/account'),
  M('strava', 'Strava', 'Health', ['STRAVA'], ['strava.com'], '/settings'),
  M('myfitnesspal', 'MyFitnessPal', 'Health', ['MYFITNESSPAL'], ['myfitnesspal.com'], '/account'),
  M('noom', 'Noom', 'Health', ['NOOM'], ['noom.com'], '/account'),
  M('whoop', 'Whoop', 'Health', ['WHOOP'], ['whoop.com'], '/account'),
  M('fitbit-premium', 'Fitbit Premium', 'Health', ['FITBIT'], ['fitbit.com'], '/account'),
  M('duolingo', 'Duolingo', 'Learning', ['DUOLINGO'], ['duolingo.com'], '/settings'),
  M('babbel', 'Babbel', 'Learning', ['BABBEL'], ['babbel.com'], '/account'),
  M('rosetta-stone', 'Rosetta Stone', 'Learning', ['ROSETTA STONE'], ['rosettastone.com'], '/account'),
  M('masterclass', 'MasterClass', 'Learning', ['MASTERCLASS'], ['masterclass.com'], '/account'),
  M('skillshare', 'Skillshare', 'Learning', ['SKILLSHARE'], ['skillshare.com'], '/account'),
  M('coursera', 'Coursera', 'Learning', ['COURSERA'], ['coursera.org'], '/account'),
  M('udemy', 'Udemy', 'Learning', ['UDEMY'], ['udemy.com'], '/account'),

  // Delivery, retail & memberships
  M('amazon-prime', 'Amazon Prime', 'Membership', ['AMAZON PRIME', 'AMZN PRIME', 'AMAZON.COM PRIME'], ['amazon.com'], '/account'),
  M('uber-one', 'Uber One', 'Membership', ['UBER ONE', 'UBER'], ['uber.com'], '/account'),
  M('dashpass', 'DashPass', 'Membership', ['DASHPASS', 'DOORDASH'], ['doordash.com'], '/account'),
  M('instacart-plus', 'Instacart+', 'Membership', ['INSTACART'], ['instacart.com'], '/account'),
  M('walmart-plus', 'Walmart+', 'Membership', ['WALMART PLUS', 'WALMART+', 'WALMART'], ['walmart.com'], '/account'),
  M('costco', 'Costco', 'Membership', ['COSTCO'], ['costco.com'], '/account'),
  M('sams-club', 'Sam\'s Club', 'Membership', ['SAMS CLUB', 'SAM\'S CLUB'], ['samsclub.com'], '/account'),
  M('hellofresh', 'HelloFresh', 'Food', ['HELLOFRESH'], ['hellofresh.com'], '/account'),
  M('blue-apron', 'Blue Apron', 'Food', ['BLUE APRON'], ['blueapron.com'], '/account'),
  M('factor', 'Factor', 'Food', ['FACTOR MEALS', 'FACTOR75', 'FACTOR'], ['factor75.com'], '/account'),
  M('grubhub-plus', 'Grubhub+', 'Food', ['GRUBHUB'], ['grubhub.com'], '/account'),

  // Security & VPN
  M('nordvpn', 'NordVPN', 'Security', ['NORDVPN', 'NORD VPN'], ['nordvpn.com'], '/account'),
  M('expressvpn', 'ExpressVPN', 'Security', ['EXPRESSVPN'], ['expressvpn.com'], '/account'),
  M('surfshark', 'Surfshark', 'Security', ['SURFSHARK'], ['surfshark.com'], '/account'),
  M('proton', 'Proton', 'Security', ['PROTON VPN', 'PROTONMAIL', 'PROTON'], ['proton.me'], '/account'),
  M('malwarebytes', 'Malwarebytes', 'Security', ['MALWAREBYTES'], ['malwarebytes.com'], '/account'),
  M('mcafee', 'McAfee', 'Security', ['MCAFEE'], ['mcafee.com'], '/account'),
  M('norton', 'Norton', 'Security', ['NORTON', 'LIFELOCK'], ['norton.com'], '/account'),

  // News & reading
  M('nyt', 'The New York Times', 'News', ['NEW YORK TIMES', 'NYTIMES', 'NYT'], ['nytimes.com'], '/account'),
  M('wsj', 'The Wall Street Journal', 'News', ['WALL STREET JOURNAL', 'WSJ'], ['wsj.com'], '/account'),
  M('washington-post', 'The Washington Post', 'News', ['WASHINGTON POST'], ['washingtonpost.com'], '/account'),
  M('guardian', 'The Guardian', 'News', ['GUARDIAN'], ['theguardian.com'], '/account'),
  M('economist', 'The Economist', 'News', ['ECONOMIST'], ['economist.com'], '/account'),
  M('bloomberg', 'Bloomberg', 'News', ['BLOOMBERG'], ['bloomberg.com'], '/account'),
  M('financial-times', 'Financial Times', 'News', ['FINANCIAL TIMES'], ['ft.com'], '/account'),

  // Cloud backup
  M('backblaze', 'Backblaze', 'Storage', ['BACKBLAZE'], ['backblaze.com'], '/account'),
  M('pcloud', 'pCloud', 'Storage', ['PCLOUD'], ['pcloud.com'], '/account'),
  M('mega', 'MEGA', 'Storage', ['MEGA.NZ', 'MEGA'], ['mega.nz'], '/account'),
];

const byKey = new Map(MERCHANTS.map((m) => [m.key, m]));

const aliasIndex = MERCHANTS.flatMap((m) =>
  m.aliases.map((alias) => ({ alias, merchant: m }))
).sort((a, b) => b.alias.length - a.alias.length);

const domainIndex = new Map();
for (const m of MERCHANTS) {
  for (const d of m.domains) domainIndex.set(d.toLowerCase(), m);
}

export function getMerchant(key) {
  return byKey.get(key) || null;
}

function aliasRegex(alias) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`, 'i');
}

function matchAlias(text) {
  const up = String(text || '').toUpperCase();
  for (const { alias, merchant } of aliasIndex) {
    if (alias.length <= 4 || /[^A-Z0-9 ]/.test(alias)) {
      if (aliasRegex(alias).test(up)) return merchant;
    } else if (up.includes(alias)) {
      return merchant;
    }
  }
  return null;
}

export function cleanDescriptor(raw) {
  let s = String(raw || '')
    .replace(/[\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^(PAYPAL|SQ|TST|SP|PP|PY|POS|ACH|DEBIT|PURCHASE|PAYMENT|RECURRING|CARD)\s*[*#-]?\s*/i, '');
  s = s.replace(/\s*#\s*\d+\b/g, ' ');
  s = s.replace(/[*#]/g, ' ');
  s = s.replace(/\b\d{6,}\b/g, ' ');
  s = s.replace(/\b(XX+\d*|\d{4})\b/g, ' ');
  s = s.replace(/\s+\d{1,5}$/, ' ');
  s = s.replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/[.,/]+$/g, '');
  s = s.replace(/\s+(COM|NET|ORG|CO|LLC|INC|LTD|USA|US)\b\.?$/i, '');
  return s || String(raw || '').trim();
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'unknown';
}

function titleize(value) {
  return String(value || '')
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (word === '&') return '&';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export function normalizeMerchant(raw) {
  const source = String(raw || '').trim();
  const known = matchAlias(source);
  if (known) {
    return {
      key: known.key,
      name: known.name,
      known: true,
      category: known.category,
      site: known.site,
      cancelUrl: known.managePath ? known.site + known.managePath : known.site,
    };
  }
  const cleaned = cleanDescriptor(source);
  const knownClean = matchAlias(cleaned);
  if (knownClean) {
    return {
      key: knownClean.key,
      name: knownClean.name,
      known: true,
      category: knownClean.category,
      site: knownClean.site,
      cancelUrl: knownClean.managePath ? knownClean.site + knownClean.managePath : knownClean.site,
    };
  }
  const name = titleize(cleaned) || 'Unknown merchant';
  return {
    key: slugify(cleaned || source),
    name,
    known: false,
    category: 'Other',
    site: null,
    cancelUrl: null,
  };
}

function fromCatalog(merchant) {
  return {
    key: merchant.key,
    name: merchant.name,
    known: true,
    category: merchant.category,
    site: merchant.site,
    cancelUrl: merchant.managePath ? merchant.site + merchant.managePath : merchant.site,
  };
}

export function merchantFromEmail({ from = '', subject = '', text = '' } = {}) {
  const email = String(from);
  const domain = (email.match(/@([A-Za-z0-9.-]+)/) || [])[1]?.toLowerCase();
  const display = email.replace(/<[^>]+>/g, ' ').trim();

  // Specific signals first. A generic sender like "Amazon" or "Apple" can map to
  // several products, so the subject usually disambiguates (Prime vs Music, etc.).
  const bySender = matchAlias(display) || matchAlias(email.split('@')[0] || '');
  if (bySender) return fromCatalog(bySender);

  const bySubject = matchAlias(subject);
  if (bySubject) return fromCatalog(bySubject);

  if (domain) {
    for (const [knownDomain, merchant] of domainIndex) {
      if (domain === knownDomain || domain.endsWith(`.${knownDomain}`)) {
        return fromCatalog(merchant);
      }
    }
  }

  const byBody = matchAlias(String(text).slice(0, 2000));
  if (byBody) return fromCatalog(byBody);

  return normalizeMerchant(display || domain || subject || 'Unknown merchant');
}
