export type Page =
  | "welcome"
  | "login"
  | "reset"
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
  | "imports"
  | "costing"
  | "ai"
  | "conversions"
  | "suppliers"
  | "settings";

export type AppRoute =
  | { name: "welcome" }
  | { name: "login" }
  | { name: "reset"; token?: string }
  | { name: "dashboard" }
  | { name: "recipes"; recipeId?: string; mode?: "detail" | "new" | "edit" | "scale" }
  | { name: "inventory"; ingredientId?: string; mode?: "detail" | "new" | "edit" }
  | { name: "orders"; orderId?: string; mode?: "detail" | "new" | "edit"; returnTo?: AppRoute }
  | { name: "production"; orderId?: string; batchId?: string }
  | { name: "shopping"; returnTo?: AppRoute }
  | { name: "imports"; mode?: "start" | "review"; returnTo?: AppRoute }
  | { name: "costing"; recipeId?: string; returnTo?: AppRoute }
  | { name: "ai" }
  | { name: "conversions"; ruleId?: string }
  | { name: "suppliers"; supplierId?: string }
  | { name: "settings"; section?: string };

export type LegacyRouteContext = {
  selectedRecipeId?: string;
  selectedIngredientId?: string;
  selectedOrderId?: string;
};

export const pageIds = new Set<Page>([
  "welcome",
  "login",
  "reset",
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
  "imports",
  "costing",
  "ai",
  "conversions",
  "suppliers",
  "settings"
]);

export const topLevelPages = new Set<Page>([
  "welcome",
  "login",
  "dashboard",
  "recipes",
  "inventory",
  "orders",
  "production",
  "shopping",
  "imports",
  "costing",
  "ai",
  "conversions",
  "suppliers",
  "settings"
]);

const pageRouteNames = new Set([
  "welcome",
  "login",
  "reset",
  "dashboard",
  "recipes",
  "inventory",
  "orders",
  "production",
  "shopping",
  "imports",
  "costing",
  "ai",
  "conversions",
  "suppliers",
  "settings"
]);

function stripHash(hash: string) {
  return hash.trim().replace(/^#\/?/, "").replace(/^\/+/, "");
}

function decodePathSegment(value: string | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value);
}

function parseQuery(rawQuery = "") {
  return new URLSearchParams(rawQuery.replace(/^\?/, ""));
}

