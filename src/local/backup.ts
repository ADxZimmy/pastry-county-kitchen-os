// Export and restore for a device workspace.
//
// This is the whole durability story for a device account, so it is deliberately
// blunt: one file holding everything, and a restore that replaces rather than
// merges. Merging two divergent kitchens would need conflict rules nobody has
// agreed, and quietly guessing wrong about stock is worse than being told the
// restore overwrites.
//
// It is also the only bridge between devices: signing in elsewhere starts a fresh
// empty workspace, and this file is how a tester carries their work across.
import { currentWorkspace, deviceMeta, markBackupExported, replaceWorkspace } from "./store";
import { seedWorkspace } from "./seed";
import type { LocalWorkspace } from "./types";

export const BACKUP_FORMAT = "pcko-device-backup";
export const BACKUP_FORMAT_VERSION = 1;

export interface DeviceBackup {
  format: string;
  formatVersion: number;
  exportedAt: string;
  account: { userId: string; email: string };
  workspace: LocalWorkspace;
}

export function buildBackup(): DeviceBackup {
  const workspace = currentWorkspace();
  if (!workspace) throw new Error("The device workspace is not open.");
  const meta = deviceMeta();
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    account: { userId: meta?.userId ?? "", email: meta?.email ?? "" },
    workspace
  };
}

export function backupFilename(exportedAt = new Date().toISOString()) {
  return `pastry-county-backup-${exportedAt.slice(0, 10)}.json`;
}

export async function exportBackup(download: (filename: string, content: string) => void) {
  const backup = buildBackup();
  download(backupFilename(backup.exportedAt), JSON.stringify(backup, null, 2));
  await markBackupExported();
  return backup;
}

export interface ParsedBackup {
  backup: DeviceBackup;
  belongsToAnotherAccount: boolean;
  counts: Record<string, number>;
}

export function parseBackup(text: string, currentUserId: string): ParsedBackup {
  let parsed: DeviceBackup;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not a Kitchen OS backup — it could not be read as JSON.");
  }
  if (parsed?.format !== BACKUP_FORMAT) {
    throw new Error("That file is not a Kitchen OS backup.");
  }
  // Refuse a newer format outright rather than importing what it happens to
  // understand: a partial restore of a kitchen is worse than no restore.
  if (Number(parsed.formatVersion) > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `This backup was written by a newer version of Kitchen OS (format ${parsed.formatVersion}). Update the app before restoring it.`
    );
  }
  if (!parsed.workspace || typeof parsed.workspace !== "object") {
    throw new Error("This backup has no workspace in it.");
  }

  const workspace = parsed.workspace as unknown as Record<string, unknown>;
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(workspace)) {
    if (Array.isArray(value)) counts[key] = value.length;
  }

  return {
    backup: parsed,
    belongsToAnotherAccount: Boolean(parsed.account?.userId) && parsed.account.userId !== currentUserId,
    counts
  };
}

export async function restoreBackup(parsed: ParsedBackup) {
  // Fill any collection a older backup predates, so a restore cannot leave the
  // workspace missing a key the engine expects.
  const blank = seedWorkspace(new Date().toISOString());
  const next: LocalWorkspace = {
    ...blank,
    ...parsed.backup.workspace,
    settings: { ...blank.settings, ...(parsed.backup.workspace.settings ?? {}) }
  };
  await replaceWorkspace(next);
  return next;
}

export function describeBackup(parsed: ParsedBackup) {
  const notable = ["recipes", "ingredients", "orders", "suppliers"] as const;
  const parts = notable
    .map((key) => (parsed.counts[key] ? `${parsed.counts[key]} ${key}` : null))
    .filter(Boolean) as string[];
  const when = parsed.backup.exportedAt?.slice(0, 10) ?? "an unknown date";
  return parts.length ? `${parts.join(", ")} from ${when}` : `an empty workspace from ${when}`;
}
