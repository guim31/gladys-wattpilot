// -----------------------------------------------------------------------------
// Every text the integration produces, in the four languages of the Gladys
// interface. German says "du", Spanish "usted" (test/i18n.test.js checks it).
//
// Two kinds of tables:
//   - one table per language (NAMES, OPTION_LABELS...): texts fixed in Gladys
//     in the language of the config (`language`, French by default), since a
//     device integration does not receive the user's language;
//   - multi-language objects (MESSAGES): the core picks the user's language.
//
// The brand names (Wattpilot, Fronius, Next Trip, Solar.web) are not translated.
// -----------------------------------------------------------------------------

/** Feature names, fixed when the device is added to Gladys. */
export const NAMES = {
  en: {
    connector_status: 'Connector',
    charging_state: 'Charging state',
    plugged: 'Car plugged in',
    power: 'Charging power',
    power_l1: 'Power L1',
    power_l2: 'Power L2',
    power_l3: 'Power L3',
    current_l1: 'Current L1',
    current_l2: 'Current L2',
    current_l3: 'Current L3',
    session_energy: 'Session energy',
    total_energy: 'Total energy',
    target_current: 'Charging current',
    charging_mode: 'Charging mode',
    force_mode: 'Charge override',
    temperature: 'Temperature',
    error: 'Error',
    online: 'Online',
  },
  fr: {
    connector_status: 'Connecteur',
    charging_state: 'État de la charge',
    plugged: 'Voiture branchée',
    power: 'Puissance de charge',
    power_l1: 'Puissance L1',
    power_l2: 'Puissance L2',
    power_l3: 'Puissance L3',
    current_l1: 'Courant L1',
    current_l2: 'Courant L2',
    current_l3: 'Courant L3',
    session_energy: 'Énergie de la session',
    total_energy: 'Énergie totale',
    target_current: 'Courant de charge',
    charging_mode: 'Mode de charge',
    force_mode: 'Forçage de la charge',
    temperature: 'Température',
    error: 'Erreur',
    online: 'En ligne',
  },
  de: {
    connector_status: 'Anschluss',
    charging_state: 'Ladezustand',
    plugged: 'Auto angesteckt',
    power: 'Ladeleistung',
    power_l1: 'Leistung L1',
    power_l2: 'Leistung L2',
    power_l3: 'Leistung L3',
    current_l1: 'Stromstärke L1',
    current_l2: 'Stromstärke L2',
    current_l3: 'Stromstärke L3',
    session_energy: 'Energie der Sitzung',
    total_energy: 'Gesamtenergie',
    target_current: 'Ladestrom',
    charging_mode: 'Lademodus',
    force_mode: 'Laden erzwingen',
    temperature: 'Temperatur',
    error: 'Fehler',
    online: 'Online',
  },
  es: {
    connector_status: 'Conector',
    charging_state: 'Estado de la carga',
    plugged: 'Coche enchufado',
    power: 'Potencia de carga',
    power_l1: 'Potencia L1',
    power_l2: 'Potencia L2',
    power_l3: 'Potencia L3',
    current_l1: 'Corriente L1',
    current_l2: 'Corriente L2',
    current_l3: 'Corriente L3',
    session_energy: 'Energía de la sesión',
    total_energy: 'Energía total',
    target_current: 'Corriente de carga',
    charging_mode: 'Modo de carga',
    force_mode: 'Forzado de la carga',
    temperature: 'Temperatura',
    error: 'Error',
    online: 'En línea',
  },
};

/** Labels of the select options (charging mode, override). */
export const OPTION_LABELS = {
  en: {
    default: 'Default',
    eco: 'Eco',
    next_trip: 'Next Trip',
    neutral: 'Follow the mode',
    off: 'Forced stop',
    on: 'Forced charge',
  },
  fr: {
    default: 'Standard',
    eco: 'Éco',
    next_trip: 'Next Trip',
    neutral: 'Selon le mode',
    off: 'Arrêt forcé',
    on: 'Charge forcée',
  },
  de: {
    default: 'Standard',
    eco: 'Eco',
    next_trip: 'Next Trip',
    neutral: 'Nach Modus',
    off: 'Erzwungener Stopp',
    on: 'Erzwungenes Laden',
  },
  es: {
    default: 'Estándar',
    eco: 'Eco',
    next_trip: 'Next Trip',
    neutral: 'Según el modo',
    off: 'Parada forzada',
    on: 'Carga forzada',
  },
};

