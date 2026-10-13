import { useStore, type Tab } from "./store";

/** The key the local file system is remembered under; every local tab shares it. */
export const LOCAL_PATH_SOURCE = "";

/**
 * The key a tab's directories are remembered under: the connection its
 * listing comes from. A companion tab rides its SSH connection, whose id
 * outlives the reconnect that hands the companion a new one, so keying by
 * the connection rather than by the tab is what lets a reconnected session
 * resume where it was. `remoteId` is null on the local side.
 */
export const pathSource = (tab: Tab | undefined, remoteId: string | null): string =>
  remoteId === null ? LOCAL_PATH_SOURCE : (tab?.companionOf ?? remoteId);

/**
 * The directory last shown for each source, so coming back to a session
 * returns to where the user was browsing instead of its home (issue #74).
 * Module level so hiding a panel keeps it too; entries for closed sessions
 * are pruned as others are recorded.
 */
const lastPaths = new Map<string, string>();

/** Records `path` as the directory last shown for `source`. */
export const rememberPath = (source: string, path: string): void => {
  const open = new Set(useStore.getState().tabs.map((tab) => tab.info.id));
  for (const key of lastPaths.keys()) {
    if (key !== LOCAL_PATH_SOURCE && !open.has(key)) lastPaths.delete(key);
  }
  lastPaths.set(source, path);
};

/** The directory last recorded for `source`, if there is one. */
export const lastPath = (source: string): string | undefined => lastPaths.get(source);
