import test from 'ava';

import { ElectrumWS, ElectrumWSEvent } from './electrum-ws';

const localURL = 'ws://127.0.0.1:1234' || process.env.LOCAL_TEST_WS_URL;

test('constructor should connect to electrum server', async (t) => {
  const electrum = new ElectrumWS(localURL);
  // wait for connection
  await new Promise<void>((resolve) => {
    electrum.on(ElectrumWSEvent.CONNECTED, () => {
      resolve();
    });
  });
  t.pass();
});

test('close should disconnect from electrum server', async (t) => {
  const electrum = new ElectrumWS(localURL);
  // wait for connection
  await new Promise<void>((resolve) => {
    electrum.on(ElectrumWSEvent.CONNECTED, () => {
      resolve();
    });
  });
  await electrum.close('close reason');
  t.false(electrum.isConnected());
  t.pass();
});

test('should be able to send some electrum requests', async (t) => {
  const electrum = new ElectrumWS(localURL);
  const response = await electrum.request<number>('blockchain.estimatefee', 1);
  t.is(typeof response, 'number');

  const blockHeaderResponse = await electrum.request<string>(
    'blockchain.block.header',
    1
  );
  t.is(typeof blockHeaderResponse, 'string');

  t.pass();
});

test('should be able to send multiple requests using batchRequest', async (t) => {
  const electrum = new ElectrumWS(localURL);
  const response = await electrum.batchRequest(
    {
      method: 'blockchain.estimatefee',
      params: [1],
    },
    {
      method: 'blockchain.block.header',
      params: [1],
    }
  );
  t.is(response.length, 2);
  t.is(typeof response[0], 'number');
  t.is(typeof response[1], 'string');
  t.pass();
});

test('should throw an error if the method name is invalid', async (t) => {
  const electrum = new ElectrumWS(localURL);
  await t.throwsAsync(async () => {
    await electrum.request<number>(
      'blockchain.estimatefee.bad.request.name',
      1
    );
  });
  t.pass();
});

test('should throw and error if the request parameters are invalid', async (t) => {
  const electrum = new ElectrumWS(localURL);
  await t.throwsAsync(async () => {
    await electrum.request<number>('blockchain.estimatefee', [1]); // should be a number, not an array
  });
  t.pass();
});