/** The Wattpilot car state, as the widget says it (key = `car` value). */
export const CAR_LABELS = {
  en: {
    0: 'Unknown',
    1: 'Ready',
    2: 'Charging',
    3: 'Waiting',
    4: 'Charge complete',
    5: 'Error',
    offline: 'Offline',
  },
  fr: {
    0: 'Inconnu',
    1: 'Prête',
    2: 'En charge',
    3: 'En attente',
    4: 'Charge terminée',
    5: 'Erreur',
    offline: 'Hors ligne',
  },
  de: {
    0: 'Unbekannt',
    1: 'Bereit',
    2: 'Lädt',
    3: 'Wartet',
    4: 'Laden beendet',
    5: 'Fehler',
    offline: 'Offline',
  },
  es: {
    0: 'Desconocido',
    1: 'Lista',
    2: 'Cargando',
    3: 'En espera',
    4: 'Carga terminada',
    5: 'Error',
    offline: 'Sin conexión',
  },
};

/** Wattpilot `err` codes (same as the go-e API v2), as the Error feature says them. */
export const ERROR_LABELS = {
  en: {
    0: 'None',
    1: 'Residual current (AC)',
    2: 'Residual current (DC)',
    3: 'Phase fault',
    4: 'Overvoltage',
    5: 'Overcurrent',
    6: 'Diode fault',
    7: 'Invalid cable (PP)',
    8: 'Earth fault',
    9: 'Contactor stuck',
    10: 'Contactor missing',
    11: 'Residual current device fault',
    12: 'Unknown error',
    13: 'Overheating',
    14: 'No communication',
    15: 'Cable lock stuck open',
    16: 'Cable lock stuck locked',
    other: 'Error',
  },
  fr: {
    0: 'Aucune',
    1: 'Courant de fuite (AC)',
    2: 'Courant de fuite (DC)',
    3: 'Défaut de phase',
    4: 'Surtension',
    5: 'Surintensité',
    6: 'Défaut de diode',
    7: 'Câble non valide (PP)',
    8: 'Défaut de terre',
    9: 'Contacteur bloqué',
    10: 'Contacteur absent',
    11: 'Défaut du différentiel',
    12: 'Erreur inconnue',
    13: 'Surchauffe',
    14: 'Pas de communication',
    15: 'Verrou du câble bloqué ouvert',
    16: 'Verrou du câble bloqué fermé',
    other: 'Erreur',
  },
  de: {
    0: 'Keiner',
    1: 'Fehlerstrom (AC)',
    2: 'Fehlerstrom (DC)',
    3: 'Phasenfehler',
    4: 'Überspannung',
    5: 'Überstrom',
    6: 'Diodenfehler',
    7: 'Ungültiges Kabel (PP)',
    8: 'Erdungsfehler',
    9: 'Schütz klemmt',
    10: 'Schütz fehlt',
    11: 'Fehler des FI-Schutzes',
    12: 'Unbekannter Fehler',
    13: 'Überhitzung',
    14: 'Keine Kommunikation',
    15: 'Kabelverriegelung klemmt offen',
    16: 'Kabelverriegelung klemmt zu',
    other: 'Fehler',
  },
  es: {
    0: 'Ninguno',
    1: 'Corriente de fuga (AC)',
    2: 'Corriente de fuga (DC)',
    3: 'Fallo de fase',
    4: 'Sobretensión',
    5: 'Sobreintensidad',
    6: 'Fallo de diodo',
    7: 'Cable no válido (PP)',
    8: 'Fallo de tierra',
    9: 'Contactor bloqueado',
    10: 'Contactor ausente',
    11: 'Fallo del diferencial',
    12: 'Error desconocido',
    13: 'Sobrecalentamiento',
    14: 'Sin comunicación',
    15: 'Bloqueo del cable atascado abierto',
    16: 'Bloqueo del cable atascado cerrado',
    other: 'Error',
  },
};

/** The text of the Error feature: never empty (Gladys ignores an empty text). */
export function errorLabel(language, code) {
  const table = ERROR_LABELS[language] ?? ERROR_LABELS.en;
  return table[code] ?? `${table.other} ${code}`;
}

