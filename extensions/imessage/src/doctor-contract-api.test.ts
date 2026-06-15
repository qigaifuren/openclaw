// Imessage tests cover the doctor contract for deprecated catchup config.
import { describe, expect, it } from "vitest";
import { legacyConfigRules, normalizeCompatibilityConfig } from "../doctor-contract-api.js";

describe("iMessage doctor contract: deprecated catchup config", () => {
  it("detects a disabled top-level catchup block", () => {
    const cfg = { channels: { imessage: { catchup: { enabled: false } } } } as never;
    const rule = legacyConfigRules[0];
    expect(rule?.match?.((cfg as { channels: { imessage: unknown } }).channels.imessage, cfg)).toBe(
      true,
    );
  });

  it("detects a disabled per-account catchup block", () => {
    const imessage = { accounts: { work: { catchup: { enabled: false } } } };
    const cfg = { channels: { imessage } } as never;
    expect(legacyConfigRules[0]?.match?.(imessage, cfg)).toBe(true);
  });

  it("does not flag enabled catchup because replay remains compatibility-supported", () => {
    const imessage = {
      catchup: { enabled: true, maxAgeMinutes: 360 },
      accounts: { work: { catchup: { enabled: true, perRunLimit: 25 } } },
    };
    const cfg = { channels: { imessage } } as never;
    expect(legacyConfigRules[0]?.match?.(imessage, cfg)).toBe(false);
  });

  it("does not flag a config without catchup", () => {
    const imessage = { dmPolicy: "pairing", accounts: { work: { cliPath: "imsg" } } };
    const cfg = { channels: { imessage } } as never;
    expect(legacyConfigRules[0]?.match?.(imessage, cfg)).toBe(false);
  });

  it("strips disabled catchup and preserves enabled catchup", () => {
    const cfg = {
      channels: {
        imessage: {
          catchup: { enabled: true, maxAgeMinutes: 360 },
          dmPolicy: "pairing",
          accounts: {
            work: { catchup: { enabled: false }, cliPath: "imsg" },
            home: { catchup: { enabled: true, perRunLimit: 25 }, cliPath: "imsg-home" },
          },
        },
      },
    } as never;
    const mutation = normalizeCompatibilityConfig({ cfg });
    expect(mutation.changes).toHaveLength(1);
    const imessage = (mutation.config as { channels: { imessage: Record<string, unknown> } })
      .channels.imessage;
    expect(imessage.catchup).toEqual({ enabled: true, maxAgeMinutes: 360 });
    const accounts = imessage.accounts as {
      work: Record<string, unknown>;
      home: Record<string, unknown>;
    };
    expect("catchup" in accounts.work).toBe(false);
    expect(accounts.home.catchup).toEqual({ enabled: true, perRunLimit: 25 });
    expect(accounts.work.cliPath).toBe("imsg");
  });

  it("is a no-op when catchup is absent", () => {
    const cfg = { channels: { imessage: { dmPolicy: "pairing" } } } as never;
    const mutation = normalizeCompatibilityConfig({ cfg });
    expect(mutation.changes).toHaveLength(0);
    expect(mutation.config).toBe(cfg);
  });
});

describe("iMessage doctor contract: retired coalesceSameSenderDms config", () => {
  it("detects a top-level coalesceSameSenderDms key", () => {
    const imessage = { coalesceSameSenderDms: true };
    const cfg = { channels: { imessage } } as never;
    expect(legacyConfigRules[1]?.match?.(imessage, cfg)).toBe(true);
  });

  it("detects a per-account coalesceSameSenderDms key", () => {
    const imessage = { accounts: { work: { coalesceSameSenderDms: false } } };
    const cfg = { channels: { imessage } } as never;
    expect(legacyConfigRules[1]?.match?.(imessage, cfg)).toBe(true);
  });

  it("does not flag a config without coalesceSameSenderDms", () => {
    const imessage = { dmPolicy: "pairing", accounts: { work: { cliPath: "imsg" } } };
    const cfg = { channels: { imessage } } as never;
    expect(legacyConfigRules[1]?.match?.(imessage, cfg)).toBe(false);
  });

  it("strips coalesceSameSenderDms at root and per account, preserving siblings", () => {
    const cfg = {
      channels: {
        imessage: {
          coalesceSameSenderDms: true,
          dmPolicy: "pairing",
          accounts: {
            work: { coalesceSameSenderDms: true, cliPath: "imsg" },
            home: { cliPath: "imsg-home" },
          },
        },
      },
    } as never;
    const mutation = normalizeCompatibilityConfig({ cfg });
    expect(mutation.changes).toHaveLength(2);
    const imessage = (mutation.config as { channels: { imessage: Record<string, unknown> } })
      .channels.imessage;
    expect("coalesceSameSenderDms" in imessage).toBe(false);
    expect(imessage.dmPolicy).toBe("pairing");
    const accounts = imessage.accounts as {
      work: Record<string, unknown>;
      home: Record<string, unknown>;
    };
    expect("coalesceSameSenderDms" in accounts.work).toBe(false);
    expect(accounts.work.cliPath).toBe("imsg");
    expect(accounts.home.cliPath).toBe("imsg-home");
  });

  it("strips both retired catchup and coalesce keys together", () => {
    const cfg = {
      channels: {
        imessage: {
          coalesceSameSenderDms: true,
          catchup: { enabled: false },
          dmPolicy: "pairing",
        },
      },
    } as never;
    const mutation = normalizeCompatibilityConfig({ cfg });
    expect(mutation.changes).toHaveLength(2);
    const imessage = (mutation.config as { channels: { imessage: Record<string, unknown> } })
      .channels.imessage;
    expect("coalesceSameSenderDms" in imessage).toBe(false);
    expect("catchup" in imessage).toBe(false);
    expect(imessage.dmPolicy).toBe("pairing");
  });
});
