import {
  AlertTriangle,
  BarChart3,
  Bot,
  Boxes,
  Calculator,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Clock,
  Cookie,
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
  Users,
  Wand2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiBaseUrl, backendMode } from "./lib/backend";
import { auditLogs, conversionRules, ingredientBatches, ingredients, inventoryMovements, orderItems, orders, products, recipeItems, recipes, settings, suppliers, setKitchenSnapshot } from "./data";
import type { ConversionRule, Ingredient, Order, Recipe, StockStatus, Supplier, Unit } from "./types";
import {
  calculateMargin,
  calculateOrderCost,
  calculateRecipeCost,
  checkOrderStockAvailability,
  checkStockAvailability,
  convertUnit,
  formatNaira,
  generateShoppingList,
  parseRecipeText,
  requirementsForOrder,
  scaleRecipe
} from "./lib/kitchen";

type Page =
  | "welcome"
  | "login"
  | "dashboard"
  | "recipes"
  | "recipe-detail"
  | "recipe-form"
  | "scaling"
  | "inventory"
  | "ingredient-detail"
  | "ingredient-form"
  | "orders"
  | "order-create"
  | "order-detail"
  | "production"
  | "shopping"
  | "costing"
  | "ai"
  | "conversions"
  | "suppliers"
  | "settings";

const desktopNav = [
  ["dashboard", LayoutDashboard, "Dashboard"],
  ["recipes", Cookie, "Recipes"],
  ["inventory", Boxes, "Inventory"],
  ["orders", ClipboardList, "Orders"],
  ["production", ChefHat, "Production"],
  ["shopping", ShoppingBasket, "Shopping List"],
  ["costing", Calculator, "Costing"],
  ["ai", Bot, "AI Assistant"],
  ["suppliers", Truck, "Suppliers"],
  ["settings", Settings, "Settings"]
] as const;

const bottomNav = [
  ["dashboard", Home, "Dashboard"],
  ["recipes", Cookie, "Recipes"],
  ["inventory", Boxes, "Inventory"],
  ["orders", ClipboardList, "Orders"],
  ["settings", ListChecks, "More"]
] as const;

const moreItems = [
  ["production", ChefHat, "Production"],
  ["shopping", ShoppingBasket, "Shopping List"],
  ["costing", Calculator, "Costing"],
  ["ai", Bot, "AI Assistant"],
  ["conversions", Wand2, "Conversions"],
  ["suppliers", Truck, "Suppliers"],
  ["settings", Settings, "Settings"]
] as const;

const pageIds = new Set<Page>([
  "welcome",
  "login",
  "dashboard",
  "recipes",
  "recipe-detail",
  "recipe-form",
  "scaling",
  "inventory",
  "ingredient-detail",
  "ingredient-form",
  "orders",
  "order-create",
  "order-detail",
  "production",
  "shopping",
  "costing",
  "ai",
  "conversions",
  "suppliers",
  "settings"
]);

type AppSession = {
  page?: Page;
  selectedRecipeId?: string;
  selectedIngredientId?: string;
  selectedOrderId?: string;
  user?: AppUser;
};

type AppUser = {
  id: string;
  email: string;
  fullName: string;
  role: "Owner/Admin" | "Baker" | "Inventory Manager" | "Viewer";
};

