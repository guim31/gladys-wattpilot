# Fronius Wattpilot

Siga y controle su cargador **Fronius Wattpilot** (Wattpilot Home y Go, 11 y
22 kW; Wattpilot Flex en prueba) desde Gladys, **en su red local**: Gladys se
comunica con el WebSocket del cargador, como hace la app Fronius
Solar.wattpilot en casa. Sin nube, sin cuenta de Fronius.

> **Desarrollada sin el hardware: sus comentarios son bienvenidos.** Esta
> integración se ha escrito a partir del protocolo tal como lo documentan e
> implementan otros proyectos libres (la biblioteca `wattpilot` de joscha82, la
> integración de Home Assistant de mk-maddin), y se ha probado contra un
> cargador simulado, sin un Wattpilot a mano. Si algo parece incorrecto, abra
> una issue en el repositorio de GitHub con los registros de la integración.

Esta integración no está afiliada a Fronius International GmbH.

## Requisitos

- Un Fronius Wattpilot (Home o Go, 11 o 22 kW) conectado a su Wi-Fi. El
  Wattpilot Flex está soportado en teoría (su comprobación de contraseña es
  distinta), pero sin probar.
- La **contraseña del cargador**: la que eligió en la app Solar.wattpilot al
  instalar el cargador (la app la pide para conectarse).
- Una **dirección IP fija** para el cargador, configurada en su router
  (reserva DHCP): la integración lo alcanza por su dirección.
- Gladys y el cargador en la misma red (puerto 80 del cargador accesible desde
  Gladys).
- Gladys 5.2.0 o posterior.

## Configuración

1. Instale la integración desde **Integraciones → Instalar desde GitHub** (o la
   tienda) y abra su pestaña **Configuración**.
2. **Dirección IP del cargador**: por ejemplo `192.0.2.10`.
3. **Contraseña del cargador**: la contraseña de la app Solar.wattpilot. Se
   queda en Gladys (campo secreto) y solo sale hacia el cargador, en forma de
   hash.
4. **Intervalo de actualización**: frecuencia de envío de las medidas
   (potencia, corriente, energía) a Gladys, 15 segundos por defecto.
5. **Idioma de los nombres de las funciones**: nombres de las funciones de los
   dispositivos nuevos e idioma de los textos de error (francés por defecto).
6. Guarde: el cargador aparece en la pestaña **Descubrimiento**. Añádalo.
7. El botón **Probar la conexión** indica si el cargador está conectado
   (nombre, número de serie, firmware) o por qué no.

## Actualización y uso de la red

La integración mantiene **una conexión WebSocket** abierta con el cargador,
que envía sus cambios por sí mismo: no se consulta nada en bucle. El cargador
envía sus medidas varias veces por segundo durante una carga; la integración
las transmite a Gladys al intervalo elegido, y **en el acto** cuando cambia
algo sobre lo que usted actúa (estado del coche, modo, corriente, forzado,
error). Solo se envían los valores que han cambiado, más todos los valores
cada 6 horas para que un valor estable nunca muestre «Sin valor reciente».
Gladys también consulta el dispositivo como respaldo; la integración omite
entonces un envío que acaba de hacer.

Cuando la conexión se corta, la integración se reconecta tras 5 s, 10 s,
30 s, y luego cada minuto. Una contraseña rechazada solo se reintenta cada
10 minutos. Un cargador en silencio durante un minuto recibe un ping, y la
conexión se vuelve a abrir si no responde.

## El dispositivo cargador

| Función              | Lo que muestra                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Conector             | Disponible (sin coche), Ocupado (coche enchufado), No disponible (sin conexión), En avería (error)                |
| Estado de la carga   | Cargando, Vehículo conectado (en espera), En pausa (vehículo): carga terminada, En pausa (cargador): no permitida |
| Coche enchufado      | 1 cuando hay un coche enchufado                                                                                   |
| Potencia de carga    | Potencia total, W                                                                                                 |
| Potencia L1, L2, L3  | Potencia por fase, W                                                                                              |
| Corriente L1, L2, L3 | Corriente por fase, A                                                                                             |
| Energía de la sesión | Energía desde que se enchufó el coche, kWh                                                                        |
| Energía total        | El contador del cargador, kWh: el seguimiento de energía de Gladys calcula a partir de él el consumo y su coste   |
| Corriente de carga   | **Comando**: la corriente ofrecida al coche, de 6 A a 16 A (11 kW) o 32 A (22 kW)                                 |
| Modo de carga        | **Comando**: Estándar, Eco, Next Trip — los modos de la app Solar.wattpilot                                       |
| Forzado de la carga  | **Comando**: Según el modo, Carga forzada, Parada forzada                                                         |
| Temperatura          | El sensor más caliente del cargador, °C                                                                           |
| Error                | El error del Wattpilot en palabras («Ninguno» cuando todo va bien)                                                |
| En línea             | 1 mientras el cargador está conectado                                                                             |

