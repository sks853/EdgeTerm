import { beforeEach, describe, expect, it, vi } from "vitest";

// The store reaches platform.ts through the shortcut table, and IS_MAC is a
// build-time constant vitest does not define.
vi.mock("./platform", () => ({
  IS_MAC: true,
  IS_WINDOWS: false,
}));

import { LOCAL_PATH_SOURCE, lastPath, pathSource, rememberPath } from "./lastPaths";
import { useStore, type Tab } from "./store";

const initialState = useStore.getState();

const makeTab = (id: string, companionOf: string | null = null): Tab => ({
  info: {
    id,
    profileId: id,
    name: id,
    kind: companionOf === null ? "ssh" : "sftp",
    protocol: "shell",
    address: "default shell",
    color: "#4ea1f3",
    supportsRemoteFiles: true,
    recording: null,
    legacyAlgorithms: [],
    sharedConnection: false,
  },
  profile: { id, name: id, kind: companionOf === null ? "ssh" : "sftp" },
  number: 1,
  ordinal: 0,
  state: "connected",
  commandActivity: "idle",
  activityKind: "command",
  cols: 80,
  rows: 24,
  companionOf,
  paneId: initialState.activePaneId,
});

const openTabs = (...tabs: Tab[]) => {
  useStore.setState(
    {
      ...initialState,
      tabs,
      activeId: tabs.length > 0 ? tabs[0].info.id : null,
      panes: [
        {
          id: initialState.activePaneId,
          activeTabId: tabs.length > 0 ? tabs[0].info.id : null,
        },
      ],
    },
    true,
  );
};

describe("pathSource", () => {
  it("keys the local side to one slot every local tab shares", () => {
    expect(pathSource(makeTab("local-a"), null)).toBe(LOCAL_PATH_SOURCE);
    expect(pathSource(makeTab("local-b"), null)).toBe(LOCAL_PATH_SOURCE);
  });

  it("keys a remote tab by its own session", () => {
    expect(pathSource(makeTab("shell"), "shell")).toBe("shell");
  });

  it("keys a companion by the connection it rides, not by its own tab", () => {
    // The reconnect case: the dropped companion's id is gone and the new
    // one is different, but both ride the same SSH connection.
    expect(pathSource(makeTab("companion-1", "shell"), "companion-1")).toBe("shell");
    expect(pathSource(makeTab("companion-2", "shell"), "companion-2")).toBe("shell");
  });
});

describe("lastPaths", () => {
  beforeEach(() => {
    openTabs(makeTab("shell"), makeTab("companion", "shell"));
  });

  it("remembers and returns a recorded directory", () => {
    rememberPath("recorded", "/var/log");
    expect(lastPath("recorded")).toBe("/var/log");
  });

  it("resumes a reconnected companion where the dropped one left off", () => {
    rememberPath("shell", "/var/log");
    // A reconnect hands the companion a new tab id; the connection key is
    // what survives it.
    const reconnected = makeTab("companion-new", "shell");
    expect(lastPath(pathSource(reconnected, reconnected.info.id))).toBe("/var/log");
  });

  it("shares one local slot across local tabs", () => {
    rememberPath(LOCAL_PATH_SOURCE, "/home/me/Downloads");
    expect(lastPath(pathSource(makeTab("local-b"), null))).toBe("/home/me/Downloads");
  });

  it("forgets a session that is no longer open", () => {
    rememberPath("doomed", "/var/log");
    openTabs(makeTab("shell"));
    rememberPath("shell", "/tmp");
    expect(lastPath("doomed")).toBeUndefined();
    expect(lastPath("shell")).toBe("/tmp");
  });

  it("keeps the local slot when no local tab is open", () => {
    rememberPath(LOCAL_PATH_SOURCE, "/home/me/Downloads");
    openTabs(makeTab("shell"));
    rememberPath("shell", "/var/log");
    expect(lastPath(LOCAL_PATH_SOURCE)).toBe("/home/me/Downloads");
  });
});
