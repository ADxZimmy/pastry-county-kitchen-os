import {
  AlertTriangle,
  BarChart3,
  Bot,
  Boxes,
  Calculator,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Cookie,
  FileSpreadsheet,
  FileText,
  Home,
  LayoutDashboard,
  ListChecks,
  LogIn,
  PackagePlus,
  Plus,
  Scale,
  Search,
  Settings,
  ShoppingBasket,
  Sparkles,
  Truck,
  Upload,
  UserPlus,
  Users,
  Wand2
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiBaseUrl, backendMode } from "./lib/backend";
import { auditChangedFields, auditChangeSummary, auditDataJson, auditExportRows, auditFieldLabel, auditRecordLabel, auditSearchText, type AuditRecordNameLookup } from "./lib/audit";
import { appUsers, conversionRules, ingredientBatches, ingredients, inventoryMovements, orderEvents, orderItems, orders, products, productionQcLogs, recipeItems, recipes, settings, suppliers, setKitchenSnapshot } from "./data";
import type { KitchenSnapshot } from "./data";
import type { AppStaffUser, AuditLog, ConversionRule, ImportDraft, ImportDraftRecipeItem, Ingredient, IngredientAllergenProfile, IngredientBatch, IngredientStorageProfile, InventoryMovement, Order, Recipe, RecipeCostProfile, RecipeFormulaMetadata, RecipeItem, RecipeItemPrepState, StockStatus, Supplier, Unit } from "./types";
import {
  calculateMargin,
  calculateOrderCost,
  calculateRecipeCost,
  cancellationConsequences,
  checkOrderStockAvailability,
  checkStockAvailability,
  computeOrderPricing,
  convertUnit,
  buildKitchenAssistantResponse,
  businessToday,
  dashboardProductionQueue,
  formatNaira,
  ordersForProductionBucket,
  formatQuantity,
  formatScaledIngredientQuantity,
  generateShoppingList,
  HELPER_CAPABILITY,
  HELPER_NAME,
  netSellingPrice,
  orderEventLabel,
  orderEventsForOrder,
  parseRecipeText,
  requirementsForOrder,
  requirementsForOrderLines,
  restockSuggestions,
  scaleRecipe,
  stockAdjustmentValidation
} from "./lib/kitchen";
import {
  isRouteActive,
  isSameRoute,
  isTopLevelRoute,
  pageForRoute,
  pageIds,
  parseAppRoute,
  routeBackLabel,
  routeFromPage,
  routeNavPage,
  routeParent,
  routeTitle,
  selectedIdsForRoute,
  serializeAppRoute,
  activeSelectedIdsForRoute,
  type AppRoute,
  type Page
} from "./lib/routes";
import { MINIMUM_PASSWORD_LENGTH, defaultAllowsDecimals, passwordsMatch, unitIncrement, validatePasswordStrength } from "../shared/policy.js";
import { describeShowing, fetchResourcePage, usePagedResource } from "./lib/routeData";
import { deviceAccount, deviceUserId, isDeviceMode, sessionActor, setDataSession } from "./lib/dataMode";
import type { PagedStatus } from "./lib/routeData";

type OrderDraft = {
  recipeId: string;
  requestedYieldQuantity: number;
};

type OrderLineDraft = {
  productId: string;
  recipeId: string;
  requestedYieldQuantity: number;
  yieldUnit: string;
  quantityMultiplier: number;
  unitSellingPrice?: number;
};

type TableRow = {
  key: string;
  cells: React.ReactNode[];
  onClick?: () => void;
  details?: React.ReactNode;
  expanded?: boolean;
};

type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type Navigate = (target: Page | AppRoute, options?: { replace?: boolean }) => void;

const desktopNav = [
  ["dashboard", LayoutDashboard, "Dashboard"],
  ["recipes", Cookie, "Recipes"],
  ["imports", Upload, "Import"],
  ["inventory", Boxes, "Inventory"],
  ["orders", ClipboardList, "Orders"],
  ["production", ChefHat, "Production"],
  ["shopping", ShoppingBasket, "Shopping List"],
  ["costing", Calculator, "Costing"],
  ["ai", Bot, HELPER_NAME],
  ["suppliers", Truck, "Suppliers"],
  ["settings", Settings, "Settings"]
] as const;

// The five primary slots hold the daily operating loop: look up a recipe, check
// stock, work the order book, run production. Dashboard moves to the top of the
// More sheet -- it is the post-login landing page, so it is seen every session
// anyway, whereas Recipes was two taps away from a baker who needs it constantly.
const bottomNav = [
  ["recipes", Cookie, "Recipes"],
  ["inventory", Boxes, "Inventory"],
  ["orders", ClipboardList, "Orders"],
  ["production", ChefHat, "Production"],
  ["settings", ListChecks, "More"]
] as const;

const moreItems = [
  ["dashboard", Home, "Dashboard"],
  ["imports", Upload, "Import"],
  ["shopping", ShoppingBasket, "Shopping"],
  ["costing", Calculator, "Costing"],
  ["ai", Bot, HELPER_NAME],
  ["conversions", Wand2, "Conversions"],
  ["suppliers", Truck, "Suppliers"],
  ["settings", Settings, "Settings"]
] as const;

const bottomNavIds = new Set<Page>(bottomNav.map(([id]) => id as Page));
const moreNavIds = new Set<Page>(moreItems.map(([id]) => id as Page));

function isBottomNavActive(route: AppRoute, id: Page) {
  const current = routeNavPage(route);
  return current === id || (id === "settings" && moreNavIds.has(current) && !bottomNavIds.has(current));
}

export type AppSession = {
  page?: Page;
  route?: AppRoute;
  selectedRecipeId?: string;
  selectedIngredientId?: string;
  selectedOrderId?: string;
  user?: AppUser;
};

export type AppUser = {
  id: string;
  email: string;
  fullName: string;
  role: "Owner/Admin" | "Baker" | "Inventory Manager" | "Viewer";
  // "device" accounts keep their kitchen data in this browser instead of on the
  // server, which refuses them every business read and write. Absent means the
  // normal server-backed account.
  dataMode?: "server" | "device";
};

const permissionRoles = {
  manageSettings: ["Owner/Admin"],
  restoreArchive: ["Owner/Admin"],
  deleteRecords: ["Owner/Admin"],
  manageInventory: ["Owner/Admin", "Inventory Manager"],
  manageRecipes: ["Owner/Admin", "Baker"],
  manageImports: ["Owner/Admin", "Baker", "Inventory Manager"],
  manageOrders: ["Owner/Admin", "Baker", "Inventory Manager"],
  runProduction: ["Owner/Admin", "Baker"],
  purchaseStock: ["Owner/Admin", "Inventory Manager"],
  manageConversions: ["Owner/Admin", "Baker"],
  manageSuppliers: ["Owner/Admin", "Inventory Manager"]
} as const;

const unitOptions: Unit[] = ["g", "kg", "ml", "litre", "pcs", "cup", "tablespoon", "teaspoon", "pack", "roll", "egg", "yolk", "white"];

type Permission = keyof typeof permissionRoles;

function canUser(user: AppUser | undefined, permission: Permission) {
  return Boolean(user && (permissionRoles[permission] as readonly string[]).includes(user.role));
}

const sessionStorageKey = "pastry-county-session";

// The session credential lives in an HttpOnly cookie the page cannot read, so
// there is nothing here for an XSS payload to steal. The CSRF token is not a
// credential on its own — it only proves a request came from this app — and is
// held in memory for the lifetime of the tab, never persisted.
let csrfToken = "";

export function setCsrfToken(value: string) {
  csrfToken = typeof value === "string" ? value : "";
}

// Toasts name where a change was persisted. For a device account that is this
// browser, not the shared database, and saying otherwise would be a small lie
// told on every save.
function storageLabel() {
  return isDeviceMode() ? "this device" : "Neon";
}

function csrfHeaders(): Record<string, string> {
  return csrfToken ? { "x-csrf-token": csrfToken } : {};
}

async function fetchSessionIdentity(): Promise<AppUser | undefined> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/session`, { credentials: "same-origin" });
    // Always consume the body, including on a 401. An unread response body keeps
    // the connection open, which leaks a pending request on every page load.
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setCsrfToken("");
      setDataSession(undefined);
      return undefined;
    }
    setCsrfToken(body.csrfToken ?? "");
    const user = body.user as AppUser | undefined;
    // Set before anything that reads data can mount, so fetchResourcePage and
    // apiAction know which engine to use without being handed the user.
    setDataSession(user);
    return user;
  } catch {
    setCsrfToken("");
    setDataSession(undefined);
    return undefined;
  }
}

export function writeSession(session: AppSession) {
  if (typeof window === "undefined") return;
  // Only non-sensitive route and selection state is persisted; the signed-in
  // identity comes back from the server on load.
  const persistable = { ...session };
  delete persistable.user;
  window.localStorage.setItem(sessionStorageKey, JSON.stringify(persistable));
}

export function pageFromHash(hash: string): Page | undefined {
  const route = parseAppRoute(hash);
  return route ? pageForRoute(route) : undefined;
}

function fallbackRouteForSession(session: Pick<AppSession, "page" | "route" | "user">): AppRoute {
  if (session.user) return { name: "dashboard" };
  return session.page === "login" || session.route?.name === "login" ? { name: "login" } : { name: "welcome" };
}

export function resolveSessionRoute(hash: string, session: AppSession): AppRoute {
  const context = {
    selectedRecipeId: session.selectedRecipeId,
    selectedIngredientId: session.selectedIngredientId,
    selectedOrderId: session.selectedOrderId
  };
  const resolvedHashRoute = parseAppRoute(hash, context);
  if (resolvedHashRoute) return resolvedHashRoute;
  if (hash.replace(/^#\/?/, "")) return fallbackRouteForSession(session);
  if (session.route) return session.route;
  if (session.page && pageIds.has(session.page)) return routeFromPage(session.page, context);
  return fallbackRouteForSession(session);
}

export function resolveSessionPage(hash: string, session: AppSession): Page {
  return pageForRoute(resolveSessionRoute(hash, session));
}

export function readSession(): AppSession {
  if (typeof window === "undefined") return {};
  try {
    const session = JSON.parse(window.localStorage.getItem(sessionStorageKey) ?? "{}") as AppSession;
    if (session.user) {
      // Builds before Phase 011 persisted the session token here. Drop it on the
      // way past so returning browsers stop carrying a readable credential.
      delete session.user;
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
    }
    const route = resolveSessionRoute(window.location.hash, session);
    return { ...session, route, page: pageForRoute(route) };
  } catch {
    const route = parseAppRoute(window.location.hash) ?? { name: "welcome" };
    return { route, page: pageForRoute(route) };
  }
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "caramel" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Button({ children, variant = "primary", type = "button", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button className={`btn btn-${variant}${className ? ` ${className}` : ""}`} type={type} {...props}>
      {children}
    </button>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children, helper }: { label: string; children: React.ReactNode; helper?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {helper && <small>{helper}</small>}
    </label>
  );
}

const dialogFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

type BackgroundInertSnapshot = {
  element: HTMLElement;
  inert: boolean;
  ariaHidden: string | null;
};

function isVisibleFocusable(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && element.getAttribute("aria-hidden") !== "true" && element.getAttribute("aria-disabled") !== "true";
}

function dialogFocusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(dialogFocusableSelector)).filter(isVisibleFocusable);
}

function setDialogBackgroundInert(dialog: HTMLElement) {
  const backdrop = dialog.closest(".modal-backdrop");
  const snapshots = new Map<HTMLElement, BackgroundInertSnapshot>();
  let protectedNode = backdrop instanceof HTMLElement ? backdrop : dialog;
  let parent = protectedNode.parentElement;

  while (parent && parent !== document.documentElement) {
    Array.from(parent.children).forEach((child) => {
      if (child === protectedNode || !(child instanceof HTMLElement)) return;
      if (!snapshots.has(child)) {
        snapshots.set(child, { element: child, inert: child.inert, ariaHidden: child.getAttribute("aria-hidden") });
      }
      child.inert = true;
      child.setAttribute("aria-hidden", "true");
    });
    protectedNode = parent;
    parent = protectedNode.parentElement;
  }

  return Array.from(snapshots.values());
}

function restoreDialogBackground(snapshots: BackgroundInertSnapshot[]) {
  snapshots.forEach(({ element, inert, ariaHidden }) => {
    element.inert = inert;
    if (ariaHidden === null) element.removeAttribute("aria-hidden");
    else element.setAttribute("aria-hidden", ariaHidden);
  });
}

function focusDialogStart(dialog: HTMLElement) {
  const focusTarget = dialog.querySelector<HTMLElement>("[data-autofocus]") ?? dialogFocusableElements(dialog)[0] ?? dialog;
  focusTarget.focus({ preventScroll: true });
}

function useDialogA11y<T extends HTMLElement>(isOpen: boolean, onClose: () => void) {
  const dialogRef = useRef<T | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inertSnapshots = setDialogBackgroundInert(dialog);
    const focusTimer = window.setTimeout(() => focusDialogStart(dialog), 0);

    return () => {
      window.clearTimeout(focusTimer);
      restoreDialogBackground(inertSnapshots);
      const returnFocus = returnFocusRef.current;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [isOpen]);

  const onDialogKeyDown = useCallback((event: React.KeyboardEvent<T>) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeRef.current();
      return;
    }
    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = dialogFocusableElements(dialog);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;
    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    } else if (!dialog.contains(activeElement)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }, []);

  return { dialogRef, onDialogKeyDown };
}

function stockTone(status: StockStatus | string) {
  if (status.includes("Enough") || status === "In Stock" || status === "Ready" || status === "Completed") return "success";
  if (status.includes("Short") || status === "Out of Stock" || status === "Cancelled") return "danger";
  if (status.includes("Low") || status.includes("Check") || status.includes("Partial") || status === "In Progress") return "warning";
  return "neutral";
}

function hasShortageForOrder(orderId: string) {
  return checkOrderStockAvailability(orderId).some((item) => item.shortageQuantity > 0);
}

function isBelowReorder(item: Pick<Ingredient, "currentStock" | "reorderLevel">) {
  return item.reorderLevel > 0 && item.currentStock <= item.reorderLevel;
}

function shortageText(items: { ingredientName: string; shortageQuantity: number; unit?: Unit }[]) {
  return items.map((item) => `${item.ingredientName} short ${formatQuantity(item.shortageQuantity, item.unit ?? "g")}`).join(", ");
}

function stockMovementLabel(type: string) {
  return type.replace(/_/g, " ");
}

type Notify = (message: string) => void;
type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "warning";
  onConfirm: () => Promise<void> | void;
};
type AskConfirm = (request: ConfirmRequest) => void;
const kitchenRequestEvent = "pastry-county:kitchen-request";

function emitKitchenRequest(detail: { phase: "start" | "end" }) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(kitchenRequestEvent, { detail }));
}

function formValue(form: HTMLFormElement, name: string) {
  const value = new FormData(form).get(name);
  return value === null ? "" : String(value);
}

function formNumber(form: HTMLFormElement, name: string, fallback = 0) {
  const value = Number(formValue(form, name));
  return Number.isFinite(value) ? value : fallback;
}

function optionalFormNumber(form: HTMLFormElement, name: string) {
  const value = formValue(form, name).trim();
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function formValues(form: HTMLFormElement, name: string) {
  return new FormData(form).getAll(name).map(String).filter(Boolean);
}

function hasFormulaMetadata(metadata?: RecipeFormulaMetadata) {
  return Boolean(metadata && Object.values(metadata).some((value) => value !== undefined && value !== null && String(value).trim() !== ""));
}

function formulaMetadataRows(metadata?: RecipeFormulaMetadata) {
  if (!metadata) return [];
  const rows: [string, string | number | undefined][] = [
    ["Family", metadata.productFamily],
    ["Version", metadata.formulaVersion],
    ["Pan", [metadata.panCount, metadata.panProfile].filter(Boolean).join(" x ")],
    ["Fill", metadata.fillGuidance],
    ["Oven", metadata.ovenTemperature],
    ["Bake", metadata.bakeTimeRange],
    ["Mixing", metadata.mixingMethod],
    ["Rest/Chill/Cool", [metadata.restWindow, metadata.chillWindow, metadata.coolWindow].filter(Boolean).join(" / ")],
    ["Doneness", metadata.targetDoneness],
    ["Checkpoints", metadata.sensoryCheckpoints],
    ["Storage", metadata.storageServiceNotes],
    ["Test bake", metadata.testBakeStatus?.replace(/_/g, " ")]
  ];
  return rows.filter((row): row is [string, string | number] => row[1] !== undefined && row[1] !== "");
}

function formulaMetadataSummary(metadata?: RecipeFormulaMetadata) {
  const rows = formulaMetadataRows(metadata).slice(0, 4).map(([label, value]) => `${label}: ${value}`);
  return rows.length ? rows.join(" | ") : "No formula profile yet";
}

function prepStateSummary(prepState?: RecipeItemPrepState) {
  if (!prepState) return "";
  return [
    prepState.component,
    prepState.stage,
    prepState.ingredientState,
    prepState.temperatureState,
    prepState.dividedUse,
    prepState.preparationNotes,
    prepState.handlingWarning ? `Warning: ${prepState.handlingWarning}` : ""
  ].filter(Boolean).join(" | ");
}

function splitCsv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function joinList(value?: string[]) {
  return value?.length ? value.join(", ") : "None recorded";
}

function allergenSummary(profile?: IngredientAllergenProfile) {
  if (!profile) return "No allergen profile";
  const contains = profile.contains?.length ? `Contains ${profile.contains.join(", ")}` : "";
  const mayContain = profile.mayContain?.length ? `May contain ${profile.mayContain.join(", ")}` : "";
  return [contains, mayContain, profile.crossContactRisk ? `${profile.crossContactRisk} cross-contact risk` : ""].filter(Boolean).join(" | ") || "No allergen profile";
}

function storageSummary(profile?: IngredientStorageProfile) {
  if (!profile) return "No storage profile";
  return [
    profile.storageTemperature?.replace(/_/g, " "),
    profile.storageLocation,
    profile.openedShelfLifeDays ? `${profile.openedShelfLifeDays} days after opening` : "",
    profile.humiditySensitive ? "humidity sensitive" : "",
    profile.odorSensitive ? "odor sensitive" : ""
  ].filter(Boolean).join(" | ") || "No storage profile";
}

function costProfileSummary(profile?: RecipeCostProfile) {
  if (!profile) return "Ingredient-only costing";
  const pieces = [
    profile.laborMinutes ? `${profile.laborMinutes} min labor` : "",
    profile.packagingCost ? `${formatNaira(profile.packagingCost)} packaging` : "",
    profile.overheadCost ? `${formatNaira(profile.overheadCost)} overhead` : "",
    profile.utilityCost ? `${formatNaira(profile.utilityCost)} utilities` : "",
    profile.failureAllowancePercentage ? `${profile.failureAllowancePercentage}% failure allowance` : "",
    profile.yieldLossPercentage ? `${profile.yieldLossPercentage}% yield loss` : ""
  ].filter(Boolean);
  return pieces.length ? pieces.join(" | ") : "Ingredient-only costing";
}

async function postAction(action: string, payload: Record<string, unknown>) {
  const response = await fetch(`${apiBaseUrl}/api/actions`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...csrfHeaders() },
    body: JSON.stringify({ action, ...payload })
  });
  const result = await response.json().catch(() => ({}));
  return { response, result };
}

function isStaleCsrfError(status: number, error: unknown) {
  return status === 403 && /security token|did not come from/i.test(String(error ?? ""));
}

// The two actions a device account still sends to the server, because a browser
// cannot do them: parsing a PDF/DOCX/XLSX, and sending mail. Everything else runs
// against the local workspace.
const SERVER_ACTIONS_IN_DEVICE_MODE = new Set(["import.extract", "notification.lowStockEmail"]);

async function apiAction(action: string, payload: Record<string, unknown> = {}) {
  emitKitchenRequest({ phase: "start" });
  try {
    if (isDeviceMode()) {
      const local = await import("./local/store");
      if (!SERVER_ACTIONS_IN_DEVICE_MODE.has(action)) {
        return await local.runDeviceAction(action, payload, sessionActor());
      }
      // An import is matched against the caller's own ingredient and recipe
      // names, never the server's — otherwise the parse would resolve a tester's
      // draft against a kitchen they cannot see.
      if (action === "import.extract") {
        payload = { ...payload, localContext: local.localImportContext() };
      }
    }
    let { response, result } = await postAction(action, payload);
    // A stale CSRF token — the session was rotated in another tab, or this tab
    // sat open across a re-login — is recoverable. Fetch the current one and
    // retry once instead of making someone sign in again over a lost header.
    if (isStaleCsrfError(response.status, result.error)) {
      await fetchSessionIdentity();
      ({ response, result } = await postAction(action, payload));
    }
    if (!response.ok) throw new Error(result.error || "Kitchen action failed.");
    return result;
  } finally {
    emitKitchenRequest({ phase: "end" });
  }
}

async function markOrderProduced(orderId: string, notify: Notify, qcLog: Record<string, unknown> = {}) {
  try {
    const result = await apiAction("order.produce", { orderId, qcLog });
    notify(result.alreadyProduced ? "This order was already produced. Inventory was not deducted again." : "Order marked as produced, inventory deducted, and QC logged.");
  } catch (error) {
    notify(error instanceof Error ? error.message : "Unable to mark order as produced.");
    throw error;
  }
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function csvValue(value: React.ReactNode) {
  const text = String(value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCsv(filename: string, headers: string[], rows: React.ReactNode[][], notify?: Notify) {
  const csv = [headers.map(csvValue).join(","), ...rows.map((row) => row.map(csvValue).join(","))].join("\n");
  downloadText(filename, csv);
  notify?.(`${filename} exported.`);
}

function exportPrintableReport(filename: string, title: string, rows: [string, React.ReactNode][], notify?: Notify) {
  const body = rows.map(([label, value]) => `<tr><th>${csvValue(label).slice(1, -1)}</th><td>${csvValue(value).slice(1, -1)}</td></tr>`).join("");
  downloadText(filename, `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Inter,Arial,sans-serif;padding:32px;color:#24160d}table{border-collapse:collapse;width:100%}th,td{border:1px solid #dcc8b7;padding:10px;text-align:left}th{background:#fff4df;width:32%}</style></head><body><h1>${title}</h1><table>${body}</table><script>window.print()</script></body></html>`);
  notify?.(`${filename} printable report exported.`);
}

type AppNotification = {
  id: string;
  title: string;
  detail: string;
  tone: "warning" | "danger";
  page: Page;
  ingredientId?: string;
  orderId?: string;
};

function notificationDigest(): AppNotification[] {
  const today = new Date().toISOString().slice(0, 10);
  const lowStock = ingredients.filter(isBelowReorder);
  const dueOrders = orders.filter((order) => order.dueDate <= today && !["Delivered", "Cancelled"].includes(order.status));
  const blockedOrders = orders.filter((order) => order.stockStatus === "Shortage" && !["Delivered", "Cancelled"].includes(order.status));
  const expiringLots = ingredientBatches.filter((batch) => {
    if (!batch.expiryDate) return false;
    const days = (new Date(batch.expiryDate).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 7;
  });
  return [
    ...lowStock.map((item): AppNotification => ({ id: `stock-${item.id}`, title: `${item.name} is low`, detail: `${formatQuantity(item.currentStock, item.baseUnit)} left, reorder at ${formatQuantity(item.reorderLevel, item.baseUnit)}`, tone: "danger", page: "ingredient-detail", ingredientId: item.id })),
    ...dueOrders.map((order): AppNotification => ({ id: `due-${order.id}`, title: `${order.customerName} order is due`, detail: `${order.status} · due ${order.dueDate}`, tone: "warning", page: "order-detail", orderId: order.id })),
    ...blockedOrders.map((order): AppNotification => ({ id: `blocked-${order.id}`, title: `${order.customerName} is blocked by shortage`, detail: "Restock before production or delivery.", tone: "danger", page: "order-detail", orderId: order.id })),
    ...expiringLots.map((batch): AppNotification => ({ id: `expiry-${batch.id}`, title: "Ingredient lot expiring soon", detail: `${ingredients.find((item) => item.id === batch.ingredientId)?.name ?? batch.ingredientId} · ${batch.expiryDate?.slice(0, 10)}`, tone: "warning", page: "ingredient-detail", ingredientId: batch.ingredientId }))
  ].slice(0, 8);
}

async function shareText(text: string, notify: Notify) {
  const shareData = { title: "Pastry County Kitchen OS", text };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      notify("Shared from Pastry County Kitchen OS.");
      return;
    }
    await navigator.clipboard.writeText(text);
    notify("Copied to clipboard for sharing.");
  } catch {
    downloadText("pastry-county-share.txt", text);
    notify("Sharing was unavailable, so a text file was downloaded.");
  }
}

