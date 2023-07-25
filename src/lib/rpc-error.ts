// https://github.com/bitcoin/bitcoin/blob/v25.0/src/rpc/protocol.h#L38-L50 b
const JSON_RPC_ERRORS: Map<number, string> = new Map([
  [-32700, 'Parse error'],
  [-32600, 'Invalid request'],
  [-32601, 'Method not found'],
  [-32602, 'Invalid params'],
  [-32603, 'Internal error'],
  [-1, 'Miscellaneous error'],
  [-3, 'Unexpected type was passed as parameter'],
  [-5, 'Invalid address or key'],
  [-7, 'Ran out of memory during operation'],
  [-8, 'Invalid, missing or duplicate parameter'],
  [-20, 'Database error'],
  [-22, 'Error parsing JSON'],
  [-25, 'An error occured while transaction or block submission'],
  [-26, 'Transaction or block was rejected by network rules'],
  [-27, 'Transaction already in chain'],
  [-28, 'Client still warming up'],
  [-32, 'RPC method is deprecated'],
]);

export class RPCError extends Error {
  code: number;

  constructor(public str: string) {
    const code = findRPCErrorCode(str);
    if (!code) throw new Error('Could not find RPC error code in string');
    const message = JSON_RPC_ERRORS.get(code) || 'Unknown JSON RPC error';
    super(`${message} (code: ${code})`);
  }
}

function findRPCErrorCode(str: string): number | false {
  const match = str.match(/"code":\s*(-?\d+)/);
  if (!match) {
    return false;
  }

  return parseInt(match[1], 10);
}
