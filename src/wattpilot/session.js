// -----------------------------------------------------------------------------
// One authenticated WebSocket session with a Wattpilot: `ws://<host>/ws`.
//
//   hello → authRequired → auth → authSuccess → fullStatus (partial: true)…
//   → fullStatus (partial: false) → deltaStatus, deltaStatus…
//
// The charger pushes its status: a session resolves once the full status has
// arrived, then emits `delta` for every change. Commands are `setValue`
// messages (wrapped in a `securedMsg` when the charger is `secured`), each
// acknowledged by a `response` with the same request id.
//
// Only the keys of STATUS_KEYS are kept: the full status also holds the go-e
// cloud API key (`cak`), the Wi-Fi networks and other things this integration
// has no use for — they never reach the memory, nor the logs.
//
// Every failure is a WattpilotError with a `kind` the rest of the code turns
// into a message in the user's language.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { authMessage, hashPassword, securedMessage } from './auth.js';

/** The status keys the integration reads. */
export const STATUS_KEYS = [
  'sse', // serial number
  'typ', // device type
  'var', // variant: 11 (kW, 16 A) or 22 (kW, 32 A)
  'fna', // friendly name, set in the app
  'fwv', // firmware version
  'car', // car state
  'alw', // allowed to charge now
  'nrg', // voltages, currents, powers
  'wh', // energy since the car was connected, Wh
  'eto', // energy total, Wh
  'amp', // requested current, A
  'ama', // maximum current set in the app, A
  'frc', // force state
  'lmo', // logic mode: Default, Eco, Next Trip
  'err', // error code
  'tma', // temperature sensors, °C
];

export const ERROR_KINDS = {
  /** No connection: wrong address, charger off, another network. */
  UNREACHABLE: 'unreachable',
  /** Something answers, but not the Wattpilot WebSocket API. */
  NOT_WATTPILOT: 'not_wattpilot',
  /** The charger refused the password. */
  AUTH_FAILED: 'auth_failed',
  /** No password configured. */
  NO_PASSWORD: 'no_password',
  /** Authenticated, but the status did not come (or a command got no answer). */
  TIMEOUT: 'timeout',
  /** The connection dropped. */
  CLOSED: 'closed',
  /** The charger refused a value. */
  REJECTED: 'rejected',
};

export class WattpilotError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message never a password, a hash or a token
   */
  constructor(kind, message) {
    super(message);
    this.name = 'WattpilotError';
    this.kind = kind;
  }
}

/** Socket error codes meaning "nothing there". */
const UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ECONNRESET',
]);

const pick = (status) =>
  Object.fromEntries(Object.entries(status ?? {}).filter(([key]) => STATUS_KEYS.includes(key)));

/**
 * @typedef {object} Hello
 * @property {string} serial
 * @property {string} [devicetype] wattpilot, wattpilot_v2, wattpilot_flex...
 * @property {string} [version] firmware
 * @property {string} [friendlyName]
 * @property {boolean} secured
 * @property {string} [hash] pbkdf2 or bcrypt (Flex)
 */

