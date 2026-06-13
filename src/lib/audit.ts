import type { AuditLog } from "../types";

export function isSensitiveAuditKey(key: string) {
  return /(password|token|secret|hash|api[_-]?key|session)/i.test(key);
}

export function redactAuditValue(value: unknown, key = ""): unknown {
  if (isSensitiveAuditKey(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map((item) => redactAuditValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [childKey, redactAuditValue(childValue, childKey)]));
  }
  return value ?? null;
}

export function auditDataJson(data?: Record<string, unknown>) {
  if (!data || Object.keys(data).length === 0) return "None recorded";
  return JSON.stringify(redactAuditValue(data), null, 2);
}

export function auditChangedFields(entry: AuditLog) {
  const before = entry.beforeData ?? {};
  const after = entry.afterData ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter((key) => !isSensitiveAuditKey(key));
  return keys.filter((key) => JSON.stringify(redactAuditValue(before[key], key)) !== JSON.stringify(redactAuditValue(after[key], key)));
}

export function auditFieldLabel(field: string) {
  return field.replace(/_/g, " ");
}

export function auditChangeSummary(entry: AuditLog) {
  const changed = auditChangedFields(entry);
  if (changed.length > 0) {
    const visible = changed.slice(0, 4).map(auditFieldLabel).join(", ");
    return changed.length > 4 ? `${visible}, +${changed.length - 4} more` : visible;
  }
  if (entry.beforeData || entry.afterData) return "Detailed values recorded";
  return "No detailed values recorded";
}

export function auditSearchText(entry: AuditLog) {
  return [
    entry.entityType,
    entry.entityId,
    entry.action,
    entry.actor,
    new Date(entry.createdAt).toLocaleString(),
    auditChangeSummary(entry),
    auditDataJson(entry.beforeData),
    auditDataJson(entry.afterData)
  ].join(" ");
}

export function auditExportRows(entries: AuditLog[]) {
  return entries.map((entry) => [
    entry.entityType,
    entry.entityId,
    entry.action,
    entry.actor,
    new Date(entry.createdAt).toLocaleString(),
    auditChangeSummary(entry),
    auditDataJson(entry.beforeData),
    auditDataJson(entry.afterData)
  ]);
}
