interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * AlienVault OTX MCP — Open Threat Exchange (free with key)
 *
 * OTX hosts community-curated "pulses" — threat-intel reports bundling
 * indicators of compromise (IPs, domains, URLs, file hashes) with TTPs,
 * targeted industries, and references. Pairs with VirusTotal (per-indicator
 * verdicts) and GreyNoise (scanner-noise filtering).
 *
 * API: https://otx.alienvault.com/api
 * Tools:
 * - search_pulses:     keyword search across community pulses
 * - get_pulse:         full pulse + indicator list
 * - lookup_indicator:  per-indicator context (IPv4 / domain / url / file hash)
 */


const BASE_URL = 'https://otx.alienvault.com/api/v1';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_pulses',
    description:
      'Search OTX threat-intel pulses by keyword. Returns pulse ID, name, description preview, tags, targeted countries, malware families, attack IDs, and indicator count.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term' },
        limit: { type: 'number', description: '1-50 (default 20)' },
        page: { type: 'number', description: '1-based page (default 1)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_pulse',
    description:
      'Fetch a single OTX pulse: full description, references, indicators, attack IDs, targeted countries, malware families, industries, and creation/modification dates.',
    inputSchema: {
      type: 'object',
      properties: {
        pulse_id: { type: 'string', description: 'OTX pulse ID (hex string)' },
      },
      required: ['pulse_id'],
    },
  },
  {
    name: 'lookup_indicator',
    description:
      'Look up an indicator (IPv4, domain, URL, or file hash) in OTX. Returns pulses referencing the indicator and observed-context fields. type auto-detected when omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        indicator: { type: 'string', description: 'IPv4, domain, URL, or file hash (md5/sha1/sha256)' },
        type: {
          type: 'string',
          description: 'Force a type instead of auto-detecting',
          enum: ['IPv4', 'IPv6', 'domain', 'hostname', 'url', 'file'],
        },
      },
      required: ['indicator'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = (args._apiKey as string | undefined)?.trim();
  if (!apiKey) {
    throw new Error(
      'AlienVault OTX requires an API key. Contact the operator about platform credentials, or BYO via ?_apiKey=<key> after registering at https://otx.alienvault.com',
    );
  }
  switch (name) {
    case 'search_pulses':
      return searchPulses(apiKey, args);
    case 'get_pulse':
      return getPulse(apiKey, String(args.pulse_id));
    case 'lookup_indicator':
      return lookupIndicator(apiKey, String(args.indicator), args.type as string | undefined);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function otxFetch<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-OTX-API-KEY': apiKey, Accept: 'application/json' },
  });
  if (res.status === 401 || res.status === 403) throw new Error('OTX: unauthorized — check the API key');
  if (res.status === 404) throw new Error('OTX: not found');
  if (res.status === 429) throw new Error('OTX: rate-limit hit (HTTP 429)');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OTX error: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

interface PulseSummary {
  id?: string;
  name?: string;
  description?: string;
  author_name?: string;
  created?: string;
  modified?: string;
  tags?: string[];
  targeted_countries?: string[];
  malware_families?: string[];
  attack_ids?: string[];
  industries?: string[];
  indicators?: { count?: number } | unknown[];
}

function normalizePulse(p: PulseSummary, full = false) {
  const indicatorsCount = Array.isArray(p.indicators)
    ? p.indicators.length
    : (p.indicators as { count?: number } | undefined)?.count ?? null;
  const base: Record<string, unknown> = {
    id: p.id ?? null,
    name: p.name ?? null,
    description: p.description ? String(p.description).slice(0, full ? 8000 : 400) : null,
    author: p.author_name ?? null,
    created: p.created ?? null,
    modified: p.modified ?? null,
    tags: p.tags ?? [],
    targeted_countries: p.targeted_countries ?? [],
    malware_families: p.malware_families ?? [],
    attack_ids: p.attack_ids ?? [],
    industries: p.industries ?? [],
    indicators_count: indicatorsCount,
    otx_url: p.id ? `https://otx.alienvault.com/pulse/${p.id}` : null,
  };
  if (full && Array.isArray(p.indicators)) {
    base.indicators = p.indicators;
  }
  return base;
}

async function searchPulses(apiKey: string, args: Record<string, unknown>) {
  const params = new URLSearchParams({
    q: String(args.query),
    limit: String(Math.min(50, Math.max(1, (args.limit as number) ?? 20))),
    page: String(Math.max(1, (args.page as number) ?? 1)),
  });
  const data = await otxFetch<{ count?: number; results?: PulseSummary[] }>(
    apiKey,
    `/search/pulses?${params}`,
  );
  return {
    total: data.count ?? 0,
    returned: data.results?.length ?? 0,
    pulses: (data.results ?? []).map((p) => normalizePulse(p, false)),
  };
}

async function getPulse(apiKey: string, pulseId: string) {
  const data = await otxFetch<PulseSummary>(apiKey, `/pulses/${encodeURIComponent(pulseId)}`);
  return normalizePulse(data, true);
}

function detectType(indicator: string): string {
  if (/^https?:\/\//i.test(indicator)) return 'url';
  if (/^([0-9a-f]{32}|[0-9a-f]{40}|[0-9a-f]{64})$/i.test(indicator)) return 'file';
  if (/^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(indicator)) return 'IPv4';
  if (/^[0-9a-f:]+$/i.test(indicator) && indicator.includes(':')) return 'IPv6';
  return 'domain';
}

async function lookupIndicator(apiKey: string, indicator: string, type?: string) {
  const t = type ?? detectType(indicator);
  const safe = encodeURIComponent(indicator);
  const path = `/indicators/${t}/${safe}/general`;
  const data = await otxFetch<{
    pulse_info?: { count?: number; pulses?: PulseSummary[] };
    [key: string]: unknown;
  }>(apiKey, path);

  return {
    indicator,
    type: t,
    pulse_count: data.pulse_info?.count ?? 0,
    pulses: (data.pulse_info?.pulses ?? []).map((p) => normalizePulse(p, false)),
    context: Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'pulse_info')),
  };
}

export default { tools, callTool, meter: { credits: 2 } } satisfies McpToolExport;