function readSession(): AppSession {
  if (typeof window === "undefined") return {};
  const hashPage = window.location.hash.replace(/^#\/?/, "") as Page;
  try {
    const session = JSON.parse(window.localStorage.getItem("pastry-county-session") ?? "{}") as AppSession;
    const page = pageIds.has(hashPage) ? hashPage : pageIds.has(session.page as Page) ? session.page : undefined;
    return { ...session, page };
  } catch {
    return pageIds.has(hashPage) ? { page: hashPage } : {};
  }
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "caramel" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Button({ children, variant = "primary", onClick, type = "button", disabled = false }: { children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger"; onClick?: React.MouseEventHandler<HTMLButtonElement>; type?: "button" | "submit" | "reset"; disabled?: boolean }) {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick} type={type} disabled={disabled}>
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

function stockTone(status: StockStatus | string) {
  if (status.includes("Enough") || status === "In Stock" || status === "Ready" || status === "Completed") return "success";
  if (status.includes("Short") || status === "Out of Stock" || status === "Cancelled") return "danger";
  if (status.includes("Low") || status.includes("Check") || status.includes("Partial")) return "warning";
  return "neutral";
}

function hasShortageForOrder(orderId: string) {
  return checkOrderStockAvailability(orderId).some((item) => item.shortageQuantity > 0);
}

function formatQuantity(value: number, unit: Unit) {
  return `${Number(value.toFixed(3)).toLocaleString("en-NG")}${unit}`;
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

function formValue(form: HTMLFormElement, name: string) {
  const value = new FormData(form).get(name);
  return value === null ? "" : String(value);
}

function formNumber(form: HTMLFormElement, name: string, fallback = 0) {
  const value = Number(formValue(form, name));
  return Number.isFinite(value) ? value : fallback;
}

function formValues(form: HTMLFormElement, name: string) {
  return new FormData(form).getAll(name).map(String).filter(Boolean);
}

function netSellingPrice(grossPrice: number) {
  const taxRate = (settings.defaultTaxPercentage ?? 0) / 100;
  return taxRate > 0 ? grossPrice / (1 + taxRate) : grossPrice;
}

async function apiAction(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch(`${apiBaseUrl}/api/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Kitchen action failed.");
  return result;
}

async function markOrderProduced(orderId: string, notify: Notify) {
  try {
    const response = await fetch(`${apiBaseUrl}/api/orders/${orderId}/produced`, { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || "Unable to mark order as produced.");
    }
    notify(result.alreadyProduced ? "This order was already produced. Inventory was not deducted again." : "Order marked as produced and inventory deducted.");
  } catch (error) {
    notify(error instanceof Error ? error.message : "Unable to mark order as produced.");
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
  const [page, setPage] = useState<Page>(() => savedSession.user ? savedSession.page ?? "dashboard" : savedSession.page === "login" ? "login" : "welcome");
  const [selectedRecipeId, setSelectedRecipeId] = useState(() => savedSession.selectedRecipeId ?? "");
  const [selectedIngredientId, setSelectedIngredientId] = useState(() => savedSession.selectedIngredientId ?? "");
  const [selectedOrderId, setSelectedOrderId] = useState(() => savedSession.selectedOrderId ?? "");
  const [query, setQuery] = useState("");
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
  const [dataError, setDataError] = useState("");
  const [dataVersion, setDataVersion] = useState(0);
  const [toast, setToast] = useState("");
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? "" : current)), 3600);
  }, []);

  const askConfirm = useCallback((request: ConfirmRequest) => {
    setConfirmRequest(request);
  }, []);

  const loadKitchenData = useCallback(async (cancelled?: () => boolean) => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/bootstrap`);
        if (!response.ok) throw new Error(`Kitchen API returned ${response.status}`);
        const snapshot = await response.json();
        if (!cancelled?.()) {
          setKitchenSnapshot(snapshot);
          setSelectedRecipeId((current) => snapshot.recipes.some((item: Recipe) => item.id === current) ? current : snapshot.recipes[0]?.id ?? "");
          setSelectedIngredientId((current) => snapshot.ingredients.some((item: Ingredient) => item.id === current) ? current : snapshot.ingredients[0]?.id ?? "");
          setSelectedOrderId((current) => snapshot.orders.some((item: Order) => item.id === current) ? current : snapshot.orders[0]?.id ?? "");
          setDataStatus("ready");
          setDataVersion((version) => version + 1);
        }
      } catch (error) {
        if (!cancelled?.()) {
          setDataError(error instanceof Error ? error.message : "Unable to load kitchen data");
          setDataStatus("error");
        }
      }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadKitchenData(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadKitchenData]);

  useEffect(() => {
    window.localStorage.setItem("pastry-county-session", JSON.stringify({ page, selectedRecipeId, selectedIngredientId, selectedOrderId, user }));
    window.history.replaceState(null, "", `#${page}`);
  }, [page, selectedIngredientId, selectedOrderId, selectedRecipeId, user]);

  const navigate = (next: Page) => {
    if (next !== page) setQuery("");
    if (next === "settings" && page !== "settings") {
      setPage("settings");
      return;
    }
    setPage(next);
  };

  const content = useMemo(() => {
    const props = { setPage: navigate, setSelectedRecipeId, setSelectedIngredientId, setSelectedOrderId, selectedRecipeId, selectedIngredientId, selectedOrderId, query, setQuery, notify, askConfirm, reloadData: () => loadKitchenData() };
    switch (page) {
      case "welcome":
        return <Welcome setPage={navigate} />;
      case "login":
        return <Login setPage={navigate} setUser={setUser} notify={notify} />;
      case "dashboard":
        return <Dashboard {...props} />;
      case "recipes":
        return <Recipes {...props} />;
      case "recipe-detail":
        return <RecipeDetail recipeId={selectedRecipeId} setPage={navigate} notify={notify} askConfirm={askConfirm} reloadData={() => loadKitchenData()} />;
      case "recipe-form":
        return <RecipeForm recipeId={selectedRecipeId} setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
      case "scaling":
        return <RecipeScaling recipeId={selectedRecipeId} setPage={navigate} notify={notify} />;
      case "inventory":
        return <Inventory {...props} />;
      case "ingredient-detail":
        return <IngredientDetail ingredientId={selectedIngredientId} setPage={navigate} notify={notify} askConfirm={askConfirm} reloadData={() => loadKitchenData()} />;
      case "ingredient-form":
        return <IngredientForm ingredientId={selectedIngredientId} setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
      case "orders":
        return <Orders {...props} />;
      case "order-create":
        return <CreateOrder orderId={selectedOrderId} setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
      case "order-detail":
        return <OrderDetail orderId={selectedOrderId} setPage={navigate} notify={notify} askConfirm={askConfirm} reloadData={() => loadKitchenData()} />;
      case "production":
        return <Production setPage={navigate} setSelectedOrderId={setSelectedOrderId} notify={notify} reloadData={() => loadKitchenData()} />;
      case "shopping":
        return <ShoppingList notify={notify} reloadData={() => loadKitchenData()} />;
      case "costing":
        return <Costing />;
      case "ai":
        return <AiAssistant setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
      case "conversions":
        return <ConversionLibrary notify={notify} askConfirm={askConfirm} reloadData={() => loadKitchenData()} />;
      case "suppliers":
        return <Suppliers notify={notify} askConfirm={askConfirm} reloadData={() => loadKitchenData()} />;
      case "settings":
        return <SettingsPage setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
    }
  }, [page, selectedIngredientId, selectedOrderId, selectedRecipeId, query, notify, askConfirm, loadKitchenData, dataVersion, user]);

  if (page === "welcome" || page === "login") return <>{content}</>;

  if (!user) return <Login setPage={navigate} setUser={setUser} notify={notify} />;

  if (dataStatus === "loading") {
    return <LoadingScreen />;
  }

  if (dataStatus === "error") {
    return <ErrorScreen message={dataError} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <BrandMark />
        <nav>
          {desktopNav.map(([id, Icon, label]) => (
            <button key={id} className={page === id ? "nav-item active" : "nav-item"} onClick={() => navigate(id as Page)}>
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Sparkles size={18} />
          <span>{backendMode === "neon-api" || backendMode === "same-origin-api" ? "Connected to Neon API" : "Database mode active"}</span>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Pastry County Kitchen OS</p>
            <h1>{titleFor(page)}</h1>
          </div>
          <div className="button-row">
            <Badge tone="caramel">{user.role}</Badge>
            <Button variant="secondary" onClick={() => navigate("ai")}>
              <Bot size={18} /> Ask AI
            </Button>
            <Button variant="ghost" onClick={() => { setUser(undefined); setPage("login"); notify("Logged out."); }}>Logout</Button>
          </div>
        </header>
        {content}
      </main>
      <nav className="bottom-nav">
        {bottomNav.map(([id, Icon, label]) => (
          <button key={id} className={page === id || (id === "settings" && moreItems.some(([moreId]) => moreId === page)) ? "active" : ""} onClick={() => navigate(id as Page)}>
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
        <p>Loading live inventory, recipes, orders, and conversion rules from Postgres.</p>
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

function titleFor(page: Page) {
  const map: Partial<Record<Page, string>> = {
    dashboard: "Kitchen Command Center",
    recipes: "Recipe Library",
    inventory: "Inventory",
    orders: "Orders",
    production: "Production Plan",
    shopping: "Shopping List",
    costing: "Costing & Margins",
    ai: "AI Conversion Assistant",
    conversions: "Conversion Library",
    suppliers: "Suppliers",
    settings: "More & Settings"
  };
  return map[page] ?? "Kitchen OS";
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

function Welcome({ setPage }: { setPage: (page: Page) => void }) {
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

function Login({ setPage, setUser, notify }: { setPage: (page: Page) => void; setUser: (user: AppUser) => void; notify: Notify }) {
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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: formValue(form, "email"), password: formValue(form, "password") })
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || "Login failed.");
          setUser(result as AppUser);
          notify(`Signed in as ${(result as AppUser).role}.`);
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
        <button type="button" className="text-link" onClick={() => alert("Password reset will be connected when team email delivery is configured.")}>Forgot password?</button>
      </form>
    </main>
  );
}

function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const [working, setWorking] = useState(false);
  const runConfirm = async () => {
    setWorking(true);
    try {
      await request.onConfirm();
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to complete this action.");
      setWorking(false);
    }
  };
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div>
          <p className="eyebrow">{request.tone === "danger" ? "Destructive action" : "Please confirm"}</p>
          <h2 id="confirm-title">{request.title}</h2>
          <p>{request.message}</p>
        </div>
        <div className="button-row">
          <Button variant="secondary" onClick={onClose}>Keep it</Button>
          <Button variant={request.tone === "danger" ? "danger" : "primary"} onClick={runConfirm}>{working ? "Working..." : request.confirmLabel}</Button>
        </div>
      </section>
    </div>
  );
}

function Dashboard({ setPage, setSelectedIngredientId }: any) {
  const shopping = generateShoppingList();
  const today = new Date().toISOString().slice(0, 10);
  const productionCards = orders.slice(0, 3).map((order) => {
    const line = orderItems.find((item) => item.orderId === order.id);
    const product = products.find((item) => item.id === line?.productId);
    return {
      id: order.id,
      productName: product?.name ?? "Order item",
      quantity: line ? `${line.requestedYieldQuantity} ${line.yieldUnit}` : "No items",
      dueDate: order.dueDate === today ? "Due today" : `Due ${order.dueDate}`,
      productionStatus: order.productionStatus,
      stockStatus: order.stockStatus
    };
  });
  const lowStock = ingredients.filter((item) => item.currentStock <= item.reorderLevel).slice(0, 3);
  const metrics = [
    ["Total Ingredients", ingredients.length, "Active pantry and packaging items"],
    ["Low Stock Items", ingredients.filter((item) => item.currentStock <= item.reorderLevel).length, "Need attention"],
    ["Orders Due Today", orders.filter((order) => order.dueDate === today).length, "Confirmed and draft"],
    ["Pending Production", orders.filter((order) => order.productionStatus !== "Completed").length, "Across this week"],
    ["Shopping Estimate", formatNaira(shopping.reduce((sum, item) => sum + item.estimatedCost, 0)), "Suggested restock cost"],
    ["Recipe Cost Updates", 3, "Ingredient prices changed"]
  ];
  return (
    <div className="page-grid">
      <div className="metric-grid">
        {metrics.map(([label, value, hint]) => (
          <article className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{hint}</small>
          </article>
        ))}
      </div>
      <Section title="Today's Production" action={<Button variant="secondary" onClick={() => setPage("production")}><ChefHat size={18} /> View Plan</Button>}>
        <div className="card-list three">
          {productionCards.map((card) => (
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
      </Section>
      <div className="split">
        <Section title="Low Stock Alerts">
          <div className="compact-list">
            {lowStock.map((item) => (
              <button className="row-card" key={item.id} onClick={() => { setSelectedIngredientId(item.id); setPage("ingredient-detail"); }}>
                <span><strong>{item.name}</strong><small>{item.currentStock}{item.baseUnit} left, reorder at {item.reorderLevel}{item.baseUnit}</small></span>
                <Badge tone="danger">Low Stock</Badge>
              </button>
            ))}
          </div>
        </Section>
        <Section title="Smart Suggestions">
          <article className="ai-card">
            <Sparkles size={24} />
            <div>
              <h3>Restock before Friday</h3>
              <p>Based on confirmed orders, you may need to restock {lowStock.map((item) => item.name.toLowerCase()).join(", ") || "key ingredients"} before the next production run.</p>
            </div>
          </article>
        </Section>
      </div>
    </div>
  );
}

function Inventory({ setPage, setSelectedIngredientId, query, setQuery }: any) {
  const [filter, setFilter] = useState("All");
  const categories = ["All", "Dry Goods", "Dairy", "Chocolate", "Fruits", "Packaging", "Low Stock"];
  const list = ingredients.filter((item) => {
    const categoryMatch = filter === "All" || item.category === filter || (filter === "Low Stock" && item.currentStock <= item.reorderLevel);
    return categoryMatch && item.name.toLowerCase().includes(query.toLowerCase());
  });
  return (
    <>
      <Toolbar query={query} setQuery={setQuery} placeholder="Search ingredients" action={<Button onClick={() => { setSelectedIngredientId(""); setPage("ingredient-form"); }}><Plus size={18} /> Add Ingredient</Button>} />
      <Chips items={categories} active={filter} setActive={setFilter} />
      <ResponsiveTable
        headers={["Ingredient", "Category", "Current Stock", "Reorder", "Latest Cost", "Status"]}
        rows={list.map((item) => ({
          key: item.id,
          onClick: () => { setSelectedIngredientId(item.id); setPage("ingredient-detail"); },
          cells: [item.name, item.category, `${item.currentStock}${item.baseUnit}`, `${item.reorderLevel}${item.baseUnit}`, `${formatNaira(item.latestUnitCost)}/${item.baseUnit}`, <Badge tone={item.currentStock <= item.reorderLevel ? "danger" : "success"}>{item.currentStock <= item.reorderLevel ? "Low Stock" : "In Stock"}</Badge>]
        }))}
      />
    </>
  );
}

function IngredientDetail({ ingredientId, setPage, notify, askConfirm, reloadData }: { ingredientId: string; setPage: (page: Page) => void; notify: (message: string) => void; askConfirm: AskConfirm; reloadData: () => Promise<void> }) {
  const ingredient = ingredients.find((item) => item.id === ingredientId)!;
  const [stockForm, setStockForm] = useState<"purchase" | "adjustment" | null>(null);
  if (!ingredient) return <EmptyState title="Ingredient not found" message="Select an ingredient from inventory." />;
  const supplier = suppliers.find((item) => item.id === ingredient.supplierId);
  const movements = inventoryMovements.filter((item) => item.ingredientId === ingredientId);
  const batches = ingredientBatches.filter((item) => item.ingredientId === ingredientId);
  const auditTrail = auditLogs.filter((item) => item.entityType === "ingredients" && item.entityId === ingredientId).slice(0, 8);
  return (
    <div className="detail-layout">
      <article className="detail-hero">
        <div>
          <p className="eyebrow">{ingredient.category}</p>
          <h2>{ingredient.name}</h2>
          <p>{ingredient.currentStock}{ingredient.baseUnit} in stock · reorder at {ingredient.reorderLevel}{ingredient.baseUnit}</p>
        </div>
        <div className="button-row">
          <Button onClick={() => setStockForm("purchase")}><PackagePlus size={18} /> Add Stock</Button>
          <Button variant="secondary" onClick={() => setStockForm("adjustment")}>Adjust Stock</Button>
          <Button variant="secondary" onClick={() => notify(`${ingredient.name} usage history is shown in the movement timeline below.`)}>View Usage</Button>
          <Button variant="ghost" onClick={() => setPage("ingredient-form")}>Edit {ingredient.name}</Button>
          <Button variant="danger" onClick={() => askConfirm({ title: `Archive ${ingredient.name}?`, message: "It will disappear from active inventory, while historical recipe and order records remain intact.", confirmLabel: "Archive Ingredient", tone: "danger", onConfirm: async () => { await apiAction("ingredient.delete", { ingredientId }); notify(`${ingredient.name} archived from active inventory.`); await reloadData(); setPage("inventory"); } })}>Archive</Button>
        </div>
      </article>
      <div className="split">
        <SummaryCard title="Stock Summary" items={[["Current stock", `${ingredient.currentStock}${ingredient.baseUnit}`], ["Reserved stock", `${ingredient.reservedStock ?? 0}${ingredient.baseUnit}`], ["Available stock", `${ingredient.currentStock - (ingredient.reservedStock ?? 0)}${ingredient.baseUnit}`], ["Reorder level", `${ingredient.reorderLevel}${ingredient.baseUnit}`]]} />
        <SummaryCard title="Cost Summary" items={[["Last purchase price", `${formatNaira(ingredient.latestUnitCost)}/${ingredient.baseUnit}`], ["Supplier", supplier?.name ?? "Unassigned"], ["Expiry date", ingredient.expiryDate ?? "Not tracked"], ["Price trend", "18% increase placeholder"]]} />
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
                <small>{movement.movementType} · {formatQuantity(movement.quantityChange, movement.unit)} · {new Date(movement.createdAt).toLocaleDateString()}</small>
              </div>
            </article>
          ))}
        </div>
      </Section>
      {stockForm && <StockAdjustmentModal ingredient={ingredient} mode={stockForm} onClose={() => setStockForm(null)} notify={notify} reloadData={reloadData} />}
    </div>
  );
}

function StockAdjustmentModal({ ingredient, mode, onClose, notify, reloadData }: { ingredient: Ingredient; mode: "purchase" | "adjustment"; onClose: () => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const [direction, setDirection] = useState<"add" | "remove">(mode === "purchase" ? "add" : "remove");
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="stock-adjustment-title">
      <form className="confirm-modal wide" onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const quantity = formNumber(form, "quantity");
        if (quantity <= 0) {
          notify("Enter an adjustment quantity greater than zero.");
          return;
        }
        const signedQuantity = direction === "remove" ? -quantity : quantity;
        await apiAction("inventory.adjust", {
          ingredientId: ingredient.id,
          movementType: mode === "purchase" && direction === "add" ? "purchase" : "adjustment",
          quantityChange: signedQuantity,
          unit: ingredient.baseUnit,
          note: formValue(form, "note") || `${direction === "add" ? "Added" : "Removed"} ${formatQuantity(quantity, ingredient.baseUnit)}`
        });
        notify(`${ingredient.name} stock updated by ${formatQuantity(signedQuantity, ingredient.baseUnit)}.`);
        await reloadData();
        onClose();
      }}>
        <h2 id="stock-adjustment-title">{mode === "purchase" ? "Add Stock" : "Adjust Stock"}</h2>
        <p>Current stock: {formatQuantity(ingredient.currentStock, ingredient.baseUnit)}. Removals cannot take stock below zero.</p>
        <div className="form-grid">
          <Field label="Adjustment type">
            <select value={direction} onChange={(event) => setDirection(event.target.value as "add" | "remove")}>
              <option value="add">Add stock</option>
              <option value="remove">Remove stock</option>
            </select>
          </Field>
          <Field label={`Quantity (${ingredient.baseUnit})`}><input name="quantity" type="number" min="0.001" step="0.001" required /></Field>
          <Field label="Reason"><textarea name="note" required placeholder="Purchase, spoilage, count correction, or production note" /></Field>
        </div>
        <div className="button-row">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">{mode === "purchase" ? "Add Stock" : "Save Adjustment"}</Button>
        </div>
      </form>
    </div>
  );
}

function IngredientForm({ ingredientId, setPage, notify, reloadData }: { ingredientId: string; setPage: (page: Page) => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const ingredient = ingredients.find((item) => item.id === ingredientId);
  return (
    <FormShell title={ingredient ? "Edit Ingredient" : "Add Ingredient"} action="Save Ingredient" cancelTo="inventory" setPage={setPage} onDone={async (form) => {
      const supplierName = formValue(form, "supplierId");
      await apiAction("ingredient.save", {
        ingredient: {
          id: ingredient?.id,
          name: formValue(form, "name"),
          category: formValue(form, "category"),
          baseUnit: formValue(form, "baseUnit"),
          currentStock: formNumber(form, "currentStock"),
          reorderLevel: formNumber(form, "reorderLevel"),
          latestUnitCost: formNumber(form, "latestUnitCost", ingredient?.latestUnitCost ?? 0),
          purchaseQuantity: formNumber(form, "purchaseQuantity"),
          purchaseUnit: formValue(form, "purchaseUnit"),
          purchasePrice: formNumber(form, "purchasePrice"),
          supplierId: supplierName || undefined,
          expiryTrackingEnabled: formValue(form, "expiryTrackingEnabled"),
          defaultExpiryDays: formNumber(form, "defaultExpiryDays"),
          expiryDate: formValue(form, "expiryDate"),
          notes: formValue(form, "notes")
        }
      });
      notify("Ingredient saved to Neon.");
      await reloadData();
      setPage("inventory");
    }}>
      <div className="form-grid">
        <Field label="Ingredient name"><input name="name" defaultValue={ingredient?.name ?? ""} placeholder="Ingredient name" required /></Field>
        <Field label="Category"><select name="category" defaultValue={ingredient?.category ?? ""} required><option value="" disabled>Select category</option><option>Dry Goods</option><option>Dairy</option><option>Chocolate</option><option>Fruits</option><option>Packaging</option></select></Field>
        <Field label="Base unit" helper="Use one consistent storage unit for calculations."><select name="baseUnit" defaultValue={ingredient?.baseUnit ?? "g"}><option>g</option><option>kg</option><option>ml</option><option>litre</option><option>pcs</option><option>pack</option><option>roll</option></select></Field>
        <Field label="Current stock"><input name="currentStock" type="number" min="0" step="0.001" defaultValue={ingredient?.currentStock ?? 0} placeholder="0" required /></Field>
        <Field label="Reorder level"><input name="reorderLevel" type="number" min="0" step="0.001" defaultValue={ingredient?.reorderLevel ?? 0} placeholder="0" required /></Field>
        <Field label="Latest unit cost" helper={`Cost per ${ingredient?.baseUnit ?? "base unit"} used for costing when no purchase price is entered.`}><input name="latestUnitCost" type="number" min="0" step="0.0001" defaultValue={ingredient?.latestUnitCost ?? 0} placeholder="0" required /></Field>
        <Field label="Purchase quantity" helper="Optional. Added on top of current stock."><input name="purchaseQuantity" type="number" min="0" step="0.001" placeholder="0" /></Field>
        <Field label="Purchase unit"><select name="purchaseUnit" defaultValue={ingredient?.baseUnit ?? "g"}><option>g</option><option>kg</option><option>ml</option><option>litre</option><option>pcs</option><option>pack</option><option>roll</option></select></Field>
        <Field label="Purchase price"><input name="purchasePrice" type="number" min="0" step="0.01" placeholder="0" /></Field>
        <Field label="Supplier"><select name="supplierId" defaultValue={ingredient?.supplierId ?? ""}><option value="">Unassigned</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
        <Field label="Expiry tracking"><select name="expiryTrackingEnabled" defaultValue={ingredient?.expiryTrackingEnabled ? "Yes" : "No"}><option>Yes</option><option>No</option></select></Field>
        <Field label="Default expiry days"><input name="defaultExpiryDays" type="number" min="0" step="1" defaultValue={ingredient?.defaultExpiryDays ?? ""} placeholder="e.g. 14" /></Field>
        <Field label="Current batch expiry"><input name="expiryDate" type="date" defaultValue={ingredient?.expiryDate?.slice(0, 10) ?? ""} /></Field>
        <Field label="Notes"><textarea name="notes" defaultValue={ingredient?.notes ?? ""} placeholder="Storage notes, preferred brands, or supplier details" /></Field>
      </div>
    </FormShell>
  );
}

function Recipes({ setPage, setSelectedRecipeId, query, setQuery }: any) {
  const [filter, setFilter] = useState("All");
  const categories = ["All", "Brownies", "Blondies", "Cookies", "Loaves", "Cakes", "Packaging Sets"];
  const list = recipes.filter((recipe) => (filter === "All" || recipe.category === filter) && recipe.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <Toolbar query={query} setQuery={setQuery} placeholder="Search recipes" action={<Button onClick={() => { setSelectedRecipeId(""); setPage("recipe-form"); }}><Plus size={18} /> Add Recipe</Button>} />
      <Chips items={categories} active={filter} setActive={setFilter} />
      <div className="card-grid">
        {list.map((recipe) => {
          const cost = calculateRecipeCost(recipe.id, recipe.baseYieldQuantity);
          return (
            <article className="item-card" key={recipe.id} onClick={() => { setSelectedRecipeId(recipe.id); setPage("recipe-detail"); }}>
              <div className="item-card-head"><Cookie size={22} /><Badge tone="caramel">{recipe.category}</Badge></div>
              <h3>{recipe.name}</h3>
              <p>Base yield: {recipe.baseYieldQuantity} {recipe.yieldUnit}</p>
              <div className="mini-stats"><span>{formatNaira(cost.totalRecipeCost)} batch</span><span>{formatNaira(cost.costPerYieldUnit)} each</span></div>
              <Button variant="secondary" onClick={(event) => { event.stopPropagation(); setSelectedRecipeId(recipe.id); setPage("scaling"); }}><Scale size={18} /> Scale Recipe</Button>
            </article>
          );
        })}
      </div>
    </>
  );
}

function RecipeDetail({ recipeId, setPage, notify, askConfirm, reloadData }: { recipeId: string; setPage: (page: Page) => void; notify: (message: string) => void; askConfirm: AskConfirm; reloadData: () => Promise<void> }) {
  const recipe = recipes.find((item) => item.id === recipeId);
  if (!recipe) return <EmptyState title="Recipe not found" message="Select a recipe from the database-backed recipe library." />;
  const cost = calculateRecipeCost(recipeId, recipe.baseYieldQuantity);
  return (
    <div className="detail-layout">
      <article className="detail-hero">
        <div><p className="eyebrow">{recipe.category}</p><h2>{recipe.name}</h2><p>Base yield {recipe.baseYieldQuantity} {recipe.yieldUnit} · {formatNaira(cost.totalRecipeCost)} batch cost</p></div>
        <div className="button-row"><Button onClick={() => setPage("scaling")}><Scale size={18} /> Scale Recipe</Button><Button variant="secondary" onClick={() => setPage("recipe-form")}>Edit Recipe</Button><Button variant="secondary" onClick={() => setPage("order-create")}>Create Order</Button><Button variant="ghost" onClick={async () => { await apiAction("recipe.save", { recipe: { name: `${recipe.name} Copy`, category: recipe.category, baseYieldQuantity: recipe.baseYieldQuantity, yieldUnit: recipe.yieldUnit, notes: recipe.notes, instructions: recipe.instructions.join("\n"), items: recipeItems.filter((item) => item.recipeId === recipe.id) } }); notify("Recipe duplicated in Neon."); await reloadData(); setPage("recipes"); }}>Duplicate</Button><Button variant="danger" onClick={() => askConfirm({ title: `Archive ${recipe.name}?`, message: "It will disappear from active recipes. Linked order history stays intact.", confirmLabel: "Archive Recipe", tone: "danger", onConfirm: async () => { await apiAction("recipe.delete", { recipeId }); notify(`${recipe.name} archived from active recipes.`); await reloadData(); setPage("recipes"); } })}>Archive</Button></div>
      </article>
      <div className="split">
        <Section title="Ingredients"><div className="compact-list">{recipeItems.filter((item) => item.recipeId === recipeId).map((item) => <div className="row-card" key={item.id}><strong>{ingredients.find((ingredient) => ingredient.id === item.ingredientId)?.name}</strong><span>{item.quantity}{item.unit}</span></div>)}</div></Section>
        <Section title="Instructions"><ol className="method-list">{recipe.instructions.map((step) => <li key={step}>{step}</li>)}</ol></Section>
      </div>
      <div className="split">
        <Section title="Cost Breakdown"><div className="compact-list">{cost.ingredientCostBreakdown.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}<small>{item.scaledQuantity}{item.unit}</small></span><strong>{formatNaira(item.cost)}</strong></div>)}</div></Section>
        <Section title="Inventory Availability"><div className="metric-grid small">{[1, 2, 3].map((batch) => <article className="metric-card" key={batch}><span>{batch} batch{batch > 1 ? "es" : ""}</span><strong>{checkStockAvailability(scaleRecipe(recipeId, recipe.baseYieldQuantity * batch)).some((item) => item.status === "shortage") ? "Shortage" : "Ready"}</strong></article>)}</div></Section>
      </div>
    </div>
  );
}

function RecipeForm({ recipeId, setPage, notify, reloadData }: { recipeId: string; setPage: (page: Page) => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const recipe = recipes.find((item) => item.id === recipeId);
  const existingItems = recipeItems.filter((item) => item.recipeId === recipeId);
  const [builderRows, setBuilderRows] = useState<number[]>(existingItems.length ? existingItems.map((_, index) => index) : [0]);
  return (
    <FormShell title={recipe ? "Edit Recipe" : "Add Recipe"} action="Save Recipe" cancelTo="recipes" setPage={setPage} onDone={async (form) => {
      const items = builderRows.map((_, index) => ({
        ingredientId: formValue(form, `ingredientId-${index}`),
        quantity: formNumber(form, `quantity-${index}`),
        unit: formValue(form, `unit-${index}`),
        wastePercentage: formNumber(form, `wastePercentage-${index}`)
      })).map((item) => {
        const ingredient = ingredients.find((candidate) => candidate.id === item.ingredientId);
        if (!ingredient || item.unit === ingredient.baseUnit) return item;
        const conversion = convertUnit(item.quantity, item.unit as Unit, ingredient.baseUnit, ingredient.id);
        return conversion.needsReview ? item : { ...item, quantity: Number(conversion.convertedQuantity.toFixed(3)), unit: ingredient.baseUnit };
      });
      await apiAction("recipe.save", {
        recipe: {
          id: recipe?.id,
          productId: recipe?.productId,
          name: formValue(form, "name"),
          category: formValue(form, "category"),
          baseYieldQuantity: formNumber(form, "baseYieldQuantity", 1),
          yieldUnit: formValue(form, "yieldUnit"),
          notes: formValue(form, "notes"),
          instructions: formValue(form, "instructions"),
          items
        }
      });
      notify("Recipe saved to Neon.");
      await reloadData();
      setPage("recipes");
    }}>
      <Section title="Product information"><div className="form-grid"><Field label="Product name"><input name="name" defaultValue={recipe?.name ?? ""} placeholder="Product name" required /></Field><Field label="Category"><select name="category" defaultValue={recipe?.category ?? ""} required><option value="" disabled>Select category</option><option>Brownies</option><option>Blondies</option><option>Cookies</option><option>Loaves</option><option>Cakes</option></select></Field><Field label="Batch notes"><textarea name="notes" defaultValue={recipe?.notes ?? ""} placeholder="Cooling, cutting, baking, or packaging notes" /></Field></div></Section>
      <Section title="Yield information"><div className="form-grid two"><Field label="Base yield quantity"><input name="baseYieldQuantity" type="number" step="0.001" defaultValue={recipe?.baseYieldQuantity ?? 16} placeholder="0" /></Field><Field label="Yield unit"><select name="yieldUnit" defaultValue={recipe?.yieldUnit ?? "pieces"}><option>pieces</option><option>cookies</option><option>loaves</option><option>boxes</option><option>trays</option></select></Field></div></Section>
      <Section title="Ingredients" action={<Button variant="secondary" onClick={() => setBuilderRows((rows) => [...rows, Date.now()])}><Plus size={18} /> Add Ingredient</Button>}>
        <div className="compact-list">
          {builderRows.map((row, index) => {
            const item = existingItems[index];
            return <div className="builder-row" key={row}><select name={`ingredientId-${index}`} defaultValue={item?.ingredientId ?? ""} required><option value="" disabled>Select ingredient</option>{ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}</select><input name={`quantity-${index}`} type="number" step="0.001" defaultValue={item?.quantity ?? ""} placeholder="Quantity" /><select name={`unit-${index}`} defaultValue={item?.unit ?? "g"}><option>g</option><option>ml</option><option>pcs</option><option>cup</option><option>tablespoon</option><option>teaspoon</option><option>pack</option><option>roll</option></select><input name={`wastePercentage-${index}`} type="number" step="0.001" defaultValue={item?.wastePercentage ?? 0} placeholder="Waste %" /><Button variant="ghost" onClick={() => setBuilderRows((rows) => rows.length === 1 ? rows : rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</Button></div>;
          })}
        </div>
      </Section>
      <Section title="Conversion helper"><div className="compact-list">{builderRows.map((row, index) => {
        const item = existingItems[index];
        const ingredient = ingredients.find((candidate) => candidate.id === item?.ingredientId);
        const rule = item && ingredient ? conversionRules.find((candidate) => candidate.ingredientId === ingredient.id && candidate.fromUnit === item.unit && candidate.toUnit === ingredient.baseUnit) : undefined;
        return <div className="row-card" key={row}><span>Row {index + 1}<small>{rule ? `Saved rule available: 1 ${rule.fromUnit} = ${rule.conversionFactor}${rule.toUnit}` : "Saved conversion rules apply automatically on save when available."}</small></span><Badge tone={rule ? "success" : "neutral"}>{rule ? "Ready" : "Auto-check"}</Badge></div>;
      })}</div><div className="button-row"><Button variant="secondary" onClick={() => notify("Verified conversion rules are applied to recipe ingredients when you save.")}><Wand2 size={18} /> Apply saved conversions on save</Button><Button variant="secondary" onClick={() => notify("Paste-to-structure helper is available from the AI Assistant page.")}><Bot size={18} /> Paste recipe and structure</Button></div></Section>
      <Section title="Instructions"><Field label="Method"><textarea name="instructions" defaultValue={recipe?.instructions.join("\n") ?? ""} placeholder="Add the recipe method step by step" /></Field></Section>
    </FormShell>
  );
}

function RecipeScaling({ recipeId, setPage, notify }: { recipeId: string; setPage: (page: Page) => void; notify: (message: string) => void }) {
  const [desired, setDesired] = useState(12);
  const recipe = recipes.find((item) => item.id === recipeId);
  if (!recipe) return <EmptyState title="No recipe selected" message="Add or select a recipe before scaling." />;
  const scaled = scaleRecipe(recipeId, desired);
  const cost = calculateRecipeCost(recipeId, desired);
  const availability = checkStockAvailability(scaled);
  return (
    <div className="detail-layout">
      <Section title="Scale Recipe">
        <div className="form-grid">
          <Field label="Recipe"><select value={recipeId} disabled><option value={recipeId}>{recipe.name}</option></select></Field>
          <Field label="Base yield"><input readOnly value={`${recipe.baseYieldQuantity} ${recipe.yieldUnit}`} /></Field>
          <Field label="Desired yield"><input type="number" value={desired} onChange={(event) => setDesired(Number(event.target.value))} /></Field>
          <Field label="Scale factor"><input readOnly value={`${(desired / recipe.baseYieldQuantity).toFixed(2)}x`} /></Field>
        </div>
      </Section>
      <div className="metric-grid small"><Metric label="Estimated cost" value={formatNaira(cost.totalRecipeCost)} /><Metric label="Cost per piece" value={formatNaira(cost.costPerYieldUnit)} /><Metric label="Stock availability" value={availability.some((item) => item.status === "shortage") ? "Shortage" : "Ready"} /></div>
      <Section title="Scaled Ingredients"><div className="compact-list">{scaled.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}<small>Original {item.originalQuantity}{item.unit}</small></span><strong>{item.scaledQuantity}{item.unit}</strong></div>)}</div></Section>
      {availability.some((item) => item.status === "shortage") && <article className="warning-card"><AlertTriangle size={22} /> Some ingredients are short. Update stock before production is completed.</article>}
      <div className="sticky-actions"><Button onClick={() => { notify("Scaled recipe added to production planning view."); setPage("production"); }}>Save as production plan</Button><Button variant="secondary" onClick={() => setPage("order-create")}>Create order</Button><Button variant="secondary" onClick={() => window.print()}>Print recipe</Button><Button variant="ghost" onClick={() => shareText(`${recipe.name} scaled to ${desired} ${recipe.yieldUnit}`, notify)}>Share recipe</Button></div>
    </div>
  );
}

function Orders({ setPage, setSelectedOrderId, query, setQuery }: any) {
  const [filter, setFilter] = useState("All");
  const statuses = ["All", "New", "Confirmed", "In Production", "Produced", "Delivered", "Cancelled"];
  const list = orders.filter((order) => (filter === "All" || order.status === filter || (filter === "New" && order.status === "Draft")) && order.customerName.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <Toolbar query={query} setQuery={setQuery} placeholder="Search orders" action={<Button onClick={() => { setSelectedOrderId(""); setPage("order-create"); }}><Plus size={18} /> Add Order</Button>} />
      <Chips items={statuses} active={filter} setActive={setFilter} />
      <div className="card-grid">
        {list.map((order) => <OrderCard key={order.id} order={order} onClick={() => { setSelectedOrderId(order.id); setPage("order-detail"); }} />)}
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

function CreateOrder({ orderId, setPage, notify, reloadData }: { orderId: string; setPage: (page: Page) => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const order = orders.find((item) => item.id === orderId);
  const existingItems = orderItems.filter((item) => item.orderId === orderId);
  const [orderRows, setOrderRows] = useState<number[]>(existingItems.length ? existingItems.map((_, index) => index) : [0]);
  const previewOrderId = orderId || orders[0]?.id;
  const requirements = previewOrderId ? requirementsForOrder(previewOrderId) : [];
  const availability = checkStockAvailability(requirements);
  const cost = previewOrderId ? calculateOrderCost(previewOrderId) : 0;
  const sampleSellingPrice = 18000;
  const netPrice = netSellingPrice(sampleSellingPrice);
  const margin = calculateMargin(netPrice, cost);
  const previewItem = orderItems.find((item) => item.orderId === previewOrderId);
  return (
    <FormShell title={order ? "Edit Order" : "Create Order"} action="Confirm and Reserve Stock" cancelTo="orders" setPage={setPage} onDone={async (form) => {
      const items = orderRows.map((_, index) => ({
        productId: formValue(form, `productId-${index}`),
        recipeId: formValue(form, `recipeId-${index}`),
        requestedYieldQuantity: formNumber(form, `requestedYieldQuantity-${index}`, 1),
        yieldUnit: formValue(form, `yieldUnit-${index}`),
        quantityMultiplier: formNumber(form, `quantityMultiplier-${index}`, 1)
      }));
      await apiAction("order.save", {
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
          items
        }
      });
      notify("Order saved to Neon and stock reservation checked.");
      await reloadData();
      setPage("orders");
    }}>
      <Section title="Customer info"><div className="form-grid"><Field label="Customer name"><input name="customerName" defaultValue={order?.customerName ?? ""} placeholder="Customer name" required /></Field><Field label="Customer phone"><input name="customerPhone" type="tel" defaultValue={order?.customerPhone ?? ""} placeholder="+234..." /></Field><Field label="Due date"><input name="dueDate" type="date" defaultValue={order?.dueDate ?? new Date().toISOString().slice(0, 10)} required /></Field><Field label="Delivery or pickup"><select name="deliveryMethod" defaultValue={order?.deliveryMethod ?? "Pickup"}><option>Pickup</option><option>Delivery</option></select></Field><Field label="Payment status"><select name="paymentStatus" defaultValue={order?.paymentStatus ?? "Unpaid"}><option>Unpaid</option><option>Deposit Paid</option><option>Paid</option></select></Field><Field label="Notes"><textarea name="notes" defaultValue={order?.notes ?? ""} placeholder="Order notes" /></Field></div></Section>
      <Section title="Order items" action={<Button variant="secondary" onClick={() => setOrderRows((rows) => [...rows, Date.now()])}><Plus size={18} /> Add another product</Button>}>
        <div className="compact-list">
          {orderRows.map((row, index) => {
            const item = existingItems[index] ?? (index === 0 ? previewItem : undefined);
            return <div className="builder-row" key={row}><select name={`productId-${index}`} defaultValue={item?.productId ?? ""} required><option value="" disabled>Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><select name={`recipeId-${index}`} defaultValue={item?.recipeId ?? ""} required><option value="" disabled>Select recipe</option>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</select><input name={`requestedYieldQuantity-${index}`} type="number" step="0.001" defaultValue={item?.requestedYieldQuantity ?? ""} placeholder="Yield" /><select name={`yieldUnit-${index}`} defaultValue={item?.yieldUnit ?? "pieces"}><option>pieces</option><option>cookies</option><option>loaves</option></select><input name={`quantityMultiplier-${index}`} type="number" step="0.001" defaultValue={item?.quantityMultiplier ?? 1} /></div>;
          })}
        </div>
      </Section>
      <div className="split">
        <Section title="Ingredient Requirement Preview"><div className="compact-list">{requirements.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}</span><strong>{item.scaledQuantity}{item.unit}</strong></div>)}</div></Section>
      <Section title="Stock Availability"><div className="compact-list">{availability.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}<small>Available {item.availableStock}</small></span><Badge tone={item.status === "shortage" ? "danger" : "success"}>{item.status.replace(/_/g, " ")}</Badge></div>)}</div></Section>
      </div>
      {availability.some((item) => item.shortageQuantity > 0) && <article className="warning-card"><AlertTriangle size={22} /> Some ingredients are short. You can still save this order, but production cannot be completed until stock is updated.</article>}
      <div className="metric-grid small"><Metric label="Estimated Production Cost" value={formatNaira(cost)} /><Metric label="Net Selling Price" value={formatNaira(netPrice)} /><Metric label="Estimated Gross Margin" value={`${margin.grossMarginPercentage.toFixed(1)}%`} /></div>
    </FormShell>
  );
}

function OrderDetail({ orderId, setPage, notify, askConfirm, reloadData }: { orderId: string; setPage: (page: Page) => void; notify: (message: string) => void; askConfirm: AskConfirm; reloadData: () => Promise<void> }) {
  const order = orders.find((item) => item.id === orderId);
  if (!order) return <EmptyState title="Order not found" message="Select an order from the live order list." />;
  const requirements = requirementsForOrder(orderId);
  const availability = checkOrderStockAvailability(orderId);
  const hasShortage = availability.some((item) => item.shortageQuantity > 0);
  const isFinal = ["Produced", "Delivered", "Cancelled"].includes(order.status);
  const canReserve = !["Produced", "Delivered", "Cancelled"].includes(order.status);
  const canStartProduction = !hasShortage && ["Confirmed", "Stock Reserved", "In Production"].includes(order.status);
  const canProduce = !hasShortage && ["Stock Reserved", "In Production"].includes(order.status);
  const canDeliver = order.status === "Produced";
  const cost = calculateOrderCost(orderId);
  return (
    <div className="detail-layout">
      <article className="detail-hero">
        <div>
          <p className="eyebrow">Order detail</p>
          <h2>{order.customerName}</h2>
          <p>{order.customerPhone} · {order.deliveryMethod} · due {order.dueDate}</p>
        </div>
        <div className="button-row">
          <Button variant="secondary" onClick={() => setPage("order-create")} disabled={isFinal}>Edit Order</Button>
          <Button onClick={async () => { const result = await apiAction("order.reserve", { orderId }); notify(result.partial ? `Partially reserved ${result.reservedLines.length} ingredient${result.reservedLines.length === 1 ? "" : "s"}; shortages remain.` : result.shortage ? "No additional stock could be reserved; shortages remain." : result.alreadyReserved ? "Stock is already fully reserved for this order." : "Stock reserved in Neon."); await reloadData(); }} disabled={!canReserve}>Reserve Stock</Button>
          <Button variant="secondary" onClick={async () => { await apiAction("order.status", { orderId, status: "In Production", productionStatus: "In Progress" }); notify("Order marked as in production."); await reloadData(); }} disabled={!canStartProduction}>Mark In Production</Button>
          <Button variant="secondary" onClick={async () => { await markOrderProduced(orderId, notify); await reloadData(); }} disabled={!canProduce}>Mark Produced</Button>
          <Button variant="ghost" onClick={async () => { await apiAction("order.status", { orderId, status: "Delivered", productionStatus: "Completed" }); notify("Order marked as delivered."); await reloadData(); }} disabled={!canDeliver}>Delivered</Button>
          <Button variant="secondary" onClick={async () => { await apiAction("order.status", { orderId, status: "Cancelled" }); notify("Order cancelled and reservations released."); await reloadData(); }} disabled={order.status === "Cancelled" || order.status === "Delivered"}>Cancel Order</Button>
          <Button variant="danger" onClick={() => askConfirm({ title: `Delete ${order.customerName}'s order?`, message: "This removes the order from active operations and releases any reservation. Ledger history is preserved.", confirmLabel: "Delete Order", tone: "danger", onConfirm: async () => { await apiAction("order.delete", { orderId }); notify("Order deleted from active list and reservation released."); await reloadData(); setPage("orders"); } })}>Delete Order</Button>
        </div>
      </article>
      {hasShortage && <article className="warning-card"><AlertTriangle size={22} /> Resolve ingredient shortages before reserving stock, starting production, or marking this order produced.</article>}
      <div className="split"><SummaryCard title="Customer Info" items={[["Name", order.customerName], ["Phone", order.customerPhone], ["Payment", order.paymentStatus], ["Notes", order.notes ?? "None"]]} /><SummaryCard title="Cost Summary" items={[["Production cost", formatNaira(cost)], ["Stock status", order.stockStatus], ["Production status", order.productionStatus], ["Order status", order.status]]} /></div>
      <Section title="Required Ingredients"><div className="compact-list">{requirements.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}</span><strong>{item.scaledQuantity}{item.unit}</strong></div>)}</div></Section>
      <Section title="Stock Check"><div className="compact-list">{availability.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}<small>Required {item.requiredQuantity}, available {item.availableStock}</small></span><Badge tone={item.shortageQuantity > 0 ? "danger" : "success"}>{item.shortageQuantity > 0 ? "Shortage" : "Enough Stock"}</Badge></div>)}</div></Section>
      <Section title="Timeline"><div className="timeline"><article><CheckCircle2 size={18} /><div><strong>Order confirmed</strong><small>May 18, 2026</small></div></article><article><AlertTriangle size={18} /><div><strong>Stock shortage detected</strong><small>Dark Chocolate and Eggs need restock</small></div></article></div></Section>
    </div>
  );
}