function App() {
  const savedSession = readSession();
  const [user, setUser] = useState<AppUser | undefined>(() => savedSession.user);
  const [route, setRoute] = useState<AppRoute>(() => savedSession.route ?? (savedSession.user ? { name: "dashboard" } : savedSession.page === "login" ? { name: "login" } : { name: "welcome" }));
  const page = pageForRoute(route);
  const initialRouteIds = selectedIdsForRoute(route);
  const [selectedRecipeId, setSelectedRecipeId] = useState(() => initialRouteIds.selectedRecipeId || savedSession.selectedRecipeId || "");
  const [selectedIngredientId, setSelectedIngredientId] = useState(() => initialRouteIds.selectedIngredientId || savedSession.selectedIngredientId || "");
  const [selectedOrderId, setSelectedOrderId] = useState(() => initialRouteIds.selectedOrderId || savedSession.selectedOrderId || "");
  const [orderDraft, setOrderDraft] = useState<OrderDraft | null>(null);
  const [query, setQuery] = useState("");
  const [sessionState, setSessionState] = useState<"checking" | "ready">("checking");
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
  const [dataError, setDataError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeRequests, setActiveRequests] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);
  const [toast, setToast] = useState("");
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const historyAction = useRef<"push" | "replace">("replace");
  const dataStatusRef = useRef(dataStatus);
  const routeRef = useRef(route);
  const dirtyRef = useRef(hasUnsavedChanges);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? "" : current)), 3600);
  }, []);

  const askConfirm = useCallback((request: ConfirmRequest) => {
    setConfirmRequest(request);
  }, []);

  useEffect(() => {
    dataStatusRef.current = dataStatus;
  }, [dataStatus]);

  useEffect(() => {
    routeRef.current = route;
    const ids = selectedIdsForRoute(route);
    if (route.name === "recipes") setSelectedRecipeId(ids.selectedRecipeId);
    if (route.name === "inventory") setSelectedIngredientId(ids.selectedIngredientId);
    if (route.name === "orders" || route.name === "production") setSelectedOrderId(ids.selectedOrderId);
  }, [route]);

  useEffect(() => {
    dirtyRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  const applyLoadedSnapshot = useCallback((snapshot: KitchenSnapshot) => {
    setKitchenSnapshot(snapshot);
    setSelectedRecipeId((current) => snapshot.recipes.some((item: Recipe) => item.id === current) ? current : snapshot.recipes[0]?.id ?? "");
    setSelectedIngredientId((current) => snapshot.ingredients.some((item: Ingredient) => item.id === current) ? current : snapshot.ingredients[0]?.id ?? "");
    setSelectedOrderId((current) => current && snapshot.orders.some((item: Order) => item.id === current) ? current : "");
    setDataError("");
    setDataStatus("ready");
    setDataVersion((version) => version + 1);
  }, []);

  const loadKitchenData = useCallback(async (cancelled?: () => boolean) => {
      const wasReady = dataStatusRef.current === "ready";
      if (wasReady) setIsRefreshing(true);

      // A device account's kitchen is in this browser. /api/bootstrap is not just
      // unnecessary here — the server refuses it — so it is never called.
      const account = deviceAccount();
      if (account) {
        try {
          const { hydrateDeviceSnapshot } = await import("./local/store");
          const snapshot = await hydrateDeviceSnapshot(account);
          if (!cancelled?.()) applyLoadedSnapshot(snapshot);
        } catch (error) {
          if (!cancelled?.()) {
            // No silent fallback to the server: it would refuse us, and pretending
            // otherwise would show an empty kitchen as if it were the real one.
            const message = error instanceof Error ? error.message : "This browser could not open your device workspace.";
            setDataError(message);
            if (wasReady) notify(message);
            else setDataStatus("error");
          }
        } finally {
          if (!cancelled?.()) setIsRefreshing(false);
        }
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/api/bootstrap`, { credentials: "same-origin" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401) {
            if (!cancelled?.()) {
              const message = result.error || "Session expired. Sign in again to continue.";
              setCsrfToken("");
              setUser(undefined);
              setRoute({ name: "login" });
              setDataError("");
              setDataStatus("loading");
              notify(message);
            }
            return;
          }
          throw new Error(result.error || `Kitchen API returned ${response.status}`);
        }
        const snapshot = result;
        if (!cancelled?.()) applyLoadedSnapshot(snapshot);
      } catch (error) {
        if (!cancelled?.()) {
          const message = error instanceof Error ? error.message : "Unable to load kitchen data";
          setDataError(message);
          if (wasReady) notify(`Live data refresh failed: ${message}`);
          else setDataStatus("error");
        }
      } finally {
        if (!cancelled?.()) setIsRefreshing(false);
      }
  }, [notify, applyLoadedSnapshot]);

  useEffect(() => {
    const onKitchenRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ phase?: "start" | "end" }>).detail;
      setActiveRequests((current) => detail?.phase === "start" ? current + 1 : Math.max(0, current - 1));
    };
    window.addEventListener(kitchenRequestEvent, onKitchenRequest);
    return () => window.removeEventListener(kitchenRequestEvent, onKitchenRequest);
  }, []);

  // Another tab of the same device account committed a write. IndexedDB
  // serialises the transactions themselves, but this tab's in-memory copy is now
  // behind, so it reloads rather than rendering stale stock.
  useEffect(() => {
    if (user?.dataMode !== "device") return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    (async () => {
      const local = await import("./local/store").catch(() => null);
      if (!local || cancelled) return;
      local.onExternalChange(() => {
        void loadKitchenData(() => cancelled);
      });
      dispose = () => local.onExternalChange(null);
    })();
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [user?.dataMode, user?.id, loadKitchenData]);

  // The signed-in identity is no longer readable from storage, so the app asks
  // the server who it is before rendering anything role-gated.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const identity = await fetchSessionIdentity();
      if (cancelled) return;
      if (identity) {
        setUser(identity);
        setRoute((current) => (current.name === "login" ? { name: "dashboard" } : current));
      } else {
        setUser(undefined);
        // Routes a signed-out visitor is allowed to stay on. Without signup here,
        // anyone opening the invite link would be bounced straight to login.
        setRoute((current) =>
          current.name === "welcome" || current.name === "reset" || current.name === "signup" ? current : { name: "login" }
        );
      }
      setSessionState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadKitchenData(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadKitchenData, user]);

  useEffect(() => {
    writeSession({ route, page, selectedRecipeId, selectedIngredientId, selectedOrderId, user });
    const nextHash = serializeAppRoute(route);
    const state = { route, page };
    if (window.location.hash !== nextHash) {
      if (historyAction.current === "push") window.history.pushState(state, "", nextHash);
      else window.history.replaceState(state, "", nextHash);
    } else {
      window.history.replaceState(state, "", nextHash);
    }
    historyAction.current = "push";
  }, [page, route, selectedIngredientId, selectedOrderId, selectedRecipeId, user]);

  const routeContext = useCallback(() => ({
    selectedRecipeId,
    selectedIngredientId,
    selectedOrderId
  }), [selectedIngredientId, selectedOrderId, selectedRecipeId]);

  const applyRoute = useCallback((target: Page | AppRoute, options: { replace?: boolean } = {}) => {
    const nextRoute = typeof target === "string" ? routeFromPage(target, routeContext()) : target;
    if (!isSameRoute(nextRoute, routeRef.current)) setQuery("");
    historyAction.current = options.replace ? "replace" : "push";
    setHasUnsavedChanges(false);
    setRoute(nextRoute);
  }, [routeContext]);

  const navigate = useCallback((target: Page | AppRoute, options: { replace?: boolean } = {}) => {
    const nextRoute = typeof target === "string" ? routeFromPage(target, routeContext()) : target;
    if (dirtyRef.current && !isSameRoute(nextRoute, routeRef.current)) {
      askConfirm({
        title: "Discard unsaved changes?",
        message: "This form has unsaved changes. Leave the page and discard them?",
        confirmLabel: "Leave Page",
        tone: "danger",
        onConfirm: async () => applyRoute(nextRoute, options)
      });
      return;
    }
    applyRoute(nextRoute, options);
  }, [applyRoute, askConfirm, routeContext]);

  const goBack = useCallback(() => {
    const parent = routeParent(routeRef.current);
    if (parent) navigate(parent);
    else window.history.back();
  }, [navigate]);

  useEffect(() => {
    const onPopState = () => {
      const nextRoute = parseAppRoute(window.location.hash, routeContext()) ?? (user ? { name: "dashboard" } : { name: "login" } as AppRoute);
      if (dirtyRef.current && !isSameRoute(nextRoute, routeRef.current)) {
        window.history.pushState({ route: routeRef.current, page: pageForRoute(routeRef.current) }, "", serializeAppRoute(routeRef.current));
        askConfirm({
          title: "Discard unsaved changes?",
          message: "This form has unsaved changes. Leave the page and discard them?",
          confirmLabel: "Leave Page",
          tone: "danger",
          onConfirm: async () => applyRoute(nextRoute)
        });
        return;
      }
      historyAction.current = "replace";
      if (!parseAppRoute(window.location.hash, routeContext())) window.history.replaceState({ route: nextRoute, page: pageForRoute(nextRoute) }, "", serializeAppRoute(nextRoute));
      setHasUnsavedChanges(false);
      setRoute(nextRoute);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [applyRoute, askConfirm, routeContext, user]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const content = useMemo(() => {
    const { selectedRecipeId: activeSelectedRecipeId, selectedIngredientId: activeSelectedIngredientId, selectedOrderId: activeSelectedOrderId } = activeSelectedIdsForRoute(route, {
      selectedRecipeId,
      selectedIngredientId,
      selectedOrderId
    });
    const props = { user, setPage: navigate, goBack, setFormDirty: setHasUnsavedChanges, currentRoute: route, setSelectedRecipeId, setSelectedIngredientId, setSelectedOrderId, setOrderDraft, selectedRecipeId: activeSelectedRecipeId, selectedIngredientId: activeSelectedIngredientId, selectedOrderId: activeSelectedOrderId, query, setQuery, notify, askConfirm, reloadData: () => loadKitchenData() };
    switch (page) {
      case "welcome":
        return <Welcome setPage={navigate} />;
      case "login":
        return <Login setPage={navigate} setUser={setUser} notify={notify} />;
      case "signup":
        return <SignupPage setPage={navigate} setUser={setUser} notify={notify} />;
      case "reset":
        return <ResetPassword token={route.name === "reset" ? route.token : undefined} setPage={navigate} notify={notify} />;
      case "dashboard":
        return <Dashboard {...props} />;
      case "recipes":
        return <Recipes {...props} />;
      case "recipe-detail":
        return <RecipeDetail recipeId={activeSelectedRecipeId} user={user} setPage={navigate} setOrderDraft={setOrderDraft} notify={notify} askConfirm={askConfirm} reloadData={() => loadKitchenData()} />;
      case "recipe-form":
        return <RecipeForm recipeId={activeSelectedRecipeId} currentRoute={route} setPage={navigate} setFormDirty={setHasUnsavedChanges} notify={notify} reloadData={() => loadKitchenData()} />;
      case "scaling":
        return <RecipeScaling recipeId={activeSelectedRecipeId} currentRoute={route} setPage={navigate} setSelectedOrderId={setSelectedOrderId} setOrderDraft={setOrderDraft} notify={notify} />;
      case "inventory":
        return <Inventory {...props} />;
      case "ingredient-detail":
        return <IngredientDetail ingredientId={activeSelectedIngredientId} user={user} setPage={navigate} notify={notify} askConfirm={askConfirm} reloadData={() => loadKitchenData()} />;
      case "ingredient-form":
        return <IngredientForm ingredientId={activeSelectedIngredientId} setPage={navigate} setFormDirty={setHasUnsavedChanges} notify={notify} reloadData={() => loadKitchenData()} />;
      case "orders":
        return <Orders {...props} />;
      case "order-create":
        return <CreateOrder orderId={activeSelectedOrderId} currentRoute={route} orderDraft={orderDraft} setOrderDraft={setOrderDraft} setPage={navigate} setFormDirty={setHasUnsavedChanges} notify={notify} reloadData={() => loadKitchenData()} />;
      case "order-detail":
        return <OrderDetail orderId={activeSelectedOrderId} user={user} setPage={navigate} notify={notify} askConfirm={askConfirm} reloadData={() => loadKitchenData()} />;
      case "production":
        return <Production user={user} setPage={navigate} setSelectedOrderId={setSelectedOrderId} notify={notify} reloadData={() => loadKitchenData()} />;
      case "shopping":
        return <ShoppingList user={user} currentRoute={route} setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
      case "imports":
        return <ImportWorkbench user={user} currentRoute={route} setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
      case "costing":
        return <Costing setPage={navigate} />;
      case "ai":
        return <AiAssistant setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
      case "conversions":
        return <ConversionLibrary user={user} setPage={navigate} notify={notify} askConfirm={askConfirm} reloadData={() => loadKitchenData()} />;
      case "suppliers":
        return <Suppliers user={user} notify={notify} askConfirm={askConfirm} reloadData={() => loadKitchenData()} />;
      case "settings":
        return <SettingsPage user={user} setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
    }
  }, [page, route, selectedIngredientId, selectedOrderId, selectedRecipeId, query, notify, askConfirm, loadKitchenData, dataVersion, user, navigate, goBack]);

  // Until the server confirms the cookie, a protected route must not render —
  // otherwise a signed-in refresh would flash the login screen.
  // Screens a signed-out visitor can be on. Signup belongs here for the same
  // reason reset does: someone arriving with an invite has no session yet, and
  // falling through to the !user branch below would render the login form over
  // the top of wherever they were trying to go.
  if (sessionState === "checking" && page !== "welcome" && page !== "reset" && page !== "signup") {
    return <LoadingScreen />;
  }

  if (page === "welcome" || page === "login" || page === "reset" || page === "signup") {
    return (
      <>
        {content}
        {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Login setPage={navigate} setUser={setUser} notify={notify} />
        {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      </>
    );
  }

  if (dataStatus === "loading") {
    return <LoadingScreen />;
  }

  if (dataStatus === "error") {
    return <ErrorScreen message={dataError} />;
  }

  return (
    <div className="app-shell" aria-busy={isRefreshing || activeRequests > 0}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar">
        <BrandMark />
        <nav>
          {desktopNav.map(([id, Icon, label]) => (
            <button key={id} className={isRouteActive(route, id as Page) ? "nav-item active" : "nav-item"} onClick={() => navigate(id as Page)}>
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Sparkles size={18} />
          <span>{user?.dataMode === "device" ? "Kitchen data stays on this device" : backendMode === "neon-api" || backendMode === "same-origin-api" ? "Connected to Neon API" : "Database mode active"}</span>
        </div>
      </aside>
      <main id="main-content" className="main" tabIndex={-1}>
        <header className="topbar">
          <div>
            <p className="eyebrow">Pastry County Kitchen OS</p>
            <h1>{titleForRoute(route)}</h1>
          </div>
          <div className="button-row">
            <Badge tone="caramel">{user.role}</Badge>
            <Button variant="secondary" onClick={() => navigate("ai")}>
              <Bot size={18} /> {HELPER_NAME}
            </Button>
            <Button variant="ghost" onClick={async () => {
              setHasUnsavedChanges(false);
              // Logging out has to reach the server: the session is revoked there,
              // so the cookie cannot be replayed after the browser forgets it.
              try {
                const response = await fetch(`${apiBaseUrl}/api/auth/logout`, {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "Content-Type": "application/json", ...csrfHeaders() }
                });
                await response.json().catch(() => ({}));
              } catch {
                notify("Signed out on this device, but the server could not be reached.");
              }
              setCsrfToken("");
              // Close the local database but never delete it: signing out is not
              // a request to destroy a tester's kitchen, and they will sign back
              // in on this device and expect their work.
              if (isDeviceMode()) {
                await import("./local/store").then((local) => local.closeDeviceStore()).catch(() => {});
              }
              setDataSession(undefined);
              writeSession({ ...readSession(), page: "login", route: { name: "login" } });
              setUser(undefined);
              setRoute({ name: "login" });
              notify("Logged out.");
            }}>Logout</Button>
          </div>
        </header>
        <RouteWayfinding route={route} navigate={navigate} goBack={goBack} />
        {(isRefreshing || activeRequests > 0) && (
          <div className="global-status" role="status" aria-live="polite" aria-busy="true">
            {activeRequests > 0 ? "Saving kitchen changes..." : "Refreshing live kitchen data..."}
          </div>
        )}
        {dataError && dataStatus === "ready" && (
          <div className="global-error" role="alert">
            Live data is temporarily stale: {dataError}
          </div>
        )}
        {content}
      </main>
      <nav className="bottom-nav" aria-label="Primary mobile navigation">
        {bottomNav.map(([id, Icon, label]) => (
          <button key={id} className={isBottomNavActive(route, id as Page) ? "active" : ""} onClick={() => navigate(id as Page)}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      {confirmRequest && <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />}
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="auth-screen" aria-busy="true">
      <article className="auth-card loading-card">
        <BrandMark />
        <h1>Opening the kitchen</h1>
        <p>{isDeviceMode() ? "Opening your kitchen from this device." : "Loading live inventory, recipes, orders, and conversion rules from Postgres."}</p>
        <div className="skeleton-grid" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </article>
    </main>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="auth-screen">
      <article className="auth-card">
        <BrandMark />
        <h1>Database connection needed</h1>
        <p>{message}</p>
        <p>Add a valid Neon `DATABASE_URL`, run the schema and seed files, then restart the server.</p>
      </article>
    </main>
  );
}

function titleForRoute(route: AppRoute) {
  if (route.name === "recipes" && route.recipeId) {
    const recipeName = recipes.find((item) => item.id === route.recipeId)?.name ?? "Recipe";
    if (route.mode === "edit") return `Edit ${recipeName}`;
    if (route.mode === "scale") return `Scale ${recipeName}`;
    return recipeName;
  }
  if (route.name === "inventory" && route.ingredientId) {
    const ingredientName = ingredients.find((item) => item.id === route.ingredientId)?.name ?? "Ingredient";
    return route.mode === "edit" ? `Edit ${ingredientName}` : ingredientName;
  }
  if (route.name === "orders" && route.orderId) {
    const order = orders.find((item) => item.id === route.orderId);
    const label = order ? `${order.customerName} Order` : "Order";
    return route.mode === "edit" ? `Edit ${label}` : label;
  }
  if (route.name === "costing" && route.recipeId) {
    const recipeName = recipes.find((item) => item.id === route.recipeId)?.name ?? "Recipe";
    return `${recipeName} Costing`;
  }
  return routeTitle(route);
}

function RouteWayfinding({ route, navigate, goBack }: { route: AppRoute; navigate: Navigate; goBack: () => void }) {
  const parent = routeParent(route);
  if (!parent || isTopLevelRoute(route)) return null;
  const ancestors: AppRoute[] = [];
  let currentParent: AppRoute | undefined = parent;
  while (currentParent) {
    ancestors.unshift(currentParent);
    currentParent = routeParent(currentParent);
  }
  return (
    <nav className="route-wayfinding" aria-label="Breadcrumb">
      <Button variant="secondary" onClick={goBack}>{routeBackLabel(route)}</Button>
      <ol>
        {ancestors.map((item) => (
          <li key={serializeAppRoute(item)}>
            <button onClick={() => navigate(item)}>{titleForRoute(item)}</button>
          </li>
        ))}
        <li aria-current="page">{titleForRoute(route)}</li>
      </ol>
    </nav>
  );
}

function BrandMark() {
  return (
    <div className="brand">
      <div className="brand-icon">PC</div>
      <div>
        <strong>Pastry County</strong>
        <span>Kitchen OS</span>
      </div>
    </div>
  );
}

function Welcome({ setPage }: { setPage: Navigate }) {
  return (
    <main className="auth-screen welcome-screen">
      <div className="auth-card hero-card">
        <BrandMark />
        <div>
          <p className="eyebrow">Bakery operations, made calm</p>
          <h1>Pastry County Kitchen OS</h1>
          <p>Recipes, stock, costing, and production in one calm kitchen system.</p>
        </div>
        <Button onClick={() => setPage("dashboard")}>
          <CheckCircle2 size={18} /> Get Started
        </Button>
        <button className="text-link" onClick={() => setPage("login")}>
          I already have an account
        </button>
      </div>
    </main>
  );
}

function Login({ setPage, setUser, notify }: { setPage: Navigate; setUser: (user: AppUser) => void; notify: Notify }) {
  const [working, setWorking] = useState(false);
  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={async (event) => {
        event.preventDefault();
        setWorking(true);
        const form = event.currentTarget;
        try {
          const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: formValue(form, "email"), password: formValue(form, "password") })
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || "Login failed.");
          // The credential arrived as an HttpOnly cookie; only the identity and
          // the CSRF token come back in the body.
          setCsrfToken(result.csrfToken ?? "");
          const { id, email, fullName, role, dataMode } = result;
          const signedInUser: AppUser = { id, email, fullName, role, dataMode };
          setDataSession(signedInUser);
          writeSession({ ...readSession(), page: "dashboard", route: { name: "dashboard" } });
          setUser(signedInUser);
          notify(`Signed in as ${signedInUser.role}.`);
          setPage("dashboard");
        } catch (error) {
          notify(error instanceof Error ? error.message : "Login failed.");
        } finally {
          setWorking(false);
        }
      }}>
        <BrandMark />
        <h1>Welcome back</h1>
        <p>Built for bakery teams that measure twice and bake once.</p>
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" placeholder="owner@pastrycounty.ng" required />
        </Field>
        <Field label="Password">
          <input name="password" type="password" autoComplete="current-password" placeholder="Password" required />
        </Field>
        <Button type="submit" disabled={working}>
          <LogIn size={18} /> {working ? "Checking..." : "Login"}
        </Button>
        <button type="button" className="text-link" onClick={() => setPage({ name: "reset" })}>Forgot password?</button>
        <button type="button" className="text-link" onClick={() => setPage({ name: "signup" })}>Have an invite code? Create your kitchen</button>
      </form>
    </main>
  );
}

// Creating an account with an invite code. The account is created centrally; the
// kitchen it opens lives in this browser.
function SignupPage({ setPage, notify, setUser }: { setPage: Navigate; notify: Notify; setUser: (user: AppUser) => void }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  return (
    <main className="auth-screen">
      <form
        className="auth-card"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          const form = event.currentTarget;
          const password = formValue(form, "password");
          const confirmation = formValue(form, "confirmPassword");

          // Checked here so a typo is caught before an account exists, using the
          // same rules the server applies.
          const strengthError = validatePasswordStrength(password);
          if (strengthError) {
            setError(strengthError);
            return;
          }
          if (!passwordsMatch(password, confirmation)) {
            setError("Both passwords need to match.");
            return;
          }

          setWorking(true);
          try {
            const response = await fetch(`${apiBaseUrl}/api/auth/signup`, {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fullName: formValue(form, "fullName"),
                email: formValue(form, "email"),
                password,
                inviteCode: formValue(form, "inviteCode")
              })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || "Could not create your account.");
            // Signing up proves the credential, so a session comes back with it
            // and there is no second sign-in step.
            setCsrfToken(result.csrfToken ?? "");
            const signedInUser: AppUser = {
              id: result.id,
              email: result.email,
              fullName: result.fullName,
              role: result.role,
              dataMode: result.dataMode
            };
            setDataSession(signedInUser);
            writeSession({ ...readSession(), page: "dashboard", route: { name: "dashboard" } });
            setUser(signedInUser);
            notify("Your kitchen is ready. Everything you add stays on this device.");
            setPage("dashboard");
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not create your account.");
          } finally {
            setWorking(false);
          }
        }}
      >
        <BrandMark />
        <h1>Create your kitchen</h1>
        <p>Your recipes, stock and orders stay in this browser. They are never stored on our servers.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Field label="Invite code">
          <input name="inviteCode" autoComplete="off" placeholder="The code you were given" required />
        </Field>
        <Field label="Your name">
          <input name="fullName" autoComplete="name" placeholder="Ada Baker" required />
        </Field>
        <Field label="Email">
          <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
        </Field>
        <Field label="Password">
          <input name="password" type="password" autoComplete="new-password" placeholder="Password" required />
        </Field>
        <Field label="Confirm password">
          <input name="confirmPassword" type="password" autoComplete="new-password" placeholder="Type it again" required />
        </Field>
        <p className="muted">At least {MINIMUM_PASSWORD_LENGTH} characters. A long passphrase is a good choice.</p>
        <Button type="submit" disabled={working}>
          <UserPlus size={18} /> {working ? "Creating..." : "Create my kitchen"}
        </Button>
        <button type="button" className="text-link" onClick={() => setPage({ name: "login" })}>Already have an account? Sign in</button>
      </form>
    </main>
  );
}

// One screen, two states: ask for a link, or set a new password when arriving
// with a token from the email.
function ResetPassword({ token, setPage, notify }: { token?: string; setPage: Navigate; notify: Notify }) {
  const [working, setWorking] = useState(false);
  const [requested, setRequested] = useState("");
  const [error, setError] = useState("");

  if (!token) {
    return (
      <main className="auth-screen">
        <form className="auth-card" onSubmit={async (event) => {
          event.preventDefault();
          setWorking(true);
          setError("");
          const form = event.currentTarget;
          try {
            const response = await fetch(`${apiBaseUrl}/api/auth/reset-request`, {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: formValue(form, "email") })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || "Could not send a reset link. Try again shortly.");
            // The server answers the same way whether or not the address is
            // registered, and so does this screen.
            setRequested(result.message || "If that email belongs to a Kitchen OS account, a reset link is on its way.");
          } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Could not send a reset link.");
          } finally {
            setWorking(false);
          }
        }}>
          <BrandMark />
          <h1>Reset your password</h1>
          {requested ? (
            <>
              <p role="status">{requested}</p>
              <p className="muted">The link works once and expires in 30 minutes. Check your spam folder if it does not arrive.</p>
              <Button type="button" variant="secondary" onClick={() => setPage({ name: "login" })}>Back to login</Button>
            </>
          ) : (
            <>
              <p>Enter the email you sign in with and we will send a reset link.</p>
              {error && <p className="form-error" role="alert">{error}</p>}
              <Field label="Email">
                <input name="email" type="email" autoComplete="email" placeholder="owner@pastrycounty.ng" required />
              </Field>
              <Button type="submit" disabled={working}>{working ? "Sending..." : "Send reset link"}</Button>
              <button type="button" className="text-link" onClick={() => setPage({ name: "login" })}>Back to login</button>
            </>
          )}
        </form>
      </main>
    );
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const form = event.currentTarget;
        const password = formValue(form, "password");
        const confirmation = formValue(form, "confirmPassword");
        if (!passwordsMatch(password, confirmation)) {
          setError("Those passwords do not match.");
          return;
        }
        const strengthError = validatePasswordStrength(password);
        if (strengthError) {
          setError(strengthError);
          return;
        }
        setWorking(true);
        try {
          const response = await fetch(`${apiBaseUrl}/api/auth/reset-confirm`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password })
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || "This reset link is no longer valid. Request a new one.");
          notify(result.message || "Password updated. Sign in with your new password.");
          setPage({ name: "login" });
        } catch (confirmError) {
          setError(confirmError instanceof Error ? confirmError.message : "This reset link is no longer valid.");
        } finally {
          setWorking(false);
        }
      }}>
        <BrandMark />
        <h1>Choose a new password</h1>
        <p>Setting a new password signs out every other device.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Field label="New password">
          <input name="password" type="password" autoComplete="new-password" minLength={MINIMUM_PASSWORD_LENGTH} required />
        </Field>
        <Field label="Confirm new password">
          <input name="confirmPassword" type="password" autoComplete="new-password" minLength={MINIMUM_PASSWORD_LENGTH} required />
        </Field>
        <p className="muted">At least {MINIMUM_PASSWORD_LENGTH} characters. A long passphrase is a good choice.</p>
        <Button type="submit" disabled={working}>{working ? "Saving..." : "Save new password"}</Button>
        <button type="button" className="text-link" onClick={() => setPage({ name: "reset" })}>Request a new link</button>
      </form>
    </main>
  );
}

function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const { dialogRef, onDialogKeyDown } = useDialogA11y<HTMLElement>(true, onClose);
  const runConfirm = async () => {
    setWorking(true);
    setError("");
    try {
      await request.onConfirm();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to complete this action.");
      setWorking(false);
    }
  };
  return (
    <div className="modal-backdrop" role="presentation">
      <section ref={dialogRef} className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" tabIndex={-1} onKeyDown={onDialogKeyDown}>
        <div>
          <p className="eyebrow">{request.tone === "danger" ? "Destructive action" : "Please confirm"}</p>
          <h2 id="confirm-title">{request.title}</h2>
          <p>{request.message}</p>
        </div>
        {error && <p className="global-error" role="alert">{error}</p>}
        <div className="button-row">
          <Button variant="secondary" onClick={onClose}>Keep it</Button>
          <Button variant={request.tone === "danger" ? "danger" : "primary"} onClick={runConfirm}>{working ? "Working..." : request.confirmLabel}</Button>
        </div>
      </section>
    </div>
  );
}

// Shown to a device account until it has exported a backup once. A tester who
// clears their browser loses the whole kitchen, and the first they would hear of
// it otherwise is when it is gone — so the warning stays until there is a file,
// then never appears again.
function DeviceBackupBanner({ setPage }: { setPage: Navigate }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!isDeviceMode()) return;
    let cancelled = false;
    void (async () => {
      try {
        const local = await import("./local/store");
        const status = await local.deviceStorageStatus();
        if (!cancelled) setShow(!status.hasExportedBackup);
      } catch {
        if (!cancelled) setShow(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  if (!show) return null;
  return (
    <div className="summary-card" role="status">
      <h3>Your kitchen data lives on this device</h3>
      <p>
        Nothing you enter here is stored in the Pastry County database. That also means clearing your browser data would
        delete it, and signing in on another device starts an empty workspace.
      </p>
      <div className="button-row">
        <Button onClick={() => setPage({ name: "settings" })}>Download a backup</Button>
        <Button variant="secondary" onClick={() => setShow(false)}>Not now</Button>
      </div>
    </div>
  );
}

function Dashboard({ setPage, setSelectedIngredientId, setSelectedOrderId }: any) {
  const shopping = generateShoppingList();
  const today = new Date().toISOString().slice(0, 10);
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("pastry-county-dismissed-notifications") ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const notifications = notificationDigest().filter((item) => !dismissedNotifications.includes(item.id));
  const dismissNotification = (id: string) => {
    setDismissedNotifications((current) => {
      const next = [...new Set([...current, id])].slice(-50);
      window.localStorage.setItem("pastry-county-dismissed-notifications", JSON.stringify(next));
      return next;
    });
  };
  const openNotification = (item: ReturnType<typeof notificationDigest>[number]) => {
    if (item.ingredientId) setSelectedIngredientId(item.ingredientId);
    if (item.orderId) setSelectedOrderId(item.orderId);
    if (item.ingredientId) setPage({ name: "inventory", ingredientId: item.ingredientId, mode: "detail" });
    else if (item.orderId) setPage({ name: "orders", orderId: item.orderId, mode: "detail" });
    else setPage(item.page);
  };
  const [movementSummary, setMovementSummary] = useState<{ wasteEvents: number; topUsedIngredientId: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchResourcePage<never>("summary")
      .then((body: any) => {
        if (!cancelled) setMovementSummary(body?.summary?.movements ?? null);
      })
      .catch(() => {
        // The rest of the dashboard is snapshot-driven and still renders; these
        // two metrics show a placeholder rather than a wrong number.
        if (!cancelled) setMovementSummary(null);
      });
    return () => {
      cancelled = true;
    };
    // Fetched when the dashboard mounts, which is each time it is navigated to.
  }, []);
  const activeOrders = orders.filter((order) => !["Delivered", "Cancelled"].includes(order.status));
  const producedOrders = orders.filter((order) => ["Produced", "Delivered"].includes(order.status));
  const activeOrderCost = activeOrders.reduce((sum, order) => sum + calculateOrderCost(order.id), 0);
  const stockValue = ingredients.reduce((sum, item) => sum + (item.currentStock * item.latestUnitCost), 0);
  // Aggregated by the database over every movement. These used to be computed
  // from whatever fitted in the snapshot's last 200 rows, so "most used" meant
  // "most used recently" and drifted as history grew.
  const topIngredientId = movementSummary?.topUsedIngredientId ?? undefined;
  const productionQueue = dashboardProductionQueue(today);
  const lowStock = ingredients.filter(isBelowReorder).slice(0, 3);
  const restockList = restockSuggestions(new Date().toISOString().slice(0, 10));
  // Each card names a list the operator can act on, so tapping it goes there --
  // filtered where the destination supports it. A count with no way through is a
  // dead end.
  const metrics: { label: string; value: React.ReactNode; hint: string; onOpen?: () => void; openLabel?: string }[] = [
    { label: "Total Ingredients", value: ingredients.length, hint: "Active pantry and packaging items", onOpen: () => setPage({ name: "inventory" }), openLabel: `Total ingredients: ${ingredients.length}. Open inventory.` },
    { label: "Low Stock Items", value: ingredients.filter(isBelowReorder).length, hint: "Need attention", onOpen: () => setPage({ name: "inventory", filter: "Low Stock" }), openLabel: `Low stock items: ${ingredients.filter(isBelowReorder).length}. Open inventory filtered to low stock.` },
    { label: "Orders Due Today", value: activeOrders.filter((order) => order.dueDate === today).length, hint: "Active orders only", onOpen: () => setPage({ name: "orders" }), openLabel: `Orders due today: ${activeOrders.filter((order) => order.dueDate === today).length}. Open orders.` },
    { label: "Pending Production", value: activeOrders.filter((order) => order.productionStatus !== "Completed").length, hint: "Active order queue", onOpen: () => setPage({ name: "production" }), openLabel: "Open the production plan." },
    { label: "Shopping Estimate", value: formatNaira(shopping.reduce((sum, item) => sum + item.estimatedCost, 0)), hint: "Suggested restock cost", onOpen: () => setPage({ name: "shopping" }), openLabel: "Open the shopping list." },
    { label: "Notifications", value: notifications.length, hint: "Active alerts" }
  ];
  return (
    <div className="page-grid">
      <DeviceBackupBanner setPage={setPage} />
      <div className="metric-grid">
        {metrics.map(({ label, value, hint, onOpen, openLabel }) => (
          <Metric key={label} label={label} value={value} hint={hint} onOpen={onOpen} openLabel={openLabel} />
        ))}
      </div>
      <Section title="Today's Production" action={<Button variant="secondary" onClick={() => setPage("production")}><ChefHat size={18} /> View Plan</Button>}>
        {!productionQueue.today.length && <p className="empty-note">No active production orders are due today.</p>}
        <div className="card-list three">
          {productionQueue.today.map((card) => (
            <article className="item-card" key={card.id}>
              <div className="item-card-head">
                <Cookie size={20} />
                <Badge tone={stockTone(card.stockStatus)}>{card.stockStatus}</Badge>
              </div>
              <h3>{card.productName}</h3>
              <p>{card.quantity} · {card.dueDate}</p>
              <Badge tone={card.productionStatus === "Ready" ? "success" : "warning"}>{card.productionStatus}</Badge>
            </article>
          ))}
        </div>
        {productionQueue.overdue.length > 0 && (
          <div className="compact-list">
            <p className="section-note">Overdue or carryover production</p>
            {productionQueue.overdue.map((card) => (
              <button className="row-card" key={card.id} onClick={() => { setSelectedOrderId(card.id); setPage({ name: "orders", orderId: card.id, mode: "detail" }); }}>
                <span><strong>{card.productName}</strong><small>{card.quantity} · {card.dueDate}</small></span>
                <Badge tone={stockTone(card.stockStatus)}>{card.stockStatus}</Badge>
              </button>
            ))}
          </div>
        )}
      </Section>
      <div className="split">
        <Section title="Notifications" action={<Button variant="secondary" onClick={() => {
          const message = notifications.map((item) => `${item.title}: ${item.detail}`).join("\n") || "No active notifications.";
          shareText(message, () => undefined);
        }}>Share Digest</Button>}>
          <div className="compact-list">
            {notifications.length === 0 && <p className="empty-note">No active notifications.</p>}
            {notifications.map((item) => (
              <div className="row-card" key={item.id}>
                <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                <div className="button-row">
                  <Button variant="secondary" onClick={() => openNotification(item)}>Open</Button>
                  <Button variant="ghost" onClick={() => dismissNotification(item.id)}>Dismiss</Button>
                  <Badge tone={item.tone}>{item.tone === "danger" ? "Action" : "Watch"}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Low Stock Alerts">
          <div className="compact-list">
            {lowStock.map((item) => (
              <button className="row-card" key={item.id} onClick={() => { setSelectedIngredientId(item.id); setPage({ name: "inventory", ingredientId: item.id, mode: "detail" }); }}>
                <span><strong>{item.name}</strong><small>{formatQuantity(item.currentStock, item.baseUnit)} left, reorder at {formatQuantity(item.reorderLevel, item.baseUnit)}</small></span>
                <Badge tone="danger">Low Stock</Badge>
              </button>
            ))}
          </div>
        </Section>
        <Section title="Analytics">
          <div className="metric-grid small">
            <Metric label="Produced Orders" value={producedOrders.length} />
            <Metric label="Active Order Cost" value={formatNaira(activeOrderCost)} />
            <Metric label="Stock Value" value={formatNaira(stockValue)} />
            <Metric label="Waste Events" value={movementSummary ? movementSummary.wasteEvents : "..."} />
          </div>
          <div className="compact-list">
            <div className="row-card"><span>Most used ingredient</span><strong>{ingredients.find((item) => item.id === topIngredientId)?.name ?? "No production use yet"}</strong></div>
            <div className="row-card"><span>Open shortages</span><strong>{orders.filter((order) => order.stockStatus === "Shortage").length}</strong></div>
          </div>
        </Section>
        <Section title="Restock guidance">
          {restockList.length === 0
            ? <p className="section-note">No restock needed right now — every tracked ingredient is above its reorder level.</p>
            : <div className="compact-list">{restockList.slice(0, 4).map((item) => (
                <article className="ai-card" key={item.ingredientId}>
                  <Sparkles size={24} />
                  <div>
                    <h3>Order {item.ingredientName} by {item.recommendedOrderByDate}</h3>
                    <p>{item.reason} Current stock {formatQuantity(item.currentStock, item.unit)} vs reorder level {formatQuantity(item.reorderLevel, item.unit)} (short {formatQuantity(item.shortfall, item.unit)}){item.relevantOrderCount > 0 ? `, needed by ${item.relevantOrderCount} active order${item.relevantOrderCount === 1 ? "" : "s"}` : ""}.</p>
                  </div>
                </article>
              ))}</div>}
        </Section>
      </div>
    </div>
  );
}

function Inventory({ user, setPage, setSelectedIngredientId, query, setQuery, currentRoute }: any) {
  // Seeded from the route so a dashboard card can deep-link to a filtered list
  // and the filtered view is shareable.
  const [filter, setFilter] = useState(currentRoute?.name === "inventory" && currentRoute.filter ? currentRoute.filter : "All");
  const categories = ["All", "Dry Goods", "Dairy", "Chocolate", "Fruits", "Packaging", "Low Stock"];
  const applyFilter = (next: string) => {
    setFilter(next);
    setPage({ name: "inventory", ...(next && next !== "All" ? { filter: next } : {}) }, { replace: true });
  };
  const list = ingredients.filter((item) => {
    const categoryMatch = filter === "All" || item.category === filter || (filter === "Low Stock" && isBelowReorder(item));
    return categoryMatch && item.name.toLowerCase().includes(query.toLowerCase());
  });
  return (
    <>
      <Toolbar query={query} setQuery={setQuery} placeholder="Search ingredients" action={<div className="button-row"><Button variant="secondary" onClick={() => exportCsv("pastry-county-inventory.csv", ["Ingredient", "Category", "Current Stock", "Reorder Level", "Base Unit", "Purchase Unit", "Latest Unit Cost", "Supplier", "Allergens", "Storage"], list.map((item) => [item.name, item.category, item.currentStock, item.reorderLevel, item.baseUnit, item.purchaseUnit ?? item.baseUnit, item.latestUnitCost, suppliers.find((supplier) => supplier.id === item.supplierId)?.name ?? "Unassigned", allergenSummary(item.allergenProfile), storageSummary(item.storageProfile)]))}>Export CSV</Button><Button variant="secondary" onClick={() => setPage({ name: "imports", returnTo: { name: "inventory" } })} disabled={!canUser(user, "manageImports")}><Upload size={18} /> Import</Button><Button onClick={() => { setSelectedIngredientId(""); setPage({ name: "inventory", mode: "new" }); }} disabled={!canUser(user, "manageInventory")}><Plus size={18} /> Add Ingredient</Button></div>} />
      <Chips items={categories} active={filter} setActive={applyFilter} />
      <ResponsiveTable
        headers={["Ingredient", "Category", "Current Stock", "Reorder", "Latest Cost", "Status"]}
        rows={list.map((item) => ({
          key: item.id,
          onClick: () => { setSelectedIngredientId(item.id); setPage({ name: "inventory", ingredientId: item.id, mode: "detail", ...(filter && filter !== "All" ? { filter } : {}) }); },
          cells: [item.name, item.category, formatQuantity(item.currentStock, item.baseUnit), formatQuantity(item.reorderLevel, item.baseUnit), `${formatNaira(item.latestUnitCost)}/${item.baseUnit}`, <Badge tone={isBelowReorder(item) ? "danger" : "success"}>{isBelowReorder(item) ? "Low Stock" : "In Stock"}</Badge>]
        }))}
      />
    </>
  );
}

function IngredientDetail({ ingredientId, user, setPage, notify, askConfirm, reloadData }: { ingredientId: string; user?: AppUser; setPage: Navigate; notify: (message: string) => void; askConfirm: AskConfirm; reloadData: () => Promise<void> }) {
  const ingredient = ingredients.find((item) => item.id === ingredientId)!;
  const [stockForm, setStockForm] = useState<"purchase" | "adjustment" | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  // This record's own history, fetched for this ingredient rather than filtered
  // out of a truncated copy of the whole audit trail.
  const [auditTrail, setAuditTrail] = useState<AuditLog[]>([]);
  const [batches, setBatches] = useState<IngredientBatch[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchResourcePage<AuditLog>("audit", { entityType: "ingredients", entityId: ingredientId, limit: 8 })
      .then((page) => {
        if (!cancelled) setAuditTrail(page.items ?? []);
      })
      .catch(() => {
        // A missing history panel must not take the ingredient page down with it.
        if (!cancelled) setAuditTrail([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ingredientId]);
  useEffect(() => {
    let cancelled = false;
    // This ingredient's own stock history, complete rather than whatever
    // survived the snapshot's global cap.
    fetchResourcePage<InventoryMovement>("movements", { ingredientId, limit: 200 })
      .then((page) => {
        if (!cancelled) setMovements(page.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setMovements([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ingredientId]);
  useEffect(() => {
    let cancelled = false;
    fetchResourcePage<IngredientBatch>("batches", { ingredientId, limit: 100 })
      .then((page) => {
        if (!cancelled) setBatches(page.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setBatches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ingredientId]);
  if (!ingredient) return <EmptyState title="Ingredient not found" message="Select an ingredient from inventory." action={<Button variant="secondary" onClick={() => setPage({ name: "inventory" })}>Back to Inventory</Button>} />;
  const supplier = suppliers.find((item) => item.id === ingredient.supplierId);
  const usageMovements = movements.filter((movement) => ["production_use", "waste", "adjustment", "reservation", "reservation_release"].includes(movement.movementType));
  const purchaseMovements = movements.filter((movement) => movement.movementType === "purchase").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const trendText = purchaseMovements.length >= 2 ? `${purchaseMovements[purchaseMovements.length - 1].quantityChange > purchaseMovements[0].quantityChange ? "Higher" : "Stable"} purchase volume trend` : "Not enough purchase history";
  return (
    <div className="detail-layout">
      <article className="detail-hero">
        <div>
          <p className="eyebrow">{ingredient.category}</p>
          <h2>{ingredient.name}</h2>
          <p>{formatQuantity(ingredient.currentStock, ingredient.baseUnit)} in stock · reorder at {formatQuantity(ingredient.reorderLevel, ingredient.baseUnit)}</p>
        </div>
        <div className="button-row">
          <Button onClick={() => setStockForm("purchase")} disabled={!canUser(user, "manageInventory")}><PackagePlus size={18} /> Add Stock</Button>
          <Button variant="secondary" onClick={() => setStockForm("adjustment")} disabled={!canUser(user, "manageInventory")}>Adjust Stock</Button>
          <Button variant="secondary" onClick={() => setUsageOpen(true)}>View Usage</Button>
          <Button variant="ghost" onClick={() => setPage({ name: "inventory", ingredientId, mode: "edit" })} disabled={!canUser(user, "manageInventory")}>Edit {ingredient.name}</Button>
          <Button variant="danger" onClick={() => askConfirm({ title: `Archive ${ingredient.name}?`, message: "It will disappear from active inventory, while historical recipe and order records remain intact.", confirmLabel: "Archive Ingredient", tone: "danger", onConfirm: async () => { await apiAction("ingredient.delete", { ingredientId }); notify(`${ingredient.name} archived from active inventory.`); await reloadData(); setPage({ name: "inventory" }); } })} disabled={!canUser(user, "deleteRecords")}>Archive</Button>
        </div>
      </article>
      <div className="split">
        <SummaryCard title="Stock Summary" items={[["Current stock", formatQuantity(ingredient.currentStock, ingredient.baseUnit)], ["Reserved stock", formatQuantity(ingredient.reservedStock ?? 0, ingredient.baseUnit)], ["Available stock", formatQuantity(ingredient.currentStock - (ingredient.reservedStock ?? 0), ingredient.baseUnit)], ["Reorder level", formatQuantity(ingredient.reorderLevel, ingredient.baseUnit)]]} />
        <SummaryCard title="Cost Summary" items={[["Last purchase price", `${formatNaira(ingredient.latestUnitCost)}/${ingredient.baseUnit}`], ["Purchase unit", ingredient.purchaseUnit ?? ingredient.baseUnit], ["Supplier", supplier?.name ?? "Unassigned"], ["Expiry date", ingredient.expiryDate ?? "Not tracked"], ["Purchase trend", trendText]]} />
      </div>
      <div className="split">
        <SummaryCard title="Allergen Profile" items={[
          ["Contains", joinList(ingredient.allergenProfile?.contains)],
          ["May contain", joinList(ingredient.allergenProfile?.mayContain)],
          ["Dietary flags", joinList(ingredient.allergenProfile?.dietaryFlags)],
          ["Cross-contact", ingredient.allergenProfile?.crossContactRisk ?? "Not set"],
          ["Label notes", ingredient.allergenProfile?.labelNotes ?? "None"]
        ]} />
        <SummaryCard title="Storage Controls" items={[
          ["Temperature", ingredient.storageProfile?.storageTemperature?.replace(/_/g, " ") ?? "Not set"],
          ["Location", ingredient.storageProfile?.storageLocation ?? "Not set"],
          ["Opened shelf life", ingredient.storageProfile?.openedShelfLifeDays ? `${ingredient.storageProfile.openedShelfLifeDays} days` : "Not set"],
          ["Sensitivity", [ingredient.storageProfile?.humiditySensitive ? "Humidity" : "", ingredient.storageProfile?.odorSensitive ? "Odor" : ""].filter(Boolean).join(", ") || "None recorded"],
          ["Handling", ingredient.storageProfile?.handlingNotes ?? "None"]
        ]} />
      </div>
      <Section title="Batch Lots & FEFO">
        <ResponsiveTable headers={["Lot", "Remaining", "Expiry", "Received", "Guidance"]} rows={batches.map((batch, index) => ({
          key: batch.id,
          cells: [
            batch.id,
            `${batch.quantityRemaining}${batch.unit}`,
            batch.expiryDate?.slice(0, 10) ?? "No expiry",
            batch.receivedDate?.slice(0, 10) ?? "Unknown",
            index === 0 ? <Badge tone="warning">Use first</Badge> : <Badge tone="neutral">Queued</Badge>
          ]
        }))} />
      </Section>
      <Section title="Audit Trail">
        <div className="timeline">
          {auditTrail.length === 0 && <p>No audit records for this ingredient yet.</p>}
          {auditTrail.map((entry) => (
            <article key={entry.id}>
              <ListChecks size={18} />
              <div>
                <strong>{entry.action.replace(/_/g, " ")}</strong>
                <small>{entry.actor} · {new Date(entry.createdAt).toLocaleString()}</small>
              </div>
            </article>
          ))}
        </div>
      </Section>
      <Section title="Stock Movement Timeline">
        <div className="timeline">
          {movements.length === 0 && <p>No stock movements recorded yet.</p>}
          {movements.map((movement) => (
            <article key={movement.id}>
              <Clock size={18} />
              <div>
                <strong>{movement.note}</strong>
                <small>{stockMovementLabel(movement.movementType)} · {formatQuantity(movement.quantityChange, movement.unit)} · {new Date(movement.createdAt).toLocaleDateString()}</small>
              </div>
            </article>
          ))}
        </div>
      </Section>
      {stockForm && <StockAdjustmentModal ingredient={ingredient} mode={stockForm} onClose={() => setStockForm(null)} notify={notify} reloadData={reloadData} />}
      {usageOpen && <UsageHistoryModal ingredient={ingredient} movements={usageMovements} onClose={() => setUsageOpen(false)} notify={notify} />}
    </div>
  );
}

function UsageHistoryModal({ ingredient, movements, onClose, notify }: { ingredient: Ingredient; movements: typeof inventoryMovements; onClose: () => void; notify: (message: string) => void }) {
  const [range, setRange] = useState("All");
  const { dialogRef, onDialogKeyDown } = useDialogA11y<HTMLElement>(true, onClose);
  const now = Date.now();
  const filtered = movements.filter((movement) => {
    if (range === "All") return true;
    const days = range === "30 days" ? 30 : 7;
    return new Date(movement.createdAt).getTime() >= now - days * 86400000;
  });
  const used = filtered.filter((movement) => movement.quantityChange < 0).reduce((sum, movement) => sum + Math.abs(movement.quantityChange), 0);
  const addedBack = filtered.filter((movement) => movement.quantityChange > 0).reduce((sum, movement) => sum + movement.quantityChange, 0);
  return (
    <div className="modal-backdrop" role="presentation">
      <article ref={dialogRef} className="confirm-modal wide" role="dialog" aria-modal="true" aria-labelledby="usage-history-title" tabIndex={-1} onKeyDown={onDialogKeyDown}>
        <div className="section-head">
          <div><p className="eyebrow">Usage history</p><h2 id="usage-history-title">{ingredient.name}</h2></div>
          <div className="button-row"><Button variant="secondary" onClick={() => exportCsv(`usage-${ingredient.id}.csv`, ["Date", "Type", "Quantity", "Note"], filtered.map((movement) => [movement.createdAt, movement.movementType, movement.quantityChange, movement.note]), notify)}>Export CSV</Button><Button variant="secondary" onClick={onClose}>Close</Button></div>
        </div>
        <Chips items={["All", "30 days", "7 days"]} active={range} setActive={setRange} />
        <div className="metric-grid small"><Metric label="Used or removed" value={formatQuantity(used, ingredient.baseUnit)} /><Metric label="Added back" value={formatQuantity(addedBack, ingredient.baseUnit)} /><Metric label="Events" value={filtered.length} /></div>
        <ResponsiveTable headers={["Date", "Type", "Quantity", "Note"]} rows={filtered.map((movement) => ({ key: movement.id, cells: [new Date(movement.createdAt).toLocaleString(), stockMovementLabel(movement.movementType), formatQuantity(movement.quantityChange, movement.unit), movement.note] }))} />
        {!filtered.length && <p className="empty-note">No usage events in this range.</p>}
      </article>
    </div>
  );
}

function StockAdjustmentModal({ ingredient, mode, onClose, notify, reloadData }: { ingredient: Ingredient; mode: "purchase" | "adjustment"; onClose: () => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const [direction, setDirection] = useState<"add" | "remove">(mode === "purchase" ? "add" : "remove");
  const [quantity, setQuantity] = useState(0);
  const [removalConfirmed, setRemovalConfirmed] = useState(false);
  const [error, setError] = useState("");
  const { dialogRef, onDialogKeyDown } = useDialogA11y<HTMLFormElement>(true, onClose);
  const clientValidationError = stockAdjustmentValidation({ direction, quantity, currentStock: ingredient.currentStock, unit: ingredient.baseUnit, removalConfirmed });
  const validationError = quantity > 0 || error ? clientValidationError || error : "";
  return (
    <div className="modal-backdrop" role="presentation">
      <form ref={dialogRef} className="confirm-modal wide" role="dialog" aria-modal="true" aria-labelledby="stock-adjustment-title" tabIndex={-1} onKeyDown={onDialogKeyDown} onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const form = event.currentTarget;
        if (clientValidationError) {
          setError(clientValidationError);
          return;
        }
        const signedQuantity = direction === "remove" ? -quantity : quantity;
        try {
          await apiAction("inventory.adjust", {
            ingredientId: ingredient.id,
            movementType: mode === "purchase" && direction === "add" ? "purchase" : "adjustment",
            quantityChange: signedQuantity,
            unit: ingredient.baseUnit,
            expiryDate: formValue(form, "expiryDate"),
            note: formValue(form, "note") || `${direction === "add" ? "Added" : "Removed"} ${formatQuantity(quantity, ingredient.baseUnit)}`
          });
          notify(`${ingredient.name} stock updated by ${formatQuantity(signedQuantity, ingredient.baseUnit)}.`);
          await reloadData();
          onClose();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Unable to save stock adjustment.");
        }
      }}>
        <h2 id="stock-adjustment-title">{mode === "purchase" ? "Add Stock" : "Adjust Stock"}</h2>
        <p>Current stock: {formatQuantity(ingredient.currentStock, ingredient.baseUnit)}. Removals cannot take stock below zero.</p>
        <div className="form-grid">
          <Field label="Adjustment type">
            <select value={direction} onChange={(event) => { setDirection(event.target.value as "add" | "remove"); setRemovalConfirmed(false); setError(""); }}>
              <option value="add">Add stock</option>
              <option value="remove">Remove stock</option>
            </select>
          </Field>
          <Field label={`Quantity (${ingredient.baseUnit})`}><input name="quantity" type="number" min="0.001" step="0.001" value={quantity || ""} onChange={(event) => { setQuantity(Number(event.target.value)); setRemovalConfirmed(false); setError(""); }} required /></Field>
          {mode === "purchase" && direction === "add" && <Field label="Expiry date" helper="Optional. Creates a FEFO lot for this purchase."><input name="expiryDate" type="date" /></Field>}
          <Field label="Reason"><textarea name="note" required placeholder="Purchase, spoilage, count correction, or production note" /></Field>
        </div>
        {direction === "remove" && (
          <label className="check-field destructive-check">
            <input type="checkbox" checked={removalConfirmed} onChange={(event) => { setRemovalConfirmed(event.target.checked); setError(""); }} />
            <span>I understand this will reduce available stock, deduct FEFO lots, and write a movement record.</span>
          </label>
        )}
        {validationError && <p className="field-error" role="alert">{validationError}</p>}
        <div className="button-row">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={Boolean(clientValidationError)}>{mode === "purchase" ? "Add Stock" : "Save Adjustment"}</Button>
        </div>
      </form>
    </div>
  );
}

function IngredientForm({ ingredientId, setPage, setFormDirty, notify, reloadData }: { ingredientId: string; setPage: Navigate; setFormDirty: (dirty: boolean) => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const ingredient = ingredients.find((item) => item.id === ingredientId);
  const [baseUnit, setBaseUnit] = useState<Unit>(ingredient?.baseUnit ?? "g");
  const [purchaseUnit, setPurchaseUnit] = useState<Unit>(ingredient?.purchaseUnit ?? ingredient?.baseUnit ?? "g");
  const [allowsDecimals, setAllowsDecimals] = useState<boolean>(ingredient?.allowsDecimals ?? defaultAllowsDecimals(ingredient?.baseUnit ?? "g"));
  const stockStep = unitIncrement(baseUnit, { allowsDecimals, minimumIncrement: ingredient?.minimumIncrement ?? null });
  if (ingredientId && !ingredient) return <EmptyState title="Ingredient not found" message="Return to inventory and choose an active ingredient." action={<Button variant="secondary" onClick={() => setPage({ name: "inventory" })}>Back to Inventory</Button>} />;
  const returnRoute: AppRoute = ingredient ? { name: "inventory", ingredientId: ingredient.id, mode: "detail" } : { name: "inventory" };
  return (
    <FormShell title={ingredient ? "Edit Ingredient" : "Add Ingredient"} action="Save Ingredient" cancelLabel={ingredient ? "Back to Ingredient" : "Back to Inventory"} onCancel={() => setPage(returnRoute)} setFormDirty={setFormDirty} onDone={async (form) => {
      const supplierName = formValue(form, "supplierId");
      const result = await apiAction("ingredient.save", {
        ingredient: {
          id: ingredient?.id,
          name: formValue(form, "name"),
          category: formValue(form, "category"),
          baseUnit: formValue(form, "baseUnit"),
          currentStock: formNumber(form, "currentStock"),
          reorderLevel: formNumber(form, "reorderLevel"),
          allowsDecimals: formValue(form, "allowsDecimals"),
          latestUnitCost: formNumber(form, "latestUnitCost", ingredient?.latestUnitCost ?? 0),
          purchaseQuantity: formNumber(form, "purchaseQuantity"),
          purchaseUnit: formValue(form, "purchaseUnit"),
          purchasePrice: formNumber(form, "purchasePrice"),
          supplierId: supplierName || undefined,
          expiryTrackingEnabled: formValue(form, "expiryTrackingEnabled"),
          defaultExpiryDays: formNumber(form, "defaultExpiryDays"),
          expiryDate: formValue(form, "expiryDate"),
          allergenProfile: {
            contains: splitCsv(formValue(form, "containsAllergens")),
            mayContain: splitCsv(formValue(form, "mayContainAllergens")),
            dietaryFlags: splitCsv(formValue(form, "dietaryFlags")),
            crossContactRisk: formValue(form, "crossContactRisk"),
            labelNotes: formValue(form, "labelNotes")
          },
          storageProfile: {
            storageTemperature: formValue(form, "storageTemperature"),
            storageLocation: formValue(form, "storageLocation"),
            humiditySensitive: formValue(form, "humiditySensitive") === "Yes",
            odorSensitive: formValue(form, "odorSensitive") === "Yes",
            openedShelfLifeDays: optionalFormNumber(form, "openedShelfLifeDays"),
            handlingNotes: formValue(form, "handlingNotes")
          },
          notes: formValue(form, "notes")
        }
      });
      notify(`Ingredient saved to ${storageLabel()}.`);
      await reloadData();
      const savedId = typeof result.id === "string" ? result.id : ingredient?.id;
      setPage(savedId ? { name: "inventory", ingredientId: savedId, mode: "detail" } : { name: "inventory" });
    }}>
      <div className="form-grid">
        <Field label="Ingredient name"><input name="name" defaultValue={ingredient?.name ?? ""} placeholder="Ingredient name" required /></Field>
        <Field label="Category"><select name="category" defaultValue={ingredient?.category ?? ""} required><option value="" disabled>Select category</option><option>Dry Goods</option><option>Dairy</option><option>Chocolate</option><option>Fruits</option><option>Packaging</option></select></Field>
        <Field label="Base unit" helper="Use one consistent storage unit for calculations.">
          <select name="baseUnit" value={baseUnit} onChange={(event) => {
            const nextUnit = event.target.value as Unit;
            setPurchaseUnit((currentUnit) => currentUnit === baseUnit ? nextUnit : currentUnit);
            setBaseUnit(nextUnit);
            setAllowsDecimals(ingredient?.allowsDecimals ?? defaultAllowsDecimals(nextUnit));
          }}><option>g</option><option>kg</option><option>ml</option><option>litre</option><option>pcs</option><option>pack</option><option>roll</option></select>
        </Field>
        <Field label="Allow partial units" helper={`Counted units like pcs, pack and roll are whole numbers unless this is on. Current step: ${stockStep}${baseUnit}.`}>
          <select name="allowsDecimals" value={allowsDecimals ? "Yes" : "No"} onChange={(event) => setAllowsDecimals(event.target.value === "Yes")}><option>No</option><option>Yes</option></select>
        </Field>
        <Field label="Current stock"><input name="currentStock" type="number" min="0" step={stockStep} defaultValue={ingredient?.currentStock ?? 0} placeholder="0" required /></Field>
        <Field label="Reorder level"><input name="reorderLevel" type="number" min="0" step={stockStep} defaultValue={ingredient?.reorderLevel ?? 0} placeholder="0" required /></Field>
        <Field label="Latest unit cost" helper={`Cost per ${baseUnit} used for costing when no purchase price is entered.`}><input name="latestUnitCost" type="number" min="0" step="0.0001" defaultValue={ingredient?.latestUnitCost ?? 0} placeholder="0" required /></Field>
        <Field label="Purchase quantity" helper="Optional. Added on top of current stock."><input name="purchaseQuantity" type="number" min="0" step="0.001" placeholder="0" /></Field>
        <Field label="Purchase unit" helper="Saved as the default purchase unit. kg/g and litre/ml purchases are converted into the base unit.">
          <select name="purchaseUnit" value={purchaseUnit} onChange={(event) => setPurchaseUnit(event.target.value as Unit)}><option>g</option><option>kg</option><option>ml</option><option>litre</option><option>pcs</option><option>pack</option><option>roll</option></select>
        </Field>
        <Field label="Purchase price"><input name="purchasePrice" type="number" min="0" step="0.01" placeholder="0" /></Field>
        <Field label="Supplier"><select name="supplierId" defaultValue={ingredient?.supplierId ?? ""}><option value="">Unassigned</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
        <Field label="Expiry tracking"><select name="expiryTrackingEnabled" defaultValue={ingredient?.expiryTrackingEnabled ? "Yes" : "No"}><option>Yes</option><option>No</option></select></Field>
        <Field label="Default expiry days"><input name="defaultExpiryDays" type="number" min="0" step="1" defaultValue={ingredient?.defaultExpiryDays ?? ""} placeholder="e.g. 14" /></Field>
        <Field label="Current batch expiry"><input name="expiryDate" type="date" defaultValue={ingredient?.expiryDate?.slice(0, 10) ?? ""} /></Field>
        <Field label="Notes"><textarea name="notes" defaultValue={ingredient?.notes ?? ""} placeholder="Storage notes, preferred brands, or supplier details" /></Field>
      </div>
      <Section title="Allergen & Storage Controls">
        <p className="section-note">Operator awareness only. Verify local labeling and food-business rules before relying on this for public sale.</p>
        <div className="form-grid">
          <Field label="Contains allergens"><input name="containsAllergens" defaultValue={ingredient?.allergenProfile?.contains?.join(", ") ?? ""} placeholder="gluten, eggs, milk, soy" /></Field>
          <Field label="May contain"><input name="mayContainAllergens" defaultValue={ingredient?.allergenProfile?.mayContain?.join(", ") ?? ""} placeholder="peanuts, tree nuts, sesame" /></Field>
          <Field label="Dietary flags"><input name="dietaryFlags" defaultValue={ingredient?.allergenProfile?.dietaryFlags?.join(", ") ?? ""} placeholder="vegan, halal, alcohol-free" /></Field>
          <Field label="Cross-contact risk"><select name="crossContactRisk" defaultValue={ingredient?.allergenProfile?.crossContactRisk ?? ""}><option value="">Not set</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
          <Field label="Label notes"><textarea name="labelNotes" defaultValue={ingredient?.allergenProfile?.labelNotes ?? ""} placeholder="Shared mixer, supplier declaration, or label reminder" /></Field>
          <Field label="Storage temperature"><select name="storageTemperature" defaultValue={ingredient?.storageProfile?.storageTemperature ?? ""}><option value="">Not set</option><option value="ambient">Ambient</option><option value="cool_dry">Cool dry</option><option value="refrigerated">Refrigerated</option><option value="frozen">Frozen</option></select></Field>
          <Field label="Storage location"><input name="storageLocation" defaultValue={ingredient?.storageProfile?.storageLocation ?? ""} placeholder="Dry store shelf A, freezer 1" /></Field>
          <Field label="Opened shelf life days"><input name="openedShelfLifeDays" type="number" min="0" step="1" defaultValue={ingredient?.storageProfile?.openedShelfLifeDays ?? ""} placeholder="e.g. 14" /></Field>
          <Field label="Humidity sensitive"><select name="humiditySensitive" defaultValue={ingredient?.storageProfile?.humiditySensitive ? "Yes" : "No"}><option>Yes</option><option>No</option></select></Field>
          <Field label="Odor sensitive"><select name="odorSensitive" defaultValue={ingredient?.storageProfile?.odorSensitive ? "Yes" : "No"}><option>Yes</option><option>No</option></select></Field>
          <Field label="Handling notes"><textarea name="handlingNotes" defaultValue={ingredient?.storageProfile?.handlingNotes ?? ""} placeholder="Keep sealed; avoid humidity; thaw overnight under refrigeration" /></Field>
        </div>
      </Section>
    </FormShell>
  );
}

function Recipes({ setPage, setSelectedRecipeId, query, setQuery }: any) {
  const [filter, setFilter] = useState("All");
  const categories = ["All", "Brownies", "Blondies", "Cookies", "Loaves", "Cakes", "Packaging Sets"];
  const list = recipes.filter((recipe) => (filter === "All" || recipe.category === filter) && recipe.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <Toolbar query={query} setQuery={setQuery} placeholder="Search recipes" action={<div className="button-row"><Button variant="secondary" onClick={() => exportCsv("pastry-county-recipes.csv", ["Recipe", "Category", "Base Yield", "Yield Unit", "Product Family", "Pan Profile", "Oven", "Bake Time", "Ingredient Subtotal", "Non-Ingredient Cost", "Batch Cost", "Cost Per Unit"], list.map((recipe) => { const cost = calculateRecipeCost(recipe.id, recipe.baseYieldQuantity); const formula = recipe.formulaMetadata ?? {}; return [recipe.name, recipe.category, recipe.baseYieldQuantity, recipe.yieldUnit, formula.productFamily ?? "", formula.panProfile ?? "", formula.ovenTemperature ?? "", formula.bakeTimeRange ?? "", cost.ingredientSubtotal, cost.nonIngredientCost, cost.totalRecipeCost, cost.costPerYieldUnit]; }))}>Export CSV</Button><Button variant="secondary" onClick={() => setPage({ name: "imports", returnTo: { name: "recipes" } })}><Upload size={18} /> Import</Button><Button onClick={() => { setSelectedRecipeId(""); setPage({ name: "recipes", mode: "new" }); }}><Plus size={18} /> Add Recipe</Button></div>} />
      <Chips items={categories} active={filter} setActive={setFilter} />
      <div className="card-grid">
        {list.map((recipe) => {
          const cost = calculateRecipeCost(recipe.id, recipe.baseYieldQuantity);
          return (
            <article className="item-card" key={recipe.id} onClick={() => { setSelectedRecipeId(recipe.id); setPage({ name: "recipes", recipeId: recipe.id, mode: "detail" }); }}>
              <div className="item-card-head"><Cookie size={22} /><Badge tone="caramel">{recipe.category}</Badge></div>
              <h3>{recipe.name}</h3>
              <p>Base yield: {recipe.baseYieldQuantity} {recipe.yieldUnit}</p>
              <small>{formulaMetadataSummary(recipe.formulaMetadata)}</small>
              <small>{costProfileSummary(recipe.costProfile)}</small>
              <div className="mini-stats"><span>{formatNaira(cost.totalRecipeCost)} batch</span><span>{formatNaira(cost.costPerYieldUnit)} each</span></div>
              <Button variant="secondary" onClick={(event) => { event.stopPropagation(); setSelectedRecipeId(recipe.id); setPage({ name: "recipes", recipeId: recipe.id, mode: "scale" }); }}><Scale size={18} /> Scale Recipe</Button>
            </article>
          );
        })}
      </div>
    </>
  );
}

function RecipeDetail({ recipeId, user, setPage, setOrderDraft, notify, askConfirm, reloadData }: { recipeId: string; user?: AppUser; setPage: Navigate; setOrderDraft: (draft: OrderDraft | null) => void; notify: (message: string) => void; askConfirm: AskConfirm; reloadData: () => Promise<void> }) {
  const [convertItemId, setConvertItemId] = useState("");
  const recipe = recipes.find((item) => item.id === recipeId);
  if (!recipe) return <EmptyState title="Recipe not found" message="Select a recipe from the database-backed recipe library." action={<Button variant="secondary" onClick={() => setPage({ name: "recipes" })}>Back to Recipes</Button>} />;
  const cost = calculateRecipeCost(recipeId, recipe.baseYieldQuantity);
  const currentRecipeItems = recipeItems.filter((item) => item.recipeId === recipeId);
  const convertItem = currentRecipeItems.find((item) => item.id === convertItemId);
  return (
    <div className="detail-layout">
      <article className="detail-hero">
        <div><p className="eyebrow">{recipe.category}</p><h2>{recipe.name}</h2><p>Base yield {recipe.baseYieldQuantity} {recipe.yieldUnit} · {formatNaira(cost.totalRecipeCost)} batch cost</p></div>
        <div className="button-row"><Button onClick={() => setPage({ name: "recipes", recipeId, mode: "scale" })}><Scale size={18} /> Scale Recipe</Button><Button variant="secondary" onClick={() => setPage({ name: "recipes", recipeId, mode: "edit" })} disabled={!canUser(user, "manageRecipes")}>Edit Recipe</Button><Button variant="secondary" onClick={() => { setOrderDraft({ recipeId, requestedYieldQuantity: recipe.baseYieldQuantity }); setPage({ name: "orders", mode: "new", returnTo: { name: "recipes", recipeId, mode: "detail" } }); }} disabled={!canUser(user, "manageOrders")}>Create Order</Button><Button variant="ghost" onClick={async () => { const result = await apiAction("recipe.save", { recipe: { name: `${recipe.name} Copy`, category: recipe.category, baseYieldQuantity: recipe.baseYieldQuantity, yieldUnit: recipe.yieldUnit, notes: recipe.notes, instructions: recipe.instructions.join("\n"), formulaMetadata: recipe.formulaMetadata ?? {}, costProfile: recipe.costProfile ?? {}, items: currentRecipeItems.map((item) => ({ ...item, prepState: item.prepState ?? {} })) } }); notify(`Recipe duplicated in ${storageLabel()}.`); await reloadData(); setPage(typeof result.id === "string" ? { name: "recipes", recipeId: result.id, mode: "detail" } : { name: "recipes" }); }} disabled={!canUser(user, "manageRecipes")}>Duplicate</Button><Button variant="danger" onClick={() => askConfirm({ title: `Archive ${recipe.name}?`, message: "It will disappear from active recipes. Linked order history stays intact.", confirmLabel: "Archive Recipe", tone: "danger", onConfirm: async () => { await apiAction("recipe.delete", { recipeId }); notify(`${recipe.name} archived from active recipes.`); await reloadData(); setPage({ name: "recipes" }); } })} disabled={!canUser(user, "deleteRecords")}>Archive</Button></div>
      </article>
      {hasFormulaMetadata(recipe.formulaMetadata) && <Section title="Formula Profile"><div className="compact-list">{formulaMetadataRows(recipe.formulaMetadata).map(([label, value]) => <div className="row-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></Section>}
      {cost.nonIngredientCost > 0 && <Section title="Production Cost Profile"><div className="compact-list">{[
        ["Ingredient subtotal", formatNaira(cost.ingredientSubtotal)],
        ["Non-ingredient costs", formatNaira(cost.nonIngredientCost)],
        ["Effective yield", `${Number(cost.effectiveYieldQuantity.toFixed(3))} ${recipe.yieldUnit}`],
        ["Cost profile", costProfileSummary(recipe.costProfile)]
      ].map(([label, value]) => <div className="row-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></Section>}
      <div className="split">
        <Section title="Ingredients"><div className="compact-list">{currentRecipeItems.map((item) => <div className="row-card" key={item.id}><span><strong>{ingredients.find((ingredient) => ingredient.id === item.ingredientId)?.name}</strong><small>{prepStateSummary(item.prepState) || "No prep state recorded"}{item.prepState?.convertedFromQuantity !== undefined ? ` | converted from ${item.prepState.convertedFromQuantity}${item.prepState.convertedFromUnit ?? ""}${item.prepState.conversionAppliedBy ? ` by ${item.prepState.conversionAppliedBy}` : ""}` : ""}</small></span><span className="row-card-actions"><strong>{formatQuantity(item.quantity, item.unit)}</strong><Button variant="secondary" onClick={() => setConvertItemId(item.id)} disabled={!canUser(user, "manageRecipes")}>Convert unit</Button></span></div>)}</div></Section>
        <Section title="Instructions"><ol className="method-list">{recipe.instructions.map((step) => <li key={step}>{step}</li>)}</ol></Section>
      </div>
      <div className="split">
        <Section title="Cost Breakdown"><div className="compact-list">{[...cost.ingredientCostBreakdown.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}<small>{formatScaledIngredientQuantity(item)}</small></span><strong>{formatNaira(item.cost)}</strong></div>), ...cost.nonIngredientCostBreakdown.map((item) => <div className="row-card" key={item.label}><span>{item.label}</span><strong>{formatNaira(item.cost)}</strong></div>)]}</div></Section>
        <Section title="Inventory Availability"><div className="metric-grid small">{[1, 2, 3].map((batch) => <article className="metric-card" key={batch}><span>{batch} batch{batch > 1 ? "es" : ""}</span><strong>{checkStockAvailability(scaleRecipe(recipeId, recipe.baseYieldQuantity * batch)).some((item) => item.status === "shortage") ? "Shortage" : "Ready"}</strong></article>)}</div></Section>
      </div>
      {convertItem && <ConversionReviewModal item={convertItem} onClose={() => setConvertItemId("")} notify={notify} reloadData={reloadData} />}
    </div>
  );
}

function ingredientPickerGroups(query: string, selectedId?: string): [string, Ingredient[]][] {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = ingredients.filter((ingredient) => {
    if (ingredient.id === selectedId) return true;
    if (!normalizedQuery) return true;
    return `${ingredient.name} ${ingredient.category}`.toLowerCase().includes(normalizedQuery);
  });
  const groups = filtered.reduce<Record<string, Ingredient[]>>((acc, ingredient) => {
    acc[ingredient.category] = [...(acc[ingredient.category] ?? []), ingredient];
    return acc;
  }, {});
  return Object.entries(groups)
    .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB))
    .map(([category, items]) => [category, items.sort((a, b) => a.name.localeCompare(b.name))]);
}

function RecipeForm({ recipeId, currentRoute, setPage, setFormDirty, notify, reloadData }: { recipeId: string; currentRoute: AppRoute; setPage: Navigate; setFormDirty: (dirty: boolean) => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const recipe = recipes.find((item) => item.id === recipeId);
  const existingItems = recipeItems.filter((item) => item.recipeId === recipeId);
  const [builderRows, setBuilderRows] = useState<number[]>(existingItems.length ? existingItems.map((_, index) => index) : [0]);
  const [ingredientSearches, setIngredientSearches] = useState<Record<number, string>>({});
  if (recipeId && !recipe) return <EmptyState title="Recipe not found" message="Return to recipes and choose an active recipe." action={<Button variant="secondary" onClick={() => setPage({ name: "recipes" })}>Back to Recipes</Button>} />;
  const returnRoute = recipe ? { name: "recipes", recipeId: recipe.id, mode: "detail" } as AppRoute : { name: "recipes" } as AppRoute;
  return (
    <FormShell title={recipe ? "Edit Recipe" : "Add Recipe"} action="Save Recipe" cancelLabel={recipe ? "Back to Recipe" : "Back to Recipes"} onCancel={() => setPage(returnRoute)} setFormDirty={setFormDirty} onDone={async (form) => {
      const items = builderRows.map((_, index) => ({
        ingredientId: formValue(form, `ingredientId-${index}`),
        quantity: formNumber(form, `quantity-${index}`),
        unit: formValue(form, `unit-${index}`),
        wastePercentage: formNumber(form, `wastePercentage-${index}`),
        notes: formValue(form, `itemNotes-${index}`),
        prepState: {
          component: formValue(form, `component-${index}`),
          stage: formValue(form, `stage-${index}`),
          sequence: optionalFormNumber(form, `sequence-${index}`),
          ingredientState: formValue(form, `ingredientState-${index}`),
          temperatureState: formValue(form, `temperatureState-${index}`),
          dividedUse: formValue(form, `dividedUse-${index}`),
          preparationNotes: formValue(form, `preparationNotes-${index}`),
          handlingWarning: formValue(form, `handlingWarning-${index}`)
        }
      })).filter((item) => item.ingredientId && item.quantity > 0).map((item) => {
        const ingredient = ingredients.find((candidate) => candidate.id === item.ingredientId);
        if (!ingredient || item.unit === ingredient.baseUnit) return item;
        const conversion = convertUnit(item.quantity, item.unit as Unit, ingredient.baseUnit, ingredient.id);
        return conversion.needsReview ? item : { ...item, quantity: Number(conversion.convertedQuantity.toFixed(3)), unit: ingredient.baseUnit };
      });
      if (!items.length) {
        notify("Add at least one ingredient with a quantity greater than zero before saving this recipe.");
        return;
      }
      const result = await apiAction("recipe.save", {
        recipe: {
          id: recipe?.id,
          productId: recipe?.productId,
          name: formValue(form, "name"),
          category: formValue(form, "category"),
          baseYieldQuantity: formNumber(form, "baseYieldQuantity", 1),
          yieldUnit: formValue(form, "yieldUnit"),
          notes: formValue(form, "notes"),
          instructions: formValue(form, "instructions"),
          formulaMetadata: {
            productFamily: formValue(form, "productFamily"),
            formulaVersion: formValue(form, "formulaVersion"),
            panProfile: formValue(form, "panProfile"),
            panCount: optionalFormNumber(form, "panCount"),
            fillGuidance: formValue(form, "fillGuidance"),
            ovenTemperature: formValue(form, "ovenTemperature"),
            bakeTimeRange: formValue(form, "bakeTimeRange"),
            mixingMethod: formValue(form, "mixingMethod"),
            restWindow: formValue(form, "restWindow"),
            chillWindow: formValue(form, "chillWindow"),
            coolWindow: formValue(form, "coolWindow"),
            targetDoneness: formValue(form, "targetDoneness"),
            sensoryCheckpoints: formValue(form, "sensoryCheckpoints"),
            storageServiceNotes: formValue(form, "storageServiceNotes"),
            testBakeStatus: formValue(form, "testBakeStatus")
          },
          costProfile: {
            laborMinutes: optionalFormNumber(form, "laborMinutes"),
            laborRatePerHour: formNumber(form, "laborRatePerHour"),
            packagingCost: formNumber(form, "packagingCost"),
            overheadCost: formNumber(form, "overheadCost"),
            utilityCost: formNumber(form, "utilityCost"),
            failureAllowancePercentage: formNumber(form, "failureAllowancePercentage"),
            yieldLossPercentage: formNumber(form, "yieldLossPercentage"),
            notes: formValue(form, "costNotes")
          },
          items
        }
      });
      notify(`Recipe saved to ${storageLabel()}.`);
      await reloadData();
      const savedId = typeof result.id === "string" ? result.id : recipe?.id;
      setPage(savedId ? { name: "recipes", recipeId: savedId, mode: "detail" } : currentRoute.name === "recipes" ? currentRoute : { name: "recipes" });
    }}>
      <Section title="Product information"><div className="form-grid"><Field label="Product name"><input name="name" defaultValue={recipe?.name ?? ""} placeholder="Product name" required /></Field><Field label="Category"><select name="category" defaultValue={recipe?.category ?? ""} required><option value="" disabled>Select category</option><option>Brownies</option><option>Blondies</option><option>Cookies</option><option>Loaves</option><option>Cakes</option></select></Field><Field label="Batch notes"><textarea name="notes" defaultValue={recipe?.notes ?? ""} placeholder="Cooling, cutting, baking, or packaging notes" /></Field></div></Section>
      <Section title="Yield information"><div className="form-grid two"><Field label="Base yield quantity"><input name="baseYieldQuantity" type="number" step="0.001" defaultValue={recipe?.baseYieldQuantity ?? 16} placeholder="0" /></Field><Field label="Yield unit"><select name="yieldUnit" defaultValue={recipe?.yieldUnit ?? "pieces"}><option>pieces</option><option>cookies</option><option>loaves</option><option>boxes</option><option>trays</option></select></Field></div></Section>
      <Section title="Formula Profile">
        <p className="section-note">Record the pan, oven, timing, sensory checkpoints, and test-bake status that make this a repeatable pastry formula.</p>
        <div className="form-grid">
          <Field label="Product family"><input name="productFamily" defaultValue={recipe?.formulaMetadata?.productFamily ?? ""} placeholder="Brownie, loaf, cookie, cake" /></Field>
          <Field label="Formula version"><input name="formulaVersion" defaultValue={recipe?.formulaMetadata?.formulaVersion ?? ""} placeholder="v1, test bake 2, Eid batch" /></Field>
          <Field label="Pan profile"><input name="panProfile" defaultValue={recipe?.formulaMetadata?.panProfile ?? ""} placeholder="9x13 tray, 500g loaf tin" /></Field>
          <Field label="Pan count"><input name="panCount" type="number" min="0" step="1" defaultValue={recipe?.formulaMetadata?.panCount ?? ""} placeholder="1" /></Field>
          <Field label="Fill guidance"><input name="fillGuidance" defaultValue={recipe?.formulaMetadata?.fillGuidance ?? ""} placeholder="Fill to 2/3, 650g batter per tin" /></Field>
          <Field label="Oven temperature"><input name="ovenTemperature" defaultValue={recipe?.formulaMetadata?.ovenTemperature ?? ""} placeholder="170C fan / 180C deck" /></Field>
          <Field label="Bake time range"><input name="bakeTimeRange" defaultValue={recipe?.formulaMetadata?.bakeTimeRange ?? ""} placeholder="24-28 min" /></Field>
          <Field label="Mixing method"><input name="mixingMethod" defaultValue={recipe?.formulaMetadata?.mixingMethod ?? ""} placeholder="Creaming, melted, muffin method" /></Field>
          <Field label="Rest window"><input name="restWindow" defaultValue={recipe?.formulaMetadata?.restWindow ?? ""} placeholder="Rest batter 15 min" /></Field>
          <Field label="Chill window"><input name="chillWindow" defaultValue={recipe?.formulaMetadata?.chillWindow ?? ""} placeholder="Chill dough 2 hr" /></Field>
          <Field label="Cool window"><input name="coolWindow" defaultValue={recipe?.formulaMetadata?.coolWindow ?? ""} placeholder="Cool fully before cutting" /></Field>
          <Field label="Target doneness"><input name="targetDoneness" defaultValue={recipe?.formulaMetadata?.targetDoneness ?? ""} placeholder="Set edges, fudgy centre" /></Field>
          <Field label="Sensory checkpoints"><textarea name="sensoryCheckpoints" defaultValue={recipe?.formulaMetadata?.sensoryCheckpoints ?? ""} placeholder="Glossy batter, no dry flour, skewer with moist crumbs" /></Field>
          <Field label="Storage/service notes"><textarea name="storageServiceNotes" defaultValue={recipe?.formulaMetadata?.storageServiceNotes ?? ""} placeholder="Wrap after cooling; best within 3 days" /></Field>
          <Field label="Test bake status"><select name="testBakeStatus" defaultValue={recipe?.formulaMetadata?.testBakeStatus ?? "untested"}><option value="untested">Untested</option><option value="test_bake_needed">Test bake needed</option><option value="tested">Tested</option><option value="production_ready">Production ready</option></select></Field>
        </div>
      </Section>
      <Section title="Cost Profile">
        <p className="section-note">Optional production costs for the base batch. Ingredient subtotal stays separate in costing.</p>
        <div className="form-grid">
          <Field label="Labor minutes"><input name="laborMinutes" type="number" min="0" step="1" defaultValue={recipe?.costProfile?.laborMinutes ?? ""} placeholder="0" /></Field>
          <Field label="Labor rate per hour"><input name="laborRatePerHour" type="number" min="0" step="0.01" defaultValue={recipe?.costProfile?.laborRatePerHour ?? ""} placeholder="0" /></Field>
          <Field label="Packaging cost"><input name="packagingCost" type="number" min="0" step="0.01" defaultValue={recipe?.costProfile?.packagingCost ?? ""} placeholder="0" /></Field>
          <Field label="Overhead cost"><input name="overheadCost" type="number" min="0" step="0.01" defaultValue={recipe?.costProfile?.overheadCost ?? ""} placeholder="0" /></Field>
          <Field label="Utility cost"><input name="utilityCost" type="number" min="0" step="0.01" defaultValue={recipe?.costProfile?.utilityCost ?? ""} placeholder="0" /></Field>
          <Field label="Failure allowance %"><input name="failureAllowancePercentage" type="number" min="0" step="0.1" defaultValue={recipe?.costProfile?.failureAllowancePercentage ?? ""} placeholder="0" /></Field>
          <Field label="Yield loss %"><input name="yieldLossPercentage" type="number" min="0" max="99" step="0.1" defaultValue={recipe?.costProfile?.yieldLossPercentage ?? ""} placeholder="0" /></Field>
          <Field label="Cost notes"><textarea name="costNotes" defaultValue={recipe?.costProfile?.notes ?? ""} placeholder="Packaging assumptions, labor station, or overhead basis" /></Field>
        </div>
      </Section>
      <Section title="Ingredients" action={<Button variant="secondary" onClick={() => setBuilderRows((rows) => [...rows, Date.now()])}><Plus size={18} /> Add Ingredient</Button>}>
        <div className="compact-list">
          {builderRows.map((row, index) => {
            const item = existingItems[index];
            const prep = item?.prepState ?? {};
            const searchValue = ingredientSearches[row] ?? "";
            const ingredientGroups = ingredientPickerGroups(searchValue, item?.ingredientId);
            return (
              <div className="builder-row" key={row}>
                <label className="builder-field ingredient-picker"><span>Ingredient</span><input type="search" aria-label={`Search ingredients for recipe row ${index + 1}`} value={searchValue} onChange={(event) => setIngredientSearches((current) => ({ ...current, [row]: event.target.value }))} placeholder="Search ingredient or category" /><select name={`ingredientId-${index}`} defaultValue={item?.ingredientId ?? ""} required><option value="" disabled>Select ingredient</option>{ingredientGroups.map(([category, group]) => <optgroup key={category} label={category}>{group.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}</optgroup>)}</select></label>
                <label className="builder-field"><span>Quantity</span><input name={`quantity-${index}`} type="number" step="0.001" defaultValue={item?.quantity ?? ""} placeholder="0" /></label>
                <label className="builder-field"><span>Unit</span><select name={`unit-${index}`} defaultValue={item?.unit ?? "g"}><option>g</option><option>kg</option><option>ml</option><option>litre</option><option>pcs</option><option>egg</option><option>yolk</option><option>white</option><option>cup</option><option>tablespoon</option><option>teaspoon</option><option>pack</option><option>roll</option></select></label>
                <label className="builder-field"><span>Waste %</span><input name={`wastePercentage-${index}`} type="number" min="0" step="0.001" defaultValue={item?.wastePercentage ?? 0} placeholder="0" /></label>
                <Button variant="ghost" onClick={() => setBuilderRows((rows) => rows.length === 1 ? rows : rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</Button>
                <div className="builder-prep-grid">
                  <label className="builder-field"><span>Component</span><input name={`component-${index}`} defaultValue={prep.component ?? ""} placeholder="Brownie base, streusel" /></label>
                  <label className="builder-field"><span>Stage</span><input name={`stage-${index}`} defaultValue={prep.stage ?? ""} placeholder="Mise, mix, fold, finish" /></label>
                  <label className="builder-field"><span>Sequence</span><input name={`sequence-${index}`} type="number" min="1" step="1" defaultValue={prep.sequence ?? ""} placeholder="1" /></label>
                  <label className="builder-field"><span>State</span><input name={`ingredientState-${index}`} defaultValue={prep.ingredientState ?? ""} placeholder="Sifted, melted, roasted, packed" /></label>
                  <label className="builder-field"><span>Temperature</span><input name={`temperatureState-${index}`} defaultValue={prep.temperatureState ?? ""} placeholder="Cold cubed, room temp" /></label>
                  <label className="builder-field"><span>Divided use</span><input name={`dividedUse-${index}`} defaultValue={prep.dividedUse ?? ""} placeholder="Half in batter, half on top" /></label>
                  <label className="builder-field"><span>Prep notes</span><input name={`preparationNotes-${index}`} defaultValue={prep.preparationNotes ?? ""} placeholder="Toast, cool, chop medium" /></label>
                  <label className="builder-field"><span>Handling warning</span><input name={`handlingWarning-${index}`} defaultValue={prep.handlingWarning ?? ""} placeholder="Keep cold; do not overmix" /></label>
                  <label className="builder-field prep-notes-wide"><span>Line notes</span><input name={`itemNotes-${index}`} defaultValue={item?.notes ?? ""} placeholder="Supplier, substitution, or production note" /></label>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
      <Section title="Conversion helper"><p className="section-note">Saved ingredient-specific conversions are applied automatically when you save a recipe. Rows without a verified rule keep their entered unit so they can be reviewed.</p><div className="compact-list">{builderRows.map((row, index) => {
        const item = existingItems[index];
        const ingredient = ingredients.find((candidate) => candidate.id === item?.ingredientId);
        const rule = item && ingredient ? conversionRules.find((candidate) => candidate.ingredientId === ingredient.id && candidate.fromUnit === item.unit && candidate.toUnit === ingredient.baseUnit) : undefined;
        return <div className="row-card" key={row}><span>Row {index + 1}<small>{rule ? `Saved rule available: 1 ${rule.fromUnit} = ${rule.conversionFactor}${rule.toUnit}` : "Saved conversion rules apply automatically on save when available."}</small></span><Badge tone={rule ? "success" : "neutral"}>{rule ? "Ready" : "Auto-check"}</Badge></div>;
      })}</div><p className="section-note"><Wand2 size={14} /> Verified conversion rules are applied to these ingredient lines automatically when you save this recipe.</p><div className="button-row"><Button variant="secondary" onClick={() => setPage({ name: "ai" })}><Bot size={18} /> Paste recipe in {HELPER_NAME}</Button></div></Section>
      <Section title="Instructions"><Field label="Method"><textarea name="instructions" defaultValue={recipe?.instructions.join("\n") ?? ""} placeholder="Add the recipe method step by step" /></Field></Section>
    </FormShell>
  );
}

function RecipeScaling({ recipeId, currentRoute, setPage, setSelectedOrderId, setOrderDraft, notify }: { recipeId: string; currentRoute: AppRoute; setPage: Navigate; setSelectedOrderId: (id: string) => void; setOrderDraft: (draft: OrderDraft | null) => void; notify: (message: string) => void }) {
  const [desired, setDesired] = useState(12);
  const recipe = recipes.find((item) => item.id === recipeId);
  if (!recipe) return <EmptyState title="No recipe selected" message="Add or select a recipe before scaling." action={<Button variant="secondary" onClick={() => setPage({ name: "recipes" })}>Back to Recipes</Button>} />;
  const desiredValid = Number.isFinite(desired) && desired > 0;
  const scaled = desiredValid ? scaleRecipe(recipeId, desired) : [];
  const cost = desiredValid ? calculateRecipeCost(recipeId, desired) : null;
  const availability = desiredValid ? checkStockAvailability(scaled) : [];
  return (
    <div className="detail-layout">
      <Section title="Scale Recipe">
        <div className="form-grid">
          <Field label="Recipe"><select value={recipeId} disabled><option value={recipeId}>{recipe.name}</option></select></Field>
          <Field label="Base yield"><input readOnly value={`${recipe.baseYieldQuantity} ${recipe.yieldUnit}`} /></Field>
          <Field label="Desired yield"><input type="number" min="0.001" step="0.001" value={desired || ""} onChange={(event) => setDesired(Number(event.target.value))} /></Field>
          <Field label="Scale factor"><input readOnly value={desiredValid ? `${(desired / recipe.baseYieldQuantity).toFixed(2)}x` : "—"} /></Field>
        </div>
        {!desiredValid && <p className="field-error">Enter a desired yield greater than zero to scale this recipe.</p>}
      </Section>
      {desiredValid && cost && <div className="metric-grid small"><Metric label="Estimated cost" value={formatNaira(cost.totalRecipeCost)} /><Metric label="Cost per piece" value={formatNaira(cost.costPerYieldUnit)} /><Metric label="Stock availability" value={availability.some((item) => item.status === "shortage") ? "Shortage" : "Ready"} /><Metric label="Egg scaling" value={settings.eggRoundingPreference === "allow_gram_conversion" ? "Gram weights" : "Whole counts"} /></div>}
      {hasFormulaMetadata(recipe.formulaMetadata) && <Section title="Formula Profile"><div className="compact-list">{formulaMetadataRows(recipe.formulaMetadata).slice(0, 8).map(([label, value]) => <div className="row-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></Section>}
      <Section title="Scaled Ingredients"><div className="compact-list">{scaled.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}<small>Original {formatQuantity(item.originalQuantity, item.unit)}{item.practicalQuantity !== undefined ? ` | practical ${formatQuantity(item.practicalQuantity, item.unit)} (rounded to ${settings.gramRoundingPreference}g)` : ""}{prepStateSummary(item.prepState) ? ` | ${prepStateSummary(item.prepState)}` : ""}{item.scalingNote ? ` | ${item.scalingNote}` : ""}</small></span><strong>{formatScaledIngredientQuantity(item)}</strong></div>)}</div></Section>
      {availability.some((item) => item.status === "shortage") && <article className="warning-card"><AlertTriangle size={22} /> Some ingredients are short. Update stock before production is completed.</article>}
      <div className="sticky-actions"><Button onClick={() => { notify("Scaled recipe added to production planning view."); setPage({ name: "production" }); }}>Save as production plan</Button><Button variant="secondary" onClick={() => { setSelectedOrderId(""); setOrderDraft({ recipeId, requestedYieldQuantity: desired }); setPage({ name: "orders", mode: "new", returnTo: currentRoute.name === "recipes" ? currentRoute : { name: "recipes", recipeId, mode: "scale" } }); }}>Create order</Button><Button variant="secondary" onClick={() => window.print()}>Print recipe</Button><Button variant="ghost" onClick={() => shareText(`${recipe.name} scaled to ${desired} ${recipe.yieldUnit}`, notify)}>Share recipe</Button></div>
    </div>
  );
}

function Orders({ user, setPage, setSelectedOrderId, setOrderDraft, query, setQuery, currentRoute }: any) {
  const [filter, setFilter] = useState(currentRoute?.name === "orders" && currentRoute.filter ? currentRoute.filter : "All");
  const statuses = ["All", "New", "Confirmed", "In Production", "Produced", "Delivered", "Cancelled"];
  // The chosen filter is written to the URL (replacing, not stacking history
  // entries) and carried into a record, so returning from an order lands back on
  // the list the operator was actually looking at.
  const applyFilter = (next: string) => {
    setFilter(next);
    setPage({ name: "orders", ...(next && next !== "All" ? { filter: next } : {}) }, { replace: true });
  };
  const list = orders.filter((order) => (filter === "All" || order.status === filter || (filter === "New" && order.status === "Draft")) && order.customerName.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <Toolbar query={query} setQuery={setQuery} placeholder="Search orders" action={<div className="button-row"><Button variant="secondary" onClick={() => exportCsv("pastry-county-orders.csv", ["Customer", "Phone", "Due Date", "Delivery", "Status", "Payment", "Production", "Stock", "Estimated Cost"], list.map((order) => [order.customerName, order.customerPhone, order.dueDate, order.deliveryMethod, order.status, order.paymentStatus, order.productionStatus, order.stockStatus, calculateOrderCost(order.id)]))}>Export CSV</Button><Button onClick={() => { setSelectedOrderId(""); setOrderDraft(null); setPage({ name: "orders", mode: "new" }); }} disabled={!canUser(user, "manageOrders")}><Plus size={18} /> Add Order</Button></div>} />
      <Chips items={statuses} active={filter} setActive={applyFilter} />
      <div className="card-grid">
        {list.map((order) => <OrderCard key={order.id} order={order} onClick={() => { setSelectedOrderId(order.id); setPage({ name: "orders", orderId: order.id, mode: "detail", ...(filter && filter !== "All" ? { filter } : {}) }); }} />)}
      </div>
    </>
  );
}

function OrderCard({ order, onClick }: { order: Order; onClick: () => void }) {
  const items = orderItems.filter((item) => item.orderId === order.id).map((item) => products.find((product) => product.id === item.productId)?.name).join(", ");
  return (
    <article className="item-card" onClick={onClick}>
      <div className="item-card-head"><Users size={20} /><Badge tone={stockTone(order.status)}>{order.status}</Badge></div>
      <h3>{order.customerName}</h3>
      <p>{items}</p>
      <div className="mini-stats"><span>Due {order.dueDate}</span><span>{order.paymentStatus}</span></div>
      <div className="button-row"><Badge tone={stockTone(order.stockStatus)}>{order.stockStatus}</Badge><Badge tone={stockTone(order.productionStatus)}>{order.productionStatus}</Badge></div>
    </article>
  );
}

function CreateOrder({ orderId, currentRoute, orderDraft, setOrderDraft, setPage, setFormDirty, notify, reloadData }: { orderId: string; currentRoute: AppRoute; orderDraft: OrderDraft | null; setOrderDraft: (draft: OrderDraft | null) => void; setPage: Navigate; setFormDirty: (dirty: boolean) => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const order = orders.find((item) => item.id === orderId);
  const existingItems = orderItems.filter((item) => item.orderId === orderId);
  const draftRecipe = !order && orderDraft ? recipes.find((item) => item.id === orderDraft.recipeId) : undefined;
  const draftItem = draftRecipe ? { productId: draftRecipe.productId, recipeId: draftRecipe.id, requestedYieldQuantity: orderDraft?.requestedYieldQuantity ?? draftRecipe.baseYieldQuantity, yieldUnit: draftRecipe.yieldUnit, quantityMultiplier: 1 } : undefined;
  const initialLines = existingItems.length ? existingItems : draftItem ? [draftItem] : [{ productId: "", recipeId: "", requestedYieldQuantity: 1, yieldUnit: "pieces", quantityMultiplier: 1 }];
  const [orderRows, setOrderRows] = useState<number[]>(initialLines.map((_, index) => index));
  const [lineDrafts, setLineDrafts] = useState<Record<number, OrderLineDraft>>(() => Object.fromEntries(initialLines.map((item, index) => [index, {
    productId: item.productId,
    recipeId: item.recipeId,
    requestedYieldQuantity: item.requestedYieldQuantity,
    yieldUnit: item.yieldUnit,
    quantityMultiplier: item.quantityMultiplier,
    unitSellingPrice: (item as { unitSellingPrice?: number | null }).unitSellingPrice ?? undefined
  }])));
  const validLines = orderRows.map((row) => lineDrafts[row]).filter((item): item is OrderLineDraft => Boolean(item?.recipeId && item.requestedYieldQuantity > 0 && item.quantityMultiplier > 0));
  const requirements = validLines.length ? requirementsForOrderLines(validLines) : [];
  const availability = checkStockAvailability(requirements);
  const cost = requirements.reduce((sum, item) => {
    const ingredient = ingredients.find((candidate) => candidate.id === item.ingredientId);
    return sum + item.scaledQuantity * (ingredient?.latestUnitCost ?? 0);
  }, 0);
  const [deliveryFee, setDeliveryFee] = useState<number>(order?.deliveryFee ?? 0);
  const [discountAmount, setDiscountAmount] = useState<number>(order?.discountAmount ?? 0);
  const [taxRate, setTaxRate] = useState<number>(order?.taxRate ?? settings.defaultTaxPercentage ?? 0);
  const [amountPaid, setAmountPaid] = useState<number>(order?.amountPaid ?? 0);
  const pricing = computeOrderPricing({
    lines: validLines.map((line) => ({ saleQuantity: line.requestedYieldQuantity * line.quantityMultiplier, unitSellingPrice: line.unitSellingPrice ?? 0 })),
    deliveryFee,
    discountAmount,
    taxRate,
    amountPaid
  });
  const margin = calculateMargin(pricing.netTotal, cost);
  if (orderId && !order) return <EmptyState title="Order not found" message="Return to orders and choose an active order." action={<Button variant="secondary" onClick={() => setPage({ name: "orders" })}>Back to Orders</Button>} />;
  const routeReturnTo = currentRoute.name === "orders" ? currentRoute.returnTo : undefined;
  const cancelRoute = order ? { name: "orders", orderId: order.id, mode: "detail" } as AppRoute : routeReturnTo ?? { name: "orders" } as AppRoute;
  return (
    <FormShell title={order ? "Edit Order" : "Create Order"} action="Confirm and Reserve Stock" cancelLabel={order ? "Back to Order" : routeReturnTo ? "Back to Source" : "Back to Orders"} onCancel={() => { setOrderDraft(null); setPage(cancelRoute); }} setFormDirty={setFormDirty} onDone={async (form) => {
      const items = orderRows.map((row) => lineDrafts[row]).filter((item): item is OrderLineDraft => Boolean(item?.productId && item.recipeId));
      const result = await apiAction("order.save", {
        reserve: true,
        order: {
          id: order?.id,
          customerName: formValue(form, "customerName"),
          customerPhone: formValue(form, "customerPhone"),
          dueDate: formValue(form, "dueDate"),
          deliveryMethod: formValue(form, "deliveryMethod"),
          paymentStatus: formValue(form, "paymentStatus"),
          status: "Confirmed",
          notes: formValue(form, "notes"),
          deliveryFee,
          discountAmount,
          taxRate,
          amountPaid,
          items
        }
      });
      notify(`Order saved to ${storageLabel()} and stock reservation checked.`);
      setOrderDraft(null);
      await reloadData();
      const savedId = typeof result.id === "string" ? result.id : order?.id;
      setPage(savedId ? { name: "orders", orderId: savedId, mode: "detail" } : { name: "orders" });
    }}>
      <Section title="Customer info"><div className="form-grid"><Field label="Customer name"><input name="customerName" defaultValue={order?.customerName ?? ""} placeholder="Customer name" required /></Field><Field label="Customer phone"><input name="customerPhone" type="tel" defaultValue={order?.customerPhone ?? ""} placeholder="+234..." /></Field><Field label="Due date"><input name="dueDate" type="date" defaultValue={order?.dueDate ?? new Date().toISOString().slice(0, 10)} required /></Field><Field label="Delivery or pickup"><select name="deliveryMethod" defaultValue={order?.deliveryMethod ?? "Pickup"}><option>Pickup</option><option>Delivery</option></select></Field><Field label="Payment status"><select name="paymentStatus" defaultValue={order?.paymentStatus ?? "Unpaid"}><option>Unpaid</option><option>Deposit Paid</option><option>Paid</option></select></Field><Field label="Notes"><textarea name="notes" defaultValue={order?.notes ?? ""} placeholder="Order notes" /></Field></div></Section>
      <Section title="Order items" action={<Button variant="secondary" onClick={() => { const row = Date.now(); setOrderRows((rows) => [...rows, row]); setLineDrafts((drafts) => ({ ...drafts, [row]: { productId: "", recipeId: "", requestedYieldQuantity: 1, yieldUnit: "pieces", quantityMultiplier: 1 } })); }}><Plus size={18} /> Add another product</Button>}>
        <div className="compact-list">
          {orderRows.map((row, index) => {
            const item = lineDrafts[row] ?? { productId: "", recipeId: "", requestedYieldQuantity: 1, yieldUnit: "pieces", quantityMultiplier: 1 };
            const updateLine = (patch: Partial<OrderLineDraft>) => setLineDrafts((drafts) => ({ ...drafts, [row]: { ...item, ...patch } }));
            return (
              <div className="builder-row order-builder-row" key={row}>
                <label className="builder-field"><span>Product</span><select name={`productId-${index}`} value={item.productId} onChange={(event) => updateLine({ productId: event.target.value })} required><option value="" disabled>Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                <label className="builder-field"><span>Recipe</span><select name={`recipeId-${index}`} value={item.recipeId} onChange={(event) => { const recipe = recipes.find((candidate) => candidate.id === event.target.value); updateLine({ recipeId: event.target.value, productId: item.productId || recipe?.productId || "", requestedYieldQuantity: item.requestedYieldQuantity || recipe?.baseYieldQuantity || 1, yieldUnit: recipe?.yieldUnit || item.yieldUnit }); }} required><option value="" disabled>Select recipe</option>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</select></label>
                <label className="builder-field"><span>Yield qty</span><input name={`requestedYieldQuantity-${index}`} type="number" min="0.001" step="0.001" value={item.requestedYieldQuantity || ""} onChange={(event) => updateLine({ requestedYieldQuantity: Number(event.target.value) })} placeholder="0" /></label>
                <label className="builder-field"><span>Yield unit</span><select name={`yieldUnit-${index}`} value={item.yieldUnit} onChange={(event) => updateLine({ yieldUnit: event.target.value })}><option>pieces</option><option>cookies</option><option>loaves</option></select></label>
                <label className="builder-field"><span>Multiplier</span><input aria-label={`Order item ${index + 1} multiplier`} name={`quantityMultiplier-${index}`} type="number" min="0.001" step="0.001" value={item.quantityMultiplier || ""} onChange={(event) => updateLine({ quantityMultiplier: Number(event.target.value) })} /></label>
                <label className="builder-field"><span>Unit price</span><input aria-label={`Order item ${index + 1} unit selling price`} name={`unitSellingPrice-${index}`} type="number" min="0" step="0.01" value={item.unitSellingPrice ?? ""} onChange={(event) => updateLine({ unitSellingPrice: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="0" /></label>
                {orderRows.length > 1 && <Button variant="ghost" onClick={() => setOrderRows((rows) => rows.filter((candidate) => candidate !== row))}>Remove</Button>}
              </div>
            );
          })}
        </div>
      </Section>
      <Section title="Pricing & payment">
        <div className="form-grid">
          <Field label="Delivery fee"><input type="number" min="0" step="0.01" value={deliveryFee || ""} onChange={(event) => setDeliveryFee(Number(event.target.value))} placeholder="0" /></Field>
          <Field label="Order discount"><input type="number" min="0" step="0.01" value={discountAmount || ""} onChange={(event) => setDiscountAmount(Number(event.target.value))} placeholder="0" /></Field>
          <Field label="Tax rate %"><input type="number" min="0" step="0.001" value={taxRate || ""} onChange={(event) => setTaxRate(Number(event.target.value))} placeholder="0" /></Field>
          <Field label="Amount paid"><input type="number" min="0" step="0.01" value={amountPaid || ""} onChange={(event) => setAmountPaid(Number(event.target.value))} placeholder="0" /></Field>
        </div>
        <p className="section-note">Enter each item's unit price in the order items above. Totals are calculated and saved by the server; leave prices blank if this order has no agreed price yet.</p>
      </Section>
      <div className="split">
      <Section title="Ingredient Requirement Preview"><div className="compact-list">{requirements.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}</span><strong>{formatScaledIngredientQuantity(item)}</strong></div>)}</div></Section>
      <Section title="Stock Availability"><div className="compact-list">{availability.map((item) => {
        const unit = requirements.find((requirement) => requirement.ingredientId === item.ingredientId)?.unit ?? "g";
        return <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}<small>Available {formatQuantity(item.availableStock, unit)}</small></span><Badge tone={item.status === "shortage" ? "danger" : "success"}>{item.status.replace(/_/g, " ")}</Badge></div>;
      })}</div></Section>
      </div>
      {availability.some((item) => item.shortageQuantity > 0) && <article className="warning-card"><AlertTriangle size={22} /> Some ingredients are short. You can still save this order, but production cannot be completed until stock is updated.</article>}
      <div className="metric-grid small">
        <Metric label="Subtotal" value={pricing.hasPricing ? formatNaira(pricing.subtotal) : "No selling price set"} />
        <Metric label="Net Selling Price" value={pricing.hasPricing ? formatNaira(pricing.netTotal) : "—"} />
        <Metric label="Gross Total (customer pays)" value={pricing.hasPricing ? formatNaira(pricing.grossTotal) : "—"} />
        <Metric label="Estimated Production Cost" value={formatNaira(cost)} />
        <Metric label="Estimated Gross Margin" value={pricing.hasPricing ? `${margin.grossMarginPercentage.toFixed(1)}%` : "—"} />
        <Metric label="Balance Due" value={pricing.hasPricing ? formatNaira(pricing.balance) : "—"} />
      </div>
    </FormShell>
  );
}

function OrderDetail({ orderId, user, setPage, notify, askConfirm, reloadData }: { orderId: string; user?: AppUser; setPage: Navigate; notify: (message: string) => void; askConfirm: AskConfirm; reloadData: () => Promise<void> }) {
  const order = orders.find((item) => item.id === orderId);
  const [qcOrderId, setQcOrderId] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  if (!order) return <EmptyState title="Order not found" message="Select an order from the live order list." action={<Button variant="secondary" onClick={() => setPage({ name: "orders" })}>Back to Orders</Button>} />;
  const requirements = requirementsForOrder(orderId);
  const availability = checkOrderStockAvailability(orderId);
  const hasShortage = availability.some((item) => item.shortageQuantity > 0);
  const isFinal = ["Produced", "Delivered", "Cancelled"].includes(order.status);
  const canReserve = !["Produced", "Delivered", "Cancelled"].includes(order.status);
  const canStartProduction = (!hasShortage || settings.allowNegativeInventory) && ["Confirmed", "Stock Reserved", "In Production"].includes(order.status);
  const canProduce = (!hasShortage || settings.allowNegativeInventory) && ["Stock Reserved", "In Production"].includes(order.status);
  const canDeliver = order.status === "Produced";
  const cost = calculateOrderCost(orderId);
  const qcLogs = productionQcLogs.filter((log) => log.orderId === orderId);
  const events = orderEventsForOrder(orderEvents, orderId);
  const hasPricing = order.netTotal != null;
  const orderMargin = hasPricing ? calculateMargin(order.netTotal ?? 0, cost) : null;
  const cancelConsequences = cancellationConsequences(order);
  return (
    <div className="detail-layout">
      <article className="detail-hero">
        <div>
          <p className="eyebrow">Order detail</p>
          <h2>{order.customerName}</h2>
          <p>{order.customerPhone} · {order.deliveryMethod} · due {order.dueDate}</p>
        </div>
        <div className="button-row">
          <Button variant="secondary" onClick={() => setPage({ name: "orders", orderId, mode: "edit" })} disabled={isFinal || !canUser(user, "manageOrders")}>Edit Order</Button>
          <Button onClick={async () => { try { const result = await apiAction("order.reserve", { orderId }); notify(result.partial ? `Partially reserved ${result.reservedLines.length} ingredient${result.reservedLines.length === 1 ? "" : "s"}; shortages remain.` : result.shortage ? "No additional stock could be reserved; shortages remain." : result.alreadyReserved ? "Stock is already fully reserved for this order." : `Stock reserved in ${storageLabel()}.`); await reloadData(); } catch (error) { notify(error instanceof Error ? error.message : "Unable to reserve stock."); } }} disabled={!canReserve || !canUser(user, "manageOrders")}>Reserve Stock</Button>
          <Button variant="secondary" onClick={async () => { try { await apiAction("order.status", { orderId, status: "In Production", productionStatus: "In Progress" }); notify("Order marked as in production."); await reloadData(); } catch (error) { notify(error instanceof Error ? error.message : "Unable to start production."); } }} disabled={!canStartProduction || !canUser(user, "runProduction")}>Mark In Production</Button>
          <Button variant="secondary" onClick={() => setQcOrderId(orderId)} disabled={!canProduce || !canUser(user, "runProduction")}>Mark Produced</Button>
          <Button variant="ghost" onClick={async () => { try { await apiAction("order.status", { orderId, status: "Delivered", productionStatus: "Completed" }); notify("Order marked as delivered."); await reloadData(); } catch (error) { notify(error instanceof Error ? error.message : "Unable to deliver order."); } }} disabled={!canDeliver}>Delivered</Button>
          <Button variant="secondary" onClick={() => cancelConsequences.canCancel ? setCancelOpen(true) : notify(cancelConsequences.blockedReason ?? "This order cannot be cancelled.")} disabled={!cancelConsequences.canCancel || !canUser(user, "manageOrders")}>Cancel Order</Button>
          <Button variant="danger" onClick={() => askConfirm({ title: `Delete ${order.customerName}'s order?`, message: "This removes the order from active operations and releases any reservation. Ledger history is preserved.", confirmLabel: "Delete Order", tone: "danger", onConfirm: async () => { await apiAction("order.delete", { orderId }); notify("Order deleted from active list and reservation released."); await reloadData(); setPage({ name: "orders" }); } })} disabled={!canUser(user, "deleteRecords")}>Delete Order</Button>
        </div>
      </article>
      {hasShortage && <article className="warning-card"><AlertTriangle size={22} /> Resolve ingredient shortages before reserving stock, starting production, or marking this order produced.</article>}
      <div className="split"><SummaryCard title="Customer Info" items={[["Name", order.customerName], ["Phone", order.customerPhone], ["Payment", order.paymentStatus], ["Notes", order.notes ?? "None"]]} /><SummaryCard title="Cost & Margin" items={[["Production cost", formatNaira(cost)], ["Net selling price", hasPricing ? formatNaira(order.netTotal ?? 0) : "No selling price set"], ["Gross margin", hasPricing && orderMargin ? `${orderMargin.grossMarginPercentage.toFixed(1)}%` : "—"], ["Gross total", hasPricing ? formatNaira(order.grossTotal ?? 0) : "—"], ["Amount paid", hasPricing ? formatNaira(order.amountPaid ?? 0) : "—"], ["Balance due", hasPricing ? formatNaira(order.balance ?? 0) : "—"], ["Stock status", order.stockStatus], ["Order status", order.status]]} /></div>
      <Section title="Required Ingredients"><div className="compact-list">{requirements.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}</span><strong>{formatScaledIngredientQuantity(item)}</strong></div>)}</div></Section>
      <Section title="Stock Check"><div className="compact-list">{availability.map((item) => {
        const unit = requirements.find((requirement) => requirement.ingredientId === item.ingredientId)?.unit ?? "g";
        return <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}<small>Required {formatQuantity(item.requiredQuantity, unit)}, available {formatQuantity(item.availableStock, unit)}</small></span><Badge tone={item.shortageQuantity > 0 ? "danger" : "success"}>{item.shortageQuantity > 0 ? "Shortage" : "Enough Stock"}</Badge></div>;
      })}</div></Section>
      <Section title="Timeline">
        {events.length === 0
          ? <p className="section-note">No recorded events yet for this order.</p>
          : <div className="timeline">{events.map((event) => (
              <article key={event.id}>
                {event.eventType === "cancelled" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                <div><strong>{orderEventLabel(event)}</strong><small>{[event.actorName, new Date(event.createdAt).toLocaleString()].filter(Boolean).join(" · ")}</small></div>
              </article>
            ))}</div>}
      </Section>
      <Section title="Production QC Logs"><div className="timeline">{qcLogs.length === 0 && <p>No QC logs recorded for this order yet.</p>}{qcLogs.map((log) => <article key={log.id}><ClipboardList size={18} /><div><strong>{log.passedQc ? "QC passed" : "QC issue logged"}{log.actualYieldQuantity ? ` | actual ${log.actualYieldQuantity}${log.yieldUnit ?? ""}` : ""}</strong><small>{[log.ovenTemperature, log.bakeTimeMinutes ? `${log.bakeTimeMinutes} min` : "", log.sensoryNotes].filter(Boolean).join(" | ") || "No process notes"} | {new Date(log.createdAt).toLocaleString()}</small></div></article>)}</div></Section>
      {qcOrderId && <ProductionQcModal orderId={qcOrderId} onClose={() => setQcOrderId("")} notify={notify} reloadData={reloadData} />}
      {cancelOpen && <CancelOrderModal order={order} consequences={cancelConsequences} onClose={() => setCancelOpen(false)} notify={notify} reloadData={reloadData} />}
    </div>
  );
}

// Applying a conversion to a recipe line is the only path that changes a recipe
// from a conversion. It is explicitly a review: it shows the exact target line,
// the current value, the suggested value and where it came from, and an editable
// final value. Cancel writes nothing and says nothing. Success is only claimed
// after reloading and confirming the line actually changed.
function ConversionReviewModal({ item, onClose, notify, reloadData }: { item: RecipeItem; onClose: () => void; notify: Notify; reloadData: () => Promise<void> }) {
  const { dialogRef, onDialogKeyDown } = useDialogA11y<HTMLElement>(true, onClose);
  const ingredient = ingredients.find((candidate) => candidate.id === item.ingredientId);
  const [toUnit, setToUnit] = useState<Unit>(ingredient?.baseUnit ?? item.unit);
  const suggestion = convertUnit(item.quantity, item.unit, toUnit, item.ingredientId, conversionRules, {
    ingredientState: item.prepState?.ingredientState,
    temperatureState: item.prepState?.temperatureState
  });
  const [finalQuantity, setFinalQuantity] = useState<number>(Number(suggestion.convertedQuantity.toFixed(3)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const suggested = Number(suggestion.convertedQuantity.toFixed(3));
  return (
    <div className="modal-backdrop" role="presentation">
      <article ref={dialogRef} className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="conversion-review-title" tabIndex={-1} onKeyDown={onDialogKeyDown}>
        <div className="section-head"><div><p className="eyebrow">Convert recipe ingredient</p><h2 id="conversion-review-title">{ingredient?.name ?? item.ingredientId}</h2></div></div>
        <SummaryCard title="Review this change" items={[
          ["Recipe line", `${ingredient?.name ?? item.ingredientId}`],
          ["Current value", formatQuantity(item.quantity, item.unit)],
          ["Suggested", `${suggested}${toUnit}`],
          ["Source", suggestion.source],
          ["Confidence", suggestion.confidenceLevel + (suggestion.needsReview ? " (unverified)" : "")]
        ]} />
        <div className="form-grid">
          <Field label="Convert to unit">
            <select value={toUnit} onChange={(event) => { const next = event.target.value as Unit; setToUnit(next); setError(""); }}>
              {["g", "kg", "ml", "litre", "pcs", "cup", "tablespoon", "teaspoon", "pack", "roll", "egg", "yolk", "white"].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </Field>
          <Field label="Final quantity to save" helper="Edit this if the suggestion is not right for your kitchen.">
            <input type="number" min="0.001" step="0.001" value={finalQuantity || ""} onChange={(event) => { setFinalQuantity(Number(event.target.value)); setError(""); }} />
          </Field>
        </div>
        {suggestion.needsReview && <p className="section-note">No verified rule covers {item.unit} to {toUnit} for this ingredient. Check the value before saving.</p>}
        {error && <p className="field-error">{error}</p>}
        <div className="button-row">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !(finalQuantity > 0)} onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await apiAction("conversion.applyToRecipeItem", {
                recipeItemId: item.id,
                expectedQuantity: item.quantity,
                expectedUnit: item.unit,
                finalQuantity,
                finalUnit: toUnit,
                conversionRuleId: suggestion.ruleId
              });
              await reloadData();
              // Only claim success if the reloaded line really changed.
              const saved = recipeItems.find((candidate) => candidate.id === item.id);
              if (!saved || Math.abs(saved.quantity - finalQuantity) > 0.0001 || saved.unit !== toUnit) {
                setError("The recipe line did not come back with the new value. Reopen and try again.");
                setBusy(false);
                return;
              }
              notify(`${ingredient?.name ?? "Ingredient"} updated to ${formatQuantity(saved.quantity, saved.unit)} on this recipe.`);
              onClose();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Unable to apply this conversion.");
              setBusy(false);
            }
          }}>Apply to this recipe line</Button>
        </div>
      </article>
    </div>
  );
}

