import { beforeEach, describe, expect, it, vi } from "vitest";

// The store reaches platform.ts through the shortcut table, and IS_MAC is a
// build-time constant vitest does not define.
vi.mock("./platform", () => ({
  IS_MAC: true,
  IS_WINDOWS: false,
}));

const mocks = vi.hoisted(() => ({
  openSession: vi.fn(),
  closeSession: vi.fn(() => Promise.resolve()),
  stopRemoteEdits: vi.fn(() => Promise.resolve()),
  answerAuthPrompt: vi.fn(() => Promise.resolve()),
  resizeSession: vi.fn(() => Promise.resolve()),
}));
vi.mock("./api", () => mocks);

import { companionProfile, openSftpCompanion } from "./actions";
import { useStore, type Tab } from "./store";
import type { SessionInfo, SessionProfile } from "./types";

const initialState = useStore.getState();

const sshInfo = (id: string, overrides: Partial<SessionInfo> = {}): SessionInfo => ({
  id,
  profileId: id,
  name: id,
  kind: "ssh",
  protocol: "ssh",
  address: "172.16.2.93:12580",
  color: null,
  supportsRemoteFiles: true,
  recording: null,
  legacyAlgorithms: [],
  sharedConnection: false,
  ...overrides,
});

const sshProfile = (id: string): SessionProfile => ({
  id,
  name: id,
  kind: "ssh",
  host: "172.16.2.93",
  port: 12580,
  username: "admin",
});

const openSsh = (id: string, overrides: Partial<SessionInfo> = {}): string => {
  useStore.getState().addTab(sshInfo(id, overrides), sshProfile(id), "connected");
  return id;
};

const tabIds = (): string[] =>
  useStore.getState().tabs.map((tab) => tab.info.id);

/** The connected outcome `open_session` answers a companion with. */
const connectedInfo = (id: string): SessionInfo => ({
  ...sshInfo(id),
  kind: "sftp",
  protocol: "sftp",
  profileId: null,
  name: "shell (SFTP)",
});

const tabOf = (id: string | null): Tab | undefined =>
  useStore.getState().tabs.find((tab) => tab.info.id === id);

beforeEach(() => {
  useStore.setState({ ...initialState }, true);
  mocks.openSession.mockReset();
  mocks.openSession.mockImplementation(
    (_profile: SessionProfile, sessionId: string) =>
      Promise.resolve({ status: "connected", info: connectedInfo(sessionId) }),
  );
});

describe("an SSH connection's SFTP companion", () => {
  it("opens on the connection the shell authenticated, anonymous and unlisted", async () => {
    const parent = openSsh("shell");
    const companion = await openSftpCompanion(parent);

    expect(companion).not.toBeNull();
    const tab = tabOf(companion);
    expect(tab?.info.kind).toBe("sftp");
    expect(tab?.companionOf).toBe(parent);
    // Not a saved session: no profile id, so it never reaches the Session
    // panel's SFTP list and is not restored on the next start.
    expect(tab?.info.profileId).toBeNull();
    expect(tab?.info.name).toContain("(SFTP)");
    // It rides the shell's connection rather than dialling one of its own.
    expect(mocks.openSession).toHaveBeenCalledTimes(1);
    const [, , reuseSessionId] = mocks.openSession.mock.calls[0];
    expect(reuseSessionId).toBe(parent);
  });

  it("leaves the focus on the shell the user asked for", async () => {
    const parent = openSsh("shell");
    await openSftpCompanion(parent);
    expect(useStore.getState().activeId).toBe(parent);
  });

  it("is not opened for a tab that shares a connection", async () => {
    openSsh("shell", { sharedConnection: true });
    expect(await openSftpCompanion("shell")).toBeNull();
    expect(mocks.openSession).not.toHaveBeenCalled();
  });

  it("is not opened for a session that is not SSH", async () => {
    useStore.getState().addTab(
      {
        ...sshInfo("local"),
        kind: "local",
        protocol: "shell",
        address: "default shell",
        supportsRemoteFiles: false,
      },
      { id: "local", name: "local", kind: "local" },
      "connected",
    );
    expect(await openSftpCompanion("local")).toBeNull();
    expect(mocks.openSession).not.toHaveBeenCalled();
  });

  it("closes with the connection, and the connection stays when it closes", async () => {
    const parent = openSsh("shell");
    const companion = await openSftpCompanion(parent);

    await useStore.getState().closeTab(parent);
    expect(tabIds()).not.toContain(parent);
    expect(tabIds()).not.toContain(companion);

    useStore.setState({ ...initialState }, true);
    const other = openSsh("shell2");
    const otherCompanion = await openSftpCompanion(other);
    await useStore.getState().closeTab(otherCompanion!);
    expect(tabIds()).toContain(other);
    expect(tabIds()).not.toContain(otherCompanion);
  });

  it("leaves no failed tab when the server has no sftp subsystem", async () => {
    mocks.openSession.mockImplementation(() =>
      Promise.reject(new Error("the server does not offer the sftp subsystem")),
    );
    const parent = openSsh("shell");

    expect(await openSftpCompanion(parent)).toBeNull();
    expect(tabIds()).toEqual([parent]);
  });

  it("replaces the companion a reconnect left behind", async () => {
    const parent = openSsh("shell");
    const first = await openSftpCompanion(parent);
    const second = await openSftpCompanion(parent);

    expect(second).not.toBe(first);
    expect(tabIds()).not.toContain(first);
    expect(tabOf(second)?.companionOf).toBe(parent);
    expect(mocks.openSession).toHaveBeenCalledTimes(2);
  });
});

describe("companionProfile", () => {
  it("keeps the server and the secrets, drops the saved identity", () => {
    const parent = openSsh("shell");
    const profile = companionProfile(tabOf(parent)!);

    expect(profile.kind).toBe("sftp");
    expect(profile.id).toBe("");
    expect(profile.host).toBe("172.16.2.93");
    expect(profile.port).toBe(12580);
    expect(profile.username).toBe("admin");
    expect(profile.name).toContain("(SFTP)");
  });
});