function Production({ setPage, setSelectedOrderId, notify, reloadData }: any) {
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
  return (
    <div className="page-grid">
      <article className="ai-card"><ChefHat size={24} /><div><h3>Batch production mode</h3><p>{groupedRecipe ? `Next batch: ${groupedRecipe.name}, ${topGroup?.totalYield} ${groupedRecipe.yieldUnit}, across ${topGroup?.orderIds.length} order${topGroup?.orderIds.length === 1 ? "" : "s"}.` : "Group similar recipes once orders are available."}</p></div><Button variant="secondary" onClick={() => notify(groupedRecipe ? `${groupedRecipe.name} batch is grouped for ${topGroup?.totalYield} ${groupedRecipe.yieldUnit}.` : "No recipes to group yet.")}>Group similar recipes</Button></article>
      <Section title="Grouped Batches">
        <div className="card-grid">
          {batches.map((batch) => {
            const recipe = recipes.find((item) => item.id === batch.recipeId);
            const batchRequirements = recipe ? scaleRecipe(recipe.id, batch.totalYield) : [];
            const availability = checkStockAvailability(batchRequirements);
            const hasShortage = availability.some((item) => item.shortageQuantity > 0);
            return (
              <article className="item-card" key={batch.key}>
                <div className="item-card-head"><ChefHat size={20} /><Badge tone={hasShortage ? "danger" : "success"}>{hasShortage ? "Shortage" : "Ready"}</Badge></div>
                <h3>{recipe?.name ?? "Recipe"}</h3>
                <p>{batch.totalYield} {recipe?.yieldUnit ?? "units"} · due {batch.dueDate}</p>
                <small>{batch.orderIds.length} order{batch.orderIds.length === 1 ? "" : "s"} · {batchRequirements.slice(0, 3).map((item) => `${item.ingredientName} ${item.scaledQuantity}${item.unit}`).join(", ")}</small>
                <div className="button-row">
                  <Button variant="secondary" onClick={() => notify(`${recipe?.name ?? "Batch"} requirements grouped for ${batch.orderIds.length} order${batch.orderIds.length === 1 ? "" : "s"}.`)}>Review Batch</Button>
                  <Button variant="secondary" onClick={async () => { await apiAction("production.batchStatus", { orderIds: batch.orderIds, status: "In Production", productionStatus: "In Progress" }); notify(`${recipe?.name ?? "Batch"} batch started.`); await reloadData(); }} disabled={hasShortage}>Start Batch</Button>
                  <Button onClick={async () => { await apiAction("production.batchStatus", { orderIds: batch.orderIds, status: "Produced", productionStatus: "Completed" }); notify(`${recipe?.name ?? "Batch"} batch completed and stock deducted.`); await reloadData(); }} disabled={hasShortage}>Complete Batch</Button>
                </div>
              </article>
            );
          })}
        </div>
      </Section>
      {["Today", "Tomorrow", "This Week"].map((bucket) => (
        <Section title={bucket} key={bucket}>
          <div className="card-grid">
            {orders.filter((order) => bucket === "This Week" || (bucket === "Today" && order.dueDate === new Date().toISOString().slice(0, 10)) || (bucket === "Tomorrow" && order.dueDate === new Date(Date.now() + 86400000).toISOString().slice(0, 10))).map((order) => {
              const hasShortage = hasShortageForOrder(order.id);
              const canStartProduction = !hasShortage && ["Confirmed", "Stock Reserved", "In Production"].includes(order.status);
              const canDeductInventory = !hasShortage && ["Stock Reserved", "In Production"].includes(order.status);
              return (
                <article className="item-card" key={order.id} onClick={() => { setSelectedOrderId(order.id); setPage("order-detail"); }}>
                  <div className="item-card-head"><ChefHat size={20} /><Badge tone={stockTone(hasShortage ? "Shortage" : order.stockStatus)}>{hasShortage ? "Shortage" : order.stockStatus}</Badge></div>
                  <h3>{orderItems.filter((item) => item.orderId === order.id).map((item) => products.find((product) => product.id === item.productId)?.name).join(", ")}</h3>
                  <p>{order.customerName} · due {order.dueDate}</p>
                  <small>Required: {requirementsForOrder(order.id).slice(0, 3).map((item) => `${item.ingredientName} ${item.scaledQuantity}${item.unit}`).join(", ")}</small>
                  <div className="button-row"><Button variant="secondary" onClick={async (event) => { event.stopPropagation(); await apiAction("order.status", { orderId: order.id, status: "In Production", productionStatus: "In Progress" }); notify("Production started for this order."); await reloadData(); }} disabled={!canStartProduction}>Start Production</Button><Button variant="secondary" onClick={(event) => { event.stopPropagation(); setSelectedOrderId(order.id); setPage("order-detail"); }}>View Scaled Recipe</Button><Button onClick={async (event) => { event.stopPropagation(); await markOrderProduced(order.id, notify); await reloadData(); }} disabled={!canDeductInventory}>Deduct Inventory</Button></div>
                </article>
              );
            })}
          </div>
        </Section>
      ))}
    </div>
  );
}

