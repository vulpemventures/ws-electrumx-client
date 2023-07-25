// source: https://github.com/nimiq/electrum-client
import WebSocket from 'isomorphic-ws';

import { Observable } from './observable';
import { RPCError } from './rpc-error';

export type RpcResponse = {
  jsonrpc: string;
  result?: unknown;
  error?:
    | string
    | {
        code: number;
        message: string;
      };
  id: number;
};

export function isRpcResponse(obj: unknown): obj is RpcResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'jsonrpc' in obj &&
    typeof obj['jsonrpc'] === 'string' &&
    'id' in obj &&
    typeof obj['id'] === 'number'
  );
}

export type RpcRequest = {
  jsonrpc: string; // jsonrpc version, should be 2.0
  method: string; // electrum method name
  params?: unknown[]; // electrum method parameters
};

export function isRpcRequest(obj: unknown): obj is RpcRequest {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'jsonrpc' in obj &&
    typeof obj['jsonrpc'] === 'string' &&
    'method' in obj &&
    typeof obj['method'] === 'string'
  );
}

// options for ElectrumWS constructor
export type ElectrumWSOptions = {
  // token can be used in case of authentication needed by the electrum instance
  token?: string;
  // reconnect will try to reconnect if the connection is lost, default is true
  reconnect: boolean;
  // verbose will log in and out messages, default is false
  verbose: boolean;
};

export enum ElectrumWSEvent {
  OPEN = 'open',
  CLOSE = 'close',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
  MESSAGE = 'message',
}

// internal request type used by ElectrumWS to manage callbacks
type Request = {
  resolve: (result: unknown) => unknown;
  reject: (error: Error) => unknown;
  method: string;
  timeout: NodeJS.Timeout;
};

const RECONNECT_TIMEOUT = 1000;
const CONNECTED_TIMEOUT = 500;
const REQUEST_TIMEOUT = 1000 * 10; // 10 seconds
const CLOSE_CODE = 1000; // 1000 indicates a normal closure, meaning that the purpose for which the connection was established has been fulfilled

/**
 * ElectrumWS is a WebSocket client for Electrum servers.
 * It is based on the Electrum protocol and uses JSON-RPC 2.0.
 * ElectrumWS sends RpcRequest and receives RpcResponse.
 */
export class ElectrumWS extends Observable {
  static DEFAULT_OPTIONS: ElectrumWSOptions = {
    reconnect: true,
    verbose: false,
  };

  private options: ElectrumWSOptions;
  private endpoint: string;

  private requests = new Map<number, Request>();
  private subscriptions = new Map<string, (...payload: unknown[]) => unknown>();

  private connected = false;
  private connectedTimeout: NodeJS.Timeout | undefined;

  private reconnectionTimeout: NodeJS.Timeout | undefined;

  private incompleteMessage = '';

  ws: WebSocket;

  constructor(endpoint: string, options: Partial<ElectrumWSOptions> = {}) {
    super();

    this.endpoint = endpoint;

    this.options = Object.assign(ElectrumWS.DEFAULT_OPTIONS, options);

    this.connect();

    if (this.verbose) {
      Object.values(ElectrumWSEvent).forEach((ev: string) => {
        this.on(ev, (e: unknown) =>
          e
            ? console.debug(`ElectrumWS - ${ev.toUpperCase()}:`, e)
            : console.debug(`ElectrumWS - ${ev.toUpperCase()}`)
        );
      });
    }
  }

  get verbose(): boolean {
    return this.options.verbose;
  }

  // batchRequest is an helper method to send multiple requests in a single batch
  async batchRequest<R extends Array<unknown>>(
    ...requests: { method: string; params: unknown[] }[]
  ): Promise<R> {
    if (!this.connected) {
      await new Promise((resolve) =>
        this.once(ElectrumWSEvent.CONNECTED, () => resolve(true))
      );
    }

    let id: number;
    do {
      id = Math.ceil(Math.random() * 1e5);
    } while (this.requests.has(id));

    const payloads = requests.map((request) => ({
      jsonrpc: '2.0',
      method: request.method,
      params: request.params,
      id: id++,
    }));

    const promises = payloads.map((p) =>
      this.createRequestPromise<unknown>(p.id, p.method)
    );
    payloads.forEach((p) => this.ws.send(formatRequest(p)));
    return Promise.all(promises) as Promise<R>;
  }

