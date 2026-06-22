import type { AuditLog } from "../types";

export type AuditRecordNameLookup = Record<string, Record<string, string | undefined>>;

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

function auditValue(data: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = data?.[key];
    if (typeof value === "string" && value.trim() && !isSensitiveAuditKey(key)) return value.trim();
  }
  return "";
}

function auditLookupName(entry: AuditLog, lookup: AuditRecordNameLookup) {
  return lookup[entry.entityType]?.[entry.entityId]?.trim() ?? "";
}

export function auditRecordName(entry: AuditLog, lookup: AuditRecordNameLookup = {}) {
  const after = entry.afterData;
  const before = entry.beforeData;
  const lookupName = auditLookupName(entry, lookup);

  if (entry.entityType === "settings") return "Business settings";
  if (entry.entityType === "notifications") return auditValue(after, ["subject", "type"]) || auditValue(before, ["subject", "type"]) || lookupName || entry.entityId;
  if (entry.entityType === "conversion_rules") {
    const source = after ?? before;
    const ingredientId = auditValue(source, ["ingredientId", "ingredient_id"]);
    const ingredientName = ingredientId ? lookup.ingredients?.[ingredientId] ?? ingredientId : "";
    const fromUnit = auditValue(source, ["fromUnit", "from_unit"]);
    const toUnit = auditValue(source, ["toUnit", "to_unit"]);
    if (ingredientName && fromUnit && toUnit) return `${ingredientName} ${fromUnit} -> ${toUnit}`;
  }

  return auditValue(after, ["name", "customerName", "customer_name", "fullName", "full_name", "businessName", "business_name", "email"])
    || auditValue(before, ["name", "customerName", "customer_name", "fullName", "full_name", "businessName", "business_name", "email"])
    || lookupName
    || entry.entityId;
}

export function auditRecordLabel(entry: AuditLog, lookup: AuditRecordNameLookup = {}) {
  const name = auditRecordName(entry, lookup);
  return name && name !== entry.entityId ? `${name} (${entry.entityId})` : entry.entityId;
}

export function auditSearchText(entry: AuditLog, lookup: AuditRecordNameLookup = {}) {
  return [
    entry.entityType,
    entry.entityId,
    auditRecordName(entry, lookup),
    auditRecordLabel(entry, lookup),
    entry.action,
    entry.actor,
    new Date(entry.createdAt).toLocaleString(),
    auditChangeSummary(entry),
    auditDataJson(entry.beforeData),
    auditDataJson(entry.afterData)
  ].join(" ");
}

export function auditExportRows(entries: AuditLog[], lookup: AuditRecordNameLookup = {}) {
  return entries.map((entry) => [
    entry.entityType,
    auditRecordLabel(entry, lookup),
    entry.action,
    entry.actor,
    new Date(entry.createdAt).toLocaleString(),
    auditChangeSummary(entry),
    auditDataJson(entry.beforeData),
    auditDataJson(entry.afterData)
  ]);
}