function ShoppingList({ notify, reloadData }: { notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const list = generateShoppingList();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [purchaseDrafts, setPurchaseDrafts] = useState<Record<string, { quantity: number; unitCost: number; note: string; expiryDate: string }>>({});
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
          quantity: item.suggestedBuyQuantity,
          unitCost: item.unitCost,
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
      const draft = purchaseDrafts[item.ingredientId] ?? { quantity: item.suggestedBuyQuantity, unitCost: item.unitCost, note: "", expiryDate: "" };
      return {
        ...item,
        purchaseQuantity: draft.quantity,
        unitCost: draft.unitCost,
        estimatedCost: draft.quantity * draft.unitCost,
        note: draft.note,
        expiryDate: draft.expiryDate
      };
    });
  const updateDraft = (ingredientId: string, patch: Partial<{ quantity: number; unitCost: number; note: string; expiryDate: string }>) => {
    setPurchaseDrafts((current) => ({ ...current, [ingredientId]: { ...(current[ingredientId] ?? { quantity: 0, unitCost: 0, note: "", expiryDate: "" }), ...patch } }));
  };
  const exportShoppingList = () => {
    const text = list.map((item) => {
      const draft = purchaseDrafts[item.ingredientId] ?? { quantity: item.suggestedBuyQuantity, unitCost: item.unitCost };
      return `${item.ingredientName}: buy ${draft.quantity}${item.unit} (${formatNaira(draft.quantity * draft.unitCost)})`;
    }).join("\n");
    downloadText("pastry-county-shopping-list.txt", text || "No shopping list items.");
    notify("Shopping list exported.");
  };
  const selectedCost = selectedItems.reduce((sum, item) => sum + item.estimatedCost, 0);
  return (
    <div className="page-grid">
      <div className="metric-grid small"><Metric label="Needed for Orders" value={list.filter((item) => item.requiredQuantity > 0).length} /><Metric label="Below Reorder Level" value={ingredients.filter((item) => item.currentStock <= item.reorderLevel).length} /><Metric label="Selected Cost" value={formatNaira(selectedCost)} /></div>
      <Section title="Suggested Purchases" action={<Button variant="secondary" onClick={() => shareText(list.map((item) => `${item.ingredientName}: ${item.suggestedBuyQuantity}${item.unit}`).join("\n"), notify)}>Send to WhatsApp</Button>}>
        <ResponsiveTable headers={["Buy", "Ingredient", "Available", "Needed", "Purchase Qty", "Unit Cost", "Expiry", "Cost", "Reason", "Supplier"]} rows={list.map((item) => {
          const draft = purchaseDrafts[item.ingredientId] ?? { quantity: item.suggestedBuyQuantity, unitCost: item.unitCost, note: "", expiryDate: "" };
          return {
            key: item.ingredientId,
            cells: [
              <input aria-label={`Purchase ${item.ingredientName}`} type="checkbox" checked={selectedIds.includes(item.ingredientId)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...new Set([...ids, item.ingredientId])] : ids.filter((id) => id !== item.ingredientId))} />,
              item.ingredientName,
              `${item.availableStock}${item.unit}`,
              `${item.requiredQuantity}${item.unit}`,
              <input aria-label={`${item.ingredientName} purchase quantity`} type="number" min="0.001" step="0.001" value={draft.quantity} onChange={(event) => updateDraft(item.ingredientId, { quantity: Number(event.target.value) })} />,
              <input aria-label={`${item.ingredientName} unit cost`} type="number" min="0" step="0.0001" value={draft.unitCost} onChange={(event) => updateDraft(item.ingredientId, { unitCost: Number(event.target.value) })} />,
              <input aria-label={`${item.ingredientName} expiry date`} type="date" value={draft.expiryDate} onChange={(event) => updateDraft(item.ingredientId, { expiryDate: event.target.value })} />,
              formatNaira(draft.quantity * draft.unitCost),
              <input aria-label={`${item.ingredientName} purchase note`} value={draft.note} onChange={(event) => updateDraft(item.ingredientId, { note: event.target.value })} />,
              item.supplier
            ]
          };
        })} />
      </Section>
      <div className="sticky-actions"><Button onClick={async () => { await apiAction("shopping.purchaseSuggested", { items: selectedItems }); notify(`${selectedItems.length} purchase${selectedItems.length === 1 ? "" : "s"} logged and inventory updated.`); await reloadData(); }} disabled={!selectedItems.length}>Mark Selected Purchased</Button><Button variant="secondary" onClick={() => setSelectedIds(list.map((item) => item.ingredientId))}>Select All</Button><Button variant="secondary" onClick={exportShoppingList}>Export/Share List</Button></div>
    </div>
  );
}

