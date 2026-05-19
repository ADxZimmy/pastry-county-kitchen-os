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
import { conversionRules, ingredients, inventoryMovements, orderItems, orders, products, recipeItems, recipes, settings, suppliers, setKitchenSnapshot } from "./data";
import type { Ingredient, Order, Recipe, StockStatus } from "./types";
import {
  calculateMargin,
  calculateOrderCost,
  calculateRecipeCost,
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

function Button({ children, variant = "primary", onClick, type = "button" }: { children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger"; onClick?: React.MouseEventHandler<HTMLButtonElement>; type?: "button" | "submit" | "reset" }) {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick} type={type}>
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

type Notify = (message: string) => void;

function formValue(form: HTMLFormElement, name: string) {
  const value = new FormData(form).get(name);
  return value === null ? "" : String(value);
}

function formNumber(form: HTMLFormElement, name: string, fallback = 0) {
  const value = Number(formValue(form, name));
  return Number.isFinite(value) ? value : fallback;
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
  const [page, setPage] = useState<Page>(() => readSession().page ?? "welcome");
  const [selectedRecipeId, setSelectedRecipeId] = useState(() => readSession().selectedRecipeId ?? "");
  const [selectedIngredientId, setSelectedIngredientId] = useState(() => readSession().selectedIngredientId ?? "");
  const [selectedOrderId, setSelectedOrderId] = useState(() => readSession().selectedOrderId ?? "");
  const [query, setQuery] = useState("");
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
  const [dataError, setDataError] = useState("");
  const [dataVersion, setDataVersion] = useState(0);
  const [toast, setToast] = useState("");

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? "" : current)), 3600);
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
    window.localStorage.setItem("pastry-county-session", JSON.stringify({ page, selectedRecipeId, selectedIngredientId, selectedOrderId }));
    window.history.replaceState(null, "", `#${page}`);
  }, [page, selectedIngredientId, selectedOrderId, selectedRecipeId]);

  const navigate = (next: Page) => {
    if (next === "settings" && page !== "settings") {
      setPage("settings");
      return;
    }
    setPage(next);
  };

  const content = useMemo(() => {
    const props = { setPage: navigate, setSelectedRecipeId, setSelectedIngredientId, setSelectedOrderId, selectedRecipeId, selectedIngredientId, selectedOrderId, query, setQuery, notify, reloadData: () => loadKitchenData() };
    switch (page) {
      case "welcome":
        return <Welcome setPage={navigate} />;
      case "login":
        return <Login setPage={navigate} />;
      case "dashboard":
        return <Dashboard {...props} />;
      case "recipes":
        return <Recipes {...props} />;
      case "recipe-detail":
        return <RecipeDetail recipeId={selectedRecipeId} setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
      case "recipe-form":
        return <RecipeForm recipeId={selectedRecipeId} setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
      case "scaling":
        return <RecipeScaling recipeId={selectedRecipeId} setPage={navigate} notify={notify} />;
      case "inventory":
        return <Inventory {...props} />;
      case "ingredient-detail":
        return <IngredientDetail ingredientId={selectedIngredientId} setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
      case "ingredient-form":
        return <IngredientForm ingredientId={selectedIngredientId} setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
      case "orders":
        return <Orders {...props} />;
      case "order-create":
        return <CreateOrder orderId={selectedOrderId} setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
      case "order-detail":
        return <OrderDetail orderId={selectedOrderId} setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
      case "production":
        return <Production setPage={navigate} setSelectedOrderId={setSelectedOrderId} notify={notify} reloadData={() => loadKitchenData()} />;
      case "shopping":
        return <ShoppingList notify={notify} reloadData={() => loadKitchenData()} />;
      case "costing":
        return <Costing />;
      case "ai":
        return <AiAssistant setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
      case "conversions":
        return <ConversionLibrary notify={notify} reloadData={() => loadKitchenData()} />;
      case "suppliers":
        return <Suppliers notify={notify} reloadData={() => loadKitchenData()} />;
      case "settings":
        return <SettingsPage setPage={navigate} notify={notify} reloadData={() => loadKitchenData()} />;
    }
  }, [page, selectedIngredientId, selectedOrderId, selectedRecipeId, query, notify, loadKitchenData, dataVersion]);

  if (page === "welcome" || page === "login") return <>{content}</>;

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
          <Button variant="secondary" onClick={() => navigate("ai")}>
            <Bot size={18} /> Ask AI
          </Button>
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
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="auth-screen">
      <article className="auth-card">
        <BrandMark />
        <h1>Opening the kitchen</h1>
        <p>Loading live inventory, recipes, orders, and conversion rules from Postgres.</p>
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

