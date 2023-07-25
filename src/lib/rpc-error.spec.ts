import test from 'ava';

import { RPCError } from './rpc-error';

const tests = [
  {
    input:
      'sendrawtransactionRPCerror:{"code":-27,"message":"Transactionalreadyinblockchain"}',
    output: 'Transaction already in chain (code: -27)',
  },
  {
    input: 'sendrawtransactionRPCerror:{"code":-26,"message":""}',
    output: 'Transaction or block was rejected by network rules (code: -26)',
  },
];

const invalidTests = ['code:1', 'invalid parameters', 'code:1, message:2'];

for (const valid of tests) {
  test(`should parse ${valid.input} correctly`, (t) => {
    const error = new RPCError(valid.input);
    t.is(error.message, valid.output);
  });
}

for (const invalid of invalidTests) {
  test(`should throw an error for ${invalid}`, (t) => {
    t.throws(() => {
      new RPCError(invalid);
    });
  });
}