function CancelOrderModal({ order, consequences, onClose, notify, reloadData }: { order: Order; consequences: ReturnType<typeof cancellationConsequences>; onClose: () => void; notify: Notify; reloadData: () => Promise<void> }) {
  const { dialogRef, onDialogKeyDown } = useDialogA11y<HTMLElement>(true, onClose);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="modal-backdrop" role="presentation">
      <article ref={dialogRef} className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-order-title" tabIndex={-1} onKeyDown={onDialogKeyDown}>
        <div className="section-head"><div><p className="eyebrow">Cancel order</p><h2 id="cancel-order-title">{order.customerName}</h2></div></div>
        <SummaryCard title="What cancelling does" items={[
          ["Reserved stock", consequences.willReleaseReservation ? "Released back to inventory" : "None to release"],
          ["Production", consequences.productionStarted ? "Already started" : "Not started"],
          ["Deducted stock", consequences.alreadyDeducted ? "Already deducted (needs a correction)" : "None deducted"]
        ]} />
        <Field label="Cancellation reason"><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this order being cancelled?" required /></Field>
        <div className="button-row">
          <Button variant="secondary" onClick={onClose}>Keep Order</Button>
          <Button variant="danger" disabled={busy || reason.trim().length === 0} onClick={async () => { setBusy(true); try { await apiAction("order.status", { orderId: order.id, status: "Cancelled", reason: reason.trim() }); notify("Order cancelled; any reservation was released."); onClose(); await reloadData(); } catch (error) { notify(error instanceof Error ? error.message : "Unable to cancel order."); setBusy(false); } }}>Cancel This Order</Button>
        </div>
      </article>
    </div>
  );
}