function Costing() {
  const [yieldQty, setYieldQty] = useState(12);
  const [selectedRecipeId, setSelectedRecipeId] = useState(recipes[0]?.id ?? "");
  const [sellingPrice, setSellingPrice] = useState(18000);
  const recipe = recipes.find((item) => item.id === selectedRecipeId) ?? recipes[0];
  if (!recipe) return <EmptyState title="No recipes available" message="Create a recipe in the database before using costing." />;
  const safeYieldQty = yieldQty > 0 ? yieldQty : recipe.baseYieldQuantity;
  const cost = calculateRecipeCost(recipe.id, safeYieldQty);
  const netPrice = netSellingPrice(sellingPrice);
  const margin = calculateMargin(netPrice, cost.totalRecipeCost);
  return (
    <div className="page-grid">
      <div className="split">
        <Section title="Recipe Cost Calculator"><div className="form-grid"><Field label="Recipe"><select value={recipe.id} onChange={(event) => { setSelectedRecipeId(event.target.value); const nextRecipe = recipes.find((item) => item.id === event.target.value); if (nextRecipe) setYieldQty(nextRecipe.baseYieldQuantity); }}>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</select></Field><Field label="Desired yield"><input type="number" min="0.001" step="0.001" value={yieldQty} onChange={(event) => setYieldQty(Number(event.target.value))} /></Field><Metric label="Ingredient cost" value={formatNaira(cost.totalRecipeCost)} /><Metric label={`Cost per ${recipe.yieldUnit}`} value={formatNaira(cost.costPerYieldUnit)} /></div></Section>
        <Section title="Margin Calculator"><div className="form-grid"><Field label="Selling price"><input type="number" min="0" step="0.01" value={sellingPrice} onChange={(event) => setSellingPrice(Number(event.target.value))} /></Field><Metric label="Tax setting" value={`${settings.defaultTaxPercentage ?? 0}%`} /><Metric label="Net selling price" value={formatNaira(netPrice)} /><Metric label="Gross profit" value={formatNaira(margin.grossProfit)} /><Metric label="Gross margin" value={`${margin.grossMarginPercentage.toFixed(1)}%`} /></div></Section>
      </div>
      <Section title="Cost Breakdown Chart"><div className="bar-chart">{cost.ingredientCostBreakdown.slice(0, 6).map((item) => <div key={item.ingredientId}><span>{item.ingredientName}</span><div><i style={{ width: `${cost.totalRecipeCost > 0 ? Math.min(100, (item.cost / cost.totalRecipeCost) * 220) : 0}%` }} /></div><strong>{formatNaira(item.cost)}</strong></div>)}</div></Section>
      <article className="warning-card"><AlertTriangle size={22} /> Costs are calculated from the selected recipe and latest ingredient unit costs.</article>
    </div>
  );
}

