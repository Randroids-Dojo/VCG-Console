/**
 * The browser's local store, or an inert stand-in.
 *
 * Reading `localStorage` is not merely empty where a browser restricts it:
 * the access itself can throw, and these reads happen as the console comes
 * up, so a throw would stop it starting at all. Everything that keeps a
 * preference already has to survive a store that refuses to answer, which is
 * the same case as a store that is always empty.
 */

function inertStorage(): Storage {
  return {
    length: 0,
    clear() {},
    getItem: () => null,
    key: () => null,
    removeItem() {},
    setItem() {},
  };
}

export function preferenceStorage(): Storage {
  try {
    // Touching a property proves the store is really usable: some browsers
    // hand back an object and throw only when it is read.
    const store = globalThis.localStorage;
    store.length;
    return store;
  } catch {
    return inertStorage();
  }
}
