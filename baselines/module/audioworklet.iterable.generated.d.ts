/////////////////////////////
/// AudioWorklet Iterable APIs
/////////////////////////////

export interface MessageEvent<T = any> {
    /** @deprecated */
    initMessageEvent(type: string, bubbles?: boolean, cancelable?: boolean, data?: any, origin?: string, lastEventId?: string, source?: MessageEventSource | null, ports?: Iterable<MessagePort>): void;
}

export interface URLSearchParams {
    [Symbol.iterator](): IterableIterator<[string, string]>;
    /** Returns an array of key, value pairs for every entry in the search params. */
    entries(): IterableIterator<[string, string]>;
    /** Returns a list of keys in the search params. */
    keys(): IterableIterator<string>;
    /** Returns a list of values in the search params. */
    values(): IterableIterator<string>;
}