function AiAssistant({ setPage, notify, reloadData }: { setPage: (page: Page) => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
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
  return (
    <div className="ai-layout">
      <Section title="Suggested actions">
        <div className="chips wrap">
          {suggestions.map((chip) => <button key={chip.id} className={selectedId === chip.id ? "active" : ""} onClick={() => setSelectedId(chip.id)}>{chip.label}</button>)}
          <button onClick={() => setPage("shopping")}>What do I need to buy?</button>
          <button onClick={() => setPage("costing")}>Estimate recipe cost</button>
        </div>
      </Section>
      <div className="chat">
        <article className="message user">{selected.label}.</article>
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
          <div className="button-row">
            <Button onClick={() => notify(`${ingredient?.name ?? "Conversion"} result ready: ${Number(convertedQuantity.toFixed(1))}${selected.toUnit}.`)}>Use this conversion</Button>
            <Button variant="secondary" onClick={async () => { await apiAction("conversion.save", { rule: { id: savedRule?.id, ingredientId: selected.ingredientId, fromUnit: selected.fromUnit, toUnit: selected.toUnit, conversionFactor: factor, confidenceLevel: "High", source: "manual entry", verified: true } }); notify("Edited conversion saved to Neon."); await reloadData(); }}>Save edited value</Button>
            <Button variant="secondary" onClick={async () => { await apiAction("conversion.save", { rule: { id: savedRule?.id, ingredientId: selected.ingredientId, fromUnit: selected.fromUnit, toUnit: selected.toUnit, conversionFactor: factor, confidenceLevel: savedRule?.confidenceLevel ?? "Medium", source: savedRule?.source ?? "AI estimate", verified: Boolean(savedRule?.verified) } }); notify("Conversion rule saved to Neon for review."); await reloadData(); }}>Save conversion rule</Button>
          </div>
        </article>
      </div>
      <Section title="Recipe Parser Preview"><ResponsiveTable headers={["Ingredient", "Quantity", "Converted", "Confidence", "Review"]} rows={parsed.map((item) => ({ key: item.id, cells: [item.ingredientName, `${item.quantity} ${item.unit}`, `${item.convertedQuantity} ${item.convertedUnit}`, item.confidence, item.needsReview ? <Badge tone="warning">Needs review</Badge> : <Badge tone="success">Ready</Badge>] }))} /></Section>
      <Button variant="secondary" onClick={() => setPage("conversions")}><Wand2 size={18} /> Conversion Library</Button>
    </div>
  );
}

function ConversionLibrary({ notify, askConfirm, reloadData }: { notify: (message: string) => void; askConfirm: AskConfirm; reloadData: () => Promise<void> }) {
  const [editingRule, setEditingRule] = useState<Partial<ConversionRule> | null>(null);
  return (
    <div className="page-grid">
      {editingRule && <ConversionRuleForm rule={editingRule} onCancel={() => setEditingRule(null)} notify={notify} reloadData={reloadData} />}
      <Section title="Approved Conversion Rules" action={<Button onClick={() => setEditingRule({ ingredientId: ingredients[0]?.id, fromUnit: "cup", toUnit: ingredients[0]?.baseUnit ?? "g", conversionFactor: 1, confidenceLevel: "Medium", source: "manual entry", verified: false })}><Plus size={18} /> Add Conversion Rule</Button>}>
        <ResponsiveTable headers={["Ingredient", "From", "To", "Value", "Confidence", "Source", "Verified", "Actions"]} rows={conversionRules.map((rule) => ({ key: rule.id, cells: [ingredients.find((item) => item.id === rule.ingredientId)?.name, rule.fromUnit, rule.toUnit, `1 ${rule.fromUnit} = ${rule.conversionFactor}${rule.toUnit}`, rule.confidenceLevel, rule.source, rule.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Review</Badge>, <div className="button-row"><Button variant="secondary" onClick={() => setEditingRule(rule)}>Edit</Button><Button variant="secondary" onClick={async () => { await apiAction("conversion.verify", { ruleId: rule.id }); notify(`Verified ${rule.fromUnit} to ${rule.toUnit} conversion rule.`); await reloadData(); }}>Mark Verified</Button><Button variant="danger" onClick={() => askConfirm({ title: "Delete conversion rule?", message: `This removes the ${rule.fromUnit} to ${rule.toUnit} conversion rule from the approved library.`, confirmLabel: "Delete Rule", tone: "danger", onConfirm: async () => { await apiAction("conversion.delete", { ruleId: rule.id }); notify("Conversion rule deleted."); await reloadData(); } })}>Delete</Button></div>] }))} />
      </Section>
    </div>
  );
}

function ConversionRuleForm({ rule, onCancel, notify, reloadData }: { rule: Partial<ConversionRule>; onCancel: () => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const unitOptions: Unit[] = ["g", "kg", "ml", "litre", "pcs", "cup", "tablespoon", "teaspoon", "pack", "roll", "egg", "yolk", "white"];
  return (
    <form className="section" onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      await apiAction("conversion.save", {
        rule: {
          id: rule.id,
          ingredientId: formValue(form, "ingredientId"),
          fromUnit: formValue(form, "fromUnit"),
          toUnit: formValue(form, "toUnit"),
          conversionFactor: formNumber(form, "conversionFactor", 1),
          confidenceLevel: formValue(form, "confidenceLevel"),
          source: formValue(form, "source"),
          verified: formValue(form, "verified")
        }
      });
      notify("Conversion rule saved to Neon.");
      await reloadData();
      onCancel();
    }}>
      <div className="section-head"><h2>{rule.id ? "Edit Conversion Rule" : "Add Conversion Rule"}</h2><div className="button-row"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit">Save Rule</Button></div></div>
      <div className="form-grid">
        <Field label="Ingredient"><select name="ingredientId" defaultValue={rule.ingredientId} required>{ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}</select></Field>
        <Field label="From unit"><select name="fromUnit" defaultValue={rule.fromUnit ?? "cup"}>{unitOptions.map((unit) => <option key={unit}>{unit}</option>)}</select></Field>
        <Field label="To unit"><select name="toUnit" defaultValue={rule.toUnit ?? "g"}>{unitOptions.map((unit) => <option key={unit}>{unit}</option>)}</select></Field>
        <Field label="Conversion factor"><input name="conversionFactor" type="number" min="0.001" step="0.001" defaultValue={rule.conversionFactor ?? 1} required /></Field>
        <Field label="Confidence"><select name="confidenceLevel" defaultValue={rule.confidenceLevel ?? "Medium"}><option>Low</option><option>Medium</option><option>High</option></select></Field>
        <Field label="Source"><select name="source" defaultValue={rule.source ?? "manual entry"}><option>AI estimate</option><option>manual entry</option><option>measured in kitchen</option><option>seed rule</option></select></Field>
        <Field label="Verified"><select name="verified" defaultValue={rule.verified ? "Yes" : "No"}><option>Yes</option><option>No</option></select></Field>
      </div>
    </form>
  );
}

