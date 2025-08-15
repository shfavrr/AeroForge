import { describe, it, expect, beforeEach } from "vitest";

interface Log {
  blockHeight: bigint;
  performer: string;
  details: Uint8Array;
}

interface MockContract {
  contractAdmin: string;
  paused: boolean;
  aircraftOwners: Map<string, string>;
  aircraftLogCounts: Map<string, bigint>;
  maintenanceLogs: Map<string, Log>;
  userRoles: Map<string, bigint>;
  ROLE_OWNER: bigint;
  ROLE_MECHANIC: bigint;
  ROLE_INSPECTOR: bigint;
  MAX_DETAILS_LENGTH: number;

  isContractAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  registerAircraft(caller: string, aircraftId: string, initialOwner: string): { value: boolean } | { error: number };
  transferAircraftOwnership(caller: string, aircraftId: string, newOwner: string): { value: boolean } | { error: number };
  addRole(caller: string, aircraftId: string, user: string, role: bigint): { value: boolean } | { error: number };
  removeRole(caller: string, aircraftId: string, user: string): { value: boolean } | { error: number };
  logMaintenance(caller: string, aircraftId: string, details: Uint8Array): { value: bigint } | { error: number };
  getAircraftOwner(aircraftId: string): { value: string | undefined };
  getLogCount(aircraftId: string): { value: bigint };
  getMaintenanceLog(aircraftId: string, index: bigint): { value: Log } | { error: number };
  getUserRole(aircraftId: string, user: string): { value: bigint };
}

