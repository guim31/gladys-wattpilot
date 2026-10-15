// -----------------------------------------------------------------------------
// Dashboard widget "charger" (Gladys 5.2+): one Wattpilot at a glance, and the
// buttons a driver uses — charge now, stop, back to the charging mode, and a
// settings form (current and charging mode).
//
// Budget of the core: 8 components, laid out as 3 live tiles (bound to the
// device features, they follow the states with no refresh), 1 status list,
// 4 buttons. The current override is marked by its icon (check-circle), never
// by the `primary` style, invisible in dark mode (Gladys#3153).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import {
  CAR,
  CHARGING_MODES,
  MIN_CURRENT,
  allowedMaxCurrent,
  readings,
} from './wattpilot/model.js';
import { FEATURE } from './devices.js';
import { CAR_LABELS, OPTION_LABELS, WIDGET_TEXT, errorLabel, optionLabel } from './i18n.js';
import { WIDGET_KEY } from './hub.js';

export { WIDGET_KEY };

/** Button action keys (forever once published: dashboards keep them). */
export const WIDGET_ACTION = {
  FORCE_ON: 'force_on',
  FORCE_OFF: 'force_off',
  NEUTRAL: 'neutral',
  SETTINGS: 'settings',
};

const CAR_COLORS = {
  [CAR.IDLE]: WIDGET_COLORS.NEUTRAL,
  [CAR.CHARGING]: WIDGET_COLORS.SUCCESS,
  [CAR.WAIT_CAR]: WIDGET_COLORS.INFO,
  [CAR.COMPLETE]: WIDGET_COLORS.PRIMARY,
  [CAR.ERROR]: WIDGET_COLORS.DANGER,
};

const pick = (table, language) => table[language] ?? table.en;

/** A form label: the core wants multi-language objects there. */
const formLabel = (key) =>
  Object.fromEntries(Object.entries(WIDGET_TEXT).map(([lang, text]) => [lang, text[key]]));

/**
 * The content of the widget for one charger.
 * @param {object} options
 * @param {object|null} options.charger the hub's charger, null when it never answered
 * @param {string} options.deviceExternalId
 * @param {string} options.language
 */
export function buildChargerContent({ charger, deviceExternalId, language }) {
  const text = pick(WIDGET_TEXT, language);
  const options = pick(OPTION_LABELS, language);
  const cars = pick(CAR_LABELS, language);
  const featureId = (key) => `${deviceExternalId}:${key}`;

  const components = [
    { type: 'value', label: text.power, device_feature: featureId(FEATURE.POWER) },
    { type: 'value', label: text.session, device_feature: featureId(FEATURE.SESSION_ENERGY) },
    { type: 'value', label: text.current, device_feature: featureId(FEATURE.TARGET_CURRENT) },
  ];

  if (!charger || !charger.online) {
    components.push({
      type: 'status',
      items: [{ label: text.state, value: cars.offline, color: WIDGET_COLORS.WARNING }],
    });
    return { ttl_seconds: 60, components };
  }

  const r = readings(charger.status);
  const items = [
    {
      label: text.state,
      value: cars[r.car] ?? cars[CAR.UNKNOWN],
      color: CAR_COLORS[r.car] ?? WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (r.mode) {
    items.push({ label: text.mode, value: options[r.mode], color: WIDGET_COLORS.NEUTRAL });
  }
  if (r.force && r.force !== 'neutral') {
    items.push({
      label: text.override,
      value: options[r.force],
      color: r.force === 'off' ? WIDGET_COLORS.WARNING : WIDGET_COLORS.INFO,
    });
  }
  if (r.error !== null && r.error !== 0) {
    items.push({
      label: text.error,
      value: errorLabel(language, r.error),
      color: WIDGET_COLORS.DANGER,
    });
  }
  components.push({ type: 'status', items });

  const forceButton = (force, label, icon, key) => ({
    type: 'button',
    label,
    icon: r.force === force ? 'check-circle' : icon,
    style: 'secondary',
    action: { key },
  });
  components.push(
    forceButton('on', text.charge, 'zap', WIDGET_ACTION.FORCE_ON),
    forceButton('off', text.stop, 'pause-circle', WIDGET_ACTION.FORCE_OFF),
    forceButton('neutral', text.auto, 'refresh-cw', WIDGET_ACTION.NEUTRAL),
    {
      type: 'button',
      label: text.settings,
      icon: 'sliders',
      style: 'secondary',
      action: {
        key: WIDGET_ACTION.SETTINGS,
        fields: [
          {
            key: 'amps',
            type: 'number',
            label: formLabel('currentField'),
            required: true,
            min: MIN_CURRENT,
            max: allowedMaxCurrent(charger.status),
            default: r.targetCurrent ?? MIN_CURRENT,
          },
          {
            key: 'mode',
            type: 'select',
            label: formLabel('modeField'),
            required: true,
            default: r.mode ?? 'default',
            options: Object.keys(CHARGING_MODES).map((value) => ({
              value,
              label: optionLabel(value),
            })),
          },
        ],
      },
    },
  );
  return { ttl_seconds: 60, components };
}

/** The content when the widget has no charger to show. */
export function messageContent(message) {
  return { components: [{ type: 'text', variant: 'body', text: message }] };
}

/**
 * The widget handlers, bound to the hub.
 * @param {import('./hub.js').ChargerHub} hub
 */
export function createWidget(hub) {
  return {
    async get({ settings = {}, language = 'en' }) {
      const text = pick(WIDGET_TEXT, language);
      const deviceExternalId = settings.charger;
      if (!deviceExternalId) {
        return messageContent(text.pick);
      }
      if (!hub.isOurDevice(deviceExternalId)) {
        return messageContent(text.unknownCharger);
      }
      return buildChargerContent({
        charger: hub.chargerOfDevice(deviceExternalId),
        deviceExternalId,
        language,
      });
    },

    async action(actionKey, _params, { settings = {}, values } = {}) {
      const device = settings.charger;
      switch (actionKey) {
        case WIDGET_ACTION.FORCE_ON:
          return hub.setForceMode(device, 'on');
        case WIDGET_ACTION.FORCE_OFF:
          return hub.setForceMode(device, 'off');
        case WIDGET_ACTION.NEUTRAL:
          return hub.setForceMode(device, 'neutral');
        case WIDGET_ACTION.SETTINGS:
          // A core older than 5.2.0 drops the form and sends no values.
          if (values?.amps === undefined || values?.mode === undefined) {
            throw new Error('No values received: Gladys 5.2.0 or later is needed');
          }
          return hub.applySettings(device, values);
        default:
          throw new Error(`Unknown widget action ${actionKey}`);
      }
    },
  };
}

/** Kept for the tests: the ids the content binds to exist on the device. */
export function boundFeatureIds(content) {
  return content.components.filter((c) => c.device_feature).map((c) => c.device_feature);
}
