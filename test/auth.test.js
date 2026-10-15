// The authentication of the Wattpilot, against reference values computed with
// the Python implementations: hashlib (PBKDF2, as joscha82/wattpilot does) and
// the bcrypt code of the Home Assistant integration of mk-maddin run with the
// `bcrypt` package (Wattpilot Flex).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HASH,
  authMessage,
  bcryptPassword,
  bcryptSalt,
  hashPassword,
  hashTypeOf,
  hmacOf,
  pbkdf2Password,
  securedMessage,
} from '../src/wattpilot/auth.js';

test('PBKDF2 hash of Wattpilot Home and Go', async () => {
  assert.equal(
    await pbkdf2Password('my-secret-pw', '91234567'),
    'YqGTx/ES2yBj4mMl7NtvZzTXol/mQuWE',
  );
});

test('bcrypt hash of Wattpilot Flex', async () => {
  assert.equal(await bcryptSalt('91234567'), '$2a$08$...........H.OGB/.SE/u');
  assert.equal(await bcryptPassword('my-secret-pw', '91234567'), '.b.UAeRPYVGMn44EJQzN/kuHWIdNNGO');
  await assert.rejects(bcryptSalt('AB12'), /digits only/);
});

test('the hash type comes from hello', async () => {
  assert.equal(hashTypeOf({ devicetype: 'wattpilot' }), HASH.PBKDF2);
  assert.equal(hashTypeOf({ devicetype: 'wattpilot_flex' }), HASH.BCRYPT);
  assert.equal(hashTypeOf({ devicetype: 'wattpilot', hash: 'bcrypt' }), HASH.BCRYPT);
  assert.equal(hashTypeOf({ devicetype: 'wattpilot_flex', hash: 'pbkdf2' }), HASH.PBKDF2);
  assert.equal(
    await hashPassword('my-secret-pw', { serial: '91234567', hash: 'bcrypt' }),
    '.b.UAeRPYVGMn44EJQzN/kuHWIdNNGO',
  );
});

test('the auth answer and the secured message', () => {
  const auth = authMessage(
    'abcdefghijklmnopqrstuvwxyz012345',
    'tok1',
    'tok2',
    '00112233445566778899aabbccddeeff',
  );
  assert.deepEqual(auth, {
    type: 'auth',
    token3: '00112233445566778899aabbccddeeff',
    hash: 'd36236c2a4a167727c5f2cf497d8e681c6569386e6bc42174e9f548551bc8b01',
  });
  assert.match(authMessage('h', 't1', 't2').token3, /^[0-9a-f]{32}$/);

  const command = { type: 'setValue', requestId: 7, key: 'amp', value: 10 };
  const secured = securedMessage('hashed', command);
  assert.equal(secured.type, 'securedMsg');
  assert.equal(secured.requestId, '7sm');
  assert.deepEqual(JSON.parse(secured.data), command);
  assert.equal(secured.hmac, hmacOf('hashed', secured.data));
  assert.match(secured.hmac, /^[0-9a-f]{64}$/);
});
