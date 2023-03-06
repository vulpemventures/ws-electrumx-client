# ws-electrumx-client

Light electrum x websocket client.

# Installation

```bash
npm install ws-electrumx-client
# or with yarn
yarn add ws-electrumx-client
```

# Usage

```typescript
import { ElectrumWS } from 'ws-electrumx-client';

const electrum = new ElectrumWS('wss://blockstream.info/liquidtestnet/electrum-websocket/api');
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
```

# Development

## Setup

```bash
yarn install
```

## Build

```bash
yarn build
```

## Test

Some tests requires [nigiri](https://nigiri.vulpem.com/) to be installed and running as well as a websocat instance mapping the electrumx port to a local ws endpoint.

```bash
nigiri start --liquid
```

You can map the nigiri electrum port to a local websocket endpoint using solsson/websocat docker image:

```bash
docker run --net=host solsson/websocat -b ws-l:127.0.0.1:1234 tcp:127.0.0.1:50001&
```

Then you can run the unit tests:

```bash
yarn test
```

## Test coverage

```bash
yarn cov
```

## Documentation

Generate and open in browser an HTML TypeDoc documentation:

```bash
yarn doc
```

## Linter and Formatter

```bash
yarn fix
```

# Acknowledgements

- [ElectrumX](https://electrumx.readthedocs.io/en/latest/index.html)
- [ElectrumX-Client](https://github.com/nimiq/electrum-client)
