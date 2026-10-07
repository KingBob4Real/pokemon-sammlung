import { objOr } from "../core/format.js";

// Ansichts-Einstellungen (Sortierung, Filter) – bleiben auf dem Gerät, werden nicht synchronisiert.
export function createPrefs(storage, storageKey, defaults) {
  const values = { ...defaults, ...objOr(storage.get(storageKey, {})) };
  return {
    get: (name) => values[name],
    set(name, value) {
      values[name] = value;
      storage.set(storageKey, values);
    },
  };
}
