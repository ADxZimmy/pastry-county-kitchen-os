import type { AppStaffUser, AuditLog, ConversionRule, Ingredient, IngredientBatch, InventoryMovement, Order, OrderItem, Product, ProductionQcLog, Recipe, RecipeItem, Settings, Supplier } from "./types";

export interface KitchenSnapshot {
  suppliers: Supplier[];
  appUsers?: AppStaffUser[];
  ingredients: Ingredient[];
  products: Product[];
  recipes: Recipe[];
  recipeItems: RecipeItem[];
  orders: Order[];
  orderItems: OrderItem[];
  inventoryMovements: InventoryMovement[];
  ingredientBatches?: IngredientBatch[];
  productionQcLogs?: ProductionQcLog[];
  auditLogs?: AuditLog[];
  conversionRules: ConversionRule[];
  settings: Settings;
}

export const suppliers: Supplier[] = [];
export const appUsers: AppStaffUser[] = [];
export const ingredients: Ingredient[] = [];
export const products: Product[] = [];
export const recipes: Recipe[] = [];
export const recipeItems: RecipeItem[] = [];
export const orders: Order[] = [];
export const orderItems: OrderItem[] = [];
export const inventoryMovements: InventoryMovement[] = [];
export const ingredientBatches: IngredientBatch[] = [];
export const productionQcLogs: ProductionQcLog[] = [];
export const auditLogs: AuditLog[] = [];
export const conversionRules: ConversionRule[] = [];

export const settings: Settings = {
  businessName: "",
  currency: "NGN",
  defaultDeductionStage: "production_completion",
  allowNegativeInventory: false,
  requireAiConversionConfirmation: true,
  gramRoundingPreference: 5,
  eggRoundingPreference: "nearest_whole_egg"
};

function replaceArray<T>(target: T[], next: T[]) {
  target.splice(0, target.length, ...next);
}

export function setKitchenSnapshot(snapshot: KitchenSnapshot) {
  replaceArray(suppliers, snapshot.suppliers);
  replaceArray(appUsers, snapshot.appUsers ?? []);
  replaceArray(ingredients, snapshot.ingredients);
  replaceArray(products, snapshot.products);
  replaceArray(recipes, snapshot.recipes);
  replaceArray(recipeItems, snapshot.recipeItems);
  replaceArray(orders, snapshot.orders);
  replaceArray(orderItems, snapshot.orderItems);
  replaceArray(inventoryMovements, snapshot.inventoryMovements);
  replaceArray(ingredientBatches, snapshot.ingredientBatches ?? []);
  replaceArray(productionQcLogs, snapshot.productionQcLogs ?? []);
  replaceArray(auditLogs, snapshot.auditLogs ?? []);
  replaceArray(conversionRules, snapshot.conversionRules);
  Object.assign(settings, snapshot.settings);
}