export class WattpilotSession extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.host
   * @param {string} options.password
   * @param {number} [options.timeoutMs] to get the full status
   * @param {number} [options.commandTimeoutMs] to get the answer of a command
   * @param {boolean} [options.authenticate] false: stop after hello (probe without password)
   */
  constructor({
    host,
    password,
    timeoutMs = 20000,
    commandTimeoutMs = 10000,
    authenticate = true,
  }) {
    super();
    this.host = host;
    this.password = password;
    this.timeoutMs = timeoutMs;
    this.commandTimeoutMs = commandTimeoutMs;
    this.authenticate = authenticate;
    /** @type {Hello|null} */
    this.hello = null;
    this.status = {};
    this.ready = false;
    this.closed = false;
    this.hashedPassword = null;
    this.requestId = 0;
    /** @type {Map<number, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
    this.pending = new Map();
    this.ws = null;
  }

  /**
   * Connect, authenticate and wait for the full status.
   * @returns {Promise<this>}
   */
  open() {
    return new Promise((resolve, reject) => {
      let opened = false;
      const fail = (err) => {
        clearTimeout(timer);
        this.close();
        reject(err);
      };
      const timer = setTimeout(() => {
        if (!opened) {
          fail(new WattpilotError(ERROR_KINDS.UNREACHABLE, `${this.host}: no connection`));
        } else if (!this.hello) {
          fail(new WattpilotError(ERROR_KINDS.NOT_WATTPILOT, `${this.host}: no hello message`));
        } else {
          fail(new WattpilotError(ERROR_KINDS.TIMEOUT, `${this.host}: no full status`));
        }
      }, this.timeoutMs);
      timer.unref?.();

      this.onReady = () => {
        clearTimeout(timer);
        resolve(this);
      };
      this.onFailure = fail;

      try {
        this.ws = new WebSocket(`ws://${this.host}/ws`, {
          handshakeTimeout: this.timeoutMs,
          perMessageDeflate: false,
          followRedirects: false,
        });
      } catch (err) {
        fail(new WattpilotError(ERROR_KINDS.UNREACHABLE, `${this.host}: ${err.message}`));
        return;
      }
      this.ws.on('open', () => {
        opened = true;
      });
      this.ws.on('unexpected-response', (_request, response) => {
        // An HTTP server answered the upgrade: not the Wattpilot API.
        fail(
          new WattpilotError(
            ERROR_KINDS.NOT_WATTPILOT,
            `${this.host}: HTTP ${response.statusCode} instead of a WebSocket`,
          ),
        );
      });
      this.ws.on('message', (data) => {
        this.handle(data).catch((err) => {
          if (!this.ready) {
            fail(err);
          }
        });
      });
      this.ws.on('pong', () => this.emit('alive'));
      this.ws.on('error', (err) => {
        const code = err?.code;
        const kind =
          !opened && (UNREACHABLE_CODES.has(code) || /timed out/i.test(err.message))
            ? ERROR_KINDS.UNREACHABLE
            : opened
              ? ERROR_KINDS.CLOSED
              : ERROR_KINDS.NOT_WATTPILOT;
        const error = new WattpilotError(kind, `${this.host}: ${code ?? err.message}`);
        if (!this.ready) {
          fail(error);
        } else {
          this.drop(error);
        }
      });
      this.ws.on('close', (code) => {
        const error = new WattpilotError(
          ERROR_KINDS.CLOSED,
          `${this.host}: connection closed (${code})`,
        );
        if (!this.ready) {
          fail(opened ? error : new WattpilotError(ERROR_KINDS.UNREACHABLE, error.message));
        } else {
          this.drop(error);
        }
      });
    });
  }

  async handle(data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      throw new WattpilotError(ERROR_KINDS.NOT_WATTPILOT, `${this.host}: not a JSON message`);
    }
    this.emit('alive');
    switch (message?.type) {
      case 'hello':
        this.hello = {
          serial: String(message.serial ?? ''),
          devicetype: typeof message.devicetype === 'string' ? message.devicetype : undefined,
          version: typeof message.version === 'string' ? message.version : undefined,
          friendlyName:
            typeof (message.friendly_name ?? message.friendlyname) === 'string'
              ? (message.friendly_name ?? message.friendlyname)
              : undefined,
          secured: message.secured === true || message.secured > 0,
          hash: typeof message.hash === 'string' ? message.hash : undefined,
        };
        if (!this.authenticate) {
          this.onReady();
          this.close();
        }
        return;
      case 'authRequired':
        await this.answerAuth(message);
        return;
      case 'authSuccess':
        return;
      case 'authError':
        throw new WattpilotError(ERROR_KINDS.AUTH_FAILED, `${this.host}: password refused`);
      case 'fullStatus':
        Object.assign(this.status, pick(message.status));
        if (message.partial !== true) {
          this.markReady();
        }
        return;
      case 'deltaStatus':
        this.applyDelta(message.status);
        return;
      case 'response':
        this.settle(message);
        return;
      default:
        // clearInverters, updateInverter...: nothing this integration uses.
        return;
    }
  }

  async answerAuth(message) {
    if (!this.hello?.serial) {
      throw new WattpilotError(ERROR_KINDS.NOT_WATTPILOT, `${this.host}: no serial number`);
    }
    if (!this.password) {
      throw new WattpilotError(ERROR_KINDS.NO_PASSWORD, `${this.host}: no password configured`);
    }
    this.hashedPassword = await hashPassword(this.password, this.hello);
    this.send(authMessage(this.hashedPassword, message.token1, message.token2));
  }

  markReady() {
    if (this.ready) {
      return;
    }
    this.ready = true;
    this.onReady();
  }

  applyDelta(status) {
    const changes = pick(status);
    if (!this.ready) {
      // Some firmwares end the full status without `partial: false`: the first
      // delta says it is over (as the Home Assistant integration assumes).
      Object.assign(this.status, changes);
      this.markReady();
      return;
    }
    const keys = Object.keys(changes).filter(
      (key) => JSON.stringify(this.status[key]) !== JSON.stringify(changes[key]),
    );
    if (keys.length === 0) {
      return;
    }
    const before = Object.fromEntries(keys.map((key) => [key, this.status[key]]));
    Object.assign(this.status, changes);
    this.emit('delta', keys, before);
  }

  send(message) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new WattpilotError(ERROR_KINDS.CLOSED, `${this.host}: not connected`);
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Write one key. Resolves once the charger accepted it.
   * @param {string} key
   * @param {number|boolean|string} value
   */
  setValue(key, value) {
    if (!this.ready) {
      return Promise.reject(new WattpilotError(ERROR_KINDS.CLOSED, `${this.host}: not connected`));
    }
    this.requestId += 1;
    const requestId = this.requestId;
    const command = { type: 'setValue', requestId, key, value };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new WattpilotError(ERROR_KINDS.TIMEOUT, `${this.host}: no answer to ${key}`));
      }, this.commandTimeoutMs);
      timer.unref?.();
      this.pending.set(requestId, { resolve, reject, timer, key });
      try {
        this.send(this.hello.secured ? securedMessage(this.hashedPassword, command) : command);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(err);
      }
    });
  }

  settle(message) {
    // A secured command is answered with "<id>sm" or "<id>", depending on the firmware.
    const requestId = Number.parseInt(String(message.requestId ?? '').replace(/sm$/, ''), 10);
    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }
    this.pending.delete(requestId);
    clearTimeout(pending.timer);
    if (message.success === true) {
      if (message.status && typeof message.status === 'object') {
        this.applyDelta(message.status);
      }
      pending.resolve();
      return;
    }
    const reason = typeof message.message === 'string' ? message.message.slice(0, 120) : 'refused';
    const err = new WattpilotError(
      ERROR_KINDS.REJECTED,
      `${this.host}: ${pending.key} refused (${reason})`,
    );
    err.reason = reason;
    pending.reject(err);
  }

  /** A WebSocket ping: a living charger answers with a pong (`alive`). */
  ping() {
    try {
      this.ws?.ping();
    } catch {
      // Closed meanwhile: the close event says it.
    }
  }

  drop(error) {
    if (this.closed) {
      return;
    }
    this.close();
    this.emit('close', error);
  }

  close() {
    this.closed = true;
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new WattpilotError(ERROR_KINDS.CLOSED, `${this.host}: connection closed`));
      this.pending.delete(requestId);
    }
    const ws = this.ws;
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.removeAllListeners('message');
      ws.on('error', () => {});
      try {
        ws.terminate();
      } catch {
        // Already gone.
      }
    }
  }
}

/**
 * Open an authenticated session.
 * @param {ConstructorParameters<typeof WattpilotSession>[0]} options
 */
export function openSession(options) {
  return new WattpilotSession(options).open();
}