function Suppliers({ notify, askConfirm, reloadData }: { notify: (message: string) => void; askConfirm: AskConfirm; reloadData: () => Promise<void> }) {
  const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier> | null>(null);
  return (
    <div className="page-grid">
      {editingSupplier && <SupplierForm supplier={editingSupplier} notify={notify} reloadData={reloadData} onCancel={() => setEditingSupplier(null)} />}
      <Section title="Suppliers" action={<Button onClick={() => setEditingSupplier({ defaultCurrency: "NGN" })}><Plus size={18} /> Add Supplier</Button>}>
        <div className="card-grid">
          {suppliers.map((supplier) => <article className="item-card" key={supplier.id}><Truck size={22} /><h3>{supplier.name}</h3><p>{supplier.contactName || "No contact"} · {supplier.phone || "No phone"}</p><small>{(supplier.suppliedIngredientIds?.length ? supplier.suppliedIngredientIds : ingredients.filter((item) => item.supplierId === supplier.id).map((item) => item.id)).map((id) => ingredients.find((item) => item.id === id)?.name).filter(Boolean).slice(0, 6).join(", ") || "No linked ingredients"}</small><small>Lead time: {supplier.leadTimeDays ?? 2} day{supplier.leadTimeDays === 1 ? "" : "s"} · Currency: {supplier.defaultCurrency ?? "NGN"}</small><p>{supplier.notes}</p><div className="button-row"><Button variant="secondary" onClick={() => setEditingSupplier(supplier)}>Edit</Button><Button variant="danger" onClick={() => askConfirm({ title: `Delete supplier ${supplier.name}?`, message: "Ingredients from this supplier will remain in inventory, but their supplier will become unassigned.", confirmLabel: "Delete Supplier", tone: "danger", onConfirm: async () => { await apiAction("supplier.delete", { supplierId: supplier.id }); notify("Supplier deleted and ingredients unassigned."); await reloadData(); } })}>Delete</Button></div></article>)}
        </div>
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
      notify("Supplier saved to Neon.");
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
        <Field label="Default currency"><select name="defaultCurrency" defaultValue={supplier.defaultCurrency ?? "NGN"}><option value="NGN">Nigerian Naira</option></select></Field>
        <Field label="Lead time days"><input name="leadTimeDays" type="number" min="0" step="1" defaultValue={supplier.leadTimeDays ?? 2} /></Field>
        <Field label="Supplied items" helper="Hold Ctrl or Cmd to select multiple ingredients."><select name="suppliedIngredientIds" multiple defaultValue={supplier.suppliedIngredientIds ?? []}>{ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}</select></Field>
        <Field label="Notes"><textarea name="notes" defaultValue={supplier.notes ?? ""} placeholder="Lead time, preferred ordering channel, supplied items" /></Field>
      </div>
    </form>
  );
}