  // make a request to an electrum server
  async request<ResponseType = unknown>(
    method: string,
    ...params: (boolean | string | number | (string | number)[])[]
  ): Promise<ResponseType> {
    let id: number;
    do {
      id = Math.ceil(Math.random() * 1e5);
    } while (this.requests.has(id));

    const payload = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    if (!this.connected) {
      await new Promise((resolve) =>
        this.once(ElectrumWSEvent.CONNECTED, () => resolve(true))
      );
    }
    const promise = this.createRequestPromise<ResponseType>(id, method);

    if (this.verbose) console.debug('ElectrumWS SEND:', method, ...params);
    this.ws.send(formatRequest(payload));

    return promise;
  }

  private createRequestPromise<ResponseType = unknown>(
    id: number,
    method: string
  ) {
    return new Promise<ResponseType>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requests.delete(id);
        reject(
          new Error(`ElectrumWS request timeout. request ID: ${id} (${method})`)
        );
      }, REQUEST_TIMEOUT);

      this.requests.set(id, {
        resolve,
        reject,
        method,
        timeout,
      });
    });
  }

  // send an electrum subscribe request
  // this method adds .subscribe to the `method` parameter
  async subscribe(
    method: string,
    callback: (...payload: unknown[]) => unknown,
    ...params: (string | number)[]
  ) {
    const subscriptionKey = `${method}${
      typeof params[0] === 'string' ? `-${params[0]}` : ''
    }`;
    this.subscriptions.set(subscriptionKey, callback);

    // If not currently connected, the subscription will be activated in onOpen()
    if (!this.connected) return;

    callback(...params, await this.request(`${method}.subscribe`, ...params));
  }

  // send an electrum unsubscribe request
  // this method adds .unsubscribe to the `method` parameter
  async unsubscribe(method: string, ...params: (string | number)[]) {
    const subscriptionKey = `${method}${
      typeof params[0] === 'string' ? `-${params[0]}` : ''
    }`;
    const deleted = this.subscriptions.delete(subscriptionKey);

    if (deleted) return this.request(`${method}.unsubscribe`, ...params);
    return Promise.resolve();
  }

  // whether the websocket connection is open
  isConnected() {
    return this.connected;
  }

  // close the websocket connection
  async close(reason: string): Promise<boolean> {
    this.options.reconnect = false;

    // Reject all pending requests
    for (const [id, request] of this.requests) {
      clearTimeout(request.timeout);
      this.requests.delete(id);
      if (this.verbose)
        console.debug('Rejecting pending request:', request.method);
      request.reject(new Error(reason));
    }

    clearTimeout(this.reconnectionTimeout);

    if (
      this.ws.readyState === WebSocket.CONNECTING ||
      this.ws.readyState === WebSocket.OPEN
    ) {
      /* The websocket connection is not closed instantly and can take a very long time to trigger the close event */
      const closingPromise = new Promise<boolean>((resolve) =>
        this.once(ElectrumWSEvent.CLOSE, () => resolve(true))
      );
      this.ws.close(CLOSE_CODE, reason);
      return closingPromise;
    }
    return true;
  }

  private connect() {
    let url = this.endpoint;
    if (this.options.token) {
      url = `${url}?token=${this.options.token}`;
    }

    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.addEventListener('open', this.onOpen.bind(this));
    this.ws.addEventListener('message', this.onMessage.bind(this));
    this.ws.addEventListener('error', this.onError.bind(this));
    this.ws.addEventListener('close', this.onClose.bind(this));
  }

  private onOpen() {
    this.fire(ElectrumWSEvent.OPEN);

    this.connectedTimeout = setTimeout(() => {
      this.connected = true;
      this.fire(ElectrumWSEvent.CONNECTED);

      // Resubscribe to registered subscriptions
      for (const [subscriptionKey, callback] of this.subscriptions) {
        const params = subscriptionKey.split('-');
        const method = params.shift();
        if (!method) {
          if (this.verbose)
            console.warn(
              'Cannot resubscribe, no method in subscription key:',
              subscriptionKey
            );
          continue;
        }
        this.subscribe(method, callback, ...params).catch((error) => {
          if (
            this.ws.readyState === WebSocket.CONNECTING ||
            this.ws.readyState === WebSocket.OPEN
          ) {
            this.ws.close(CLOSE_CODE, error.message);
          }
        });
      }
    }, CONNECTED_TIMEOUT);
  }

  private onMessage(msg: WebSocket.MessageEvent) {
    // Handle potential multi-line frames
    const raw =
      typeof msg.data === 'string' ? msg.data : bytesToString(msg.data);
    // eslint-disable-next-line no-control-regex
    const regExpNewLineOrBlank = new RegExp('\r|\n| ', 'g');
    const lines = raw
      .split(regExpNewLineOrBlank)
      .filter((line) => line.length > 0);

    for (const line of lines) {
      const response = this.parseLine(line);
      if (!response) continue;
      this.fire(ElectrumWSEvent.MESSAGE, response);

      if (typeof response !== 'object') {
        if (this.verbose)
          console.debug('received a non-JSON response:', response);
        continue;
      }

      if ('id' in response && this.requests.has(response.id)) {
        const request = this.requests.get(response.id);
        clearTimeout(request.timeout);
        this.requests.delete(response.id);

        if ('result' in response) {
          request.resolve(response.result);
        } else if (response.error) {
          const errorMsg =
            typeof response.error === 'string'
              ? response.error
              : response.error.message;

          try {
            const rpcError = new RPCError(errorMsg);
            request.reject(rpcError);
          } catch (e) {
            request.reject(new Error(errorMsg));
          }
        } else {
          request.reject(new Error('No result'));
        }
      }

      if (
        'method' in response &&
        /** @type {string} */ response.method.endsWith('subscribe')
      ) {
        const method = response.method.replace('.subscribe', '');
        const params = response.params || [];
        // If first parameter is a string (for scripthash subscriptions), it's part of the subscription key.
        // If first parameter is an object (for header subscriptions), it's not.
        const subscriptionKey = `${method}${
          typeof params[0] === 'string' ? `-${params[0]}` : ''
        }`;
        if (this.subscriptions.has(subscriptionKey)) {
          const callback = this.subscriptions.get(subscriptionKey);
          callback(...params);
        }
      }
    }
  }

  private parseLine(line: string): RpcResponse | RpcRequest | false {
    try {
      const parsed = JSON.parse(line);
      if (isRpcResponse(parsed) || isRpcRequest(parsed)) {
        this.incompleteMessage = '';
        return parsed;
      }
    } catch {
      // ignore
      if (this.verbose) console.debug('Failed to parse:', line);
    }

    if (this.incompleteMessage && !line.includes(this.incompleteMessage)) {
      return this.parseLine(`${this.incompleteMessage}${line}`);
    }

    if (this.verbose)
      console.debug(
        `Failed to parse JSON, retrying together with next message: "${line}"`
      );
    this.incompleteMessage = line;
    return false;
  }

  private onError(event: WebSocket.ErrorEvent) {
    if (event.error) {
      if (this.verbose) console.error('ElectrumWS ERROR:', event.error);
      this.fire(ElectrumWSEvent.ERROR, event.error);
    }
  }

  private onClose(event: WebSocket.CloseEvent | Error) {
    this.fire(ElectrumWSEvent.CLOSE, event);

    if (!this.connected) clearTimeout(this.connectedTimeout);
    else this.fire(ElectrumWSEvent.DISCONNECTED);

    if (this.options.reconnect && this.connected) {
      this.fire(ElectrumWSEvent.RECONNECTING);
      this.reconnectionTimeout = setTimeout(
        () => this.connect(),
        RECONNECT_TIMEOUT
      );
    }

    this.connected = false;
  }
}

function bytesToString(bytes: Buffer | ArrayBuffer | Buffer[]) {
  if (Array.isArray(bytes)) {
    bytes = Buffer.concat(bytes);
  }
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(bytes);
}

function stringToBytes(str: string) {
  const encoder = new TextEncoder(); // utf-8 is the default
  return encoder.encode(str);
}

function formatRequest(r: RpcRequest): Uint8Array {
  return stringToBytes(JSON.stringify(r) + '\n');
}
