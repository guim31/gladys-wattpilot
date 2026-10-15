// -----------------------------------------------------------------------------
// The Wattpilot as Gladys sees it: the link to the charger, its last status,
// the publication of the states, the commands and the scene trigger.
//
// Refresh. The charger pushes its changes over the WebSocket (`deltaStatus`),
// several times a second while charging. Sending each one to Gladys would
// overrun its 300 states per minute, so the hub publishes on its own timer,
// every refresh interval (15 s by default) — and at once when something a
// user acts on changes (car state, mode, current, override, error). The core
// cannot be trusted to call onPoll (GladysAssistant/Gladys#3198), so onPoll is
// only a fallback: it publishes when the timer has not for 90 % of a period,
// and reconnects a charger that is down.
//
// States. Only the changes are sent (publishChangedStates), with a heartbeat
// every 6 hours so a stable value (the total energy of a charger nobody uses)
// never shows "no recent value" in Gladys. Only a device the user added to
// Gladys gets states: the core drops the states of a device it does not know.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured, refreshIntervalMs } from './config.js';
import { ChargerLink } from './wattpilot/link.js';
import { WattpilotError, openSession } from './wattpilot/session.js';
import {
  CAR,
  CHARGING_MODES,
  FORCE_MODES,
  MIN_CURRENT,
  allowedMaxCurrent,
  modelName,
} from './wattpilot/model.js';
import {
  FEATURE,
  buildDevice,
  chargerIds,
  deviceName,
  offlineStates,
  statesFor,
} from './devices.js';
import { MESSAGES, joinMessages, optionLabel } from './i18n.js';
import { createIssueLog } from './issues.js';

const logger = createLogger({ name: 'wattpilot' });

export const HEARTBEAT_MS = 6 * 60 * 60 * 1000;

/** Status keys a user acts on: a change is published at once, not at the next tick. */
export const IMMEDIATE_KEYS = ['car', 'alw', 'frc', 'lmo', 'amp', 'err'];

/** Scene trigger keys (manifest `scene_triggers`): forever once published. */
export const SCENE_TRIGGER = {
  CHARGE_FINISHED: 'charge_finished',
};
export const SCENE_TRIGGER_KEYS = Object.values(SCENE_TRIGGER);

/** Widget keys (manifest `widgets`): forever once published. */
export const WIDGET_KEY = 'charger';

/** A user-facing error: its message is a multi-language object. */
export class UserError extends Error {
  constructor(message) {
    super(message.en);
    this.name = 'UserError';
    this.userMessage = message;
  }
}

const failureMessage = (err, where) =>
  (MESSAGES.failure[err?.kind] ?? MESSAGES.failure.closed)(where);