function Login({ setPage }: { setPage: (page: Page) => void }) {
  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={(event) => { event.preventDefault(); setPage("dashboard"); }}>
        <BrandMark />
        <h1>Welcome back</h1>
        <p>Built for bakery teams that measure twice and bake once.</p>
        <Field label="Email">
          <input type="email" autoComplete="email" placeholder="owner@pastrycounty.ng" />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" placeholder="••••••••" />
        </Field>
        <Button type="submit">
          <LogIn size={18} /> Login
        </Button>
        <button type="button" className="text-link" onClick={() => alert("Password reset will be connected when team email delivery is configured.")}>Forgot password?</button>
      </form>
    </main>
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

function IngredientDetail({ ingredientId, setPage, notify, reloadData }: { ingredientId: string; setPage: (page: Page) => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const ingredient = ingredients.find((item) => item.id === ingredientId)!;
  if (!ingredient) return <EmptyState title="Ingredient not found" message="Select an ingredient from inventory." />;
  const supplier = suppliers.find((item) => item.id === ingredient.supplierId);
  const movements = inventoryMovements.filter((item) => item.ingredientId === ingredientId);
  return (
    <div className="detail-layout">
      <article className="detail-hero">
        <div>
          <p className="eyebrow">{ingredient.category}</p>
          <h2>{ingredient.name}</h2>
          <p>{ingredient.currentStock}{ingredient.baseUnit} in stock · reorder at {ingredient.reorderLevel}{ingredient.baseUnit}</p>
        </div>
        <div className="button-row">
          <Button onClick={async () => { await apiAction("inventory.adjust", { ingredientId, movementType: "purchase", quantityChange: 100, unit: ingredient.baseUnit, note: "Quick add stock from ingredient detail" }); notify(`Added 100${ingredient.baseUnit} to ${ingredient.name}.`); await reloadData(); }}><PackagePlus size={18} /> Add Stock</Button>
          <Button variant="secondary" onClick={async () => { await apiAction("inventory.adjust", { ingredientId, movementType: "adjustment", quantityChange: -1, unit: ingredient.baseUnit, note: "Quick adjustment from ingredient detail" }); notify(`Adjusted ${ingredient.name} by -1${ingredient.baseUnit}.`); await reloadData(); }}>Adjust Stock</Button>
          <Button variant="secondary" onClick={() => notify(`${ingredient.name} usage history is shown in the movement timeline below.`)}>View Usage</Button>
          <Button variant="ghost" onClick={() => setPage("ingredient-form")}>Edit {ingredient.name}</Button>
          <Button variant="danger" onClick={async () => { if (!window.confirm(`Archive ${ingredient.name}? It will disappear from active inventory but historical recipe/order records remain intact.`)) return; await apiAction("ingredient.delete", { ingredientId }); notify(`${ingredient.name} archived from active inventory.`); await reloadData(); setPage("inventory"); }}>Archive</Button>
        </div>
      </article>
      <div className="split">
        <SummaryCard title="Stock Summary" items={[["Current stock", `${ingredient.currentStock}${ingredient.baseUnit}`], ["Reserved stock", `${ingredient.reservedStock ?? 0}${ingredient.baseUnit}`], ["Available stock", `${ingredient.currentStock - (ingredient.reservedStock ?? 0)}${ingredient.baseUnit}`], ["Reorder level", `${ingredient.reorderLevel}${ingredient.baseUnit}`]]} />
        <SummaryCard title="Cost Summary" items={[["Last purchase price", `${formatNaira(ingredient.latestUnitCost)}/${ingredient.baseUnit}`], ["Supplier", supplier?.name ?? "Unassigned"], ["Expiry date", ingredient.expiryDate ?? "Not tracked"], ["Price trend", "18% increase placeholder"]]} />
      </div>
      <Section title="Stock Movement Timeline">
        <div className="timeline">
          {movements.map((movement) => (
            <article key={movement.id}>
              <Clock size={18} />
              <div>
                <strong>{movement.note}</strong>
                <small>{movement.movementType} · {new Date(movement.createdAt).toLocaleDateString()}</small>
              </div>
            </article>
          ))}
        </div>
      </Section>
    </div>
  );
}

function IngredientForm({ ingredientId, setPage, notify, reloadData }: { ingredientId: string; setPage: (page: Page) => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const ingredient = ingredients.find((item) => item.id === ingredientId);
  return (
    <FormShell title={ingredient ? "Edit Ingredient" : "Add Ingredient"} action="Save Ingredient" onDone={async (form) => {
      const supplierName = formValue(form, "supplierId");
      await apiAction("ingredient.save", {
        ingredient: {
          id: ingredient?.id,
          name: formValue(form, "name"),
          category: formValue(form, "category"),
          baseUnit: formValue(form, "baseUnit"),
          currentStock: formNumber(form, "currentStock"),
          reorderLevel: formNumber(form, "reorderLevel"),
          purchaseQuantity: formNumber(form, "purchaseQuantity"),
          purchaseUnit: formValue(form, "purchaseUnit"),
          purchasePrice: formNumber(form, "purchasePrice"),
          supplierId: supplierName || undefined,
          expiryTrackingEnabled: formValue(form, "expiryTrackingEnabled"),
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
        <Field label="Current stock"><input name="currentStock" type="number" step="0.001" defaultValue={ingredient?.currentStock ?? 0} placeholder="0" /></Field>
        <Field label="Reorder level"><input name="reorderLevel" type="number" step="0.001" defaultValue={ingredient?.reorderLevel ?? 0} placeholder="0" /></Field>
        <Field label="Purchase quantity"><input name="purchaseQuantity" type="number" step="0.001" placeholder="0" /></Field>
        <Field label="Purchase unit"><select name="purchaseUnit" defaultValue={ingredient?.baseUnit ?? "g"}><option>g</option><option>kg</option><option>ml</option><option>litre</option><option>pcs</option><option>pack</option><option>roll</option></select></Field>
        <Field label="Purchase price"><input name="purchasePrice" type="number" step="0.01" placeholder="0" /></Field>
        <Field label="Supplier"><select name="supplierId" defaultValue={ingredient?.supplierId ?? ""}><option value="">Unassigned</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
        <Field label="Expiry tracking"><select name="expiryTrackingEnabled" defaultValue={ingredient?.expiryTrackingEnabled ? "Yes" : "No"}><option>Yes</option><option>No</option></select></Field>
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

function RecipeDetail({ recipeId, setPage, notify, reloadData }: { recipeId: string; setPage: (page: Page) => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const recipe = recipes.find((item) => item.id === recipeId);
  if (!recipe) return <EmptyState title="Recipe not found" message="Select a recipe from the database-backed recipe library." />;
  const cost = calculateRecipeCost(recipeId, recipe.baseYieldQuantity);
  return (
    <div className="detail-layout">
      <article className="detail-hero">
        <div><p className="eyebrow">{recipe.category}</p><h2>{recipe.name}</h2><p>Base yield {recipe.baseYieldQuantity} {recipe.yieldUnit} · {formatNaira(cost.totalRecipeCost)} batch cost</p></div>
        <div className="button-row"><Button onClick={() => setPage("scaling")}><Scale size={18} /> Scale Recipe</Button><Button variant="secondary" onClick={() => setPage("recipe-form")}>Edit Recipe</Button><Button variant="secondary" onClick={() => setPage("order-create")}>Create Order</Button><Button variant="ghost" onClick={async () => { await apiAction("recipe.save", { recipe: { name: `${recipe.name} Copy`, category: recipe.category, baseYieldQuantity: recipe.baseYieldQuantity, yieldUnit: recipe.yieldUnit, notes: recipe.notes, instructions: recipe.instructions.join("\n"), items: recipeItems.filter((item) => item.recipeId === recipe.id) } }); notify("Recipe duplicated in Neon."); await reloadData(); setPage("recipes"); }}>Duplicate</Button><Button variant="danger" onClick={async () => { if (!window.confirm(`Archive ${recipe.name}? Linked order history stays intact.`)) return; await apiAction("recipe.delete", { recipeId }); notify(`${recipe.name} archived from active recipes.`); await reloadData(); setPage("recipes"); }}>Archive</Button></div>
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
    <FormShell title={recipe ? "Edit Recipe" : "Add Recipe"} action="Save Recipe" onDone={async (form) => {
      const items = builderRows.map((_, index) => ({
        ingredientId: formValue(form, `ingredientId-${index}`),
        quantity: formNumber(form, `quantity-${index}`),
        unit: formValue(form, `unit-${index}`),
        wastePercentage: formNumber(form, `wastePercentage-${index}`)
      }));
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
      <Section title="AI helper"><div className="button-row"><Button variant="secondary" onClick={() => notify("Paste-to-structure helper is available from the AI Assistant page.")}><Bot size={18} /> Paste recipe and let AI structure it</Button><Button variant="secondary" onClick={() => notify("Conversion helper is available from the AI Assistant page.")}><Wand2 size={18} /> Convert cups/spoons to grams</Button></div></Section>
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
  const margin = calculateMargin(18000, cost);
  const previewItem = orderItems.find((item) => item.orderId === previewOrderId);
  return (
    <FormShell title={order ? "Edit Order" : "Create Order"} action="Confirm and Reserve Stock" onDone={async (form) => {
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
      <div className="metric-grid small"><Metric label="Estimated Production Cost" value={formatNaira(cost)} /><Metric label="Estimated Gross Margin" value={`${margin.grossMarginPercentage.toFixed(1)}%`} /></div>
    </FormShell>
  );
}

function OrderDetail({ orderId, setPage, notify, reloadData }: { orderId: string; setPage: (page: Page) => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const order = orders.find((item) => item.id === orderId);
  if (!order) return <EmptyState title="Order not found" message="Select an order from the live order list." />;
  const requirements = requirementsForOrder(orderId);
  const availability = checkStockAvailability(requirements);
  const cost = calculateOrderCost(orderId);
  return (
    <div className="detail-layout">
      <article className="detail-hero"><div><p className="eyebrow">Order detail</p><h2>{order.customerName}</h2><p>{order.customerPhone} · {order.deliveryMethod} · due {order.dueDate}</p></div><div className="button-row"><Button variant="secondary" onClick={() => setPage("order-create")}>Edit Order</Button><Button onClick={async () => { const result = await apiAction("order.reserve", { orderId }); notify(result.shortage ? "Stock is short. Reservation was not created." : result.alreadyReserved ? "Stock is already reserved for this order." : "Stock reserved in Neon."); await reloadData(); }}>Reserve Stock</Button><Button variant="secondary" onClick={async () => { await apiAction("order.status", { orderId, status: "In Production", productionStatus: "In Progress" }); notify("Order marked as in production."); await reloadData(); }}>Mark In Production</Button><Button variant="secondary" onClick={async () => { await markOrderProduced(orderId, notify); await reloadData(); }}>Mark Produced</Button><Button variant="ghost" onClick={async () => { await apiAction("order.status", { orderId, status: "Delivered", productionStatus: "Completed" }); notify("Order marked as delivered."); await reloadData(); }}>Delivered</Button><Button variant="secondary" onClick={async () => { await apiAction("order.status", { orderId, status: "Cancelled" }); notify("Order cancelled and reservations released."); await reloadData(); }}>Cancel Order</Button><Button variant="danger" onClick={async () => { if (!window.confirm(`Delete ${order.customerName}'s order from active operations? Ledger history will be preserved.`)) return; await apiAction("order.delete", { orderId }); notify("Order deleted from active list and reservation released."); await reloadData(); setPage("orders"); }}>Delete Order</Button></div></article>
      <div className="split"><SummaryCard title="Customer Info" items={[["Name", order.customerName], ["Phone", order.customerPhone], ["Payment", order.paymentStatus], ["Notes", order.notes ?? "None"]]} /><SummaryCard title="Cost Summary" items={[["Production cost", formatNaira(cost)], ["Stock status", order.stockStatus], ["Production status", order.productionStatus], ["Order status", order.status]]} /></div>
      <Section title="Required Ingredients"><div className="compact-list">{requirements.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}</span><strong>{item.scaledQuantity}{item.unit}</strong></div>)}</div></Section>
      <Section title="Stock Check"><div className="compact-list">{availability.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}<small>Required {item.requiredQuantity}, available {item.availableStock}</small></span><Badge tone={item.shortageQuantity > 0 ? "danger" : "success"}>{item.shortageQuantity > 0 ? "Shortage" : "Enough Stock"}</Badge></div>)}</div></Section>
      <Section title="Timeline"><div className="timeline"><article><CheckCircle2 size={18} /><div><strong>Order confirmed</strong><small>May 18, 2026</small></div></article><article><AlertTriangle size={18} /><div><strong>Stock shortage detected</strong><small>Dark Chocolate and Eggs need restock</small></div></article></div></Section>
    </div>
  );
}

function Production({ setPage, setSelectedOrderId, notify, reloadData }: any) {
  const grouped = orderItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.recipeId] = (acc[item.recipeId] ?? 0) + item.requestedYieldQuantity;
    return acc;
  }, {});
  const topGroup = Object.entries(grouped).sort((a, b) => b[1] - a[1])[0];
  const groupedRecipe = recipes.find((recipe) => recipe.id === topGroup?.[0]);
  return (
    <div className="page-grid">
      <article className="ai-card"><ChefHat size={24} /><div><h3>Batch production mode</h3><p>{groupedRecipe ? `Group similar recipes: total ${groupedRecipe.name} needed is ${topGroup?.[1]} ${groupedRecipe.yieldUnit}.` : "Group similar recipes once orders are available."}</p></div><Button variant="secondary" onClick={() => notify(groupedRecipe ? `${groupedRecipe.name} is grouped for ${topGroup?.[1]} ${groupedRecipe.yieldUnit}.` : "No recipes to group yet.")}>Group similar recipes</Button></article>
      {["Today", "Tomorrow", "This Week"].map((bucket) => (
        <Section title={bucket} key={bucket}>
          <div className="card-grid">
            {orders.filter((order) => bucket === "This Week" || (bucket === "Today" && order.dueDate === new Date().toISOString().slice(0, 10)) || (bucket === "Tomorrow" && order.dueDate === new Date(Date.now() + 86400000).toISOString().slice(0, 10))).map((order) => (
              <article className="item-card" key={order.id} onClick={() => { setSelectedOrderId(order.id); setPage("order-detail"); }}>
                <div className="item-card-head"><ChefHat size={20} /><Badge tone={stockTone(order.stockStatus)}>{order.stockStatus}</Badge></div>
                <h3>{orderItems.filter((item) => item.orderId === order.id).map((item) => products.find((product) => product.id === item.productId)?.name).join(", ")}</h3>
                <p>{order.customerName} · due {order.dueDate}</p>
                <small>Required: {requirementsForOrder(order.id).slice(0, 3).map((item) => `${item.ingredientName} ${item.scaledQuantity}${item.unit}`).join(", ")}</small>
                <div className="button-row"><Button variant="secondary" onClick={async (event) => { event.stopPropagation(); await apiAction("order.status", { orderId: order.id, status: "In Production", productionStatus: "In Progress" }); notify("Production started for this order."); await reloadData(); }}>Start Production</Button><Button variant="secondary" onClick={(event) => { event.stopPropagation(); setSelectedOrderId(order.id); setPage("order-detail"); }}>View Scaled Recipe</Button><Button onClick={async (event) => { event.stopPropagation(); await markOrderProduced(order.id, notify); await reloadData(); }}>Deduct Inventory</Button></div>
              </article>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

function ShoppingList({ notify, reloadData }: { notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const list = generateShoppingList();
  const exportShoppingList = () => {
    const text = list.map((item) => `${item.ingredientName}: buy ${item.suggestedBuyQuantity}${item.unit} (${formatNaira(item.estimatedCost)})`).join("\n");
    downloadText("pastry-county-shopping-list.txt", text || "No shopping list items.");
    notify("Shopping list exported.");
  };
  return (
    <div className="page-grid">
      <div className="metric-grid small"><Metric label="Needed for Orders" value={list.filter((item) => item.requiredQuantity > 0).length} /><Metric label="Below Reorder Level" value={ingredients.filter((item) => item.currentStock <= item.reorderLevel).length} /><Metric label="Estimated Cost" value={formatNaira(list.reduce((sum, item) => sum + item.estimatedCost, 0))} /></div>
      <Section title="Suggested Purchases" action={<Button variant="secondary" onClick={() => shareText(list.map((item) => `${item.ingredientName}: ${item.suggestedBuyQuantity}${item.unit}`).join("\n"), notify)}>Send to WhatsApp</Button>}>
        <ResponsiveTable headers={["Buy", "Ingredient", "Current", "Needed", "Shortage", "Suggested", "Cost", "Supplier"]} rows={list.map((item) => ({ key: item.ingredientId, cells: [<input type="checkbox" />, item.ingredientName, `${item.currentStock}${item.unit}`, `${item.requiredQuantity}${item.unit}`, `${item.shortageQuantity}${item.unit}`, `${item.suggestedBuyQuantity}${item.unit}`, formatNaira(item.estimatedCost), item.supplier] }))} />
      </Section>
      <div className="sticky-actions"><Button onClick={async () => { await apiAction("shopping.purchaseSuggested", { items: list }); notify("Shopping list purchased and stock updated in Neon."); await reloadData(); }}>Mark as Purchased</Button><Button variant="secondary" onClick={async () => { await apiAction("shopping.purchaseSuggested", { items: list.slice(0, 1) }); notify("Purchase cost logged for the first suggested item."); await reloadData(); }}>Add Purchase Cost</Button><Button variant="secondary" onClick={exportShoppingList}>Export/Share List</Button></div>
    </div>
  );
}

function Costing() {
  const [yieldQty, setYieldQty] = useState(12);
  const recipe = recipes[0];
  if (!recipe) return <EmptyState title="No recipes available" message="Create a recipe in the database before using costing." />;
  const cost = calculateRecipeCost(recipe.id, yieldQty);
  const margin = calculateMargin(18000, cost.totalRecipeCost);
  return (
    <div className="page-grid">
      <div className="split">
        <Section title="Recipe Cost Calculator"><div className="form-grid"><Field label="Recipe"><select defaultValue={recipe.id}>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</select></Field><Field label="Desired yield"><input type="number" value={yieldQty} onChange={(event) => setYieldQty(Number(event.target.value))} /></Field><Metric label="Ingredient cost" value={formatNaira(cost.totalRecipeCost)} /><Metric label="Cost per piece" value={formatNaira(cost.costPerYieldUnit)} /></div></Section>
        <Section title="Margin Calculator"><div className="form-grid"><Field label="Selling price"><input type="number" defaultValue="18000" /></Field><Metric label="Gross profit" value={formatNaira(margin.grossProfit)} /><Metric label="Gross margin" value={`${margin.grossMarginPercentage.toFixed(1)}%`} /></div></Section>
      </div>
      <Section title="Cost Breakdown Chart"><div className="bar-chart">{cost.ingredientCostBreakdown.slice(0, 6).map((item) => <div key={item.ingredientId}><span>{item.ingredientName}</span><div><i style={{ width: `${Math.min(100, (item.cost / cost.totalRecipeCost) * 220)}%` }} /></div><strong>{formatNaira(item.cost)}</strong></div>)}</div></Section>
      <article className="warning-card"><AlertTriangle size={22} /> Dark Chocolate cost increased by 18% since last purchase.</article>
    </div>
  );
}

function AiAssistant({ setPage, notify, reloadData }: { setPage: (page: Page) => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
  const flour = convertUnit(4, "cup", "g", "flour");
  const egg = convertUnit(4, "egg", "g", "eggs");
  const yolk = convertUnit(2, "yolk", "g", "egg-yolks");
  const parsed = parseRecipeText("2 cups flour\n1 cup sugar\n4 eggs\n1/2 cup cocoa powder\n1 cup coconut oil");
  return (
    <div className="ai-layout">
      <Section title="Suggested actions">
        <div className="chips wrap">{["Convert 4 cups flour to grams", "Convert 3 egg yolks to grams", "Scale this recipe to 24 pieces", "Paste a recipe and clean it up", "What do I need to buy for this weekend's orders?", "Estimate cost for 12 brownies"].map((chip) => <button key={chip} onClick={() => notify(`Loaded prompt: ${chip}`)}>{chip}</button>)}</div>
      </Section>
      <div className="chat">
        <article className="message user">Convert 4 cups of flour to grams.</article>
        <article className="message ai"><h3>Ingredient Conversion</h3><SummaryCard title="AI response card" items={[["Ingredient", "Flour"], ["Measurement", "4 cups"], ["Estimated conversion", `${flour.convertedQuantity}g`], ["Confidence", flour.confidenceLevel], ["Note", "Cup-to-gram conversions depend on how the flour is measured. Confirm before saving."]]} /><div className="button-row"><Button onClick={() => notify("Conversion applied to the current recipe draft.")}>Use this conversion</Button><Button variant="secondary" onClick={async () => { const value = window.prompt("Grams for 1 cup flour", "120"); if (value) { await apiAction("conversion.save", { rule: { ingredientId: "flour", fromUnit: "cup", toUnit: "g", conversionFactor: Number(value), confidenceLevel: "High", source: "manual entry", verified: true } }); notify("Edited conversion saved to Neon."); await reloadData(); } }}>Edit value</Button><Button variant="secondary" onClick={async () => { await apiAction("conversion.save", { rule: { ingredientId: "flour", fromUnit: "cup", toUnit: "g", conversionFactor: 120, confidenceLevel: "Medium", source: "AI estimate", verified: false } }); notify("Conversion rule saved to Neon for review."); await reloadData(); }}>Save conversion rule</Button></div></article>
        <article className="message user">Convert 4 eggs and 2 yolks to grams.</article>
        <article className="message ai"><h3>Egg estimate</h3><p>1 large egg approx. 50g without shell. 1 yolk approx. 18g. 4 eggs = {egg.convertedQuantity}g. 2 yolks = {yolk.convertedQuantity}g. Total = {egg.convertedQuantity + yolk.convertedQuantity}g.</p><div className="button-row"><Button onClick={() => notify("Egg estimate applied to the current recipe draft.")}>Use estimate</Button><Button variant="secondary" onClick={async () => { const value = window.prompt("Grams for 1 large egg", "50"); if (value) { await apiAction("conversion.save", { rule: { ingredientId: "eggs", fromUnit: "egg", toUnit: "g", conversionFactor: Number(value), confidenceLevel: "High", source: "manual entry", verified: true } }); notify("Egg estimate edited and saved."); await reloadData(); } }}>Edit</Button><Button variant="secondary" onClick={async () => { await apiAction("conversion.save", { rule: { ingredientId: "eggs", fromUnit: "egg", toUnit: "g", conversionFactor: 50, confidenceLevel: "High", source: "measured in kitchen", verified: true } }); notify("Egg conversion default saved to Neon."); await reloadData(); }}>Save as default</Button></div></article>
      </div>
      <Section title="Recipe Parser Preview"><ResponsiveTable headers={["Ingredient", "Quantity", "Converted", "Confidence", "Review"]} rows={parsed.map((item) => ({ key: item.id, cells: [item.ingredientName, `${item.quantity} ${item.unit}`, `${item.convertedQuantity} ${item.convertedUnit}`, item.confidence, item.needsReview ? <Badge tone="warning">Needs review</Badge> : <Badge tone="success">Ready</Badge>] }))} /></Section>
      <Button variant="secondary" onClick={() => setPage("conversions")}><Wand2 size={18} /> Conversion Library</Button>
    </div>
  );
}

function ConversionLibrary({ notify, reloadData }: { notify: (message: string) => void; reloadData: () => Promise<void> }) {
  return (
    <Section title="Approved Conversion Rules" action={<Button onClick={async () => { const factor = window.prompt("Conversion value for 1 cup flour to grams", "120"); if (factor) { await apiAction("conversion.save", { rule: { ingredientId: ingredients[0]?.id, fromUnit: "cup", toUnit: ingredients[0]?.baseUnit ?? "g", conversionFactor: Number(factor), confidenceLevel: "Medium", source: "manual entry", verified: false } }); notify("Conversion rule added to Neon."); await reloadData(); } }}><Plus size={18} /> Add Conversion Rule</Button>}>
      <ResponsiveTable headers={["Ingredient", "From", "To", "Value", "Confidence", "Source", "Verified", "Actions"]} rows={conversionRules.map((rule) => ({ key: rule.id, cells: [ingredients.find((item) => item.id === rule.ingredientId)?.name, rule.fromUnit, rule.toUnit, `1 ${rule.fromUnit} = ${rule.conversionFactor}${rule.toUnit}`, rule.confidenceLevel, rule.source, rule.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Review</Badge>, <div className="button-row"><Button variant="secondary" onClick={async () => { await apiAction("conversion.verify", { ruleId: rule.id }); notify(`Verified ${rule.fromUnit} to ${rule.toUnit} conversion rule.`); await reloadData(); }}>Mark Verified</Button><Button variant="danger" onClick={async () => { if (!window.confirm(`Delete this ${rule.fromUnit} to ${rule.toUnit} conversion rule?`)) return; await apiAction("conversion.delete", { ruleId: rule.id }); notify("Conversion rule deleted."); await reloadData(); }}>Delete</Button></div>] }))} />
    </Section>
  );
}

function Suppliers({ notify, reloadData }: { notify: (message: string) => void; reloadData: () => Promise<void> }) {
  return (
    <Section title="Suppliers" action={<Button onClick={async () => { const name = window.prompt("Supplier name"); if (name) { await apiAction("supplier.save", { supplier: { name, contactName: "New contact", phone: "", email: "", address: "", notes: "Added from supplier screen" } }); notify("Supplier saved to Neon."); await reloadData(); } }}><Plus size={18} /> Add Supplier</Button>}>
      <div className="card-grid">
        {suppliers.map((supplier) => <article className="item-card" key={supplier.id}><Truck size={22} /><h3>{supplier.name}</h3><p>{supplier.contactName} · {supplier.phone}</p><small>{ingredients.filter((item) => item.supplierId === supplier.id).map((item) => item.name).slice(0, 5).join(", ")}</small><small>Last purchase: May 12, 2026</small><p>{supplier.notes}</p><div className="button-row"><Button variant="secondary" onClick={async () => { const name = window.prompt("Supplier name", supplier.name); if (name) { await apiAction("supplier.save", { supplier: { id: supplier.id, name, contactName: supplier.contactName, phone: supplier.phone, email: supplier.email, address: supplier.address, notes: supplier.notes } }); notify("Supplier updated."); await reloadData(); } }}>Edit</Button><Button variant="danger" onClick={async () => { if (!window.confirm(`Delete supplier ${supplier.name}? Ingredients will become unassigned.`)) return; await apiAction("supplier.delete", { supplierId: supplier.id }); notify("Supplier deleted and ingredients unassigned."); await reloadData(); }}>Delete</Button></div></article>)}
      </div>
    </Section>
  );
}

function SettingsPage({ setPage, notify, reloadData }: { setPage: (page: Page) => void; notify: (message: string) => void; reloadData: () => Promise<void> }) {
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
            requireAiConversionConfirmation: formValue(form, "requireAiConversionConfirmation")
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
          <Field label="User roles"><select defaultValue="Owner/Admin"><option>Owner/Admin</option><option>Baker</option><option>Inventory Manager</option><option>Viewer</option></select></Field>
        </div>
      </Section>
      </form>
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
  return (
    <div className="responsive-table">
      <table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.key} onClick={row.onClick}>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table>
      <div className="mobile-table-cards">{rows.map((row) => <article key={row.key} className="item-card" onClick={row.onClick}>{row.cells.map((cell, index) => <div className="mobile-row" key={index}><span>{headers[index]}</span><strong>{cell}</strong></div>)}</article>)}</div>
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

function FormShell({ title, action, onDone, children }: { title: string; action: string; onDone: (form: HTMLFormElement) => void | Promise<void>; children: React.ReactNode }) {
  const [saving, setSaving] = useState(false);
  return (
    <form className="form-shell" onSubmit={async (event) => { event.preventDefault(); setSaving(true); try { await onDone(event.currentTarget); } catch (error) { alert(error instanceof Error ? error.message : "Unable to save."); } finally { setSaving(false); } }}>
      <div className="section-head"><h2>{title}</h2><div className="button-row"><Button variant="secondary" onClick={() => window.history.back()}>Cancel</Button><Button type="submit">{saving ? "Saving..." : action}</Button></div></div>
      {children}
      <div className="sticky-actions"><Button type="submit">{saving ? "Saving..." : action}</Button></div>
    </form>
  );
}

export default App;
