import test from 'ava';

import { Observable } from './observable';

test('on should return incremented id', (t) => {
  const observable = new Observable();
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const callback = () => {};
  const id = observable.on('event', callback);
  t.is(id, 0);
  t.pass();
});

test('on should fire callback on event is fired', (t) => {
  const observable = new Observable();
  let hasBeenCalled = false;
  const callback = () => {
    hasBeenCalled = true;
  };
  observable.on('event', callback);
  observable.fire('event');
  t.true(hasBeenCalled);
  t.pass();
});

test('on should fire callback with payload', (t) => {
  const observable = new Observable();
  let payload: unknown;
  const callback = (p: unknown) => {
    payload = p;
  };
  observable.on('event', callback);
  observable.fire('event', 'payload');
  t.is(payload, 'payload');
  t.pass();
});

test('on should be able to call the callback multiple times', (t) => {
  const observable = new Observable();
  let hasBeenCalled = 0;
  const callback = () => {
    hasBeenCalled++;
  };
  observable.on('event', callback);
  observable.fire('event'); // +1
  observable.fire('event'); // +1
  t.is(hasBeenCalled, 2);
  t.pass();
});

test('once should fire callback only once', (t) => {
  const observable = new Observable();
  let hasBeenCalled = 0;
  const callback = () => {
    hasBeenCalled++;
  };
  observable.once('event', callback);
  observable.fire('event'); // +1
  observable.fire('event'); // +0
  t.is(hasBeenCalled, 1);
  t.pass();
});

test('off should remove callback from listeners', (t) => {
  const observable = new Observable();
  let hasBeenCalled = false;
  const callback = () => {
    hasBeenCalled = true;
  };
  const id = observable.on('event', callback);
  observable.off('event', id);
  observable.fire('event');
  t.false(hasBeenCalled);
  t.pass();
});

test('allOff should remove all callbacks from listeners', (t) => {
  const observable = new Observable();
  let hasBeenCalled = false;
  const callback = () => {
    hasBeenCalled = true;
  };
  const callbackBis = () => {
    hasBeenCalled = true;
  };

  observable.on('event', callback);
  observable.on('event', callbackBis);
  observable.allOff('event');
  observable.fire('event');
  t.false(hasBeenCalled);
  t.pass();
});
