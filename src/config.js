// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. This module holds the defaults (they
// MUST match the manifest `default` values, test/manifest.test.js checks it)
// and turns the raw form values into what the code uses: the address of the
// Wattpilot, its password, how often the states go to Gladys.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/** Intervals offered by the form, in seconds (manifest select values). */
export const REFRESH_INTERVALS = ['10', '15', '30', '60'];

export const DEFAULT_CONFIG = {
  // IP address or host name of the Wattpilot on the local network.
  host: '',
  // The password of the charger, set in the Wattpilot app (a `secret` field).
  password: '',
  refresh_interval: '15',
  language: 'fr',
};

// A host as typed in the form: an IPv4 address or a host name, optional port.
// No scheme, no path, no credentials.
const HOST_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::\d{1,5})?$/;

/**
 * The address typed in the form, cleaned up: forgives a pasted "http://",
 * "ws://" or a trailing "/ws".
 * @param {string} raw
 * @returns {{ host: string|null, invalid: string|null }}
 */
export function parseHost(raw) {
  const host = String(raw ?? '')
    .trim()
    .replace(/^(?:https?|wss?):\/\//i, '')
    .replace(/\/ws\/?$/i, '')
    .replace(/\/+$/, '');
  if (host === '') {
    return { host: null, invalid: null };
  }
  if (!HOST_PATTERN.test(host)) {
    // Never echo an entry carrying credentials back in a message or a log.
    return { host: null, invalid: host.includes('@') ? '***' : host };
  }
  return { host: host.toLowerCase(), invalid: null };
}

/**
 * Merge the user config with the defaults and derive what the code uses.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const merged = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
  const { host, invalid } = parseHost(merged.host);
  const interval = REFRESH_INTERVALS.includes(String(merged.refresh_interval))
    ? String(merged.refresh_interval)
    : DEFAULT_CONFIG.refresh_interval;
  return {
    host,
    invalidHost: invalid,
    // Kept as typed: a password may start or end with a space.
    password: typeof merged.password === 'string' ? merged.password : '',
    refresh_interval: interval,
    language: LANGUAGES.includes(merged.language) ? merged.language : DEFAULT_CONFIG.language,
  };
}

/** The refresh interval, in milliseconds. */
export function refreshIntervalMs(config) {
  return Number(config.refresh_interval) * 1000;
}

/** An address and a password: enough to reach the charger. */
export function isConfigured(config) {
  return config.host !== null && config.password !== '';
}
