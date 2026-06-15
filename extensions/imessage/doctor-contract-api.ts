// Imessage API module exposes the plugin public contract.
import type {
  ChannelDoctorConfigMutation,
  ChannelDoctorLegacyConfigRule,
} from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";

// Disabled `channels.imessage.catchup` blocks are retired. Enabled blocks stay
// as a compatibility contract: older configs that opted into replay still get
// downtime recovery, while new/default installs use the always-on recovery
// cursor plus stale-backlog fence.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEnabledCatchup(value: unknown): boolean {
  return isRecord(value) && value.enabled === true;
}

function imessageEntryHasRetiredCatchup(entry: unknown): boolean {
  if (!isRecord(entry)) {
    return false;
  }
  if (Object.hasOwn(entry, "catchup") && !isEnabledCatchup(entry.catchup)) {
    return true;
  }
  const accounts = entry.accounts;
  if (!isRecord(accounts)) {
    return false;
  }
  return Object.values(accounts).some(
    (account) =>
      isRecord(account) && Object.hasOwn(account, "catchup") && !isEnabledCatchup(account.catchup),
  );
}

// `channels.imessage.coalesceSameSenderDms` is retired. imsg (>= 0.11.1)
// coalesces Apple's URL-preview split-sends upstream, so the client-side
// debounce-and-merge opt-in is dead config and must be dropped from existing
// `openclaw.json` files. Removable at the imessage entry root and per account.
function imessageEntryHasRetiredCoalesce(entry: unknown): boolean {
  if (!isRecord(entry)) {
    return false;
  }
  if (Object.hasOwn(entry, "coalesceSameSenderDms")) {
    return true;
  }
  const accounts = entry.accounts;
  if (!isRecord(accounts)) {
    return false;
  }
  return Object.values(accounts).some(
    (account) => isRecord(account) && Object.hasOwn(account, "coalesceSameSenderDms"),
  );
}

export const legacyConfigRules: ChannelDoctorLegacyConfigRule[] = [
  {
    path: ["channels", "imessage"],
    message:
      "disabled channels.imessage.catchup config is retired; iMessage now recovers via always-on inbound dedupe and a stale-backlog age fence. " +
      'Run "openclaw doctor --fix" to remove disabled catchup blocks.',
    match: (value) => imessageEntryHasRetiredCatchup(value),
  },
  {
    path: ["channels", "imessage"],
    message:
      "channels.imessage.coalesceSameSenderDms is retired; imsg (>= 0.11.1) coalesces Apple URL-preview split-sends upstream. " +
      'Run "openclaw doctor --fix" to remove the stale key.',
    match: (value) => imessageEntryHasRetiredCoalesce(value),
  },
];

export function normalizeCompatibilityConfig({
  cfg,
}: {
  cfg: OpenClawConfig;
}): ChannelDoctorConfigMutation {
  const channels = cfg.channels as Record<string, unknown> | undefined;
  const imessage = channels?.imessage;
  if (
    (!imessageEntryHasRetiredCatchup(imessage) && !imessageEntryHasRetiredCoalesce(imessage)) ||
    !isRecord(imessage)
  ) {
    return { config: cfg, changes: [] };
  }
  const changes: string[] = [];
  const nextImessage: Record<string, unknown> = { ...imessage };
  if (Object.hasOwn(nextImessage, "catchup") && !isEnabledCatchup(nextImessage.catchup)) {
    delete nextImessage.catchup;
    changes.push("Removed disabled retired channels.imessage.catchup.");
  }
  if (Object.hasOwn(nextImessage, "coalesceSameSenderDms")) {
    delete nextImessage.coalesceSameSenderDms;
    changes.push("Removed retired channels.imessage.coalesceSameSenderDms.");
  }
  if (isRecord(nextImessage.accounts)) {
    let accountsChanged = false;
    const nextAccounts: Record<string, unknown> = { ...nextImessage.accounts };
    for (const [id, account] of Object.entries(nextImessage.accounts)) {
      if (!isRecord(account)) {
        continue;
      }
      const hasRetiredCatchup =
        Object.hasOwn(account, "catchup") && !isEnabledCatchup(account.catchup);
      const hasRetiredCoalesce = Object.hasOwn(account, "coalesceSameSenderDms");
      if (!hasRetiredCatchup && !hasRetiredCoalesce) {
        continue;
      }
      const nextAccount = { ...account };
      if (hasRetiredCatchup) {
        delete nextAccount.catchup;
        changes.push(`Removed disabled retired channels.imessage.accounts.${id}.catchup.`);
      }
      if (hasRetiredCoalesce) {
        delete nextAccount.coalesceSameSenderDms;
        changes.push(`Removed retired channels.imessage.accounts.${id}.coalesceSameSenderDms.`);
      }
      nextAccounts[id] = nextAccount;
      accountsChanged = true;
    }
    if (accountsChanged) {
      nextImessage.accounts = nextAccounts;
    }
  }
  return {
    config: {
      ...cfg,
      channels: { ...channels, imessage: nextImessage },
    } as OpenClawConfig,
    changes,
  };
}