const mockContract: MockContract = {
  contractAdmin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  aircraftOwners: new Map(),
  aircraftLogCounts: new Map(),
  maintenanceLogs: new Map(),
  userRoles: new Map(),
  ROLE_OWNER: 1n,
  ROLE_MECHANIC: 2n,
  ROLE_INSPECTOR: 3n,
  MAX_DETAILS_LENGTH: 1024,

  isContractAdmin(caller: string) {
    return caller === this.contractAdmin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isContractAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  registerAircraft(caller: string, aircraftId: string, initialOwner: string) {
    if (this.paused) return { error: 105 };
    if (!this.isContractAdmin(caller)) return { error: 100 };
    if (this.aircraftOwners.has(aircraftId)) return { error: 102 };
    if (initialOwner === "SP000000000000000000002Q6VF78") return { error: 106 };
    this.aircraftOwners.set(aircraftId, initialOwner);
    this.aircraftLogCounts.set(aircraftId, 0n);
    this.userRoles.set(`${aircraftId}_${initialOwner}`, this.ROLE_OWNER);
    return { value: true };
  },

  transferAircraftOwnership(caller: string, aircraftId: string, newOwner: string) {
    if (this.paused) return { error: 105 };
    if (!this.aircraftOwners.has(aircraftId)) return { error: 101 };
    const callerRole = this.userRoles.get(`${aircraftId}_${caller}`) || 0n;
    if (callerRole !== this.ROLE_OWNER) return { error: 100 };
    if (newOwner === "SP000000000000000000002Q6VF78") return { error: 106 };
    this.aircraftOwners.set(aircraftId, newOwner);
    this.userRoles.set(`${aircraftId}_${newOwner}`, this.ROLE_OWNER);
    return { value: true };
  },

  addRole(caller: string, aircraftId: string, user: string, role: bigint) {
    if (this.paused) return { error: 105 };
    if (!this.aircraftOwners.has(aircraftId)) return { error: 101 };
    const callerRole = this.userRoles.get(`${aircraftId}_${caller}`) || 0n;
    if (callerRole !== this.ROLE_OWNER) return { error: 100 };
    if (role !== this.ROLE_MECHANIC && role !== this.ROLE_INSPECTOR) return { error: 103 };
    if (user === "SP000000000000000000002Q6VF78") return { error: 106 };
    this.userRoles.set(`${aircraftId}_${user}`, role);
    return { value: true };
  },

  removeRole(caller: string, aircraftId: string, user: string) {
    if (this.paused) return { error: 105 };
    if (!this.aircraftOwners.has(aircraftId)) return { error: 101 };
    const callerRole = this.userRoles.get(`${aircraftId}_${caller}`) || 0n;
    if (callerRole !== this.ROLE_OWNER) return { error: 100 };
    const userRole = this.userRoles.get(`${aircraftId}_${user}`) || 0n;
    if (userRole === this.ROLE_OWNER) return { error: 100 };
    this.userRoles.delete(`${aircraftId}_${user}`);
    return { value: true };
  },

  logMaintenance(caller: string, aircraftId: string, details: Uint8Array) {
    if (this.paused) return { error: 105 };
    if (!this.aircraftOwners.has(aircraftId)) return { error: 101 };
    if (details.length === 0 || details.length > this.MAX_DETAILS_LENGTH) return { error: 104 };
    const callerRole = this.userRoles.get(`${aircraftId}_${caller}`) || 0n;
    if (callerRole !== this.ROLE_OWNER && callerRole !== this.ROLE_MECHANIC && callerRole !== this.ROLE_INSPECTOR) {
      return { error: 100 };
    }
    const currentCount = this.aircraftLogCounts.get(aircraftId) || 0n;
    const logIndex = currentCount;
    const blockHeight = BigInt(12345); // Mock block height
    this.maintenanceLogs.set(`${aircraftId}_${logIndex}`, { blockHeight, performer: caller, details });
    this.aircraftLogCounts.set(aircraftId, currentCount + 1n);
    return { value: logIndex };
  },

  getAircraftOwner(aircraftId: string) {
    return { value: this.aircraftOwners.get(aircraftId) };
  },

  getLogCount(aircraftId: string) {
    return { value: this.aircraftLogCounts.get(aircraftId) || 0n };
  },

  getMaintenanceLog(aircraftId: string, index: bigint) {
    const log = this.maintenanceLogs.get(`${aircraftId}_${index}`);
    return log ? { value: log } : { error: 108 };
  },

  getUserRole(aircraftId: string, user: string) {
    return { value: this.userRoles.get(`${aircraftId}_${user}`) || 0n };
  },
};

describe("AeroForge Maintenance Log Contract", () => {
  beforeEach(() => {
    mockContract.contractAdmin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.aircraftOwners.clear();
    mockContract.aircraftLogCounts.clear();
    mockContract.maintenanceLogs.clear();
    mockContract.userRoles.clear();
  });

  it("should allow admin to register aircraft", () => {
    const result = mockContract.registerAircraft(
      mockContract.contractAdmin,
      "aircraft1",
      "ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S",
    );
    expect(result).toEqual({ value: true });
    expect(mockContract.aircraftOwners.get("aircraft1")).toBe("ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S");
    expect(mockContract.userRoles.get("aircraft1_ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S")).toBe(mockContract.ROLE_OWNER);
  });

  it("should prevent non-admin from registering aircraft", () => {
    const result = mockContract.registerAircraft(
      "ST3NBR2K86CMH5P7N1NV4F8X2",
      "aircraft1",
      "ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S",
    );
    expect(result).toEqual({ error: 100 });
  });

  it("should prevent registering already registered aircraft", () => {
    mockContract.registerAircraft(mockContract.contractAdmin, "aircraft1", "ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S");
    const result = mockContract.registerAircraft(
      mockContract.contractAdmin,
      "aircraft1",
      "ST3NBR2K86CMH5P7N1NV4F8X2",
    );
    expect(result).toEqual({ error: 102 });
  });

  it("should allow owner to transfer ownership", () => {
    mockContract.registerAircraft(mockContract.contractAdmin, "aircraft1", "ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S");
    const result = mockContract.transferAircraftOwnership(
      "ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S",
      "aircraft1",
      "ST3NBR2K86CMH5P7N1NV4F8X2",
    );
    expect(result).toEqual({ value: true });
    expect(mockContract.aircraftOwners.get("aircraft1")).toBe("ST3NBR2K86CMH5P7N1NV4F8X2");
  });

  it("should allow owner to add mechanic role", () => {
    mockContract.registerAircraft(mockContract.contractAdmin, "aircraft1", "ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S");
    const result = mockContract.addRole(
      "ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S",
      "aircraft1",
      "ST3NBR2K86CMH5P7N1NV4F8X2",
      mockContract.ROLE_MECHANIC,
    );
    expect(result).toEqual({ value: true });
    expect(mockContract.userRoles.get("aircraft1_ST3NBR2K86CMH5P7N1NV4F8X2")).toBe(mockContract.ROLE_MECHANIC);
  });

  it("should prevent non-owner from adding role", () => {
    mockContract.registerAircraft(mockContract.contractAdmin, "aircraft1", "ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S");
    const result = mockContract.addRole(
      "ST3NBR2K86CMH5P7N1NV4F8X2",
      "aircraft1",
      "ST4F8X2K86CMH5P7N1NV4F8X2",
      mockContract.ROLE_MECHANIC,
    );
    expect(result).toEqual({ error: 100 });
  });

  it("should allow mechanic to log maintenance", () => {
    mockContract.registerAircraft(mockContract.contractAdmin, "aircraft1", "ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S");
    mockContract.addRole(
      "ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S",
      "aircraft1",
      "ST3NBR2K86CMH5P7N1NV4F8X2",
      mockContract.ROLE_MECHANIC,
    );
    const details = new Uint8Array([0x54, 0x65, 0x73, 0x74]); // "Test"
    const result = mockContract.logMaintenance("ST3NBR2K86CMH5P7N1NV4F8X2", "aircraft1", details);
    expect(result).toEqual({ value: 0n });
    const log = mockContract.maintenanceLogs.get("aircraft1_0");
    expect(log).toEqual({
      blockHeight: 12345n,
      performer: "ST3NBR2K86CMH5P7N1NV4F8X2",
      details: details,
    });
  });

  it("should prevent logging with invalid details", () => {
    mockContract.registerAircraft(mockContract.contractAdmin, "aircraft1", "ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S");
    const result = mockContract.logMaintenance("ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S", "aircraft1", new Uint8Array());
    expect(result).toEqual({ error: 104 });
  });

  it("should prevent logging when paused", () => {
    mockContract.registerAircraft(mockContract.contractAdmin, "aircraft1", "ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S");
    mockContract.setPaused(mockContract.contractAdmin, true);
    const details = new Uint8Array([0x54, 0x65, 0x73, 0x74]);
    const result = mockContract.logMaintenance("ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S", "aircraft1", details);
    expect(result).toEqual({ error: 105 });
  });

  it("should retrieve maintenance log", () => {
    mockContract.registerAircraft(mockContract.contractAdmin, "aircraft1", "ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S");
    const details = new Uint8Array([0x54, 0x65, 0x73, 0x74]);
    mockContract.logMaintenance("ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S", "aircraft1", details);
    const result = mockContract.getMaintenanceLog("aircraft1", 0n);
    expect(result).toEqual({
      value: {
        blockHeight: 12345n,
        performer: "ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S",
        details: details,
      },
    });
  });

  it("should return error for non-existent log", () => {
    mockContract.registerAircraft(mockContract.contractAdmin, "aircraft1", "ST2CY5V39NHDPWSXMW9QDT3HC3DC0K0H7W4K8S");
    const result = mockContract.getMaintenanceLog("aircraft1", 0n);
    expect(result).toEqual({ error: 108 });
  });
});