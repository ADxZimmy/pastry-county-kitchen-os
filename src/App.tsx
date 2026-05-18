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
import { useEffect, useMemo, useState } from "react";
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

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "caramel" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Button({ children, variant = "primary", onClick }: { children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger"; onClick?: () => void }) {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick}>
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

function App() {
  const [page, setPage] = useState<Page>("welcome");
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [query, setQuery] = useState("");
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadKitchenData() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/bootstrap`);
        if (!response.ok) throw new Error(`Kitchen API returned ${response.status}`);
        const snapshot = await response.json();
        if (!cancelled) {
          setKitchenSnapshot(snapshot);
          setSelectedRecipeId(snapshot.recipes[0]?.id ?? "");
          setSelectedIngredientId(snapshot.ingredients[0]?.id ?? "");
          setSelectedOrderId(snapshot.orders[0]?.id ?? "");
          setDataStatus("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setDataError(error instanceof Error ? error.message : "Unable to load kitchen data");
          setDataStatus("error");
        }
      }
    }
    loadKitchenData();
    return () => {
      cancelled = true;
    };
  }, []);

  const navigate = (next: Page) => {
    if (next === "settings" && page !== "settings") {
      setPage("settings");
      return;
    }
    setPage(next);
  };

  const content = useMemo(() => {
    const props = { setPage: navigate, setSelectedRecipeId, setSelectedIngredientId, setSelectedOrderId, query, setQuery };
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
        return <RecipeDetail recipeId={selectedRecipeId} setPage={navigate} />;
      case "recipe-form":
        return <RecipeForm setPage={navigate} />;
      case "scaling":
        return <RecipeScaling recipeId={selectedRecipeId} setPage={navigate} />;
      case "inventory":
        return <Inventory {...props} />;
      case "ingredient-detail":
        return <IngredientDetail ingredientId={selectedIngredientId} setPage={navigate} />;
      case "ingredient-form":
        return <IngredientForm setPage={navigate} />;
      case "orders":
        return <Orders {...props} />;
      case "order-create":
        return <CreateOrder setPage={navigate} />;
      case "order-detail":
        return <OrderDetail orderId={selectedOrderId} setPage={navigate} />;
      case "production":
        return <Production setPage={navigate} setSelectedOrderId={setSelectedOrderId} />;
      case "shopping":
        return <ShoppingList />;
      case "costing":
        return <Costing />;
      case "ai":
        return <AiAssistant setPage={navigate} />;
      case "conversions":
        return <ConversionLibrary />;
      case "suppliers":
        return <Suppliers />;
      case "settings":
        return <SettingsPage setPage={navigate} />;
    }
  }, [page, selectedIngredientId, selectedOrderId, selectedRecipeId, query]);

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
        <Button>
          <LogIn size={18} /> Login
        </Button>
        <button type="button" className="text-link">Forgot password?</button>
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
      <Toolbar query={query} setQuery={setQuery} placeholder="Search ingredients" action={<Button onClick={() => setPage("ingredient-form")}><Plus size={18} /> Add Ingredient</Button>} />
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

function IngredientDetail({ ingredientId, setPage }: { ingredientId: string; setPage: (page: Page) => void }) {
  const ingredient = ingredients.find((item) => item.id === ingredientId)!;
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
          <Button><PackagePlus size={18} /> Add Stock</Button>
          <Button variant="secondary">Adjust Stock</Button>
          <Button variant="secondary">View Usage</Button>
          <Button variant="ghost" onClick={() => setPage("ingredient-form")}>Edit</Button>
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

function IngredientForm({ setPage }: { setPage: (page: Page) => void }) {
  return (
    <FormShell title="Add Ingredient" action="Save Ingredient" onDone={() => setPage("inventory")}>
      <div className="form-grid">
        <Field label="Ingredient name"><input placeholder="Ingredient name" /></Field>
        <Field label="Category"><select defaultValue=""><option value="" disabled>Select category</option><option>Dry Goods</option><option>Dairy</option><option>Chocolate</option><option>Fruits</option><option>Packaging</option></select></Field>
        <Field label="Base unit" helper="Use one consistent storage unit for calculations."><select defaultValue="g"><option>g</option><option>kg</option><option>ml</option><option>litre</option><option>pcs</option><option>pack</option><option>roll</option></select></Field>
        <Field label="Current stock"><input type="number" placeholder="0" /></Field>
        <Field label="Reorder level"><input type="number" placeholder="0" /></Field>
        <Field label="Purchase quantity"><input type="number" placeholder="0" /></Field>
        <Field label="Purchase unit"><select defaultValue="g"><option>g</option><option>kg</option><option>ml</option><option>litre</option><option>pcs</option><option>pack</option><option>roll</option></select></Field>
        <Field label="Purchase price"><input type="number" placeholder="0" /></Field>
        <Field label="Supplier"><select defaultValue=""><option value="" disabled>Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id}>{supplier.name}</option>)}</select></Field>
        <Field label="Expiry tracking"><select defaultValue="No"><option>Yes</option><option>No</option></select></Field>
        <Field label="Notes"><textarea placeholder="Storage notes, preferred brands, or supplier details" /></Field>
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
      <Toolbar query={query} setQuery={setQuery} placeholder="Search recipes" action={<Button onClick={() => setPage("recipe-form")}><Plus size={18} /> Add Recipe</Button>} />
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
              <Button variant="secondary" onClick={() => { setSelectedRecipeId(recipe.id); setPage("scaling"); }}><Scale size={18} /> Scale Recipe</Button>
            </article>
          );
        })}
      </div>
    </>
  );
}

function RecipeDetail({ recipeId, setPage }: { recipeId: string; setPage: (page: Page) => void }) {
  const recipe = recipes.find((item) => item.id === recipeId);
  if (!recipe) return <EmptyState title="Recipe not found" message="Select a recipe from the database-backed recipe library." />;
  const cost = calculateRecipeCost(recipeId, recipe.baseYieldQuantity);
  return (
    <div className="detail-layout">
      <article className="detail-hero">
        <div><p className="eyebrow">{recipe.category}</p><h2>{recipe.name}</h2><p>Base yield {recipe.baseYieldQuantity} {recipe.yieldUnit} · {formatNaira(cost.totalRecipeCost)} batch cost</p></div>
        <div className="button-row"><Button onClick={() => setPage("scaling")}><Scale size={18} /> Scale Recipe</Button><Button variant="secondary" onClick={() => setPage("recipe-form")}>Edit Recipe</Button><Button variant="secondary" onClick={() => setPage("order-create")}>Create Order</Button><Button variant="ghost">Duplicate</Button></div>
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

function RecipeForm({ setPage }: { setPage: (page: Page) => void }) {
  return (
    <FormShell title="Add Recipe" action="Save Recipe" onDone={() => setPage("recipes")}>
      <Section title="Product information"><div className="form-grid"><Field label="Product name"><input placeholder="Product name" /></Field><Field label="Category"><select defaultValue=""><option value="" disabled>Select category</option><option>Brownies</option><option>Blondies</option><option>Cookies</option><option>Loaves</option><option>Cakes</option></select></Field><Field label="Batch notes"><textarea placeholder="Cooling, cutting, baking, or packaging notes" /></Field></div></Section>
      <Section title="Yield information"><div className="form-grid two"><Field label="Base yield quantity"><input type="number" placeholder="0" /></Field><Field label="Yield unit"><select defaultValue="pieces"><option>pieces</option><option>cookies</option><option>loaves</option><option>boxes</option><option>trays</option></select></Field></div></Section>
      <Section title="Ingredients" action={<Button variant="secondary"><Plus size={18} /> Add Ingredient</Button>}>
        <div className="compact-list">
          <div className="builder-row"><select defaultValue=""><option value="" disabled>Select ingredient</option>{ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}</select><input type="number" placeholder="Quantity" /><select defaultValue="g"><option>g</option><option>ml</option><option>pcs</option><option>cup</option><option>tablespoon</option></select><input type="number" placeholder="Waste %" /><Button variant="ghost">Remove</Button></div>
        </div>
      </Section>
      <Section title="AI helper"><div className="button-row"><Button variant="secondary"><Bot size={18} /> Paste recipe and let AI structure it</Button><Button variant="secondary"><Wand2 size={18} /> Convert cups/spoons to grams</Button></div></Section>
      <Section title="Instructions"><Field label="Method"><textarea placeholder="Add the recipe method step by step" /></Field></Section>
    </FormShell>
  );
}

function RecipeScaling({ recipeId, setPage }: { recipeId: string; setPage: (page: Page) => void }) {
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
      <div className="sticky-actions"><Button>Save as production plan</Button><Button variant="secondary" onClick={() => setPage("order-create")}>Create order</Button><Button variant="secondary">Print recipe</Button><Button variant="ghost">Share recipe</Button></div>
    </div>
  );
}

function Orders({ setPage, setSelectedOrderId, query, setQuery }: any) {
  const [filter, setFilter] = useState("All");
  const statuses = ["All", "New", "Confirmed", "In Production", "Produced", "Delivered", "Cancelled"];
  const list = orders.filter((order) => (filter === "All" || order.status === filter || (filter === "New" && order.status === "Draft")) && order.customerName.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <Toolbar query={query} setQuery={setQuery} placeholder="Search orders" action={<Button onClick={() => setPage("order-create")}><Plus size={18} /> Add Order</Button>} />
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

function CreateOrder({ setPage }: { setPage: (page: Page) => void }) {
  const previewOrderId = orders[0]?.id;
  const requirements = previewOrderId ? requirementsForOrder(previewOrderId) : [];
  const availability = checkStockAvailability(requirements);
  const cost = previewOrderId ? calculateOrderCost(previewOrderId) : 0;
  const margin = calculateMargin(18000, cost);
  const previewItem = orderItems.find((item) => item.orderId === previewOrderId);
  return (
    <FormShell title="Create Order" action="Confirm and Reserve Stock" onDone={() => setPage("orders")}>
      <Section title="Customer info"><div className="form-grid"><Field label="Customer name"><input placeholder="Customer name" /></Field><Field label="Customer phone"><input type="tel" placeholder="+234..." /></Field><Field label="Due date"><input type="date" /></Field><Field label="Delivery or pickup"><select defaultValue="Pickup"><option>Pickup</option><option>Delivery</option></select></Field><Field label="Notes"><textarea placeholder="Order notes" /></Field></div></Section>
      <Section title="Order items" action={<Button variant="secondary"><Plus size={18} /> Add another product</Button>}><div className="builder-row"><select defaultValue={previewItem?.productId ?? ""}><option value="" disabled>Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><select defaultValue={previewItem?.recipeId ?? ""}><option value="" disabled>Select recipe</option>{recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}</select><input type="number" defaultValue={previewItem?.requestedYieldQuantity ?? ""} placeholder="Yield" /><select defaultValue={previewItem?.yieldUnit ?? "pieces"}><option>pieces</option><option>cookies</option><option>loaves</option></select><input type="number" defaultValue={previewItem?.quantityMultiplier ?? 1} /></div></Section>
      <div className="split">
        <Section title="Ingredient Requirement Preview"><div className="compact-list">{requirements.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}</span><strong>{item.scaledQuantity}{item.unit}</strong></div>)}</div></Section>
      <Section title="Stock Availability"><div className="compact-list">{availability.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}<small>Available {item.availableStock}</small></span><Badge tone={item.status === "shortage" ? "danger" : "success"}>{item.status.replace(/_/g, " ")}</Badge></div>)}</div></Section>
      </div>
      {availability.some((item) => item.shortageQuantity > 0) && <article className="warning-card"><AlertTriangle size={22} /> Some ingredients are short. You can still save this order, but production cannot be completed until stock is updated.</article>}
      <div className="metric-grid small"><Metric label="Estimated Production Cost" value={formatNaira(cost)} /><Metric label="Estimated Gross Margin" value={`${margin.grossMarginPercentage.toFixed(1)}%`} /></div>
    </FormShell>
  );
}

function OrderDetail({ orderId, setPage }: { orderId: string; setPage: (page: Page) => void }) {
  const order = orders.find((item) => item.id === orderId);
  if (!order) return <EmptyState title="Order not found" message="Select an order from the live order list." />;
  const requirements = requirementsForOrder(orderId);
  const availability = checkStockAvailability(requirements);
  const cost = calculateOrderCost(orderId);
  return (
    <div className="detail-layout">
      <article className="detail-hero"><div><p className="eyebrow">Order detail</p><h2>{order.customerName}</h2><p>{order.customerPhone} · {order.deliveryMethod} · due {order.dueDate}</p></div><div className="button-row"><Button variant="secondary" onClick={() => setPage("order-create")}>Edit Order</Button><Button>Reserve Stock</Button><Button variant="secondary">Mark In Production</Button><Button variant="secondary">Mark Produced</Button><Button variant="ghost">Delivered</Button><Button variant="danger">Cancel</Button></div></article>
      <div className="split"><SummaryCard title="Customer Info" items={[["Name", order.customerName], ["Phone", order.customerPhone], ["Payment", order.paymentStatus], ["Notes", order.notes ?? "None"]]} /><SummaryCard title="Cost Summary" items={[["Production cost", formatNaira(cost)], ["Stock status", order.stockStatus], ["Production status", order.productionStatus], ["Order status", order.status]]} /></div>
      <Section title="Required Ingredients"><div className="compact-list">{requirements.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}</span><strong>{item.scaledQuantity}{item.unit}</strong></div>)}</div></Section>
      <Section title="Stock Check"><div className="compact-list">{availability.map((item) => <div className="row-card" key={item.ingredientId}><span>{item.ingredientName}<small>Required {item.requiredQuantity}, available {item.availableStock}</small></span><Badge tone={item.shortageQuantity > 0 ? "danger" : "success"}>{item.shortageQuantity > 0 ? "Shortage" : "Enough Stock"}</Badge></div>)}</div></Section>
      <Section title="Timeline"><div className="timeline"><article><CheckCircle2 size={18} /><div><strong>Order confirmed</strong><small>May 18, 2026</small></div></article><article><AlertTriangle size={18} /><div><strong>Stock shortage detected</strong><small>Dark Chocolate and Eggs need restock</small></div></article></div></Section>
    </div>
  );
}

function Production({ setPage, setSelectedOrderId }: any) {
  const grouped = orderItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.recipeId] = (acc[item.recipeId] ?? 0) + item.requestedYieldQuantity;
    return acc;
  }, {});
  const topGroup = Object.entries(grouped).sort((a, b) => b[1] - a[1])[0];
  const groupedRecipe = recipes.find((recipe) => recipe.id === topGroup?.[0]);
  return (
    <div className="page-grid">
      <article className="ai-card"><ChefHat size={24} /><div><h3>Batch production mode</h3><p>{groupedRecipe ? `Group similar recipes: total ${groupedRecipe.name} needed is ${topGroup?.[1]} ${groupedRecipe.yieldUnit}.` : "Group similar recipes once orders are available."}</p></div><Button variant="secondary">Group similar recipes</Button></article>
      {["Today", "Tomorrow", "This Week"].map((bucket) => (
        <Section title={bucket} key={bucket}>
          <div className="card-grid">
            {orders.filter((order) => bucket === "This Week" || (bucket === "Today" && order.dueDate === new Date().toISOString().slice(0, 10)) || (bucket === "Tomorrow" && order.dueDate === new Date(Date.now() + 86400000).toISOString().slice(0, 10))).map((order) => (
              <article className="item-card" key={order.id} onClick={() => { setSelectedOrderId(order.id); setPage("order-detail"); }}>
                <div className="item-card-head"><ChefHat size={20} /><Badge tone={stockTone(order.stockStatus)}>{order.stockStatus}</Badge></div>
                <h3>{orderItems.filter((item) => item.orderId === order.id).map((item) => products.find((product) => product.id === item.productId)?.name).join(", ")}</h3>
                <p>{order.customerName} · due {order.dueDate}</p>
                <small>Required: {requirementsForOrder(order.id).slice(0, 3).map((item) => `${item.ingredientName} ${item.scaledQuantity}${item.unit}`).join(", ")}</small>
                <div className="button-row"><Button variant="secondary">Start Production</Button><Button variant="secondary">View Scaled Recipe</Button><Button>Deduct Inventory</Button></div>
              </article>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

function ShoppingList() {
  const list = generateShoppingList();
  return (
    <div className="page-grid">
      <div className="metric-grid small"><Metric label="Needed for Orders" value={list.filter((item) => item.requiredQuantity > 0).length} /><Metric label="Below Reorder Level" value={ingredients.filter((item) => item.currentStock <= item.reorderLevel).length} /><Metric label="Estimated Cost" value={formatNaira(list.reduce((sum, item) => sum + item.estimatedCost, 0))} /></div>
      <Section title="Suggested Purchases" action={<Button variant="secondary">Send to WhatsApp</Button>}>
        <ResponsiveTable headers={["Buy", "Ingredient", "Current", "Needed", "Shortage", "Suggested", "Cost", "Supplier"]} rows={list.map((item) => ({ key: item.ingredientId, cells: [<input type="checkbox" />, item.ingredientName, `${item.currentStock}${item.unit}`, `${item.requiredQuantity}${item.unit}`, `${item.shortageQuantity}${item.unit}`, `${item.suggestedBuyQuantity}${item.unit}`, formatNaira(item.estimatedCost), item.supplier] }))} />
      </Section>
      <div className="sticky-actions"><Button>Mark as Purchased</Button><Button variant="secondary">Add Purchase Cost</Button><Button variant="secondary">Export/Share List</Button></div>
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

function AiAssistant({ setPage }: { setPage: (page: Page) => void }) {
  const flour = convertUnit(4, "cup", "g", "flour");
  const egg = convertUnit(4, "egg", "g", "eggs");
  const yolk = convertUnit(2, "yolk", "g", "egg-yolks");
  const parsed = parseRecipeText("2 cups flour\n1 cup sugar\n4 eggs\n1/2 cup cocoa powder\n1 cup coconut oil");
  return (
    <div className="ai-layout">
      <Section title="Suggested actions">
        <div className="chips wrap">{["Convert 4 cups flour to grams", "Convert 3 egg yolks to grams", "Scale this recipe to 24 pieces", "Paste a recipe and clean it up", "What do I need to buy for this weekend's orders?", "Estimate cost for 12 brownies"].map((chip) => <button key={chip}>{chip}</button>)}</div>
      </Section>
      <div className="chat">
        <article className="message user">Convert 4 cups of flour to grams.</article>
        <article className="message ai"><h3>Ingredient Conversion</h3><SummaryCard title="AI response card" items={[["Ingredient", "Flour"], ["Measurement", "4 cups"], ["Estimated conversion", `${flour.convertedQuantity}g`], ["Confidence", flour.confidenceLevel], ["Note", "Cup-to-gram conversions depend on how the flour is measured. Confirm before saving."]]} /><div className="button-row"><Button>Use this conversion</Button><Button variant="secondary">Edit value</Button><Button variant="secondary">Save conversion rule</Button></div></article>
        <article className="message user">Convert 4 eggs and 2 yolks to grams.</article>
        <article className="message ai"><h3>Egg estimate</h3><p>1 large egg approx. 50g without shell. 1 yolk approx. 18g. 4 eggs = {egg.convertedQuantity}g. 2 yolks = {yolk.convertedQuantity}g. Total = {egg.convertedQuantity + yolk.convertedQuantity}g.</p><div className="button-row"><Button>Use estimate</Button><Button variant="secondary">Edit</Button><Button variant="secondary">Save as default</Button></div></article>
      </div>
      <Section title="Recipe Parser Preview"><ResponsiveTable headers={["Ingredient", "Quantity", "Converted", "Confidence", "Review"]} rows={parsed.map((item) => ({ key: item.id, cells: [item.ingredientName, `${item.quantity} ${item.unit}`, `${item.convertedQuantity} ${item.convertedUnit}`, item.confidence, item.needsReview ? <Badge tone="warning">Needs review</Badge> : <Badge tone="success">Ready</Badge>] }))} /></Section>
      <Button variant="secondary" onClick={() => setPage("conversions")}><Wand2 size={18} /> Conversion Library</Button>
    </div>
  );
}

function ConversionLibrary() {
  return (
    <Section title="Approved Conversion Rules" action={<Button><Plus size={18} /> Add Conversion Rule</Button>}>
      <ResponsiveTable headers={["Ingredient", "From", "To", "Value", "Confidence", "Source", "Verified", "Actions"]} rows={conversionRules.map((rule) => ({ key: rule.id, cells: [ingredients.find((item) => item.id === rule.ingredientId)?.name, rule.fromUnit, rule.toUnit, `1 ${rule.fromUnit} = ${rule.conversionFactor}${rule.toUnit}`, rule.confidenceLevel, rule.source, rule.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Review</Badge>, <Button variant="secondary">Edit Rule</Button>] }))} />
    </Section>
  );
}

function Suppliers() {
  return (
    <Section title="Suppliers" action={<Button><Plus size={18} /> Add Supplier</Button>}>
      <div className="card-grid">
        {suppliers.map((supplier) => <article className="item-card" key={supplier.id}><Truck size={22} /><h3>{supplier.name}</h3><p>{supplier.contactName} · {supplier.phone}</p><small>{ingredients.filter((item) => item.supplierId === supplier.id).map((item) => item.name).slice(0, 5).join(", ")}</small><small>Last purchase: May 12, 2026</small><p>{supplier.notes}</p></article>)}
      </div>
    </Section>
  );
}

function SettingsPage({ setPage }: { setPage: (page: Page) => void }) {
  return (
    <div className="page-grid">
      <div className="more-grid">
        {moreItems.map(([id, Icon, label]) => <button key={id} className="more-card" onClick={() => setPage(id as Page)}><Icon size={22} /><span>{label}</span></button>)}
      </div>
      <Section title="Business profile & defaults">
        <div className="form-grid">
          <Field label="Business name"><input defaultValue={settings.businessName} /></Field>
          <Field label="Default currency"><select defaultValue="NGN"><option>Nigerian Naira</option></select></Field>
          <Field label="Round grams"><select defaultValue={settings.gramRoundingPreference}><option>1</option><option>5</option><option>10</option></select></Field>
          <Field label="Round eggs"><select defaultValue={settings.eggRoundingPreference}><option value="nearest_whole_egg">Nearest whole egg</option><option value="allow_gram_conversion">Allow gram conversion</option></select></Field>
          <Field label="Deduct inventory when"><select defaultValue={settings.defaultDeductionStage}><option value="confirmation">Order is confirmed</option><option value="production_start">Production starts</option><option value="production_completion">Production is completed</option></select></Field>
          <Field label="Allow negative inventory"><select defaultValue={settings.allowNegativeInventory ? "Yes" : "No"}><option>Yes</option><option>No</option></select></Field>
          <Field label="Require confirmation before AI conversions"><select defaultValue={settings.requireAiConversionConfirmation ? "Yes" : "No"}><option>Yes</option><option>No</option></select></Field>
          <Field label="User roles"><select defaultValue="Owner/Admin"><option>Owner/Admin</option><option>Baker</option><option>Inventory Manager</option><option>Viewer</option></select></Field>
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

function FormShell({ title, action, onDone, children }: { title: string; action: string; onDone: () => void; children: React.ReactNode }) {
  return (
    <form className="form-shell" onSubmit={(event) => { event.preventDefault(); onDone(); }}>
      <div className="section-head"><h2>{title}</h2><div className="button-row"><Button variant="secondary" onClick={onDone}>Cancel</Button><Button>{action}</Button></div></div>
      {children}
      <div className="sticky-actions"><Button>{action}</Button></div>
    </form>
  );
}

export default App;