function Production({ user, setPage, setSelectedOrderId, notify, reloadData }: { user?: AppUser; setPage: Navigate; setSelectedOrderId: (id: string) => void; notify: Notify; reloadData: () => Promise<void> }) {
  const [reviewBatchKey, setReviewBatchKey] = useState("");
  const [scaledOrderId, setScaledOrderId] = useState("");
  const [qcOrderId, setQcOrderId] = useState("");
  const activeOrders = orders.filter((order) => !["Delivered", "Cancelled"].includes(order.status));
  const batches = Object.values(orderItems.reduce<Record<string, { key: string; recipeId: string; dueDate: string; orderIds: string[]; totalYield: number }>>((acc, item) => {
    const order = activeOrders.find((candidate) => candidate.id === item.orderId);
    if (!order) return acc;
    const key = `${order.dueDate}:${item.recipeId}`;
    acc[key] ??= { key, recipeId: item.recipeId, dueDate: order.dueDate, orderIds: [], totalYield: 0 };
    if (!acc[key].orderIds.includes(order.id)) acc[key].orderIds.push(order.id);
    acc[key].totalYield += item.requestedYieldQuantity * item.quantityMultiplier;
    return acc;
  }, {})).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.totalYield - a.totalYield);
  const topGroup = batches[0];
  const groupedRecipe = recipes.find((recipe) => recipe.id === topGroup?.recipeId);
  const reviewBatch = batches.find((batch) => batch.key === reviewBatchKey);
  const reviewRecipe = recipes.find((recipe) => recipe.id === reviewBatch?.recipeId);
  const reviewRequirements = reviewRecipe && reviewBatch ? scaleRecipe(reviewRecipe.id, reviewBatch.totalYield) : [];
  const reviewAvailability = checkStockAvailability(reviewRequirements);
  const batchReviewDialog = useDialogA11y<HTMLElement>(Boolean(reviewBatch), () => setReviewBatchKey(""));
  const batchStage = (batch: { orderIds: string[] }, hasShortage: boolean) => {
    const batchOrders = batch.orderIds.map((id) => orders.find((order) => order.id === id)).filter(Boolean) as Order[];
    if (hasShortage) return "Shortage";
    if (batchOrders.length && batchOrders.every((order) => ["Produced", "Delivered"].includes(order.status) || order.productionStatus === "Completed")) return "Completed";
    if (batchOrders.some((order) => order.status === "In Production" || order.productionStatus === "In Progress")) return "In Progress";
    return "Ready";
  };
  return (
    <div className="page-grid">
      <article className="ai-card"><ChefHat size={24} /><div><h2>Batch production mode</h2><p>{groupedRecipe ? `Next batch: ${groupedRecipe.name}, ${topGroup?.totalYield} ${groupedRecipe.yieldUnit}, across ${topGroup?.orderIds.length} order${topGroup?.orderIds.length === 1 ? "" : "s"}.` : "Group similar recipes once orders are available."}</p></div><Button variant="secondary" onClick={() => notify(groupedRecipe ? `${groupedRecipe.name} batch is grouped for ${topGroup?.totalYield} ${groupedRecipe.yieldUnit}.` : "No recipes to group yet.")}>Group similar recipes</Button></article>
      <Section title="Grouped Batches">
        <div className="card-grid">
          {batches.map((batch) => {
            const recipe = recipes.find((item) => item.id === batch.recipeId);
            const batchRequirements = recipe ? scaleRecipe(recipe.id, batch.totalYield) : [];
            const availability = checkStockAvailability(batchRequirements);
            const shortages = availability.filter((item) => item.shortageQuantity > 0).map((item) => ({ ...item, unit: batchRequirements.find((requirement) => requirement.ingredientId === item.ingredientId)?.unit ?? "g" as Unit }));
            const hasShortage = shortages.length > 0;
            const stage = batchStage(batch, hasShortage);
            const canStartBatch = (!hasShortage || settings.allowNegativeInventory) && stage === "Ready" && canUser(user, "runProduction");
            const canCompleteBatch = (!hasShortage || settings.allowNegativeInventory) && ["Ready", "In Progress"].includes(stage) && canUser(user, "runProduction");
            return (
              <article className="item-card" key={batch.key}>
                <div className="item-card-head"><ChefHat size={20} /><Badge tone={stockTone(stage)}>{stage}</Badge></div>
                <h3>{recipe?.name ?? "Recipe"}</h3>
                <p>{batch.totalYield} {recipe?.yieldUnit ?? "units"} · due {batch.dueDate}</p>
                <small>{batch.orderIds.length} order{batch.orderIds.length === 1 ? "" : "s"} | {batchRequirements.slice(0, 3).map((item) => `${item.ingredientName} ${formatScaledIngredientQuantity(item)}`).join(", ")}</small>
                {hasShortage && <small className="field-error">Resolve before production: {shortageText(shortages)}.</small>}
                <div className="button-row">
                  <Button variant="secondary" onClick={() => setReviewBatchKey(batch.key)}>Review Batch</Button>
                  {hasShortage && <Button variant="secondary" onClick={() => setPage({ name: "shopping", returnTo: { name: "production" } })}>Open Shopping List</Button>}
                  <Button variant="secondary" onClick={async () => { try { if (hasShortage && !settings.allowNegativeInventory) { notify(`Cannot start batch: ${shortageText(shortages)}.`); setPage({ name: "shopping", returnTo: { name: "production" } }); return; } await apiAction("production.batchStatus", { orderIds: batch.orderIds, status: "In Production", productionStatus: "In Progress" }); notify(`${recipe?.name ?? "Batch"} batch started.`); await reloadData(); } catch (error) { notify(error instanceof Error ? error.message : "Unable to start batch."); } }} disabled={!canStartBatch}>Start Batch</Button>
                  <Button onClick={() => { if (hasShortage && !settings.allowNegativeInventory) { notify(`Cannot complete batch: ${shortageText(shortages)}.`); setPage({ name: "shopping", returnTo: { name: "production" } }); return; } setReviewBatchKey(batch.key); }} disabled={!canCompleteBatch}>Complete Batch</Button>
                </div>
              </article>
            );
          })}
        </div>
      </Section>
      {["Today", "Tomorrow", "This Week"].map((bucket) => (
        <Section title={bucket} key={bucket}>
          <div className="card-grid">
            {ordersForProductionBucket(bucket as "Today" | "Tomorrow" | "This Week", businessToday()).map((order) => {
              const requirements = requirementsForOrder(order.id);
              const orderShortages = checkOrderStockAvailability(order.id).filter((item) => item.shortageQuantity > 0).map((item) => ({ ...item, unit: requirements.find((requirement) => requirement.ingredientId === item.ingredientId)?.unit ?? "g" as Unit }));
              const hasShortage = orderShortages.length > 0;
              const canStartProduction = (!hasShortage || settings.allowNegativeInventory) && ["Confirmed", "Stock Reserved", "In Production"].includes(order.status);
              const canDeductInventory = (!hasShortage || settings.allowNegativeInventory) && ["Stock Reserved", "In Production"].includes(order.status);
              return (
                <article className="item-card" key={order.id} onClick={() => { setSelectedOrderId(order.id); setPage({ name: "orders", orderId: order.id, mode: "detail", returnTo: { name: "production", orderId: order.id } }); }}>
                  <div className="item-card-head"><ChefHat size={20} /><Badge tone={stockTone(hasShortage ? "Shortage" : order.stockStatus)}>{hasShortage ? "Shortage" : order.stockStatus}</Badge></div>
                  <h3>{orderItems.filter((item) => item.orderId === order.id).map((item) => products.find((product) => product.id === item.productId)?.name).join(", ")}</h3>
                  <p>{order.customerName} · due {order.dueDate}</p>
                  <small>Required: {requirements.slice(0, 3).map((item) => `${item.ingredientName} ${formatScaledIngredientQuantity(item)}`).join(", ")}</small>
                  {hasShortage && <small className="field-error">Resolve before production: {shortageText(orderShortages)}.</small>}
                  <div className="button-row">{hasShortage && <Button variant="secondary" onClick={(event) => { event.stopPropagation(); setPage({ name: "shopping", returnTo: { name: "production", orderId: order.id } }); }}>Open Shopping List</Button>}<Button variant="secondary" onClick={async (event) => { event.stopPropagation(); try { if (hasShortage && !settings.allowNegativeInventory) { notify(`Cannot start production: ${shortageText(orderShortages)}.`); setPage({ name: "shopping", returnTo: { name: "production", orderId: order.id } }); return; } await apiAction("order.status", { orderId: order.id, status: "In Production", productionStatus: "In Progress" }); notify("Production started for this order."); await reloadData(); } catch (error) { notify(error instanceof Error ? error.message : "Unable to start production."); } }} disabled={!canStartProduction || !canUser(user, "runProduction")}>Start Production</Button><Button variant="secondary" onClick={(event) => { event.stopPropagation(); setScaledOrderId(order.id); }}>View Scaled Recipe</Button><Button onClick={(event) => { event.stopPropagation(); if (hasShortage && !settings.allowNegativeInventory) { notify(`Cannot deduct inventory: ${shortageText(orderShortages)}.`); setPage({ name: "shopping", returnTo: { name: "production", orderId: order.id } }); return; } setQcOrderId(order.id); }} disabled={!canDeductInventory || !canUser(user, "runProduction")}>Deduct Inventory</Button></div>
                </article>
              );
            })}
          </div>
        </Section>
      ))}
      {reviewBatch && (
        <div className="modal-backdrop" role="presentation">
          <article ref={batchReviewDialog.dialogRef} className="confirm-modal wide" role="dialog" aria-modal="true" aria-labelledby="batch-review-title" tabIndex={-1} onKeyDown={batchReviewDialog.onDialogKeyDown}>
            <div className="section-head">
              <div><p className="eyebrow">Production review</p><h2 id="batch-review-title">{reviewRecipe?.name ?? "Batch"}</h2></div>
              <Button variant="secondary" onClick={() => setReviewBatchKey("")}>Close</Button>
            </div>
            <SummaryCard title="Batch Summary" items={[
              ["Due date", reviewBatch.dueDate],
              ["Total yield", `${reviewBatch.totalYield} ${reviewRecipe?.yieldUnit ?? "units"}`],
              ["Orders", reviewBatch.orderIds.map((id) => orders.find((order) => order.id === id)?.customerName ?? id).join(", ")],
              ["Completed by", user?.fullName ?? user?.email ?? "You"],
              ["State", batchStage(reviewBatch, reviewAvailability.some((item) => item.shortageQuantity > 0))]
            ]} />
            <p className="section-note">Completing deducts the ingredients below from stock for {reviewBatch.orderIds.length} order{reviewBatch.orderIds.length === 1 ? "" : "s"}. This is recorded per order and cannot be repeated.</p>
            <ResponsiveTable headers={["Ingredient", "Current stock", "Deducts", "Resulting stock", "Status"]} rows={reviewAvailability.map((item) => {
              const unit = reviewRequirements.find((requirement) => requirement.ingredientId === item.ingredientId)?.unit ?? "g";
              const resulting = item.availableStock - item.requiredQuantity;
              return { key: item.ingredientId, cells: [
                item.ingredientName,
                formatQuantity(item.availableStock, unit),
                formatQuantity(item.requiredQuantity, unit),
                item.shortageQuantity > 0 ? formatQuantity(item.shortageQuantity * -1, unit) : formatQuantity(resulting, unit),
                <Badge tone={item.shortageQuantity > 0 ? "danger" : "success"}>{item.shortageQuantity > 0 ? "Shortage" : "Enough Stock"}</Badge>
              ] };
            })} />
            <div className="button-row">
              <Button variant="secondary" onClick={() => setReviewBatchKey("")}>Cancel</Button>
              <Button disabled={(reviewAvailability.some((item) => item.shortageQuantity > 0) && !settings.allowNegativeInventory) || !canUser(user, "runProduction")} onClick={async () => { try { const result = await apiAction("production.batchStatus", { orderIds: reviewBatch.orderIds, status: "Produced", productionStatus: "Completed" }); const produced = Array.isArray(result.results) ? result.results.filter((entry: { produced?: boolean }) => entry.produced).length : reviewBatch.orderIds.length; notify(`${reviewRecipe?.name ?? "Batch"} batch completed; stock deducted for ${produced} order${produced === 1 ? "" : "s"}.`); setReviewBatchKey(""); await reloadData(); } catch (error) { notify(error instanceof Error ? error.message : "Unable to complete batch."); } }}>Confirm &amp; Complete Batch</Button>
            </div>
          </article>
        </div>
      )}
      {scaledOrderId && <ProductionScaledRecipeModal orderId={scaledOrderId} onClose={() => setScaledOrderId("")} />}
      {qcOrderId && <ProductionQcModal orderId={qcOrderId} onClose={() => setQcOrderId("")} notify={notify} reloadData={reloadData} />}
    </div>
  );
}

