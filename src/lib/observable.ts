type Func = (...params: unknown[]) => void;

export class Observable {
  private listeners = new Map<string, Array<Func | null>>();

  public on(event: string, callback: Func) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    return this.listeners.get(event).push(callback) - 1;
  }

  public once(event: string, callback: (...params: unknown[]) => void) {
    const id = this.on(event, (...params: unknown[]) => {
      this.off(event, id);
      callback(...params);
    });
  }

  public off(event: string, id: number) {
    const callbacks = this.listeners.get(event);
    if (!callbacks || callbacks.length < id + 1) return;
    callbacks[id] = null;
  }

  public allOff(event: string) {
    this.listeners.delete(event);
  }

  public fire(event: string, ...payload: unknown[]) {
    const callbacks = this.listeners.get(event);
    if (!callbacks || !callbacks.length) return;

    for (const callback of callbacks) {
      if (!callback) continue;
      callback(...payload);
    }
  }
}
