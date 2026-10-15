// -----------------------------------------------------------------------------
// Authentication of the Wattpilot WebSocket API, as implemented by the
// `wattpilot` library of joscha82 (MIT) and the Home Assistant integration of
// mk-maddin (Apache-2.0), cross-checked with mabunixda/wattpilot (Go,
// Apache-2.0). Nothing here talks to the network.
//
//   1. The charger says `hello` (serial number, device type, `secured`), then
//      `authRequired` with two tokens.
//   2. The password is hashed with the serial number as salt:
//        - Wattpilot Home / Go: PBKDF2-HMAC-SHA512, 100 000 rounds, 256 bytes,
//          base64, first 32 characters;
//        - Wattpilot Flex (`hash: "bcrypt"` in hello, or device type
//          `wattpilot_flex`): bcrypt (cost 8) of the SHA-256 of the password,
//          salted with the serial number, salt prefix removed.
//   3. The client answers `auth` with a random token3 and
//        hash = sha256(token3 + token2 + sha256(token1 + hashedPassword)).
//   4. When the charger is `secured`, every command is wrapped in a
//      `securedMsg` carrying an HMAC-SHA256 of the command, keyed with the
//      hashed password.
// -----------------------------------------------------------------------------

import { createHash, createHmac, pbkdf2, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);

export const HASH = { PBKDF2: 'pbkdf2', BCRYPT: 'bcrypt' };

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/**
 * Which password hash the charger expects, from its hello message.
 * @param {{ hash?: string, devicetype?: string }} hello
 */
export function hashTypeOf(hello) {
  if (hello?.hash === HASH.BCRYPT || hello?.hash === HASH.PBKDF2) {
    return hello.hash;
  }
  return hello?.devicetype === 'wattpilot_flex' ? HASH.BCRYPT : HASH.PBKDF2;
}

/** PBKDF2 hash of Wattpilot Home and Go (100 000 rounds: about 0.1 s, async). */
export async function pbkdf2Password(password, serial) {
  const key = await pbkdf2Async(String(password), String(serial), 100000, 256, 'sha512');
  return key.toString('base64').slice(0, 32);
}

/**
 * The bcrypt salt of a Wattpilot Flex: the digits of the serial number as
 * byte values (0-9), left-padded with zeros to 16 bytes, in bcrypt's base64.
 */
export async function bcryptSalt(serial) {
  const { default: bcrypt } = await import('bcryptjs');
  const digits = String(serial).trim();
  if (!/^\d+$/.test(digits)) {
    throw new Error('A Wattpilot Flex serial number has digits only');
  }
  const values = [...digits].map(Number);
  const bytes = [...new Array(Math.max(0, 16 - values.length)).fill(0), ...values];
  return `$2a$08$${bcrypt.encodeBase64(bytes, 16)}`;
}

/** bcrypt hash of Wattpilot Flex. */
export async function bcryptPassword(password, serial) {
  const { default: bcrypt } = await import('bcryptjs');
  const salt = await bcryptSalt(serial);
  const hashed = await bcrypt.hash(sha256(String(password)), salt);
  return hashed.slice(salt.length);
}

/**
 * The hashed password the charger checks, for its hello message.
 * @param {string} password
 * @param {{ serial: string, hash?: string, devicetype?: string }} hello
 */
export function hashPassword(password, hello) {
  return hashTypeOf(hello) === HASH.BCRYPT
    ? bcryptPassword(password, hello.serial)
    : pbkdf2Password(password, hello.serial);
}

/** The answer to `authRequired`. */
export function authMessage(hashedPassword, token1, token2, token3 = randomToken()) {
  const hash1 = sha256(`${token1}${hashedPassword}`);
  return { type: 'auth', token3, hash: sha256(`${token3}${token2}${hash1}`) };
}

/** 32 random hexadecimal characters. */
export function randomToken() {
  return randomBytes(16).toString('hex');
}

/**
 * A command, wrapped for a `secured` charger.
 * @param {string} hashedPassword
 * @param {{ requestId: number }} message
 */
export function securedMessage(hashedPassword, message) {
  const data = JSON.stringify(message);
  return {
    type: 'securedMsg',
    data,
    requestId: `${message.requestId}sm`,
    hmac: createHmac('sha256', hashedPassword).update(data).digest('hex'),
  };
}

/** The HMAC a secured message must carry (the fake charger of the tests checks it). */
export function hmacOf(hashedPassword, data) {
  return createHmac('sha256', hashedPassword).update(data).digest('hex');
}

/** The hash the charger expects in `auth` (the fake charger of the tests checks it). */
export function expectedAuthHash(hashedPassword, token1, token2, token3) {
  return authMessage(hashedPassword, token1, token2, token3).hash;
}