export class ChargerHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {Function} [options.connect] opens a session (tests: shorter timeouts)
   * @param {object} [options.linkOptions] backoff, silence... (tests)
   * @param {boolean} [options.timers] run the refresh timer (tests may turn it off)
   * @param {() => number} [options.now]
   */
  constructor({
    gladys,
    connect = openSession,
    linkOptions = {},
    timers = true,
    now = () => Date.now(),
  }) {
    this.gladys = gladys;
    this.connect = connect;
    this.linkOptions = linkOptions;
    this.timers = timers;
    this.now = now;
    this.config = null;
    this.link = null;
    /** @type {{ serial: string, host: string, hello: object|null, status: object, online: boolean }|null} */
    this.charger = null;
    /** The serial of the charger, known from its device when it is off at startup. */
    this.knownSerial = null;
    this.issues = createIssueLog(logger);
    this.announced = false;
    this.lastConnectionStatus = null;
    this.lastPublishAt = 0;
    this.timer = null;
    // Link events are handled one after the other.
    this.queue = Promise.resolve();
  }

  /** Resolves once every link event received so far has been handled. */
  async idle() {
    let queue;
    do {
      queue = this.queue;
      await queue;
    } while (queue !== this.queue);
  }

  enqueue(what, fn) {
    this.queue = this.queue.then(fn).catch((err) => logger.error(`${what} failed: ${err.message}`));
  }

  // --- Configuration -----------------------------------------------------------

  /** (Re)start with a configuration: connect, publish the device, start the timer. */
  async start(config) {
    this.stop();
    await this.idle();
    this.config = config;
    this.charger = null;
    this.announced = false;
    this.lastConnectionStatus = null;
    this.rememberCreatedCharger();
    if (!isConfigured(config)) {
      logger.info('Not configured yet: waiting for the address and the password of the charger');
      await this.reportConnection();
      return;
    }
    const link = new ChargerLink({
      host: config.host,
      password: config.password,
      connect: this.connect,
      ...this.linkOptions,
    });
    this.link = link;
    link.on('online', (snapshot) =>
      this.enqueue('Connection', () => this.onOnline(link, snapshot)),
    );
    link.on('update', (keys, before) =>
      this.enqueue('Update', () => this.onUpdate(link, keys, before)),
    );
    link.on('offline', (err) => this.enqueue('Disconnection', () => this.onOffline(link, err)));
    await link.start();
    await this.idle();
    if (!link.online) {
      await this.reportConnection();
    }
    this.schedule();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    const link = this.link;
    this.link = null;
    link?.removeAllListeners();
    link?.stop();
  }

  /**
   * The charger the user added to Gladys knows its serial and address (device
   * params): a charger off at startup still gets its "offline" state.
   */
  rememberCreatedCharger() {
    this.knownSerial = null;
    const chargers = (this.gladys.devices ?? [])
      .map((device) => Object.fromEntries((device.params ?? []).map((p) => [p.name, p.value])))
      .filter((params) => params.SERIAL);
    const sameHost = chargers.find((params) => params.HOST === this.config.host);
    const known = sameHost ?? (chargers.length === 1 ? chargers[0] : null);
    this.knownSerial = known ? String(known.SERIAL) : null;
  }

  /** The created devices, by external id. */
  createdDeviceIds() {
    return new Set((this.gladys.devices ?? []).map((device) => device.external_id));
  }

  isCreated(serial) {
    return this.createdDeviceIds().has(chargerIds(this.gladys, serial).device);
  }

  async publishDevices() {
    if (!this.charger) {
      return;
    }
    await this.gladys.publishDiscoveredDevices([
      buildDevice(this.gladys, this.charger, this.config),
    ]);
  }

  // --- Link events ---------------------------------------------------------------

  async onOnline(link, { hello, status }) {
    if (link !== this.link) {
      return;
    }
    const serial = String(status.sse ?? hello.serial);
    this.charger = { serial, host: this.config.host, hello, status, online: true };
    this.knownSerial = serial;
    if (!this.announced) {
      this.announced = true;
      logger.info(
        `${deviceName(this.charger)} (${modelName(status, hello)}, firmware ` +
          `${status.fwv ?? hello.version ?? '?'}) connected at ${this.config.host}`,
      );
    }
    this.issues.ok('link', `${this.config.host}: the charger answers again`);
    await this.reportConnection();
    await this.publishDevices().catch((err) =>
      logger.error(`Publishing the device failed: ${err.message}`),
    );
    await this.publishStates();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  async onUpdate(link, keys, before) {
    if (link !== this.link || !this.charger) {
      return;
    }
    this.charger.status = link.status;
    logger.debug(`Changed: ${keys.join(', ')}`);
    await this.detectEvents(keys, before);
    if (keys.some((key) => IMMEDIATE_KEYS.includes(key))) {
      await this.publishStates();
      // The widget's status rows are texts, not live tiles: nudge it.
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async onOffline(link, err) {
    if (link !== this.link) {
      return;
    }
    this.issues.fail('link', `${err.message}`);
    if (this.charger?.online) {
      this.charger.online = false;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
    await this.reportConnection();
    await this.publishOffline();
  }

  async publishOffline() {
    const serial = this.charger?.serial ?? this.knownSerial;
    if (!serial || !this.isCreated(serial)) {
      return;
    }
    await this.gladys
      .publishChangedStates(offlineStates(this.gladys, serial), { heartbeat: HEARTBEAT_MS })
      .catch((err) => logger.debug(`Publishing the offline state failed: ${err.message}`));
  }

  async publishStates() {
    const charger = this.charger;
    if (!charger?.online || !this.isCreated(charger.serial)) {
      return;
    }
    this.lastPublishAt = this.now();
    const states = statesFor(this.gladys, charger, this.config.language);
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    } catch (err) {
      // Sent again by the next tick (the SDK remembers only what Gladys took).
      this.issues.fail('publish', `Publishing the states failed: ${err.message}`);
      return;
    }
    this.issues.ok('publish', 'Publishing the states works again');
  }

  /**
   * "Charge finished": the car stopped drawing after a charge (`car` from
   * Charging to Complete). The states alone cannot tell it: Gladys' charging
   * state says "paused by the vehicle" for a car that is full, and a scene on
   * it would also fire when the integration restarts; the trigger also
   * carries the energy of the session.
   */
  async detectEvents(keys, before) {
    const { status, serial } = this.charger;
    if (!keys.includes('car') || before.car !== CAR.CHARGING || status.car !== CAR.COMPLETE) {
      return;
    }
    if (!this.isCreated(serial)) {
      return;
    }
    const wh = Number(status.wh);
    const data = {
      device: chargerIds(this.gladys, serial).device,
      charger: deviceName(this.charger),
      energy_kwh: Number.isFinite(wh) ? Math.round(wh / 10) / 100 : null,
    };
    logger.info(`${data.charger}: charge finished (${data.energy_kwh} kWh)`);
    await this.gladys
      .publishSceneEvent(SCENE_TRIGGER.CHARGE_FINISHED, data)
      .catch((err) => logger.error(`Scene event charge_finished refused: ${err.message}`));
  }

  /** The connection status of the Configuration screen, sent when it changes. */
  async reportConnection() {
    let connected;
    let message;
    if (this.config.invalidHost) {
      connected = false;
      message = MESSAGES.invalidHost(this.config.invalidHost);
    } else if (!isConfigured(this.config)) {
      connected = false;
      message = MESSAGES.notConfigured;
    } else if (this.link?.online) {
      connected = true;
    } else {
      connected = false;
      message = this.link?.lastError
        ? failureMessage(this.link.lastError, this.config.host)
        : undefined;
    }
    const key = JSON.stringify({ connected, message });
    if (key === this.lastConnectionStatus) {
      return;
    }
    this.lastConnectionStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => logger.debug(`Connection status not sent: ${err.message}`));
  }

  // --- Refresh -----------------------------------------------------------------

  schedule() {
    clearInterval(this.timer);
    this.timer = null;
    if (!this.timers || !this.link) {
      return;
    }
    this.timer = setInterval(() => {
      this.enqueue('Refresh', () => this.publishStates());
    }, refreshIntervalMs(this.config));
    this.timer.unref?.();
  }

  // --- Gladys asking -------------------------------------------------------------

  /** True when a Gladys device external id is this charger. */
  isOurDevice(deviceExternalId) {
    const serial = this.charger?.serial ?? this.knownSerial;
    return Boolean(serial) && chargerIds(this.gladys, serial).device === deviceExternalId;
  }

  /** The charger of a device external id (null when it never answered). */
  chargerOfDevice(deviceExternalId) {
    return this.charger && this.isOurDevice(deviceExternalId) ? this.charger : null;
  }

  /** The core's onPoll (fallback): publishes unless the timer just did, reconnects a lost charger. */
  async pollFromCore(device) {
    if (!this.link || !this.isOurDevice(device.external_id)) {
      logger.debug(`onPoll ignored for ${device.external_id}`);
      return;
    }
    if (!this.link.online) {
      // Not awaited: a charger that does not answer would hold the poll.
      this.link.reconnectNow();
      return;
    }
    if (this.now() - this.lastPublishAt < refreshIntervalMs(this.config) * 0.9) {
      logger.debug('onPoll: published moments ago, skipped');
      return;
    }
    await this.publishStates();
  }

  /**
   * A device was just added (or updated) in Gladys: the SDK forgot what it had
   * published for it, so everything is sent again now.
   */
  async deviceCreated(device) {
    if (!this.isOurDevice(device.external_id)) {
      return;
    }
    if (this.charger?.online) {
      await this.publishStates();
    } else {
      await this.publishOffline();
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** The charger a command is for: known and online. */
  commandTarget(deviceExternalId) {
    if (!this.isOurDevice(deviceExternalId)) {
      throw new Error(`Unknown charger ${deviceExternalId}`);
    }
    if (!this.link?.online || !this.charger?.online) {
      throw new UserError(MESSAGES.offline);
    }
    return this.charger;
  }

  /** Write, then publish so Gladys shows what the charger did. */
  async write(charger, key, value, what) {
    try {
      await this.link.set(key, value);
    } catch (err) {
      if (err instanceof WattpilotError) {
        logger.warn(`${deviceName(charger)}: ${err.message}`);
        throw new UserError(failureMessage(err, deviceName(charger)));
      }
      throw err;
    }
    logger.info(`${deviceName(charger)}: ${what}`);
  }

  /** @returns {Promise<object>} the message to show */
  async setCurrent(deviceExternalId, value) {
    const charger = this.commandTarget(deviceExternalId);
    const amps = Math.round(Number(value));
    const max = allowedMaxCurrent(charger.status);
    if (!Number.isFinite(amps) || amps < MIN_CURRENT || amps > max) {
      throw new UserError(MESSAGES.currentOutOfRange(MIN_CURRENT, max));
    }
    await this.write(charger, 'amp', amps, `charging current set to ${amps} A`);
    await this.afterWrite();
    return MESSAGES.currentSet(amps);
  }

  async setForceMode(deviceExternalId, mode) {
    const charger = this.commandTarget(deviceExternalId);
    if (!(mode in FORCE_MODES)) {
      throw new Error(`Unknown override ${mode}`);
    }
    await this.write(charger, 'frc', FORCE_MODES[mode], `override set to ${mode}`);
    await this.afterWrite();
    return MESSAGES.forceSet[mode];
  }

  async setChargingMode(deviceExternalId, mode) {
    const charger = this.commandTarget(deviceExternalId);
    if (!(mode in CHARGING_MODES)) {
      throw new Error(`Unknown charging mode ${mode}`);
    }
    await this.write(charger, 'lmo', CHARGING_MODES[mode], `charging mode set to ${mode}`);
    await this.afterWrite();
    return MESSAGES.modeSet[mode];
  }

  /** The widget's settings form: current and mode in one go. */
  async applySettings(deviceExternalId, { amps, mode }) {
    const charger = this.commandTarget(deviceExternalId);
    const max = allowedMaxCurrent(charger.status);
    const value = Math.round(Number(amps));
    if (!Number.isFinite(value) || value < MIN_CURRENT || value > max) {
      throw new UserError(MESSAGES.currentOutOfRange(MIN_CURRENT, max));
    }
    if (!(mode in CHARGING_MODES)) {
      throw new Error(`Unknown charging mode ${mode}`);
    }
    if (charger.status.amp !== value) {
      await this.write(charger, 'amp', value, `charging current set to ${value} A`);
    }
    if (charger.status.lmo !== CHARGING_MODES[mode]) {
      await this.write(charger, 'lmo', CHARGING_MODES[mode], `charging mode set to ${mode}`);
    }
    await this.afterWrite();
    return MESSAGES.settingsSet(value, optionLabel(mode));
  }

  /** The charger answered with the new value: show it now. */
  async afterWrite() {
    await this.idle();
    await this.publishStates();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** onSetValue: dispatch by feature. */
  async setValue(device, feature, value) {
    const ids = chargerIds(this.gladys, this.commandTarget(device.external_id).serial);
    switch (feature.external_id) {
      case ids.feature(FEATURE.TARGET_CURRENT):
        return this.setCurrent(device.external_id, value);
      case ids.feature(FEATURE.CHARGING_MODE):
        return this.setChargingMode(device.external_id, String(value));
      case ids.feature(FEATURE.FORCE_MODE):
        return this.setForceMode(device.external_id, String(value));
      default:
        throw new Error(`${feature.external_id} is read-only`);
    }
  }

  /** The "Test the connection" action: the link's own state, never a second session. */
  async testConnection() {
    logger.info('Action test_connection');
    if (this.config.invalidHost) {
      return MESSAGES.invalidHost(this.config.invalidHost);
    }
    if (!isConfigured(this.config) || !this.link) {
      return MESSAGES.notConfigured;
    }
    if (!this.link.online) {
      await this.link.reconnectNow();
      await this.idle();
    }
    if (this.link.online && this.charger) {
      const { status, hello, serial } = this.charger;
      return joinMessages([
        MESSAGES.testOk(
          deviceName(this.charger),
          serial,
          String(status.fwv ?? hello?.version ?? '?'),
        ),
      ]);
    }
    return failureMessage(this.link.lastError, this.config.host);
  }
}