/** The widget texts, one table per language. */
export const WIDGET_TEXT = {
  en: {
    state: 'State',
    mode: 'Mode',
    override: 'Override',
    error: 'Error',
    power: 'Power',
    session: 'Session',
    current: 'Current',
    charge: 'Charge',
    stop: 'Stop',
    auto: 'Auto',
    settings: 'Settings…',
    currentField: 'Charging current (A)',
    modeField: 'Charging mode',
    pick: 'Pick a charger in the widget settings.',
    unknownCharger: 'This charger is not configured any more.',
  },
  fr: {
    state: 'État',
    mode: 'Mode',
    override: 'Forçage',
    error: 'Erreur',
    power: 'Puissance',
    session: 'Session',
    current: 'Courant',
    charge: 'Charger',
    stop: 'Arrêter',
    auto: 'Auto',
    settings: 'Réglages…',
    currentField: 'Courant de charge (A)',
    modeField: 'Mode de charge',
    pick: 'Choisissez une borne dans les réglages du widget.',
    unknownCharger: "Cette borne n'est plus configurée.",
  },
  de: {
    state: 'Zustand',
    mode: 'Modus',
    override: 'Erzwungen',
    error: 'Fehler',
    power: 'Leistung',
    session: 'Sitzung',
    current: 'Strom',
    charge: 'Laden',
    stop: 'Stoppen',
    auto: 'Auto',
    settings: 'Einstellungen…',
    currentField: 'Ladestrom (A)',
    modeField: 'Lademodus',
    pick: 'Wähle eine Ladestation in den Widget-Einstellungen.',
    unknownCharger: 'Diese Ladestation ist nicht mehr konfiguriert.',
  },
  es: {
    state: 'Estado',
    mode: 'Modo',
    override: 'Forzado',
    error: 'Error',
    power: 'Potencia',
    session: 'Sesión',
    current: 'Corriente',
    charge: 'Cargar',
    stop: 'Detener',
    auto: 'Auto',
    settings: 'Ajustes…',
    currentField: 'Corriente de carga (A)',
    modeField: 'Modo de carga',
    pick: 'Elija un cargador en los ajustes del widget.',
    unknownCharger: 'Este cargador ya no está configurado.',
  },
};