function ProductionQcModal({ orderId, onClose, notify, reloadData }: { orderId: string; onClose: () => void; notify: Notify; reloadData: () => Promise<void> }) {
  const order = orders.find((item) => item.id === orderId);
  const lines = orderItems.filter((item) => item.orderId === orderId);
  const firstLine = lines[0];
  const recipe = recipes.find((item) => item.id === firstLine?.recipeId);
  const expectedYield = firstLine ? firstLine.requestedYieldQuantity * firstLine.quantityMultiplier : 0;
  const yieldUnit = firstLine?.yieldUnit ?? recipe?.yieldUnit ?? "units";
  const { dialogRef, onDialogKeyDown } = useDialogA11y<HTMLFormElement>(true, onClose);
  if (!order) return null;
  return (
    <div className="modal-backdrop" role="presentation">
      <form ref={dialogRef} className="confirm-modal wide" role="dialog" aria-modal="true" aria-labelledby="production-qc-title" tabIndex={-1} onKeyDown={onDialogKeyDown} onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        await markOrderProduced(orderId, notify, {
          recipeId: recipe?.id,
          formulaVersion: recipe?.formulaMetadata?.formulaVersion,
          expectedYieldQuantity: formNumber(form, "expectedYieldQuantity", expectedYield),
          actualYieldQuantity: formNumber(form, "actualYieldQuantity", expectedYield),
          yieldUnit: formValue(form, "yieldUnit") || yieldUnit,
          roomTemperature: formValue(form, "roomTemperature"),
          mixTemperature: formValue(form, "mixTemperature"),
          ovenTemperature: formValue(form, "ovenTemperature"),
          bakeTimeMinutes: optionalFormNumber(form, "bakeTimeMinutes"),
          restTimeMinutes: optionalFormNumber(form, "restTimeMinutes"),
          sensoryNotes: formValue(form, "sensoryNotes"),
          defects: formValue(form, "defects"),
          nextAdjustment: formValue(form, "nextAdjustment"),
          passedQc: formValue(form, "passedQc") === "Yes"
        });
        await reloadData();
        onClose();
      }}>
        <div className="section-head">
          <div><p className="eyebrow">Production QC</p><h2 id="production-qc-title">{order.customerName}</h2></div>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
        <p className="section-note">Record the production checkpoints before inventory is deducted. This is a kitchen QC log, not a regulatory filing.</p>
        <div className="form-grid">
          <Field label="Recipe"><input readOnly value={recipe?.name ?? "Mixed order"} /></Field>
          <Field label="Expected yield"><input name="expectedYieldQuantity" type="number" min="0" step="0.001" defaultValue={expectedYield || ""} /></Field>
          <Field label="Actual yield"><input name="actualYieldQuantity" type="number" min="0" step="0.001" defaultValue={expectedYield || ""} /></Field>
          <Field label="Yield unit"><input name="yieldUnit" defaultValue={yieldUnit} /></Field>
          <Field label="Room temp"><input name="roomTemperature" placeholder="e.g. 25C" /></Field>
          <Field label="Mix temp"><input name="mixTemperature" placeholder="e.g. batter 23C" /></Field>
          <Field label="Oven temp"><input name="ovenTemperature" defaultValue={recipe?.formulaMetadata?.ovenTemperature ?? ""} placeholder="e.g. 170C fan" /></Field>
          <Field label="Bake time minutes"><input name="bakeTimeMinutes" type="number" min="0" step="0.1" /></Field>
          <Field label="Rest time minutes"><input name="restTimeMinutes" type="number" min="0" step="0.1" /></Field>
          <Field label="QC result"><select name="passedQc" defaultValue="Yes"><option>Yes</option><option>No</option></select></Field>
          <Field label="Sensory notes"><textarea name="sensoryNotes" placeholder="Glossy top, moist crumbs, clean edges" /></Field>
          <Field label="Defects"><textarea name="defects" placeholder="Overbaked edges, sunken centre, underproofed pieces" /></Field>
          <Field label="Next adjustment"><textarea name="nextAdjustment" placeholder="Reduce bake by 2 minutes, chill dough longer, lower oven shelf" /></Field>
        </div>
        <div className="button-row">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Complete Production</Button>
        </div>
      </form>
    </div>
  );
}

function ProductionScaledRecipeModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const order = orders.find((item) => item.id === orderId);
  const lines = orderItems.filter((item) => item.orderId === orderId);
  const { dialogRef, onDialogKeyDown } = useDialogA11y<HTMLElement>(true, onClose);
  if (!order) return null;
  return (
    <div className="modal-backdrop" role="presentation">
      <article ref={dialogRef} className="confirm-modal wide" role="dialog" aria-modal="true" aria-labelledby="scaled-recipe-title" tabIndex={-1} onKeyDown={onDialogKeyDown}>
        <div className="section-head">
          <div><p className="eyebrow">Scaled recipe</p><h2 id="scaled-recipe-title">{order.customerName}</h2></div>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
        {lines.map((line) => {
          const recipe = recipes.find((item) => item.id === line.recipeId);
          const requested = line.requestedYieldQuantity * line.quantityMultiplier;
          const requestedValid = Number.isFinite(requested) && requested > 0 && Number(recipe?.baseYieldQuantity) > 0;
          const scaled = recipe && requestedValid ? scaleRecipe(recipe.id, requested) : [];
          const cost = recipe && requestedValid ? calculateRecipeCost(recipe.id, requested) : { totalRecipeCost: 0, costPerYieldUnit: 0 };
          return (
            <section className="compact-list" key={line.id}>
              <SummaryCard title={recipe?.name ?? "Recipe"} items={[
                ["Requested yield", `${requested} ${line.yieldUnit}`],
                ["Scale factor", recipe ? `${(requested / recipe.baseYieldQuantity).toFixed(2)}x` : "Unknown"],
                ["Estimated cost", formatNaira(cost.totalRecipeCost)]
              ]} />
              <ResponsiveTable headers={["Ingredient", "Original", "Scaled"]} rows={scaled.map((item) => ({ key: item.ingredientId, cells: [item.ingredientName, formatQuantity(item.originalQuantity, item.unit), formatScaledIngredientQuantity(item)] }))} />
            </section>
          );
        })}
      </article>
    </div>
  );
}

function ShoppingList({ user, currentRoute, setPage, notify, reloadData }: { user?: AppUser; currentRoute: AppRoute; setPage: Navigate; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const list = generateShoppingList();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [purchaseDrafts, setPurchaseDrafts] = useState<Record<string, { quantity: string; unitCost: string; note: string; expiryDate: string }>>({});
  useEffect(() => {
    setSelectedIds((current) => {
      const available = new Set(list.map((item) => item.ingredientId));
      const kept = current.filter((id) => available.has(id));
      return kept.length ? kept : list.map((item) => item.ingredientId);
    });
  }, [list.map((item) => item.ingredientId).join("|")]);
  useEffect(() => {
    setPurchaseDrafts((current) => {
      const next = { ...current };
      list.forEach((item) => {
        next[item.ingredientId] ??= {
          quantity: String(item.suggestedBuyQuantity),
          unitCost: String(item.unitCost),
          note: `${item.reason}${item.demandOrderCount ? ` for ${item.demandOrderCount} order${item.demandOrderCount === 1 ? "" : "s"}` : ""}`,
          expiryDate: ""
        };
      });
      return next;
    });
  }, [list.map((item) => `${item.ingredientId}:${item.suggestedBuyQuantity}:${item.unitCost}`).join("|")]);
  const selectedItems = list
    .filter((item) => selectedIds.includes(item.ingredientId))
    .map((item) => {
      const draft = purchaseDrafts[item.ingredientId] ?? { quantity: String(item.suggestedBuyQuantity), unitCost: String(item.unitCost), note: "", expiryDate: "" };
      const purchaseQuantity = Number(draft.quantity) || 0;
      const unitCost = Number(draft.unitCost) || 0;
      return {
        ...item,
        purchaseQuantity,
        unitCost,
        estimatedCost: purchaseQuantity * unitCost,
        note: draft.note,
        expiryDate: draft.expiryDate
      };
    });
  const updateDraft = (ingredientId: string, patch: Partial<{ quantity: string; unitCost: string; note: string; expiryDate: string }>) => {
    setPurchaseDrafts((current) => ({ ...current, [ingredientId]: { ...(current[ingredientId] ?? { quantity: "", unitCost: "", note: "", expiryDate: "" }), ...patch } }));
  };
  const exportShoppingList = () => {
    const text = list.map((item) => {
      const draft = purchaseDrafts[item.ingredientId] ?? { quantity: String(item.suggestedBuyQuantity), unitCost: String(item.unitCost) };
      return `${item.ingredientName}: buy ${draft.quantity}${item.unit} (${formatNaira((Number(draft.quantity) || 0) * (Number(draft.unitCost) || 0))})`;
    }).join("\n");
    downloadText("pastry-county-shopping-list.txt", text || "No shopping list items.");
    notify("Shopping list exported.");
  };
  const selectedCost = selectedItems.reduce((sum, item) => sum + item.estimatedCost, 0);
  const invalidSelected = selectedItems.some((item) => item.purchaseQuantity <= 0 || item.unitCost <= 0);
  const visibleIds = Array.from(new Set(list.map((item) => item.ingredientId)));
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const returnTo = currentRoute.name === "shopping" ? currentRoute.returnTo : undefined;
  return (
    <div className="page-grid">
      {returnTo && (
        <article className="return-card">
          <div>
            <p className="eyebrow">Workflow return</p>
            <h2>{routeBackLabel(currentRoute)}</h2>
          </div>
          <Button variant="secondary" onClick={() => setPage(returnTo)}>Back</Button>
        </article>
      )}
      <div className="metric-grid small"><Metric label="Needed for Orders" value={list.filter((item) => item.requiredQuantity > 0).length} /><Metric label="Below Reorder Level" value={ingredients.filter(isBelowReorder).length} /><Metric label="Selected Cost" value={formatNaira(selectedCost)} /></div>
      <Section title="Suggested Purchases" action={<Button variant="secondary" onClick={() => shareText(list.map((item) => `${item.ingredientName}: ${item.suggestedBuyQuantity}${item.unit}`).join("\n"), notify)}>Send to WhatsApp</Button>}>
        <ResponsiveTable headers={["Buy", "Ingredient", "Available", "Needed", "Purchase Qty", "Unit Cost", "Expiry", "Cost", "Reason", "Supplier"]} rows={list.map((item) => {
          const draft = purchaseDrafts[item.ingredientId] ?? { quantity: String(item.suggestedBuyQuantity), unitCost: String(item.unitCost), note: "", expiryDate: "" };
          const lineCost = (Number(draft.quantity) || 0) * (Number(draft.unitCost) || 0);
          return {
            key: item.ingredientId,
            cells: [
              <label className="touch-checkbox"><input aria-label={`Purchase ${item.ingredientName}`} type="checkbox" checked={selectedIds.includes(item.ingredientId)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...new Set([...ids, item.ingredientId])] : ids.filter((id) => id !== item.ingredientId))} /><span aria-hidden="true" /></label>,
              item.ingredientName,
              `${item.availableStock}${item.unit}`,
              `${item.requiredQuantity}${item.unit}`,
              <input aria-label={`${item.ingredientName} purchase quantity`} type="number" min="0.001" step="0.001" value={draft.quantity} onChange={(event) => updateDraft(item.ingredientId, { quantity: event.target.value })} onBlur={(event) => updateDraft(item.ingredientId, { quantity: String(Math.max(0, Number(event.target.value) || 0)) })} />,
              <input aria-label={`${item.ingredientName} unit cost`} type="number" min="0" step="0.0001" value={draft.unitCost} onChange={(event) => updateDraft(item.ingredientId, { unitCost: event.target.value })} onBlur={(event) => updateDraft(item.ingredientId, { unitCost: String(Math.max(0, Number(event.target.value) || 0)) })} />,
              <input aria-label={`${item.ingredientName} expiry date`} type="date" value={draft.expiryDate} onChange={(event) => updateDraft(item.ingredientId, { expiryDate: event.target.value })} />,
              formatNaira(lineCost),
              <input aria-label={`${item.ingredientName} purchase note`} value={draft.note} onChange={(event) => updateDraft(item.ingredientId, { note: event.target.value })} />,
              item.supplier
            ]
          };
        })} />
      </Section>
      {invalidSelected && <article className="warning-card"><AlertTriangle size={22} /> Selected purchases need quantity and unit cost greater than zero before they can update inventory.</article>}
      <div className="sticky-actions"><Button onClick={async () => { try { if (invalidSelected) { notify("Fix selected purchase quantities and unit costs before marking purchased."); return; } await apiAction("shopping.purchaseSuggested", { items: selectedItems }); notify(`${selectedItems.length} purchase${selectedItems.length === 1 ? "" : "s"} logged and inventory updated.`); await reloadData(); } catch (error) { notify(error instanceof Error ? error.message : "Unable to log shopping purchases."); } }} disabled={!selectedItems.length || invalidSelected || !canUser(user, "purchaseStock")}>Mark Selected Purchased</Button><Button variant="secondary" onClick={() => setSelectedIds(allSelected ? [] : visibleIds)} disabled={!visibleIds.length}>{allSelected ? "Clear All" : "Select All"}</Button><Button variant="secondary" onClick={exportShoppingList}>Export/Share List</Button></div>
    </div>
  );
}