function appendRouteQuery(path: string, route: AppRoute) {
  const params = new URLSearchParams();
  if ("returnTo" in route && route.returnTo) {
    params.set("returnTo", serializeRoutePath(route.returnTo));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function parseReturnTo(params: URLSearchParams): AppRoute | undefined {
  const value = params.get("returnTo");
  if (!value) return undefined;
  return parseAppRoute(`#${value}`);
}

function parseLegacyRoute(path: string, context: LegacyRouteContext): AppRoute | undefined {
  const page = path as Page;
  if (!pageIds.has(page)) return undefined;
  return routeFromPage(page, context);
}

export function parseAppRoute(hash: string, context: LegacyRouteContext = {}): AppRoute | undefined {
  const stripped = stripHash(hash);
  if (!stripped) return undefined;
  const [rawPath, rawQuery = ""] = stripped.split("?");
  const path = rawPath.replace(/^\/+|\/+$/g, "");
  const params = parseQuery(rawQuery);
  const parts = path.split("/").filter(Boolean).map(decodePathSegment);
  const [section, first, second] = parts;

  if (!section) return undefined;

  if (parts.length === 1 && pageIds.has(section as Page) && !pageRouteNames.has(section)) {
    return parseLegacyRoute(section, context);
  }

  switch (section) {
    case "welcome":
      return { name: "welcome" };
    case "login":
      return { name: "login" };
    case "reset":
      return first ? { name: "reset", token: first } : { name: "reset" };
    case "dashboard":
      return { name: "dashboard" };
    case "recipes":
      if (!first) return { name: "recipes" };
      if (first === "new") return { name: "recipes", mode: "new" };
      if (second === "edit") return { name: "recipes", recipeId: first, mode: "edit" };
      if (second === "scale") return { name: "recipes", recipeId: first, mode: "scale" };
      return { name: "recipes", recipeId: first, mode: "detail" };
    case "inventory":
      if (!first) return { name: "inventory" };
      if (first === "new") return { name: "inventory", mode: "new" };
      if (second === "edit") return { name: "inventory", ingredientId: first, mode: "edit" };
      return { name: "inventory", ingredientId: first, mode: "detail" };
    case "orders":
      if (!first) return { name: "orders" };
      if (first === "new") return { name: "orders", mode: "new", returnTo: parseReturnTo(params) };
      if (second === "edit") return { name: "orders", orderId: first, mode: "edit", returnTo: parseReturnTo(params) };
      return { name: "orders", orderId: first, mode: "detail", returnTo: parseReturnTo(params) };
    case "production":
      return { name: "production", orderId: first, batchId: second };
    case "shopping":
      return { name: "shopping", returnTo: parseReturnTo(params) };
    case "imports":
      return { name: "imports", mode: first === "review" ? "review" : "start", returnTo: parseReturnTo(params) };
    case "costing":
      return { name: "costing", recipeId: first, returnTo: parseReturnTo(params) };
    case "ai":
      return { name: "ai" };
    case "conversions":
      return { name: "conversions", ruleId: first };
    case "suppliers":
      return { name: "suppliers", supplierId: first };
    case "settings":
      return { name: "settings", section: first };
    default:
      return parseLegacyRoute(section, context);
  }
}

export function serializeRoutePath(route: AppRoute): string {
  switch (route.name) {
    case "welcome":
    case "login":
    case "dashboard":
    case "ai":
      return route.name;
    case "reset":
      return route.token ? `reset/${encodePathSegment(route.token)}` : "reset";
    case "recipes": {
      if (route.mode === "new") return "recipes/new";
      if (!route.recipeId) return "recipes";
      const id = encodePathSegment(route.recipeId);
      if (route.mode === "edit") return `recipes/${id}/edit`;
      if (route.mode === "scale") return `recipes/${id}/scale`;
      return `recipes/${id}`;
    }
    case "inventory": {
      if (route.mode === "new") return "inventory/new";
      if (!route.ingredientId) return "inventory";
      const id = encodePathSegment(route.ingredientId);
      if (route.mode === "edit") return `inventory/${id}/edit`;
      return `inventory/${id}`;
    }
    case "orders": {
      let path = "orders";
      if (route.mode === "new") path = "orders/new";
      else if (route.orderId) path = route.mode === "edit" ? `orders/${encodePathSegment(route.orderId)}/edit` : `orders/${encodePathSegment(route.orderId)}`;
      return appendRouteQuery(path, route);
    }
    case "production": {
      const parts = ["production", route.orderId, route.batchId].filter(Boolean).map((part) => encodePathSegment(part as string));
      return parts.join("/");
    }
    case "shopping":
      return appendRouteQuery("shopping", route);
    case "imports": {
      const path = route.mode === "review" ? "imports/review" : "imports";
      return appendRouteQuery(path, route);
    }
    case "costing": {
      const path = route.recipeId ? `costing/${encodePathSegment(route.recipeId)}` : "costing";
      return appendRouteQuery(path, route);
    }
    case "conversions":
      return route.ruleId ? `conversions/${encodePathSegment(route.ruleId)}` : "conversions";
    case "suppliers":
      return route.supplierId ? `suppliers/${encodePathSegment(route.supplierId)}` : "suppliers";
    case "settings":
      return route.section ? `settings/${encodePathSegment(route.section)}` : "settings";
  }
}

export function serializeAppRoute(route: AppRoute) {
  return `#${serializeRoutePath(route)}`;
}

export function routeFromPage(page: Page, context: LegacyRouteContext = {}): AppRoute {
  switch (page) {
    case "welcome":
    case "login":
    case "reset":
    case "dashboard":
    case "production":
    case "shopping":
    case "imports":
    case "costing":
    case "ai":
    case "conversions":
    case "suppliers":
    case "settings":
      return { name: page };
    case "recipes":
      return { name: "recipes" };
    case "recipe-detail":
      return context.selectedRecipeId ? { name: "recipes", recipeId: context.selectedRecipeId, mode: "detail" } : { name: "recipes" };
    case "recipe-form":
      return context.selectedRecipeId ? { name: "recipes", recipeId: context.selectedRecipeId, mode: "edit" } : { name: "recipes", mode: "new" };
    case "scaling":
      return context.selectedRecipeId ? { name: "recipes", recipeId: context.selectedRecipeId, mode: "scale" } : { name: "recipes" };
    case "inventory":
      return { name: "inventory" };
    case "ingredient-detail":
      return context.selectedIngredientId ? { name: "inventory", ingredientId: context.selectedIngredientId, mode: "detail" } : { name: "inventory" };
    case "ingredient-form":
      return context.selectedIngredientId ? { name: "inventory", ingredientId: context.selectedIngredientId, mode: "edit" } : { name: "inventory", mode: "new" };
    case "orders":
      return { name: "orders" };
    case "order-detail":
      return context.selectedOrderId ? { name: "orders", orderId: context.selectedOrderId, mode: "detail" } : { name: "orders" };
    case "order-create":
      return context.selectedOrderId ? { name: "orders", orderId: context.selectedOrderId, mode: "edit" } : { name: "orders", mode: "new" };
  }
}

export function pageForRoute(route: AppRoute): Page {
  switch (route.name) {
    case "welcome":
    case "login":
    case "reset":
    case "dashboard":
    case "production":
    case "shopping":
    case "imports":
    case "costing":
    case "ai":
    case "conversions":
    case "suppliers":
    case "settings":
      return route.name;
    case "recipes":
      if (route.mode === "new" || route.mode === "edit") return "recipe-form";
      if (route.mode === "scale") return "scaling";
      return route.recipeId ? "recipe-detail" : "recipes";
    case "inventory":
      if (route.mode === "new" || route.mode === "edit") return "ingredient-form";
      return route.ingredientId ? "ingredient-detail" : "inventory";
    case "orders":
      if (route.mode === "new" || route.mode === "edit") return "order-create";
      return route.orderId ? "order-detail" : "orders";
  }
}

export function selectedIdsForRoute(route: AppRoute) {
  return {
    selectedRecipeId: route.name === "recipes" ? route.recipeId ?? "" : "",
    selectedIngredientId: route.name === "inventory" ? route.ingredientId ?? "" : "",
    selectedOrderId: route.name === "orders" || route.name === "production" ? route.orderId ?? "" : ""
  };
}

export function activeSelectedIdsForRoute(route: AppRoute, fallback: LegacyRouteContext = {}) {
  const routeIds = selectedIdsForRoute(route);
  return {
    selectedRecipeId: route.name === "recipes" && route.mode === "new" ? "" : routeIds.selectedRecipeId || fallback.selectedRecipeId || "",
    selectedIngredientId: route.name === "inventory" && route.mode === "new" ? "" : routeIds.selectedIngredientId || fallback.selectedIngredientId || "",
    selectedOrderId: route.name === "orders" && route.mode === "new" ? "" : routeIds.selectedOrderId || fallback.selectedOrderId || ""
  };
}

export function routeParent(route: AppRoute): AppRoute | undefined {
  switch (route.name) {
    case "recipes":
      if (route.mode === "edit" || route.mode === "scale") return route.recipeId ? { name: "recipes", recipeId: route.recipeId, mode: "detail" } : { name: "recipes" };
      if (route.mode === "new" || route.recipeId) return { name: "recipes" };
      return undefined;
    case "inventory":
      if (route.mode === "edit") return route.ingredientId ? { name: "inventory", ingredientId: route.ingredientId, mode: "detail" } : { name: "inventory" };
      if (route.mode === "new" || route.ingredientId) return { name: "inventory" };
      return undefined;
    case "orders":
      if (route.mode === "edit") return route.orderId ? { name: "orders", orderId: route.orderId, mode: "detail" } : { name: "orders" };
      if (route.mode === "new") return route.returnTo ?? { name: "orders" };
      if (route.orderId) return route.returnTo ?? { name: "orders" };
      return undefined;
    case "production":
      return route.orderId ? { name: "production" } : undefined;
    case "shopping":
    case "imports":
      return route.returnTo;
    case "costing":
      return route.returnTo;
    case "conversions":
      return route.ruleId ? { name: "conversions" } : undefined;
    case "suppliers":
      return route.supplierId ? { name: "suppliers" } : undefined;
    case "settings":
      return route.section ? { name: "settings" } : undefined;
    default:
      return undefined;
  }
}

export function routeTitle(route: AppRoute): string {
  switch (route.name) {
    case "welcome":
      return "Welcome";
    case "login":
      return "Login";
    case "reset":
      return route.token ? "Choose A New Password" : "Reset Password";
    case "dashboard":
      return "Kitchen Command Center";
    case "recipes":
      if (route.mode === "new") return "Add Recipe";
      if (route.mode === "edit") return "Edit Recipe";
      if (route.mode === "scale") return "Scale Recipe";
      return route.recipeId ? "Recipe Detail" : "Recipe Library";
    case "inventory":
      if (route.mode === "new") return "Add Ingredient";
      if (route.mode === "edit") return "Edit Ingredient";
      return route.ingredientId ? "Ingredient Detail" : "Inventory";
    case "orders":
      if (route.mode === "new") return "Create Order";
      if (route.mode === "edit") return "Edit Order";
      return route.orderId ? "Order Detail" : "Orders";
    case "production":
      return "Production Plan";
    case "shopping":
      return "Shopping List";
    case "imports":
      return route.mode === "review" ? "Review Import" : "Import Recipes";
    case "costing":
      return "Costing & Margins";
    case "ai":
      return "AI Conversion Assistant";
    case "conversions":
      return "Conversion Library";
    case "suppliers":
      return "Suppliers";
    case "settings":
      return "More & Settings";
  }
}

export function routeBackLabel(route: AppRoute): string {
  const parent = routeParent(route);
  if (!parent) return "Back";
  return `Back to ${routeTitle(parent).replace(/^Add |^Edit |^Create |^Scale /, "")}`;
}

export function isTopLevelRoute(route: AppRoute) {
  return !routeParent(route);
}

export function routeNavPage(route: AppRoute): Page {
  switch (route.name) {
    case "recipes":
      return "recipes";
    case "inventory":
      return "inventory";
    case "orders":
      return "orders";
    default:
      return pageForRoute(route);
  }
}

export function isRouteActive(route: AppRoute, page: Page) {
  return routeNavPage(route) === page;
}

export function isSameRoute(a: AppRoute, b: AppRoute) {
  return serializeRoutePath(a) === serializeRoutePath(b);
}