/** Messages shown by the core in the user's language (multi-language objects). */
export const MESSAGES = {
  notConfigured: {
    en: 'Enter the IP address and the password of your Wattpilot.',
    fr: "Saisissez l'adresse IP et le mot de passe de votre Wattpilot.",
    de: 'Gib die IP-Adresse und das Passwort deines Wattpilot ein.',
    es: 'Introduzca la dirección IP y la contraseña de su Wattpilot.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  invalidHost: (host) => ({
    en: `Invalid address: ${host}. Enter an IP address or a host name, without path.`,
    fr: `Adresse non valide : ${host}. Saisissez une adresse IP ou un nom d'hôte, sans chemin.`,
    de: `Ungültige Adresse: ${host}. Gib eine IP-Adresse oder einen Hostnamen ohne Pfad ein.`,
    es: `Dirección no válida: ${host}. Introduzca una dirección IP o un nombre de host, sin ruta.`,
  }),
  // Why the charger does not answer, by WattpilotError kind.
  failure: {
    unreachable: (where) => ({
      en: `${where}: no answer. Check the address and that the charger is on the network.`,
      fr: `${where} : pas de réponse. Vérifiez l'adresse et que la borne est sur le réseau.`,
      de: `${where}: keine Antwort. Prüfe die Adresse und ob die Ladestation im Netzwerk ist.`,
      es: `${where}: sin respuesta. Compruebe la dirección y que el cargador esté en la red.`,
    }),
    not_wattpilot: (where) => ({
      en: `${where}: something answers, but not a Wattpilot. Check the address.`,
      fr: `${where} : un appareil répond, mais pas un Wattpilot. Vérifiez l'adresse.`,
      de: `${where}: Es antwortet etwas, aber kein Wattpilot. Prüfe die Adresse.`,
      es: `${where}: algo responde, pero no un Wattpilot. Compruebe la dirección.`,
    }),
    auth_failed: (where) => ({
      en: `${where}: the charger refused the password. Enter the one set in the Wattpilot app.`,
      fr: `${where} : la borne refuse le mot de passe. Saisissez celui défini dans l'appli Wattpilot.`,
      de: `${where}: Die Ladestation lehnt das Passwort ab. Gib das in der Wattpilot-App festgelegte ein.`,
      es: `${where}: el cargador rechaza la contraseña. Introduzca la definida en la app Wattpilot.`,
    }),
    no_password: (where) => ({
      en: `${where}: enter the password of the charger.`,
      fr: `${where} : saisissez le mot de passe de la borne.`,
      de: `${where}: Gib das Passwort der Ladestation ein.`,
      es: `${where}: introduzca la contraseña del cargador.`,
    }),
    timeout: (where) => ({
      en: `${where}: connected, but the charger did not send its status in time.`,
      fr: `${where} : connectée, mais la borne n'a pas envoyé son état à temps.`,
      de: `${where}: verbunden, aber die Ladestation hat ihren Status nicht rechtzeitig gesendet.`,
      es: `${where}: conectado, pero el cargador no ha enviado su estado a tiempo.`,
    }),
    closed: (where) => ({
      en: `${where}: connection lost, reconnecting.`,
      fr: `${where} : connexion perdue, reconnexion en cours.`,
      de: `${where}: Verbindung verloren, verbinde neu.`,
      es: `${where}: conexión perdida, reconectando.`,
    }),
    rejected: (where) => ({
      en: `${where}: the charger refused the request.`,
      fr: `${where} : la borne a refusé la demande.`,
      de: `${where}: Die Ladestation hat die Anfrage abgelehnt.`,
      es: `${where}: el cargador ha rechazado la solicitud.`,
    }),
  },
  // The "Test the connection" action.
  testOk: (name, serial, firmware) => ({
    en: `${name} (serial ${serial}, firmware ${firmware}): connected.`,
    fr: `${name} (n° ${serial}, micrologiciel ${firmware}) : connectée.`,
    de: `${name} (Nr. ${serial}, Firmware ${firmware}): verbunden.`,
    es: `${name} (n.º ${serial}, firmware ${firmware}): conectado.`,
  }),
  // Commands: shown as the toast of the widget and the result of scene actions.
  offline: {
    en: 'The charger is offline: nothing was sent.',
    fr: "La borne est hors ligne : rien n'a été envoyé.",
    de: 'Die Ladestation ist offline: Es wurde nichts gesendet.',
    es: 'El cargador está sin conexión: no se ha enviado nada.',
  },
  currentOutOfRange: (min, max) => ({
    en: `The charging current must be between ${min} and ${max} A.`,
    fr: `Le courant de charge doit être compris entre ${min} et ${max} A.`,
    de: `Der Ladestrom muss zwischen ${min} und ${max} A liegen.`,
    es: `La corriente de carga debe estar entre ${min} y ${max} A.`,
  }),
  currentSet: (amps) => ({
    en: `Charging current set to ${amps} A.`,
    fr: `Courant de charge réglé sur ${amps} A.`,
    de: `Ladestrom auf ${amps} A gestellt.`,
    es: `Corriente de carga ajustada a ${amps} A.`,
  }),
  settingsSet: (amps, mode) => ({
    en: `Charging current ${amps} A, mode ${mode.en}.`,
    fr: `Courant de charge ${amps} A, mode ${mode.fr}.`,
    de: `Ladestrom ${amps} A, Modus ${mode.de}.`,
    es: `Corriente de carga ${amps} A, modo ${mode.es}.`,
  }),
  forceSet: {
    neutral: {
      en: 'Back to the charging mode.',
      fr: 'Retour au mode de charge.',
      de: 'Zurück zum Lademodus.',
      es: 'Vuelta al modo de carga.',
    },
    off: {
      en: 'Charging stopped.',
      fr: 'Charge arrêtée.',
      de: 'Laden gestoppt.',
      es: 'Carga detenida.',
    },
    on: {
      en: 'Charging forced on.',
      fr: 'Charge forcée.',
      de: 'Laden erzwungen.',
      es: 'Carga forzada.',
    },
  },
  modeSet: {
    default: {
      en: 'Charging mode: Default.',
      fr: 'Mode de charge : Standard.',
      de: 'Lademodus: Standard.',
      es: 'Modo de carga: Estándar.',
    },
    eco: {
      en: 'Charging mode: Eco.',
      fr: 'Mode de charge : Éco.',
      de: 'Lademodus: Eco.',
      es: 'Modo de carga: Eco.',
    },
    next_trip: {
      en: 'Charging mode: Next Trip.',
      fr: 'Mode de charge : Next Trip.',
      de: 'Lademodus: Next Trip.',
      es: 'Modo de carga: Next Trip.',
    },
  },
};

/** The option labels of one option value, as a multi-language object. */
export function optionLabel(value) {
  return Object.fromEntries(
    Object.entries(OPTION_LABELS).map(([lang, labels]) => [lang, labels[value]]),
  );
}

/** One line of a multi-language object list joined per language. */
export function joinMessages(messages, separator = '\n') {
  const result = {};
  for (const lang of ['en', 'fr', 'de', 'es']) {
    result[lang] = messages.map((message) => message[lang]).join(separator);
  }
  return result;
}
