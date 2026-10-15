// -----------------------------------------------------------------------------
// The link to one Wattpilot: a session kept open, opened again when it drops.
//
// Reconnection. After a failure the link waits 5 s, then 10 s, 30 s, and
// every minute after that; a refused password waits 10 minutes (the password
// will not fix itself, and nobody knows how the charger takes a stream of bad
// logins). `reconnectNow()` skips the wait (a new configuration, Gladys
// asking for a poll while the charger is down).
//
// Liveness. The charger pushes its status: the link counts any message (or a
// pong) as a sign of life. After `silenceMs` without one it sends a WebSocket
// ping, and drops the session if nothing came back after `silenceMs / 2` more.
//
// Events:
//   online  ({ hello, status })   the session is up, full status received
//   update  (keys, before)        some status keys changed
//   offline (WattpilotError)      a connection attempt failed, or the session dropped
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { ERROR_KINDS, WattpilotError, openSession } from './session.js';

export const BACKOFF_MS = [5000, 10000, 30000, 60000];
export const AUTH_RETRY_MS = 10 * 60 * 1000;
export const SILENCE_MS = 60 * 1000;

export class ChargerLink extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.host
   * @param {string} options.password
   * @param {typeof openSession} [options.connect]
   * @param {number[]} [options.backoffMs]
   * @param {number} [options.authRetryMs]
   * @param {number} [options.silenceMs]
   * @param {number} [options.timeoutMs]
   */
  constructor({
    host,
    password,
    connect = openSession,
    backoffMs = BACKOFF_MS,
    authRetryMs = AUTH_RETRY_MS,
    silenceMs = SILENCE_MS,
    timeoutMs,
  }) {
    super();
    this.host = host;
    this.password = password;
    this.connect = connect;
    this.backoffMs = backoffMs;
    this.authRetryMs = authRetryMs;
    this.silenceMs = silenceMs;
    this.timeoutMs = timeoutMs;
    this.session = null;
    this.connecting = null;
    this.failures = 0;
    this.lastError = null;
    this.retryTimer = null;
    this.watchdog = null;
    this.lastSign = 0;
    this.stopped = true;
  }

  get online() {
    return this.session !== null;
  }

  /** The last status received (empty while never connected). */
  get status() {
    return this.session?.status ?? this.lastStatus ?? {};
  }

  get hello() {
    return this.session?.hello ?? this.lastHello ?? null;
  }

  /**
   * Start: resolves once the first attempt succeeded or failed.
   * @returns {Promise<boolean>} online
   */
  async start() {
    this.stopped = false;
    await this.attempt();
    return this.online;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.watchdog);
    this.retryTimer = null;
    this.watchdog = null;
    const session = this.session;
    this.session = null;
    session?.removeAllListeners();
    session?.close();
  }

  /** Skip the wait before the next attempt; no-op while online or connecting. */
  reconnectNow() {
    if (this.stopped || this.online || this.connecting) {
      return this.connecting ?? Promise.resolve();
    }
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    return this.attempt();
  }

  attempt() {
    if (this.connecting) {
      return this.connecting;
    }
    this.connecting = this.connect({
      host: this.host,
      password: this.password,
      ...(this.timeoutMs ? { timeoutMs: this.timeoutMs } : {}),
    })
      .then(
        (session) => this.up(session),
        (err) => this.down(err),
      )
      .finally(() => {
        this.connecting = null;
      });
    return this.connecting;
  }

  up(session) {
    if (this.stopped) {
      session.close();
      return;
    }
    this.session = session;
    this.failures = 0;
    this.lastError = null;
    this.lastHello = session.hello;
    this.lastSign = Date.now();
    session.on('alive', () => {
      this.lastSign = Date.now();
    });
    session.on('delta', (keys, before) => this.emit('update', keys, before));
    session.on('close', (err) => {
      if (this.session === session) {
        this.lastStatus = session.status;
        this.session = null;
        this.down(err);
      }
    });
    this.startWatchdog(session);
    this.emit('online', { hello: session.hello, status: session.status });
  }

  down(err) {
    clearInterval(this.watchdog);
    this.watchdog = null;
    if (!(err instanceof WattpilotError)) {
      err = new WattpilotError(ERROR_KINDS.CLOSED, `${this.host}: ${err?.message ?? err}`);
    }
    this.lastError = err;
    this.failures += 1;
    if (this.stopped) {
      return;
    }
    this.emit('offline', err);
    const delay =
      err.kind === ERROR_KINDS.AUTH_FAILED || err.kind === ERROR_KINDS.NO_PASSWORD
        ? this.authRetryMs
        : this.backoffMs[Math.min(this.failures - 1, this.backoffMs.length - 1)];
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.attempt();
    }, delay);
    this.retryTimer.unref?.();
  }

  startWatchdog(session) {
    clearInterval(this.watchdog);
    let pinged = false;
    const step = Math.max(50, Math.floor(this.silenceMs / 4));
    this.watchdog = setInterval(() => {
      const silence = Date.now() - this.lastSign;
      if (silence < this.silenceMs) {
        pinged = false;
        return;
      }
      if (!pinged) {
        pinged = true;
        session.ping();
        return;
      }
      if (silence >= this.silenceMs * 1.5) {
        session.drop(new WattpilotError(ERROR_KINDS.CLOSED, `${this.host}: no sign of life`));
      }
    }, step);
    this.watchdog.unref?.();
  }

  /**
   * Write one key on the charger.
   * @param {string} key
   * @param {number|boolean|string} value
   */
  async set(key, value) {
    if (!this.session) {
      throw this.lastError ?? new WattpilotError(ERROR_KINDS.CLOSED, `${this.host}: not connected`);
    }
    await this.session.setValue(key, value);
  }
}