El **modo de carga** solo cambia de un modo a otro; sus ajustes (excedente
solar y precio límite de Eco, hora de salida y energía de Next Trip) se
quedan en la app Solar.wattpilot y en Solar.web: esta integración no duplica
la carga solar. **Carga forzada** carga decida lo que decida el modo; **Según
el modo** le devuelve la decisión.

La corriente no puede superar el límite fijado en la app («corriente
máxima»): la integración la rechaza con un mensaje en lugar de enviarla.

## Widget

Añada el widget **Fronius Wattpilot** a un panel y elija el cargador. Muestra
la potencia en directo, la energía de la sesión y la corriente de carga, el
estado (Lista, Cargando, En espera, Carga terminada, Error), el modo, un
forzado en curso y el error si lo hay. Cuatro botones: **Cargar** (carga
forzada), **Detener** (parada forzada), **Auto** (según el modo) y
**Ajustes…**, que abre un formulario para ajustar la corriente y el modo de
carga. El forzado en curso lleva un icono de marca.

## Disparador de escena

**Carga Wattpilot terminada**: el coche ha dejado de consumir tras una carga
(está lleno o ha alcanzado el límite fijado en el coche o en la app). Elija
opcionalmente el cargador. Las acciones siguientes pueden usar `energy_kwh`
(energía de la sesión) y `charger` (su nombre). Se dispara una vez por carga,
nunca al arrancar.

«Coche enchufado» no necesita disparador: use la función **Coche enchufado**
(pasa a 1) en un disparador «valor de un dispositivo».

## Acciones de escena

- **Ajustar el modo de carga Wattpilot**: Estándar, Eco o Next Trip.
- **Forzar o detener la carga Wattpilot**: carga forzada, parada forzada, o
  según el modo.

La corriente de carga no necesita acción propia: es una función, que se
ajusta con la acción habitual «controlar un dispositivo» de Gladys.

## Ejemplos de escenas

- **Sol de día, lleno de noche**: a las 8:00, «Ajustar el modo de carga
  Wattpilot» a Eco; a las 22:00, a Estándar.
- **Avíseme cuando el coche esté lleno**: disparador «Carga Wattpilot
  terminada» y luego enviar un mensaje «Carga terminada:
  {{triggerEvent.data.energy_kwh}} kWh».
- **Proteger el interruptor general**: cuando la potencia de la casa supera un
  umbral, ajustar la corriente de carga a 6 A; cuando baja, volver a 16 A.
- **Salida temprano mañana**: desde un botón del panel, «Forzar o detener la
  carga Wattpilot» a Carga forzada; a las 7:00, vuelta a Según el modo.

## Solución de problemas

- **«Sin respuesta»**: compruebe la dirección, que el cargador esté en el
  Wi-Fi y que Gladys y el cargador estén en la misma red.
- **«Algo responde, pero no un Wattpilot»**: la dirección es la de otro
  aparato (el router, el inversor…).
- **«El cargador rechaza la contraseña»**: vuelva a introducir la contraseña
  de la app Solar.wattpilot (cuidado con las mayúsculas). Tras un rechazo, la
  integración solo reintenta cada 10 minutos: pulse **Probar la conexión**
  para reintentar en el acto.
- **«Conectado, pero el cargador no ha enviado su estado a tiempo»**: reinicie
  el cargador y pulse **Probar la conexión**.
- **Un comando falla con «el cargador ha rechazado la solicitud»**: el valor
  está fuera de lo que el cargador acepta en este momento.
- Los registros de la integración dicen el resto: configure `LOG_LEVEL=debug`
  para el detalle de cada cambio.

## Limitaciones

- Un solo cargador por Gladys. Dos Wattpilot: abra una issue.
- Los nombres de las funciones y la corriente máxima se fijan al añadir el
  dispositivo (regla de Gladys): para cambiar de idioma, elimine el
  dispositivo y vuelva a añadirlo.
- Sin acceso a las tarjetas RFID, las programaciones, los ajustes solares y de
  precio, la conmutación de fases ni el bloqueo del cable: se quedan en la app
  Solar.wattpilot. El bloqueo del cable no se expone a propósito.
- Gladys mantiene una conexión abierta con el cargador, junto a la app y quizá
  otra caja domótica. El número de conexiones simultáneas aceptadas no está
  documentado: si la app ya no puede conectarse mientras Gladys lo está,
  indíquelo en una issue.
- Wattpilot Flex: su comprobación de contraseña (bcrypt) sigue la integración
  de Home Assistant, sin prueba en un Flex real.
- Probada solo contra un cargador simulado y descripciones publicadas del
  protocolo (vea la nota al principio).