function importTemplateCsv() {
  return [
    "record_type,recipe,category,base_yield_quantity,yield_unit,ingredient,quantity,unit,package_quantity,package_price,line_amount,supplier,from_unit,to_unit,conversion_factor,contact,email",
    "supplier,,,,,,,,,,,Balogun Baking Market,,,,Mrs Ade,orders@example.com",
    "ingredient,,,,,Cake Flour,,g,,,0.75,Balogun Baking Market,,,,,",
    "recipe,Chocolate Cake,Cakes,1,cake,Cake Flour,500,g,1000,750,375,,,,,,",
    "recipe,Chocolate Cake,Cakes,1,cake,Sugar,300,g,1000,620,186,,,,,,",
    "recipe,Chocolate Cake,Cakes,1,cake,Eggs,4,pcs,,,640,,,,,,",
    "recipe,Chocolate Cake,Cakes,1,cake,,,,,,,,,,,",
    "conversion,,,,,Cake Flour,,,,,,Balogun Baking Market,cup,g,120,,"
  ].join("\n");
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function confidenceTone(confidence?: string): "success" | "warning" | "danger" | "neutral" {
  if (confidence === "High") return "success";
  if (confidence === "Medium") return "warning";
  if (confidence === "Low") return "danger";
  return "neutral";
}

function importStatusLabel(confidence?: string) {
  if (confidence === "High") return "Ready";
  if (confidence === "Medium") return "Check";
  if (confidence === "Low") return "Needs help";
  return "Review";
}

function sourceEvidenceLabel(source?: { sourceName?: string; sheet?: string; row?: number; line?: number; page?: number; text?: string }) {
  if (!source) return "Original line not shown";
  const location = [source.sheet ? `sheet ${source.sheet}` : "", source.page ? `page ${source.page}` : "", source.row ? `row ${source.row}` : "", source.line ? `line ${source.line}` : ""].filter(Boolean).join(", ");
  const label = [source.sourceName, location, source.text].filter(Boolean).join(" | ");
  return label ? `Original: ${label}` : "Original line saved";
}

function ImportWorkbench({ user, currentRoute, setPage, notify, reloadData }: { user?: AppUser; currentRoute: AppRoute; setPage: Navigate; notify: Notify; reloadData: () => Promise<void> }) {
  const [mode, setMode] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const canImport = canUser(user, "manageImports");
  const inventoryImportAllowed = canUser(user, "manageInventory");
  const recipeImportAllowed = canUser(user, "manageRecipes");
  const conversionImportAllowed = canUser(user, "manageConversions");
  const canCommitImport = canImport && (inventoryImportAllowed || recipeImportAllowed || conversionImportAllowed);
  const updateDraft = (updater: (draft: ImportDraft) => ImportDraft) => setDraft((current) => current ? updater(structuredClone(current)) : current);
  const extract = async () => {
    if (!canImport) {
      notify("Your role cannot import kitchen data.");
      return;
    }
    setExtracting(true);
    try {
      const source = mode === "text"
        ? { name: "Pasted recipe text", type: "text", text }
        : file
          ? { name: file.name, type: "file", mimeType: file.type, extension: file.name.split(".").pop()?.toLowerCase(), base64: await fileToBase64(file) }
          : null;
      if (!source || (mode === "text" && !text.trim())) {
        notify("Add text or choose a file before continuing.");
        return;
      }
      const result = await apiAction("import.extract", { source }) as ImportDraft;
      setDraft(result);
      setPage({ name: "imports", mode: "review", returnTo: currentRoute.name === "imports" ? currentRoute.returnTo : currentRoute });
      notify(`Ready to review: ${result.counts.recipes} recipe${result.counts.recipes === 1 ? "" : "s"}, ${result.counts.ingredients} ingredient${result.counts.ingredients === 1 ? "" : "s"}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "We could not read that import.");
    } finally {
      setExtracting(false);
    }
  };
  const commit = async () => {
    if (!draft) return;
    setCommitting(true);
    try {
      const result = await apiAction("import.commit", { draft }) as { createdRecipes?: { id: string; name: string }[]; createdIngredients?: unknown[]; skipped?: { reason: string }[] };
      notify(`Saved ${(result.createdRecipes ?? []).length} recipe${(result.createdRecipes ?? []).length === 1 ? "" : "s"} and ${(result.createdIngredients ?? []).length} ingredient${(result.createdIngredients ?? []).length === 1 ? "" : "s"}.`);
      await reloadData();
      const firstRecipe = result.createdRecipes?.[0];
      if (firstRecipe?.id) setPage({ name: "recipes", recipeId: firstRecipe.id, mode: "detail" });
      else setPage({ name: "imports" });
    } catch (error) {
      notify(error instanceof Error ? error.message : "We could not save the selected items.");
    } finally {
      setCommitting(false);
    }
  };
  const updateRecipe = (recipeIndex: number, patch: Partial<ImportDraft["recipes"][number]>) => updateDraft((copy) => {
    copy.recipes[recipeIndex] = { ...copy.recipes[recipeIndex], ...patch };
    return copy;
  });
  const updateItem = (recipeIndex: number, itemIndex: number, patch: Partial<ImportDraftRecipeItem>) => updateDraft((copy) => {
    copy.recipes[recipeIndex].items[itemIndex] = { ...copy.recipes[recipeIndex].items[itemIndex], ...patch };
    return copy;
  });
  const updateIngredient = (ingredientIndex: number, patch: Partial<ImportDraft["ingredients"][number]>) => updateDraft((copy) => {
    copy.ingredients[ingredientIndex] = { ...copy.ingredients[ingredientIndex], ...patch };
    return copy;
  });
  const savableDraftCount = draft ? draft.recipes.length + draft.ingredients.length + draft.suppliers.length + draft.conversionRules.length : 0;
  const templateDraftCount = draft ? (draft.customerTemplates?.length ?? 0) + (draft.orderTemplates?.length ?? 0) : 0;
  return (
    <div className="page-grid import-workbench">
      <section className="import-hero">
        <div>
          <p className="eyebrow">Import setup</p>
          <h2>Bring existing recipes and costing into Kitchen OS</h2>
          <p>Upload a spreadsheet, PDF, Word document, or paste recipe text. Kitchen OS reads it first and shows everything for review before anything is saved.</p>
        </div>
        <div className="button-row">
          <Button variant="secondary" onClick={() => downloadText("pastry-county-import-template.csv", importTemplateCsv())}><FileSpreadsheet size={18} /> CSV Template</Button>
          <Button variant="secondary" onClick={() => setPage({ name: "recipes" })}>Open Recipes</Button>
        </div>
      </section>
      <div className="import-mode-grid">
        <button className={mode === "text" ? "import-mode active" : "import-mode"} onClick={() => setMode("text")} aria-pressed={mode === "text"}>
          <FileText size={24} />
          <span><strong>Paste text</strong><small>Fastest path for typed recipes and copied notes.</small></span>
        </button>
        <button className={mode === "file" ? "import-mode active" : "import-mode"} onClick={() => setMode("file")} aria-pressed={mode === "file"}>
          <Upload size={24} />
          <span><strong>Upload file</strong><small>Spreadsheets, PDFs, Word docs, and text files up to 4MB.</small></span>
        </button>
      </div>
      <Section title="Choose What to Import" action={<Button onClick={extract} disabled={!canImport || extracting}>{extracting ? "Reading..." : "Review Import"}</Button>}>
        {mode === "text" ? (
          <Field label="Paste recipe or costing text">
            <textarea value={text} onChange={(event) => setText(event.target.value)} rows={10} placeholder={"Recipe: Chocolate Cake\nCategory: Cakes\nYield: 1 cake\nIngredients:\n500 g flour | pack size: 1000 | pack price: 750 | cost: 375\n4 pcs eggs\nInstructions:\nMix gently.\nBake until set."} />
          </Field>
        ) : (
          <div className="import-drop">
            <Upload size={28} />
            <Field label="Import file">
              <input type="file" accept=".csv,.tsv,.txt,.md,.xlsx,.docx,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </Field>
            <small>{file ? `${file.name} | ${(file.size / 1024).toFixed(1)} KB` : "Choose a spreadsheet, document, PDF, or text file."}</small>
          </div>
        )}
        {!canImport && <article className="warning-card"><AlertTriangle size={22} /> Your current role can view imports but cannot add or save imported data.</article>}
      </Section>
      {draft && (
        <>
          <div className="metric-grid small">
            <Metric label="Recipes" value={String(draft.counts.recipes)} />
            <Metric label="Ingredients" value={String(draft.counts.ingredients)} />
            <Metric label="Conversions" value={String(draft.counts.conversionRules)} />
            <Metric label="Customers and Orders" value={String((draft.counts.customerTemplates ?? 0) + (draft.counts.orderTemplates ?? 0))} />
            <Metric label="Needs attention" value={String(draft.counts.reviewItems)} />
          </div>
          {draft.warnings.length > 0 && <Section title="Things To Check"><div className="compact-list">{draft.warnings.map((warning) => <div className="row-card" key={warning}><span>{warning}</span><Badge tone="warning">Check</Badge></div>)}</div></Section>}
          <Section title="Recipes To Review" action={<Button onClick={commit} disabled={committing || !canCommitImport || savableDraftCount === 0}>{committing ? "Saving..." : "Save Selected"}</Button>}>
            {draft.recipes.length === 0 ? <EmptyState title="No recipes found" message="Try the CSV template, paste clearer recipe text, or use headings like Recipe, Ingredients, and Instructions." /> : (
              <div className="import-review-list">
                {draft.recipes.map((recipe, recipeIndex) => (
                  <article className="summary-card import-review-card" key={recipe.id}>
                    <div className="item-card-head">
                      <label className="checkline"><input type="checkbox" checked={recipe.selected !== false} onChange={(event) => updateRecipe(recipeIndex, { selected: event.target.checked })} /> Include</label>
                      <Badge tone={confidenceTone(recipe.confidence)}>{importStatusLabel(recipe.confidence)}</Badge>
                    </div>
                    <div className="form-grid">
                      <Field label="Recipe name"><input value={recipe.name} onChange={(event) => updateRecipe(recipeIndex, { name: event.target.value })} /></Field>
                      <Field label="Category"><input value={recipe.category} onChange={(event) => updateRecipe(recipeIndex, { category: event.target.value })} /></Field>
                      <Field label="Base yield"><input type="number" min="0.001" step="0.001" value={recipe.baseYieldQuantity || ""} onChange={(event) => updateRecipe(recipeIndex, { baseYieldQuantity: Number(event.target.value) })} /></Field>
                      <Field label="Yield unit"><input value={recipe.yieldUnit} onChange={(event) => updateRecipe(recipeIndex, { yieldUnit: event.target.value })} /></Field>
                    </div>
                    {Boolean(recipe.duplicateCandidates?.length) && (
                      <article className="warning-card"><AlertTriangle size={20} /> {recipe.name} matches an existing recipe. Rename it or choose to save another copy.
                        <label className="checkline"><input type="checkbox" checked={Boolean(recipe.allowDuplicate)} onChange={(event) => updateRecipe(recipeIndex, { allowDuplicate: event.target.checked })} /> Save another copy</label>
                      </article>
                    )}
                    <ResponsiveTable
                      headers={["Use", "Ingredient", "Quantity", "Unit", "Cost from file", "Status"]}
                      rows={recipe.items.map((item, itemIndex) => ({
                        key: `${recipe.id}-${item.id}`,
                        cells: [
                          <input aria-label={`Include ${item.ingredientName}`} type="checkbox" checked={item.selected !== false} onChange={(event) => updateItem(recipeIndex, itemIndex, { selected: event.target.checked })} />,
                          <div className="stacked-cell">
                            <select value={item.ingredientId ?? ""} onChange={(event) => updateItem(recipeIndex, itemIndex, { ingredientId: event.target.value || undefined, needsReview: !event.target.value })}>
                              <option value="">Choose ingredient: {item.ingredientName}</option>
                              {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}
                            </select>
                            <small>{sourceEvidenceLabel(item.source)}</small>
                          </div>,
                          <input aria-label={`${item.ingredientName} quantity`} type="number" min="0" step="0.001" value={item.quantity || ""} onChange={(event) => updateItem(recipeIndex, itemIndex, { quantity: Number(event.target.value), needsReview: Number(event.target.value) <= 0 || !item.ingredientId })} />,
                          <select value={item.unit} onChange={(event) => updateItem(recipeIndex, itemIndex, { unit: event.target.value as Unit })}>{unitOptions.map((unit) => <option key={unit}>{unit}</option>)}</select>,
                          item.prepState?.sourceLineAmount ? formatNaira(item.prepState.sourceLineAmount) : "No cost shown",
                          <Badge tone={confidenceTone(item.confidence)}>{item.needsReview ? "Check" : importStatusLabel(item.confidence)}</Badge>
                        ]
                      }))}
                    />
                  </article>
                ))}
              </div>
            )}
          </Section>
          <div className="split">
            <Section title="New Ingredients Found">
              {!inventoryImportAllowed && draft.ingredients.length > 0 && <article className="warning-card"><AlertTriangle size={20} /> New ingredients can be saved by an Owner/Admin or Inventory Manager. Choose existing ingredients or ask an inventory manager to save them.</article>}
              <div className="compact-list">
                {draft.ingredients.length === 0 && <p>No new ingredients found.</p>}
                {draft.ingredients.map((ingredient, index) => (
                  <div className="row-card import-edit-row" key={ingredient.id}>
                    <label className="checkline"><input type="checkbox" checked={ingredient.selected !== false} onChange={(event) => updateIngredient(index, { selected: event.target.checked })} /> {ingredient.name}</label>
                    <select value={ingredient.baseUnit} onChange={(event) => updateIngredient(index, { baseUnit: event.target.value as Unit, purchaseUnit: event.target.value as Unit })}>{unitOptions.map((unit) => <option key={unit}>{unit}</option>)}</select>
                    <input aria-label={`${ingredient.name} unit cost`} type="number" min="0" step="0.0001" value={ingredient.latestUnitCost ?? 0} onChange={(event) => updateIngredient(index, { latestUnitCost: Number(event.target.value) })} />
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Suppliers and Conversions Found">
              <div className="compact-list">
                {draft.suppliers.map((supplier) => <div className="row-card" key={supplier.id}><span>{supplier.name}<small>{supplier.email || supplier.phone || "No contact captured"}</small></span><Badge tone={confidenceTone(supplier.confidence)}>{importStatusLabel(supplier.confidence)}</Badge></div>)}
                {draft.conversionRules.map((rule) => <div className="row-card" key={rule.id}><span>{rule.ingredientName}<small>1 {rule.fromUnit} = {rule.conversionFactor}{rule.toUnit}</small></span><Badge tone={rule.needsReview ? "warning" : "success"}>{rule.needsReview ? "Choose ingredient" : "Ready"}</Badge></div>)}
                {draft.suppliers.length === 0 && draft.conversionRules.length === 0 && <p>No suppliers or conversions found.</p>}
              </div>
            </Section>
          </div>
          {templateDraftCount > 0 && (
            <Section title="Customers and Orders Found">
              <article className="warning-card"><AlertTriangle size={20} /> Customers and order examples were found. They are shown here for review, but live orders are not created from them yet, so stock will not change unexpectedly.</article>
              <div className="compact-list">
                {draft.customerTemplates?.map((template) => (
                  <div className="row-card" key={template.id}>
                    <span>{template.customerName || "Unnamed customer"}<small>{template.email || template.phone || sourceEvidenceLabel(template.source)}</small></span>
                    <Badge tone={confidenceTone(template.confidence)}>{importStatusLabel(template.confidence)}</Badge>
                  </div>
                ))}
                {draft.orderTemplates?.map((template) => (
                  <div className="row-card" key={template.id}>
                    <span>{template.customerName || "Order template"}<small>{[template.productName || template.recipeName, template.dueDate, template.requestedYieldQuantity ? `${template.requestedYieldQuantity} ${template.yieldUnit || "units"}` : ""].filter(Boolean).join(" | ") || sourceEvidenceLabel(template.source)}</small></span>
                    <Badge tone={confidenceTone(template.confidence)}>{importStatusLabel(template.confidence)}</Badge>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Costing({ setPage }: { setPage: Navigate }) {
  const [yieldQty, setYieldQty] = useState(12);
  const [selectedRecipeId, setSelectedRecipeId] = useState(recipes[0]?.id ?? "");
  const [sellingPrice, setSellingPrice] = useState(0);
  const recipe = recipes.find((item) => item.id === selectedRecipeId) ?? recipes[0];
  if (!recipe) return <EmptyState title="No recipes available" message="Create a recipe in the database before using costing." />;
  const safeYieldQty = yieldQty > 0 ? yieldQty : recipe.baseYieldQuantity;
  const cost = calculateRecipeCost(recipe.id, safeYieldQty);
  const netPrice = netSellingPrice(sellingPrice);
  const margin = calculateMargin(netPrice, cost.totalRecipeCost);
  return (
    <div className="page-grid">
      <div className="split">
        <Section title="Recipe Cost Calculator" action={<Button variant="secondary" onClick={() => setPage({ name: "imports", returnTo: { name: "costing", recipeId: recipe.id } })}><Upload size={18} /> Import Costing</Button>}><div className="form-grid"><Field label="Recipe"><select value={recipe.id} onChange={(event) => { setSelectedRecipeId(event.target.value); const nextRecipe = recipes.find((item) => item.id === event.target.value); if (nextRecipe) setYieldQty(nextRecipe.baseYieldQuantity); }}>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</select></Field><Field label="Desired yield"><input type="number" min="0.001" step="0.001" value={yieldQty} onChange={(event) => setYieldQty(Number(event.target.value))} /></Field><Metric label="Ingredient subtotal" value={formatNaira(cost.ingredientSubtotal)} /><Metric label="Non-ingredient cost" value={formatNaira(cost.nonIngredientCost)} /><Metric label="Total production cost" value={formatNaira(cost.totalRecipeCost)} /><Metric label={`Cost per ${recipe.yieldUnit}`} value={formatNaira(cost.costPerYieldUnit)} /><Metric label="Effective yield" value={`${Number(cost.effectiveYieldQuantity.toFixed(2))} ${recipe.yieldUnit}`} /></div></Section>
        <Section title="Margin Calculator"><div className="form-grid"><Field label="What-if selling price (not saved)"><input type="number" min="0" step="0.01" value={sellingPrice || ""} onChange={(event) => setSellingPrice(Number(event.target.value))} placeholder="Enter a price to preview margin" /></Field><Metric label="Tax setting" value={`${settings.defaultTaxPercentage ?? 0}%`} /><Metric label="Net selling price" value={sellingPrice > 0 ? formatNaira(netPrice) : "—"} /><Metric label="Gross profit" value={sellingPrice > 0 ? formatNaira(margin.grossProfit) : "—"} /><Metric label="Gross margin" value={sellingPrice > 0 ? `${margin.grossMarginPercentage.toFixed(1)}%` : "Enter a price"} /></div></Section>
      </div>
      <Section title="Cost Breakdown Chart"><div className="bar-chart">{[...cost.ingredientCostBreakdown.slice(0, 6).map((item) => ({ id: item.ingredientId, label: item.ingredientName, cost: item.cost })), ...cost.nonIngredientCostBreakdown.map((item) => ({ id: item.label, label: item.label, cost: item.cost }))].map((item) => <div key={item.id}><span>{item.label}</span><div><i style={{ width: `${cost.totalRecipeCost > 0 ? Math.min(100, (item.cost / cost.totalRecipeCost) * 220) : 0}%` }} /></div><strong>{formatNaira(item.cost)}</strong></div>)}</div></Section>
      <article className="warning-card"><AlertTriangle size={22} /> Costs combine latest ingredient unit costs with the recipe cost profile. Verify labor, packaging, overhead, and yield-loss assumptions before quoting.</article>
    </div>
  );
}

function AiAssistant({ setPage, notify, reloadData }: { setPage: Navigate; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const suggestions = [
    { id: "flour-cups", label: "Convert 4 cups flour to grams", ingredientId: "flour", quantity: 4, fromUnit: "cup" as Unit, toUnit: "g" as Unit },
    { id: "yolks", label: "Convert 3 egg yolks to grams", ingredientId: "egg-yolks", quantity: 3, fromUnit: "yolk" as Unit, toUnit: "g" as Unit },
    { id: "eggs", label: "Convert 4 eggs to grams", ingredientId: "eggs", quantity: 4, fromUnit: "egg" as Unit, toUnit: "g" as Unit },
    { id: "sugar-cups", label: "Convert 1 cup sugar to grams", ingredientId: "sugar", quantity: 1, fromUnit: "cup" as Unit, toUnit: "g" as Unit }
  ];
  const [selectedId, setSelectedId] = useState(suggestions[0].id);
  const selected = suggestions.find((item) => item.id === selectedId) ?? suggestions[0];
  const ingredient = ingredients.find((item) => item.id === selected.ingredientId);
  const savedRule = conversionRules.find((rule) => rule.ingredientId === selected.ingredientId && rule.fromUnit === selected.fromUnit && rule.toUnit === selected.toUnit);
  const conversion = convertUnit(selected.quantity, selected.fromUnit, selected.toUnit, selected.ingredientId);
  const [factor, setFactor] = useState(savedRule?.conversionFactor ?? conversion.convertedQuantity / selected.quantity);
  useEffect(() => {
    setFactor(savedRule?.conversionFactor ?? conversion.convertedQuantity / selected.quantity);
  }, [selectedId, savedRule?.conversionFactor, conversion.convertedQuantity, selected.quantity]);
  const parsed = parseRecipeText("2 cups flour\n1 cup sugar\n4 eggs\n1/2 cup cocoa powder\n1 cup coconut oil");
  const convertedQuantity = selected.quantity * factor;
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<AiChatMessage[]>([
    { id: "welcome-ai", role: "assistant", text: buildKitchenAssistantResponse("summary") }
  ]);
  const askAssistant = (text: string) => {
    const prompt = text.trim();
    if (!prompt) return;
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", text: prompt },
      { id: `assistant-${Date.now()}`, role: "assistant", text: buildKitchenAssistantResponse(prompt) }
    ]);
    setChatInput("");
  };
  return (
    <div className="ai-layout">
      <Section title={HELPER_NAME}>
        <p className="section-note">{HELPER_CAPABILITY}</p>
        <div className="chat">
          {messages.map((message) => <article className={`message ${message.role === "user" ? "user" : "ai"}`} key={message.id}>{message.text.split("\n").map((line, index) => <p key={`${message.id}-${index}`}>{line || " "}</p>)}</article>)}
        </div>
        <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); askAssistant(chatInput); }}>
          <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask about shortages, what to buy, recipe cost, or paste recipe measurements..." rows={3} />
          <Button type="submit"><Bot size={18} /> Send</Button>
        </form>
        <div className="chips wrap">
          {["What do I need to buy?", "Which orders are blocked by shortages?", "Estimate Classic Brownies cost", "Show low stock items"].map((prompt) => <button key={prompt} onClick={() => askAssistant(prompt)}>{prompt}</button>)}
        </div>
      </Section>
      <Section title="Conversion workspace">
        <div className="chips wrap">
          {suggestions.map((chip) => <button key={chip.id} className={selectedId === chip.id ? "active" : ""} onClick={() => setSelectedId(chip.id)}>{chip.label}</button>)}
          <button onClick={() => setPage({ name: "shopping", returnTo: { name: "ai" } })}>What do I need to buy?</button>
          <button onClick={() => setPage({ name: "costing", returnTo: { name: "ai" } })}>Estimate recipe cost</button>
        </div>
        <article className="message ai">
          <h3>Ingredient Conversion</h3>
          <SummaryCard title="Conversion result" items={[
            ["Ingredient", ingredient?.name ?? selected.ingredientId],
            ["Measurement", `${selected.quantity} ${selected.fromUnit}`],
            ["Estimated conversion", `${Number(convertedQuantity.toFixed(1))}${selected.toUnit}`],
            ["Confidence", savedRule?.confidenceLevel ?? conversion.confidenceLevel],
            ["Source", savedRule?.source ?? conversion.source]
          ]} />
          <div className="form-grid">
            <Field label={`Value for 1 ${selected.fromUnit}`}><input type="number" min="0.001" step="0.001" value={factor} onChange={(event) => setFactor(Number(event.target.value))} /></Field>
          </div>
          <p className="section-note">This is a calculation only. Nothing changes until you save it as a rule below, or open a recipe and edit the ingredient line yourself.</p>
          <div className="button-row">
            <Button onClick={async () => { await apiAction("conversion.save", { rule: { id: savedRule?.id, ingredientId: selected.ingredientId, fromUnit: selected.fromUnit, toUnit: selected.toUnit, conversionFactor: factor, confidenceLevel: "High", source: "measured in kitchen", verified: true } }); notify(`Saved as a verified rule: 1 ${selected.fromUnit} = ${factor}${selected.toUnit}.`); await reloadData(); }}>Save as verified rule</Button>
            <Button variant="secondary" onClick={async () => { await apiAction("conversion.save", { rule: { id: savedRule?.id, ingredientId: selected.ingredientId, fromUnit: selected.fromUnit, toUnit: selected.toUnit, conversionFactor: factor, confidenceLevel: savedRule?.confidenceLevel ?? "Medium", source: savedRule?.source ?? "manual entry", verified: false } }); notify(`Saved as an unverified rule for review: 1 ${selected.fromUnit} = ${factor}${selected.toUnit}.`); await reloadData(); }}>Save as unverified rule</Button>
            <Button variant="secondary" onClick={() => setPage({ name: "recipes" })}>Open a recipe to apply it</Button>
          </div>
        </article>
      </Section>
      <Section title="Recipe Parser Preview"><ResponsiveTable headers={["Ingredient", "Quantity", "Converted", "Confidence", "Review"]} rows={parsed.map((item) => ({ key: item.id, cells: [item.ingredientName, `${item.quantity} ${item.unit}`, `${item.convertedQuantity} ${item.convertedUnit}`, item.confidence, item.needsReview ? <Badge tone="warning">Needs review</Badge> : <Badge tone="success">Ready</Badge>] }))} /></Section>
      <Button variant="secondary" onClick={() => setPage({ name: "conversions" })}><Wand2 size={18} /> Conversion Library</Button>
    </div>
  );
}

function ConversionLibrary({ user, setPage, notify, askConfirm, reloadData }: { user?: AppUser; setPage: Navigate; notify: (message: string) => void; askConfirm: AskConfirm; reloadData: () => Promise<void> }) {
  const [editingRule, setEditingRule] = useState<Partial<ConversionRule> | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [conversionSearch, setConversionSearch] = useState("");
  const [conversionFilter, setConversionFilter] = useState("All");
  const canManage = canUser(user, "manageConversions");
  const filteredRules = conversionRules.filter((rule) => {
    const ingredientName = ingredients.find((item) => item.id === rule.ingredientId)?.name ?? rule.ingredientId;
    const statusMatch = conversionFilter === "All" || (conversionFilter === "Verified" ? rule.verified : !rule.verified);
    const queryMatch = [ingredientName, rule.fromUnit, rule.toUnit, rule.conversionFactor, rule.confidenceLevel, rule.source, rule.ingredientState, rule.temperatureState, rule.formulaContext, rule.verified ? "verified" : "review"].join(" ").toLowerCase().includes(conversionSearch.toLowerCase());
    return statusMatch && queryMatch;
  });
  return (
    <div className="page-grid">
      {editingRule && (
        <div className="modal-backdrop" role="presentation">
          <ConversionRuleForm rule={editingRule} onCancel={() => setEditingRule(null)} notify={notify} reloadData={reloadData} />
        </div>
      )}
      {importOpen && (
        <div className="modal-backdrop" role="presentation">
          <ConversionImportModal onCancel={() => setImportOpen(false)} notify={notify} reloadData={reloadData} />
        </div>
      )}
      <Section title="Approved Conversion Rules" action={<div className="button-row"><Button variant="secondary" onClick={() => exportCsv("pastry-county-conversion-rules.csv", ["Ingredient", "From Unit", "To Unit", "Factor", "Ingredient State", "Temperature State", "Formula Context", "Confidence", "Source", "Verified"], filteredRules.map((rule) => [ingredients.find((item) => item.id === rule.ingredientId)?.name ?? rule.ingredientId, rule.fromUnit, rule.toUnit, rule.conversionFactor, rule.ingredientState ?? "", rule.temperatureState ?? "", rule.formulaContext ?? "", rule.confidenceLevel, rule.source, rule.verified ? "Yes" : "No"]), notify)}>Export CSV</Button><Button variant="secondary" onClick={() => setPage({ name: "imports", returnTo: { name: "conversions" } })} disabled={!canManage}>Import Data</Button><Button variant="secondary" onClick={() => setImportOpen(true)} disabled={!canManage}>Import CSV</Button><Button onClick={() => setEditingRule({ ingredientId: ingredients[0]?.id, fromUnit: "cup", toUnit: ingredients[0]?.baseUnit ?? "g", conversionFactor: 1, confidenceLevel: "Medium", source: "manual entry", verified: false })} disabled={!canManage}><Plus size={18} /> Add Conversion Rule</Button></div>}>
        <Toolbar query={conversionSearch} setQuery={setConversionSearch} placeholder="Search conversions" />
        <Chips items={["All", "Verified", "Needs Review"]} active={conversionFilter} setActive={setConversionFilter} />
        <PaginatedTable
          label="conversion rules"
          headers={["Ingredient", "From", "To", "Value", "Scope", "Confidence", "Source", "Verified", "Actions"]}
          rows={filteredRules.map((rule) => ({ key: rule.id, cells: [ingredients.find((item) => item.id === rule.ingredientId)?.name, rule.fromUnit, rule.toUnit, `1 ${rule.fromUnit} = ${rule.conversionFactor}${rule.toUnit}`, [rule.ingredientState, rule.temperatureState, rule.formulaContext].filter(Boolean).join(" | ") || "Generic", rule.confidenceLevel, rule.source, rule.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Review</Badge>, <div className="button-row"><Button variant="secondary" onClick={() => setEditingRule(rule)} disabled={!canManage}>Edit</Button><Button variant="secondary" onClick={async () => { await apiAction("conversion.verify", { ruleId: rule.id }); notify(`Verified ${rule.fromUnit} to ${rule.toUnit} conversion rule.`); await reloadData(); }} disabled={!canManage}>Mark Verified</Button><Button variant="danger" onClick={() => askConfirm({ title: "Delete conversion rule?", message: `This removes the ${rule.fromUnit} to ${rule.toUnit} conversion rule from the approved library.`, confirmLabel: "Delete Rule", tone: "danger", onConfirm: async () => { await apiAction("conversion.delete", { ruleId: rule.id }); notify("Conversion rule deleted."); await reloadData(); } })} disabled={!canUser(user, "deleteRecords")}>Delete</Button></div>] }))}
        />
      </Section>
    </div>
  );
}

function ConversionImportModal({ onCancel, notify, reloadData }: { onCancel: () => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const { dialogRef, onDialogKeyDown } = useDialogA11y<HTMLFormElement>(true, onCancel);
  const parseCsvLine = (line: string) => line.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
  return (
    <form ref={dialogRef} className="section conversion-modal" role="dialog" aria-modal="true" aria-labelledby="conversion-import-title" tabIndex={-1} onKeyDown={onDialogKeyDown} onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const text = formValue(form, "rules");
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const dataLines = lines[0]?.toLowerCase().includes("ingredient") ? lines.slice(1) : lines;
      const rules = dataLines.map(parseCsvLine).map((columns) => {
        const [ingredientName, fromUnit, toUnit, factor] = columns;
        const scopedFormat = columns.length > 7;
        const ingredientState = scopedFormat ? columns[4] ?? "" : "";
        const temperatureState = scopedFormat ? columns[5] ?? "" : "";
        const formulaContext = scopedFormat ? columns[6] ?? "" : "";
        const confidence = scopedFormat ? columns[7] ?? "Medium" : columns[4] ?? "Medium";
        const source = scopedFormat ? columns[8] ?? "manual entry" : columns[5] ?? "manual entry";
        const verified = scopedFormat ? columns[9] ?? "No" : columns[6] ?? "No";
        const ingredient = ingredients.find((item) => item.id === ingredientName || item.name.toLowerCase() === ingredientName.toLowerCase());
        return {
          ingredientId: ingredient?.id ?? "",
          fromUnit,
          toUnit,
          conversionFactor: Number(factor),
          ingredientState,
          temperatureState,
          formulaContext,
          confidenceLevel: confidence,
          source,
          verified: ["yes", "true", "verified"].includes(verified.toLowerCase())
        };
      });
      const invalid = rules.find((rule) => !rule.ingredientId || !rule.fromUnit || !rule.toUnit || !Number.isFinite(rule.conversionFactor) || rule.conversionFactor <= 0);
      if (invalid) {
        notify("Import stopped. Check ingredient names, units, and positive numeric factors.");
        return;
      }
      setSaving(true);
      try {
        for (const rule of rules) {
          await apiAction("conversion.save", { rule });
        }
        notify(`${rules.length} conversion rule${rules.length === 1 ? "" : "s"} imported.`);
        await reloadData();
        onCancel();
      } finally {
        setSaving(false);
      }
    }}>
      <div className="section-head"><h2 id="conversion-import-title">Import Conversion Rules</h2><div className="button-row"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit">{saving ? "Importing..." : "Import Rules"}</Button></div></div>
      <Field label="CSV rows" helper="Columns: Ingredient, From Unit, To Unit, Factor, Ingredient State, Temperature State, Formula Context, Confidence, Source, Verified. Ingredient can be the exact ingredient name or ID.">
        <textarea name="rules" required rows={10} placeholder={'Flour,cup,g,118,Sifted,,Brownie,High,measured in kitchen,Yes\nSugar,cup,g,200,,,,Medium,manual entry,No'} />
      </Field>
    </form>
  );
}

function ConversionRuleForm({ rule, onCancel, notify, reloadData }: { rule: Partial<ConversionRule>; onCancel: () => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const unitOptions: Unit[] = ["g", "kg", "ml", "litre", "pcs", "cup", "tablespoon", "teaspoon", "pack", "roll", "egg", "yolk", "white"];
  const { dialogRef, onDialogKeyDown } = useDialogA11y<HTMLFormElement>(true, onCancel);
  return (
    <form ref={dialogRef} className="section conversion-modal" role="dialog" aria-modal="true" aria-labelledby="conversion-form-title" tabIndex={-1} onKeyDown={onDialogKeyDown} onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      await apiAction("conversion.save", {
        rule: {
          id: rule.id,
          ingredientId: formValue(form, "ingredientId"),
          fromUnit: formValue(form, "fromUnit"),
          toUnit: formValue(form, "toUnit"),
          conversionFactor: formNumber(form, "conversionFactor", 1),
          ingredientState: formValue(form, "ingredientState"),
          temperatureState: formValue(form, "temperatureState"),
          formulaContext: formValue(form, "formulaContext"),
          confidenceLevel: formValue(form, "confidenceLevel"),
          source: formValue(form, "source"),
          verified: formValue(form, "verified") === "Yes"
        }
      });
      notify(`Conversion rule saved to ${storageLabel()}.`);
      await reloadData();
      onCancel();
    }}>
      <div className="section-head"><h2 id="conversion-form-title">{rule.id ? "Edit Conversion Rule" : "Add Conversion Rule"}</h2><div className="button-row"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit">Save Rule</Button></div></div>
      <div className="form-grid">
        <Field label="Ingredient"><select name="ingredientId" defaultValue={rule.ingredientId} required>{ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}</select></Field>
        <Field label="From unit"><select name="fromUnit" defaultValue={rule.fromUnit ?? "cup"}>{unitOptions.map((unit) => <option key={unit}>{unit}</option>)}</select></Field>
        <Field label="To unit"><select name="toUnit" defaultValue={rule.toUnit ?? "g"}>{unitOptions.map((unit) => <option key={unit}>{unit}</option>)}</select></Field>
        <Field label={`Value for 1 ${rule.fromUnit ?? "from-unit"}`} helper="Example: if 1 cup flour weighs 125g, enter 125 and set To unit to g."><input name="conversionFactor" type="number" min="0.001" step="0.001" defaultValue={rule.conversionFactor ?? 1} required /></Field>
        <Field label="Ingredient state" helper="Optional. Example: sifted, packed, melted, roasted."><input name="ingredientState" defaultValue={rule.ingredientState ?? ""} placeholder="sifted" /></Field>
        <Field label="Temperature state" helper="Optional. Example: cold cubed, room temp, melted."><input name="temperatureState" defaultValue={rule.temperatureState ?? ""} placeholder="room temp" /></Field>
        <Field label="Formula context" helper="Optional. Product family such as Brownie, Loaf, Cookie."><input name="formulaContext" defaultValue={rule.formulaContext ?? ""} placeholder="Brownie" /></Field>
        <Field label="Confidence"><select name="confidenceLevel" defaultValue={rule.confidenceLevel ?? "Medium"}><option>Low</option><option>Medium</option><option>High</option></select></Field>
        <Field label="Source"><select name="source" defaultValue={rule.source ?? "manual entry"}><option>AI estimate</option><option>manual entry</option><option>measured in kitchen</option><option>seed rule</option></select></Field>
        <Field label="Verified"><select name="verified" defaultValue={rule.verified ? "Yes" : "No"}><option>Yes</option><option>No</option></select></Field>
      </div>
    </form>
  );
}

function Suppliers({ user, notify, askConfirm, reloadData }: { user?: AppUser; notify: (message: string) => void; askConfirm: AskConfirm; reloadData: () => Promise<void> }) {
  const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier> | null>(null);
  const [supplierQuery, setSupplierQuery] = useState("");
  const canManage = canUser(user, "manageSuppliers");
  const supplierList = suppliers.filter((supplier) => {
    const suppliedNames = (supplier.suppliedIngredientIds?.length ? supplier.suppliedIngredientIds : ingredients.filter((item) => item.supplierId === supplier.id).map((item) => item.id))
      .map((id) => ingredients.find((item) => item.id === id)?.name)
      .filter(Boolean)
      .join(" ");
    return [supplier.name, supplier.contactName, supplier.phone, supplier.email, suppliedNames].join(" ").toLowerCase().includes(supplierQuery.toLowerCase());
  });
  return (
    <div className="page-grid">
      {editingSupplier && <SupplierForm supplier={editingSupplier} notify={notify} reloadData={reloadData} onCancel={() => setEditingSupplier(null)} />}
      <Section title="Suppliers" action={<Button onClick={() => setEditingSupplier({ defaultCurrency: "NGN" })} disabled={!canManage}><Plus size={18} /> Add Supplier</Button>}>
        <Toolbar query={supplierQuery} setQuery={setSupplierQuery} placeholder="Search suppliers, contacts, or supplied items" />
        <div className="card-grid">
          {supplierList.map((supplier) => {
            const linkedIngredients = ingredients.filter((item) => item.supplierId === supplier.id);
            const suppliedIds = supplier.suppliedIngredientIds?.length ? supplier.suppliedIngredientIds : linkedIngredients.map((item) => item.id);
            const suppliedNames = suppliedIds.map((id) => ingredients.find((item) => item.id === id)?.name).filter(Boolean).slice(0, 6).join(", ");
            return <article className="item-card" key={supplier.id}><Truck size={22} /><h3>{supplier.name}</h3><p>{supplier.contactName || "No contact"} · {supplier.phone || "No phone"}</p><small>{suppliedNames || "No linked ingredients"}</small><small>Lead time: {supplier.leadTimeDays ?? 2} day{supplier.leadTimeDays === 1 ? "" : "s"} · Currency: {supplier.defaultCurrency ?? "NGN"}</small>{linkedIngredients.length > 0 && <small className="field-error">Reassign {linkedIngredients.length} linked ingredient{linkedIngredients.length === 1 ? "" : "s"} before deleting.</small>}<p>{supplier.notes}</p><div className="button-row"><Button variant="secondary" onClick={() => setEditingSupplier(supplier)} disabled={!canManage}>Edit</Button><Button variant="danger" onClick={() => askConfirm({ title: `Delete supplier ${supplier.name}?`, message: "This archives the supplier only when no active ingredients are linked to it.", confirmLabel: "Delete Supplier", tone: "danger", onConfirm: async () => { try { await apiAction("supplier.delete", { supplierId: supplier.id }); notify("Supplier archived."); await reloadData(); } catch (error) { notify(error instanceof Error ? error.message : "Unable to delete supplier."); } } })} disabled={!canUser(user, "deleteRecords") || linkedIngredients.length > 0}>Delete</Button></div></article>;
          })}
        </div>
        {!supplierList.length && <p className="empty-note">No suppliers found. Try a different supplier, contact, phone, or supplied item search.</p>}
      </Section>
    </div>
  );
}

function SupplierForm({ supplier, notify, reloadData, onCancel }: { supplier: Partial<Supplier>; notify: (message: string) => void; reloadData: () => Promise<void>; onCancel: () => void }) {
  return (
    <form className="section" onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      await apiAction("supplier.save", {
        supplier: {
          id: supplier.id,
          name: formValue(form, "name"),
          contactName: formValue(form, "contactName"),
          phone: formValue(form, "phone"),
          email: formValue(form, "email"),
          address: formValue(form, "address"),
          defaultCurrency: formValue(form, "defaultCurrency") || "NGN",
          leadTimeDays: formNumber(form, "leadTimeDays", 2),
          suppliedIngredientIds: formValues(form, "suppliedIngredientIds"),
          notes: formValue(form, "notes")
        }
      });
      notify(`Supplier saved to ${storageLabel()}.`);
      await reloadData();
      onCancel();
    }}>
      <div className="section-head"><h2>{supplier.id ? "Edit Supplier" : "Add Supplier"}</h2><div className="button-row"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit">Save Supplier</Button></div></div>
      <div className="form-grid">
        <Field label="Supplier name"><input name="name" defaultValue={supplier.name ?? ""} required /></Field>
        <Field label="Contact person"><input name="contactName" defaultValue={supplier.contactName ?? ""} /></Field>
        <Field label="Phone"><input name="phone" type="tel" defaultValue={supplier.phone ?? ""} /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={supplier.email ?? ""} /></Field>
        <Field label="Address"><input name="address" defaultValue={supplier.address ?? ""} /></Field>
        <Field label="Default currency"><select name="defaultCurrency" defaultValue={supplier.defaultCurrency ?? settings.currency ?? "NGN"}><option value="NGN">Nigerian Naira</option><option value="USD">US Dollar</option><option value="GBP">British Pound</option><option value="EUR">Euro</option></select></Field>
        <Field label="Lead time days"><input name="leadTimeDays" type="number" min="0" step="1" defaultValue={supplier.leadTimeDays ?? 2} /></Field>
        <Field label="Supplied items" helper="Hold Ctrl or Cmd to select multiple ingredients."><select name="suppliedIngredientIds" multiple defaultValue={supplier.suppliedIngredientIds ?? []}>{ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}</select></Field>
        <Field label="Notes"><textarea name="notes" defaultValue={supplier.notes ?? ""} placeholder="Lead time, preferred ordering channel, supplied items" /></Field>
      </div>
    </form>
  );
}

// Export and restore for a device workspace. This is the whole durability story
// for a tester: clearing browser data, or switching to another machine, loses the
// kitchen unless they have a file.
function DeviceDataSection({ notify, reloadData }: { notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const [status, setStatus] = useState<{ persistGranted: boolean; hasExportedBackup: boolean; usage: number; quota: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const local = await import("./local/store");
      setStatus(await local.deviceStorageStatus());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function onExport() {
    setBusy(true);
    try {
      const { exportBackup } = await import("./local/backup");
      await exportBackup(downloadText);
      notify("Backup downloaded. Keep it somewhere safe — it is the only copy outside this browser.");
      await refreshStatus();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not build a backup.");
    } finally {
      setBusy(false);
    }
  }

  async function onRestoreFile(file: File) {
    setBusy(true);
    try {
      const { parseBackup, restoreBackup, describeBackup } = await import("./local/backup");
      const parsed = parseBackup(await file.text(), deviceUserId());
      const warning = parsed.belongsToAnotherAccount
        ? ` This backup was exported by a different account (${parsed.backup.account.email || "unknown"}).`
        : "";
      const confirmed = window.confirm(
        `Replace everything in this workspace with ${describeBackup(parsed)}?${warning}\n\nYour current data on this device will be lost.`
      );
      if (!confirmed) return;
      await restoreBackup(parsed);
      await reloadData();
      notify("Workspace restored from backup.");
      await refreshStatus();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not restore that backup.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const usedMb = status ? (status.usage / (1024 * 1024)).toFixed(1) : null;

  return (
    <Section
      title="Device Data"
      action={
        <div className="button-row">
          <Button onClick={onExport} disabled={busy}>Download backup</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>Restore backup</Button>
        </div>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onRestoreFile(file);
        }}
      />
      <p>
        This account keeps its kitchen data in this browser, on this device. It is never stored in the Pastry County
        database, and signing in on another device starts a separate, empty workspace.
      </p>
      <p className="muted">
        Clearing your browser data deletes it. A backup file is the only way to move a workspace to another device or
        recover one.
      </p>
      {status && (
        <ul className="muted">
          <li>{status.hasExportedBackup ? "You have exported a backup at least once." : "You have not exported a backup yet."}</li>
          <li>
            {status.persistGranted
              ? "This browser has marked the workspace as persistent storage."
              : "This browser has not granted persistent storage, so it may clear the workspace if the device runs low on space."}
          </li>
          {usedMb && <li>Using about {usedMb} MB.</li>}
        </ul>
      )}
    </Section>
  );
}

function SettingsPage({ user, setPage, notify, reloadData }: { user?: AppUser; setPage: Navigate; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const [archiveData, setArchiveData] = useState<Record<string, { id: string; name: string }[]> | null>(null);
  const [auditFilter, setAuditFilter] = useState("All");
  const [auditSearch, setAuditSearch] = useState("");
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<Partial<AppStaffUser> | null>(null);
  const canManageSettings = canUser(user, "manageSettings");
  const isDevice = user?.dataMode === "device";
  // The audit trail is paged from the server. It used to arrive inside the
  // bootstrap payload capped at 100 rows, which showed a fraction of the real
  // history as though it were all of it.
  const auditPage = usePagedResource<AuditLog>("audit", { limit: 50, enabled: canManageSettings });
  const [auditTotal, setAuditTotal] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!canManageSettings) return;
    let cancelled = false;
    fetchResourcePage<never>("summary")
      .then((body: any) => {
        if (!cancelled) setAuditTotal(body?.summary?.totals?.auditLogs);
      })
      .catch(() => {
        // A missing total only costs the "of N" phrasing, so it fails quietly
        // rather than blocking the list it annotates.
      });
    return () => {
      cancelled = true;
    };
  }, [canManageSettings]);
  const canRestoreArchive = canUser(user, "restoreArchive");
  const [wasteRows, setWasteRows] = useState<InventoryMovement[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchResourcePage<InventoryMovement>("movements", { movementType: "waste", limit: 8 })
      .then((page) => {
        if (!cancelled) setWasteRows(page.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setWasteRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const lowStockRows = ingredients.filter(isBelowReorder);
  const expiringRows = ingredientBatches.filter((batch) => batch.expiryDate).slice(0, 8);
  const auditNameLookup: AuditRecordNameLookup = {
    ingredients: Object.fromEntries(ingredients.map((item) => [item.id, item.name])),
    recipes: Object.fromEntries(recipes.map((item) => [item.id, item.name])),
    orders: Object.fromEntries(orders.map((item) => [item.id, item.customerName])),
    suppliers: Object.fromEntries(suppliers.map((item) => [item.id, item.name])),
    conversion_rules: Object.fromEntries(conversionRules.map((rule) => {
      const ingredientName = ingredients.find((item) => item.id === rule.ingredientId)?.name ?? rule.ingredientId;
      return [rule.id, `${ingredientName} ${rule.fromUnit} -> ${rule.toUnit}`];
    })),
    app_users: Object.fromEntries(appUsers.map((item) => [item.id, item.fullName || item.email])),
    settings: { default: "Business settings" },
    notifications: { low_stock_email: "Low-stock email" }
  };
  const loadedAudit = auditPage.items;
  const auditRows = (auditFilter === "All" ? loadedAudit : loadedAudit.filter((entry) => entry.entityType === auditFilter)).filter((entry) => auditSearchText(entry, auditNameLookup).toLowerCase().includes(auditSearch.toLowerCase()));
  const supplierPerformance = suppliers.map((supplier) => {
    const supplied = ingredients.filter((ingredient) => ingredient.supplierId === supplier.id);
    const low = supplied.filter(isBelowReorder);
    return { supplier, suppliedCount: supplied.length, lowCount: low.length, stockValue: supplied.reduce((sum, ingredient) => sum + ingredient.currentStock * ingredient.latestUnitCost, 0) };
  });
  const loadArchive = async () => {
    if (!canUser(user, "manageInventory")) return;
    try {
      const result = await apiAction("archive.list");
      setArchiveData(result as Record<string, { id: string; name: string }[]>);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Archive recovery could not be loaded.");
    }
  };
  useEffect(() => {
    loadArchive().catch(() => notify("Archive recovery could not be loaded."));
  }, []);
  const restoreArchive = async (entityType: string, entityId: string) => {
    if (!canRestoreArchive) {
      notify("Only Owner/Admin can restore archived records.");
      return;
    }
    await apiAction("archive.restore", { entityType, entityId });
    notify("Archived item restored.");
    await loadArchive();
    await reloadData();
  };
  const saveUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    await apiAction("user.save", {
      user: {
        id: editingUser?.id,
        email: formValue(form, "email"),
        fullName: formValue(form, "fullName"),
        role: formValue(form, "role"),
        password: formValue(form, "password"),
        active: formValue(form, "active") === "Yes"
      }
    });
    notify("Staff user saved.");
    setEditingUser(null);
    await reloadData();
  };
  const sendLowStockAlert = async () => {
    const result = await apiAction("notification.lowStockEmail", { items: lowStockRows.map((item) => `${item.name}: ${item.currentStock}${item.baseUnit} left`) });
    const recipients: string[] = Array.isArray(result.recipients) ? result.recipients : [];
    const who = recipients.length > 2 ? `${recipients.slice(0, 2).join(", ")} and ${recipients.length - 2} more` : recipients.join(", ");
    // Says what actually happened. "Logged" is not "sent", and the difference
    // matters when someone is waiting on a stock alert.
    notify(result.status === "sent" ? `Low-stock email sent to ${who}.` : `Low-stock alert logged for ${who}, but email delivery is not configured, so nothing was sent.`);
  };
  return (
    <div className="page-grid">
      <div className="more-grid">
        {moreItems.map(([id, Icon, label]) => <button key={id} className="more-card" onClick={() => setPage(id as Page)}><Icon size={22} /><span>{label}</span></button>)}
      </div>
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (!canManageSettings) {
          notify("Only Owner/Admin can save settings.");
          return;
        }
        const form = event.currentTarget;
        await apiAction("settings.save", {
          settings: {
            businessName: formValue(form, "businessName"),
            currency: formValue(form, "currency"),
            gramRoundingPreference: formNumber(form, "gramRoundingPreference", 5),
            eggRoundingPreference: formValue(form, "eggRoundingPreference"),
            defaultDeductionStage: formValue(form, "defaultDeductionStage"),
            stockHoldStage: formValue(form, "stockHoldStage"),
            allowNegativeInventory: formValue(form, "allowNegativeInventory"),
            safetyMarginPercentage: formNumber(form, "safetyMarginPercentage", 10),
            defaultTaxPercentage: formNumber(form, "defaultTaxPercentage", 0),
            lowStockNotificationEmail: formValue(form, "lowStockNotificationEmail")
          }
        });
        notify("Settings saved to Neon.");
        await reloadData();
      }}>
      <Section title="Business profile & defaults" action={<Button type="submit" disabled={!canManageSettings}>Save Settings</Button>}>
        <div className="form-grid">
          <Field label="Business name"><input name="businessName" defaultValue={settings.businessName} /></Field>
          <Field label="Default currency"><select name="currency" defaultValue={settings.currency ?? "NGN"}><option value="NGN">Nigerian Naira</option><option value="USD">US Dollar</option><option value="GBP">British Pound</option><option value="EUR">Euro</option></select></Field>
          <Field label="Round grams"><select name="gramRoundingPreference" defaultValue={settings.gramRoundingPreference}><option>1</option><option>5</option><option>10</option></select></Field>
          <Field label="Round eggs"><select name="eggRoundingPreference" defaultValue={settings.eggRoundingPreference}><option value="nearest_whole_egg">Nearest whole egg</option><option value="allow_gram_conversion">Allow gram conversion</option></select></Field>
          <Field label="Deduct inventory when"><select name="defaultDeductionStage" defaultValue={settings.defaultDeductionStage}><option value="confirmation">Order is confirmed</option><option value="production_start">Production starts</option><option value="production_completion">Production is completed</option></select></Field>
          <Field label="Hold ingredients when"><select name="stockHoldStage" defaultValue={settings.stockHoldStage ?? "order_confirmation"}><option value="order_confirmation">Order is confirmed</option><option value="production_start">Production starts</option><option value="none">Never hold</option></select></Field>
          <p className="muted">Holding is not deducting. Held ingredients stay on the shelf and still leave stock once, at the deduction point above &mdash; but they stop counting as available to other orders, so a second order shows the shortage while you can still buy for it, instead of after something has been baked.</p>
          <Field label="Allow negative inventory (backorders)" helper="When on, production can complete while short; aggregate stock may go negative and the order is flagged as a shortage. FEFO lots never go below zero."><select name="allowNegativeInventory" defaultValue={settings.allowNegativeInventory ? "Yes" : "No"}><option>No</option><option>Yes</option></select></Field>
          <Field label="Purchase safety margin %"><input name="safetyMarginPercentage" type="number" min="0" step="0.1" defaultValue={settings.safetyMarginPercentage ?? 10} /></Field>
          <Field label="Default tax %"><input name="defaultTaxPercentage" type="number" min="0" step="0.1" defaultValue={settings.defaultTaxPercentage ?? 0} /></Field>
          <Field label="Extra low-stock recipient (optional)"><input name="lowStockNotificationEmail" type="email" defaultValue={settings.lowStockNotificationEmail ?? ""} placeholder="ops@example.com" /></Field>
          <p className="muted">Low-stock alerts already go to every active Owner/Admin and Inventory Manager, and to whoever raises the alert. Add an address here only to copy a shared mailbox as well.</p>
          <Field label="Active role"><select value={user?.role ?? "Viewer"} disabled><option>Owner/Admin</option><option>Baker</option><option>Inventory Manager</option><option>Viewer</option></select></Field>
        </div>
      </Section>
      </form>
      {isDevice && <DeviceDataSection notify={notify} reloadData={reloadData} />}
      {isDevice ? (
        <Section title="Your Account">
          <div className="summary-card">
            <h3>{user?.fullName}</h3>
            <p className="muted">{user?.email}</p>
            <p>
              Accounts are managed centrally by the Kitchen OS owner, so there is no staff list here. Your kitchen data is
              not: it stays in this browser. Ask the owner if you need another account or a password reset.
            </p>
          </div>
        </Section>
      ) : (
      <Section title="Staff & Permissions" action={<Button onClick={() => setEditingUser((current) => current ? null : { role: "Baker", active: true })} disabled={!canManageSettings}>{editingUser ? "Close Staff Form" : "Add Staff"}</Button>}>
        {editingUser && <form className="summary-card" onSubmit={saveUser}>
          <h3>{editingUser.id ? "Edit Staff User" : "Add Staff User"}</h3>
          <div className="form-grid">
            <Field label="Full name"><input name="fullName" defaultValue={editingUser.fullName ?? ""} required /></Field>
            <Field label="Email"><input name="email" type="email" defaultValue={editingUser.email ?? ""} required /></Field>
            <Field label="Role"><select name="role" defaultValue={editingUser.role ?? "Baker"}><option>Owner/Admin</option><option>Baker</option><option>Inventory Manager</option><option>Viewer</option></select></Field>
            <Field label="Temporary password"><input name="password" type="password" placeholder={editingUser.id ? "Leave blank to keep password" : "Required for new staff"} /></Field>
            <Field label="Active"><select name="active" defaultValue={editingUser.active === false ? "No" : "Yes"}><option>Yes</option><option>No</option></select></Field>
          </div>
          <div className="button-row"><Button variant="secondary" onClick={() => setEditingUser(null)}>Cancel</Button><Button type="submit">Save Staff</Button></div>
        </form>}
        <ResponsiveTable headers={["Name", "Email", "Role", "Status", "Actions"]} rows={appUsers.map((staff) => ({
          key: staff.id,
          cells: [staff.fullName, staff.email, staff.role, staff.active === false ? <Badge tone="warning">Disabled</Badge> : <Badge tone="success">Active</Badge>, <div className="button-row"><Button variant="secondary" onClick={() => setEditingUser(staff)} disabled={!canManageSettings}>Edit</Button><Button variant="secondary" onClick={async () => { await apiAction("user.revokeSessions", { userId: staff.id }); notify(staff.id === user?.id ? "Your sessions were revoked. Sign in again to continue." : "Staff sessions revoked."); await reloadData(); }} disabled={!canManageSettings}>Revoke Sessions</Button><Button variant="danger" onClick={async () => { await apiAction("user.disable", { userId: staff.id }); notify("Staff user disabled."); await reloadData(); }} disabled={!canManageSettings || staff.id === user?.id}>Disable</Button></div>]
        }))} />
      </Section>
      )}
      <Section title="Audit Reports" action={<div className="button-row"><Button variant="secondary" onClick={() => exportCsv("pastry-county-audit-report.csv", ["Entity", "Record", "Action", "Actor", "Date", "Changed Fields", "Before", "After"], auditExportRows(auditRows, auditNameLookup), notify)}>Export CSV</Button><Button variant="secondary" onClick={() => exportPrintableReport("pastry-county-compliance-report.html", "Pastry County Compliance Report", [["Audit rows", auditRows.length], ["Low-stock items", lowStockRows.length], ["Waste events", wasteRows.length], ["Open shortages", orders.filter((order) => order.stockStatus === "Shortage").length]], notify)}>PDF/Print</Button></div>}>
        <Toolbar query={auditSearch} setQuery={setAuditSearch} placeholder="Search audit logs" />
        <Chips items={["All", ...Array.from(new Set(loadedAudit.map((entry) => entry.entityType))).slice(0, 8)]} active={auditFilter} setActive={setAuditFilter} />
        {auditPage.status === "loading" || auditPage.status === "error" || !loadedAudit.length ? (
          <ResourceState
            status={auditPage.status}
            error={auditPage.error}
            onRetry={auditPage.retry}
            emptyMessage="No audit activity has been recorded yet."
          />
        ) : (
          <>
            <div className="resource-meta">
              {/* Says how much of the trail is on screen. The filter and search
                  above only see loaded rows, so that is stated rather than
                  letting an empty result imply the record is empty. */}
              <span aria-live="polite">
                {describeShowing(loadedAudit.length, auditTotal, "audit entries")}
                {auditRows.length !== loadedAudit.length ? ` · ${auditRows.length.toLocaleString()} match your filter` : ""}
              </span>
              {auditPage.hasMore && (
                <Button variant="secondary" onClick={auditPage.loadMore} disabled={auditPage.status === "loadingMore"}>
                  {auditPage.status === "loadingMore" ? "Loading..." : "Load older entries"}
                </Button>
              )}
            </div>
            {auditPage.hasMore && <p className="empty-note">Search and filters apply to the {loadedAudit.length.toLocaleString()} entries loaded so far. Load older entries to widen the search.</p>}
        <PaginatedTable label="audit logs" headers={["Entity", "Record", "Action", "Actor", "Date", "Details"]} rows={auditRows.map((entry) => {
          const expanded = expandedAuditId === entry.id;
          return {
            key: entry.id,
            onClick: () => setExpandedAuditId(expanded ? null : entry.id),
            expanded,
            details: <AuditDetails entry={entry} lookup={auditNameLookup} />,
            cells: [
              entry.entityType,
              auditRecordLabel(entry, auditNameLookup),
              entry.action,
              entry.actor,
              new Date(entry.createdAt).toLocaleString(),
              <Button variant="secondary" onClick={() => setExpandedAuditId(expanded ? null : entry.id)} aria-expanded={expanded}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {expanded ? "Hide" : "Details"}</Button>
            ]
          };
        })} />
          </>
        )}
      </Section>
      <Section title="FEFO, Waste & Supplier Reports" action={<div className="button-row"><Button variant="secondary" onClick={sendLowStockAlert}>Send Low-Stock Alert</Button><Button variant="secondary" onClick={() => exportPrintableReport("pastry-county-operations-report.html", "Pastry County Operations Report", [["Expiring lots", expiringRows.length], ["Waste events", wasteRows.length], ["Suppliers", suppliers.length], ["Stock value", formatNaira(ingredients.reduce((sum, item) => sum + item.currentStock * item.latestUnitCost, 0))]], notify)}>PDF/Print</Button></div>}>
        <div className="split">
          <SummaryCard title="Next FEFO Lots" items={expiringRows.map((batch) => [ingredients.find((item) => item.id === batch.ingredientId)?.name ?? batch.ingredientId, `${batch.quantityRemaining}${batch.unit} · expires ${batch.expiryDate?.slice(0, 10)}`])} />
          <SummaryCard title="Waste Analytics" items={wasteRows.length ? wasteRows.map((movement) => [ingredients.find((item) => item.id === movement.ingredientId)?.name ?? movement.ingredientId, `${Math.abs(movement.quantityChange)}${movement.unit} · ${movement.note ?? "Waste"}`]) : [["Waste events", "No waste events recorded"]]} />
        </div>
        <ResponsiveTable headers={["Supplier", "Items", "Low Stock", "Lead Time", "Stock Value"]} rows={supplierPerformance.map((item) => ({ key: item.supplier.id, cells: [item.supplier.name, item.suppliedCount, item.lowCount, `${item.supplier.leadTimeDays ?? 2} days`, formatNaira(item.stockValue)] }))} />
      </Section>
      <Section title="Recovery & Audit" action={<Button variant="secondary" onClick={loadArchive} disabled={!canUser(user, "manageInventory")}>Refresh Archive</Button>}>
        <div className="split">
          {[
            ["ingredient", "Archived Ingredients", "archivedIngredients"],
            ["recipe", "Archived Recipes", "archivedRecipes"],
            ["order", "Archived Orders", "archivedOrders"],
            ["supplier", "Archived Suppliers", "archivedSuppliers"],
            ["conversion", "Archived Conversions", "archivedConversions"]
          ].map(([entityType, title, key]) => (
            <article className="summary-card" key={key}>
              <h3>{title}</h3>
              {(archiveData?.[key] ?? []).length === 0 && <small>{archiveData ? "Nothing archived." : "Refresh to load recoverable records."}</small>}
              {(archiveData?.[key] ?? []).map((item) => (
                <div key={item.id}>
                  <span>{item.name}</span>
                  <Button variant="secondary" onClick={() => restoreArchive(entityType, item.id)} disabled={!canRestoreArchive}>Restore</Button>
                </div>
              ))}
            </article>
          ))}
        </div>
        <div className="timeline">
          {(archiveData?.auditRows ?? []).map((entry: any) => (
            <article key={entry.id}>
              <ListChecks size={18} />
              <div>
                <strong>{entry.entityType} · {entry.action}</strong>
                <small>{entry.entityId} · {new Date(entry.createdAt).toLocaleString()}</small>
              </div>
            </article>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Toolbar({ query, setQuery, placeholder, action }: any) {
  return <div className="toolbar"><label className="search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} /></label>{action}</div>;
}

function Chips({ items, active, setActive }: { items: string[]; active: string; setActive: (item: string) => void }) {
  return <div className="chips">{items.map((item) => <button key={item} className={item === active ? "active" : ""} onClick={() => setActive(item)}>{item}</button>)}</div>;
}

function PaginatedTable({ headers, rows, label, pageSize = 25 }: { headers: string[]; rows: TableRow[]; label: string; pageSize?: number }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  const start = (page - 1) * pageSize;
  const visibleRows = rows.slice(start, start + pageSize);
  return (
    <div className="paginated-table">
      <ResponsiveTable headers={headers} rows={visibleRows} />
      {rows.length > pageSize && (
        <div className="table-footer">
          <span>Showing {start + 1}-{Math.min(start + pageSize, rows.length)} of {rows.length} {label}</span>
          <div className="pager">
            <Button variant="secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>Previous</Button>
            <strong>Page {page} of {pageCount}</strong>
            <Button variant="secondary" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResponsiveTable({ headers, rows }: { headers: string[]; rows: TableRow[] }) {
  const isDesktopTable = useDesktopTable();
  const activateRow = (event: React.MouseEvent, onClick?: () => void) => {
    const target = event.target as HTMLElement;
    if (target.closest("button,input,select,textarea,a,label")) return;
    onClick?.();
  };
  return (
    <div className="responsive-table">
      {rows.length === 0 ? <p className="empty-note">No rows to show.</p> : <>
        {isDesktopTable ? <table className="desktop-table"><thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{rows.map((row) => (
          <Fragment key={row.key}>
            <tr className={row.expanded ? "is-expanded" : undefined} onClick={(event) => activateRow(event, row.onClick)}>{row.cells.map((cell, index) => <td key={index} data-label={headers[index]}>{cell}</td>)}</tr>
            {row.expanded && row.details && <tr className="table-details-row"><td colSpan={headers.length}>{row.details}</td></tr>}
          </Fragment>
        ))}</tbody></table> : <ul className="mobile-table-cards">{rows.map((row) => <li key={row.key} className={`item-card${row.expanded ? " is-expanded" : ""}`} onClick={(event) => activateRow(event, row.onClick)}>{row.cells.map((cell, index) => <div className="mobile-row" key={index}><span>{headers[index]}</span><strong>{cell}</strong></div>)}{row.expanded && row.details && <div className="mobile-row-details">{row.details}</div>}</li>)}</ul>}
      </>}
    </div>
  );
}

function useDesktopTable() {
  const query = "(min-width: 1180px)";
  const getMatch = () => typeof window !== "undefined" && window.matchMedia?.(query).matches;
  const [isDesktopTable, setIsDesktopTable] = useState(getMatch);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(query);
    const update = () => setIsDesktopTable(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return isDesktopTable;
}

function AuditDetails({ entry, lookup }: { entry: AuditLog; lookup: AuditRecordNameLookup }) {
  const changedFields = auditChangedFields(entry);
  return (
    <div className="audit-details">
      <div className="audit-detail-head">
        <span>{auditRecordLabel(entry, lookup)}</span>
        <strong>{auditChangeSummary(entry)}</strong>
      </div>
      {changedFields.length > 0 && <div className="audit-field-list">{changedFields.map((field) => <Badge key={field} tone="neutral">{auditFieldLabel(field)}</Badge>)}</div>}
      <div className="audit-json-grid">
        <article>
          <h3>Before</h3>
          <pre>{auditDataJson(entry.beforeData)}</pre>
        </article>
        <article>
          <h3>After</h3>
          <pre>{auditDataJson(entry.afterData)}</pre>
        </article>
      </div>
    </div>
  );
}

function SummaryCard({ title, items }: { title: string; items: [string, React.ReactNode][] }) {
  return <article className="summary-card"><h3>{title}</h3>{items.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</article>;
}

function Metric({ label, value, hint, onOpen, openLabel }: { label: string; value: React.ReactNode; hint?: React.ReactNode; onOpen?: () => void; openLabel?: string }) {
  const textValue = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const valueClass = textValue.length > 7 ? "metric-value metric-value-long" : "metric-value";
  const body = <><span>{label}</span><strong className={valueClass}>{value}</strong>{hint && <small>{hint}</small>}</>;
  // A card that leads somewhere is a real button, so it is keyboard-operable and
  // announces where it goes. Cards with no destination stay inert rather than
  // pretending to be interactive.
  if (!onOpen) return <article className="metric-card">{body}</article>;
  return (
    <button type="button" className="metric-card metric-card-link" onClick={onOpen} aria-label={openLabel ?? `${label}: ${textValue}. Open list.`}>
      {body}
    </button>
  );
}

// Loading, error and empty for a route-scoped list. The skeleton reserves the
// height the rows will occupy, so arriving data replaces it in place instead of
// shoving the page around; the error is announced, not just coloured red.
function ResourceState({ status, error, onRetry, emptyMessage, rowCount = 6 }: { status: PagedStatus; error: string; onRetry: () => void; emptyMessage: string; rowCount?: number }) {
  if (status === "loading") {
    return (
      <div className="skeleton-grid resource-skeleton" role="status" aria-live="polite" aria-busy="true">
        <span className="visually-hidden">Loading…</span>
        {Array.from({ length: rowCount }, (_, index) => <span key={index} aria-hidden="true" />)}
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="global-error resource-state" role="alert">
        <p>{error || "That list could not be loaded."}</p>
        <Button variant="secondary" onClick={onRetry}>Try again</Button>
      </div>
    );
  }
  return <p className="empty-note resource-state">{emptyMessage}</p>;
}

function EmptyState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return (
    <article className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      <p>{message}</p>
    </article>
  );
}

function FormShell({ title, action, onDone, children, cancelLabel = "Cancel", onCancel, setFormDirty }: { title: string; action: string; onDone: (form: HTMLFormElement) => void | Promise<void>; children: React.ReactNode; cancelLabel?: string; onCancel: () => void; setFormDirty: (dirty: boolean) => void }) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useEffect(() => () => setFormDirty(false), [setFormDirty]);
  return (
    <form className="form-shell" onChangeCapture={() => setFormDirty(true)} onInputCapture={() => setFormDirty(true)} onSubmit={async (event) => { event.preventDefault(); setSaving(true); setSaveError(""); setFormDirty(false); try { await onDone(event.currentTarget); } catch (error) { setFormDirty(true); setSaveError(error instanceof Error ? error.message : "Unable to save."); } finally { setSaving(false); } }}>
      <div className="section-head"><h2>{title}</h2><div className="button-row"><Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button><Button type="submit">{saving ? "Saving..." : action}</Button></div></div>
      {saveError && <p className="global-error" role="alert">{saveError}</p>}
      {children}
      <div className="sticky-actions"><Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button><Button type="submit">{saving ? "Saving..." : action}</Button></div>
    </form>
  );
}

export default App;