function SettingsPage({ setPage, notify, reloadData }: { setPage: (page: Page) => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const [archiveData, setArchiveData] = useState<Record<string, { id: string; name: string }[]> | null>(null);
  const loadArchive = async () => {
    const result = await apiAction("archive.list");
    setArchiveData(result as Record<string, { id: string; name: string }[]>);
  };
  useEffect(() => {
    loadArchive().catch(() => notify("Archive recovery could not be loaded."));
  }, []);
  const restoreArchive = async (entityType: string, entityId: string) => {
    await apiAction("archive.restore", { entityType, entityId });
    notify("Archived item restored.");
    await loadArchive();
    await reloadData();
  };
  return (
    <div className="page-grid">
      <div className="more-grid">
        {moreItems.map(([id, Icon, label]) => <button key={id} className="more-card" onClick={() => setPage(id as Page)}><Icon size={22} /><span>{label}</span></button>)}
      </div>
      <form onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        await apiAction("settings.save", {
          settings: {
            businessName: formValue(form, "businessName"),
            gramRoundingPreference: formNumber(form, "gramRoundingPreference", 5),
            eggRoundingPreference: formValue(form, "eggRoundingPreference"),
            defaultDeductionStage: formValue(form, "defaultDeductionStage"),
            allowNegativeInventory: formValue(form, "allowNegativeInventory"),
            requireAiConversionConfirmation: formValue(form, "requireAiConversionConfirmation"),
            safetyMarginPercentage: formNumber(form, "safetyMarginPercentage", 10),
            defaultTaxPercentage: formNumber(form, "defaultTaxPercentage", 0),
            lowStockNotificationEmail: formValue(form, "lowStockNotificationEmail")
          }
        });
        notify("Settings saved to Neon.");
        await reloadData();
      }}>
      <Section title="Business profile & defaults" action={<Button type="submit">Save Settings</Button>}>
        <div className="form-grid">
          <Field label="Business name"><input name="businessName" defaultValue={settings.businessName} /></Field>
          <Field label="Default currency"><select defaultValue="NGN"><option>Nigerian Naira</option></select></Field>
          <Field label="Round grams"><select name="gramRoundingPreference" defaultValue={settings.gramRoundingPreference}><option>1</option><option>5</option><option>10</option></select></Field>
          <Field label="Round eggs"><select name="eggRoundingPreference" defaultValue={settings.eggRoundingPreference}><option value="nearest_whole_egg">Nearest whole egg</option><option value="allow_gram_conversion">Allow gram conversion</option></select></Field>
          <Field label="Deduct inventory when"><select name="defaultDeductionStage" defaultValue={settings.defaultDeductionStage}><option value="confirmation">Order is confirmed</option><option value="production_start">Production starts</option><option value="production_completion">Production is completed</option></select></Field>
          <Field label="Allow negative inventory"><select name="allowNegativeInventory" defaultValue={settings.allowNegativeInventory ? "Yes" : "No"}><option>Yes</option><option>No</option></select></Field>
          <Field label="Require confirmation before AI conversions"><select name="requireAiConversionConfirmation" defaultValue={settings.requireAiConversionConfirmation ? "Yes" : "No"}><option>Yes</option><option>No</option></select></Field>
          <Field label="Purchase safety margin %"><input name="safetyMarginPercentage" type="number" min="0" step="0.1" defaultValue={settings.safetyMarginPercentage ?? 10} /></Field>
          <Field label="Default tax %"><input name="defaultTaxPercentage" type="number" min="0" step="0.1" defaultValue={settings.defaultTaxPercentage ?? 0} /></Field>
          <Field label="Low-stock notification email"><input name="lowStockNotificationEmail" type="email" defaultValue={settings.lowStockNotificationEmail ?? ""} placeholder="ops@example.com" /></Field>
          <Field label="User roles"><select defaultValue="Owner/Admin"><option>Owner/Admin</option><option>Baker</option><option>Inventory Manager</option><option>Viewer</option></select></Field>
        </div>
      </Section>
      </form>
      <Section title="Recovery & Audit" action={<Button variant="secondary" onClick={loadArchive}>Refresh Archive</Button>}>
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
                  <Button variant="secondary" onClick={() => restoreArchive(entityType, item.id)}>Restore</Button>
                </div>
              ))}
            </article>
          ))}
        </div>
        <div className="timeline">
          {(archiveData?.auditRows ?? auditLogs.slice(0, 8)).map((entry: any) => (
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

function ResponsiveTable({ headers, rows }: { headers: string[]; rows: { key: string; cells: React.ReactNode[]; onClick?: () => void }[] }) {
  const activateRow = (event: React.MouseEvent, onClick?: () => void) => {
    const target = event.target as HTMLElement;
    if (target.closest("button,input,select,textarea,a")) return;
    onClick?.();
  };
  return (
    <div className="responsive-table">
      {rows.length === 0 ? <p className="empty-note">No rows to show.</p> : <>
        <table><thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.key} onClick={(event) => activateRow(event, row.onClick)}>{row.cells.map((cell, index) => <td key={index} data-label={headers[index]}>{cell}</td>)}</tr>)}</tbody></table>
        <div className="mobile-table-cards">{rows.map((row) => <article key={row.key} className="item-card" onClick={(event) => activateRow(event, row.onClick)}>{row.cells.map((cell, index) => <div className="mobile-row" key={index}><span>{headers[index]}</span><strong>{cell}</strong></div>)}</article>)}</div>
      </>}
    </div>
  );
}

function SummaryCard({ title, items }: { title: string; items: [string, React.ReactNode][] }) {
  return <article className="summary-card"><h3>{title}</h3>{items.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</article>;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong></article>;
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <article className="section">
      <div className="section-head">
        <h2>{title}</h2>
      </div>
      <p>{message}</p>
    </article>
  );
}

function FormShell({ title, action, onDone, children, cancelTo, setPage }: { title: string; action: string; onDone: (form: HTMLFormElement) => void | Promise<void>; children: React.ReactNode; cancelTo: Page; setPage: (page: Page) => void }) {
  const [saving, setSaving] = useState(false);
  return (
    <form className="form-shell" onSubmit={async (event) => { event.preventDefault(); setSaving(true); try { await onDone(event.currentTarget); } catch (error) { alert(error instanceof Error ? error.message : "Unable to save."); } finally { setSaving(false); } }}>
      <div className="section-head"><h2>{title}</h2><div className="button-row"><Button variant="secondary" onClick={() => setPage(cancelTo)}>Cancel</Button><Button type="submit">{saving ? "Saving..." : action}</Button></div></div>
      {children}
      <div className="sticky-actions"><Button type="submit">{saving ? "Saving..." : action}</Button></div>
    </form>
  );
}

export default App;
