// -----------------------------------------------------------------------------
// A fake Wattpilot, for end-to-end tests: a real WebSocket server on
// 127.0.0.1 speaking the Wattpilot protocol at `/ws`.
//
//   - hello, then authRequired with fresh tokens; the `auth` hash is checked
//     against the password, with the PBKDF2 or bcrypt hash of the fixture's
//     hello (authError otherwise, as the charger answers);
//   - the full status in two `fullStatus` messages (partial, then complete);
//   - `setValue` (wrapped in a `securedMsg` with a valid HMAC when the charger
//     is `secured`), answered with a `response`, then a `deltaStatus`;
//   - `push(changes)` sends a `deltaStatus`, as the charger does on its own.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { expectedAuthHash, hashPassword, hmacOf, randomToken } from '../../src/wattpilot/auth.js';

export const PASSWORD = 'test-password-1';

export function loadFixture(name) {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/wattpilot/${name}.json`, import.meta.url), 'utf8'),
  );
}

export const FIXTURES = {
  idle: 'home-11-idle-36.3',
  charging: 'home-22-charging-eco-38.5',
  complete: 'go-22-complete-nexttrip-40.7',
  error: 'home-11-error-overtemp-38.5',
  flex: 'flex-11-waiting-42.2',
};

/** The serial number of a fixture. */
export const serialOf = (key) => loadFixture(FIXTURES[key]).hello.serial;

/**
 * @param {{ hello: object, status: object }} fixture
 * @param {object} [options]
 * @param {string} [options.password]
 * @param {number} [options.port] 0: any free port
 */
export async function startFakeWattpilot(fixture, { password = PASSWORD, port = 0 } = {}) {
  const server = createServer((request, response) => {
    // Plain HTTP: the charger's web page, not the API.
    response.writeHead(404).end('Not found');
  });
  const wss = new WebSocketServer({ noServer: true });
  const hashed = await hashPassword(password, fixture.hello);

  const charger = {
    hello: structuredClone(fixture.hello),
    status: structuredClone(fixture.status),
    password,
    /** Every message received from clients, parsed (secured ones unwrapped). */
    received: [],
    /** setValue commands applied. */
    writes: [],
    sockets: new Set(),
    connections: 0,
    /** Answers the WebSocket upgrade (false: an HTTP page answers instead). */
    wsEnabled: true,
    /** Sends the full status after the authentication (false: never does). */
    sendsStatus: true,
    /** Answers pings (false: a frozen charger). */
    answersPings: true,
    host: null,

    /** A deltaStatus pushed by the charger. */
    push(changes) {
      Object.assign(charger.status, changes);
      for (const socket of charger.authenticated()) {
        socket.send(JSON.stringify({ type: 'deltaStatus', status: changes }));
      }
    },

    authenticated() {
      return [...charger.sockets].filter((socket) => socket.authenticated);
    },

    /** Drop every connection (the charger reboots, the Wi-Fi goes). */
    dropAll() {
      for (const socket of charger.sockets) {
        socket.terminate();
      }
    },

    write(key, value) {
      const max = charger.status.var === 11 ? 16 : 32;
      switch (key) {
        case 'amp':
          if (!Number.isInteger(value) || value < 6 || value > Math.min(max, charger.status.ama)) {
            return 'value out of range';
          }
          break;
        case 'frc':
          if (![0, 1, 2].includes(value)) {
            return 'value out of range';
          }
          break;
        case 'lmo':
          if (![3, 4, 5].includes(value)) {
            return 'value out of range';
          }
          break;
        default:
          return 'unknown key';
      }
      charger.status[key] = value;
      charger.writes.push({ key, value });
      return true;
    },

    handle(socket, raw) {
      const message = JSON.parse(raw.toString());
      if (message.type === 'auth') {
        charger.received.push(message);
        const expected = expectedAuthHash(hashed, socket.token1, socket.token2, message.token3);
        if (message.hash !== expected) {
          socket.send(JSON.stringify({ type: 'authError', message: 'Wrong password' }));
          return;
        }
        socket.authenticated = true;
        socket.send(JSON.stringify({ type: 'authSuccess', token3: message.token3, hash: 'x' }));
        if (!charger.sendsStatus) {
          return;
        }
        const entries = Object.entries(charger.status);
        const half = Math.ceil(entries.length / 2);
        socket.send(
          JSON.stringify({
            type: 'fullStatus',
            partial: true,
            status: Object.fromEntries(entries.slice(0, half)),
          }),
        );
        socket.send(
          JSON.stringify({
            type: 'fullStatus',
            partial: false,
            status: Object.fromEntries(entries.slice(half)),
          }),
        );
        return;
      }
      if (!socket.authenticated) {
        return;
      }
      let command = message;
      if (message.type === 'securedMsg') {
        if (message.hmac !== hmacOf(hashed, message.data)) {
          socket.send(
            JSON.stringify({
              type: 'response',
              requestId: message.requestId,
              success: false,
              message: 'invalid hmac',
            }),
          );
          return;
        }
        command = JSON.parse(message.data);
      } else if (charger.hello.secured && message.type === 'setValue') {
        socket.send(
          JSON.stringify({
            type: 'response',
            requestId: message.requestId,
            success: false,
            message: 'secured message required',
          }),
        );
        return;
      }
      charger.received.push(command);
      if (command.type !== 'setValue') {
        return;
      }
      const result = charger.write(command.key, command.value);
      const requestId = message.type === 'securedMsg' ? message.requestId : command.requestId;
      if (result !== true) {
        socket.send(
          JSON.stringify({ type: 'response', requestId, success: false, message: result }),
        );
        return;
      }
      socket.send(
        JSON.stringify({
          type: 'response',
          requestId,
          success: true,
          status: { [command.key]: command.value },
        }),
      );
      charger.push({ [command.key]: command.value });
    },

    async close() {
      charger.dropAll();
      wss.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };

  server.on('upgrade', (request, socket, head) => {
    if (!charger.wsEnabled || request.url !== '/ws') {
      socket.end('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      charger.connections += 1;
      charger.sockets.add(ws);
      ws.token1 = randomToken();
      ws.token2 = randomToken();
      ws.on('close', () => charger.sockets.delete(ws));
      ws.on('message', (raw) => charger.handle(ws, raw));
      // ws answers pings by itself; a frozen charger does not.
      ws.on('ping', () => {});
      if (!charger.answersPings) {
        ws.pong = () => {};
      }
      ws.send(JSON.stringify(charger.hello));
      ws.send(JSON.stringify({ type: 'authRequired', token1: ws.token1, token2: ws.token2 }));
    });
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  charger.host = `127.0.0.1:${server.address().port}`;
  return charger;
}
