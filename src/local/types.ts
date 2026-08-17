import type {
  AuditLog,
  ConversionRule,
  Ingredient,
  IngredientBatch,
  InventoryMovement,
  Order,
  OrderEvent,
  OrderItem,
  Product,
  ProductionQcLog,
  Recipe,
  RecipeItem,
  Settings,
  Supplier
} from "../types";

// A purchase receipt. The server keeps these in purchase_logs; the client never
// needed them before because nothing read them back, but a device workspace owns
// its whole history so they are stored here too.
export interface PurchaseLog {
  id: string;
  supplierId: string | null;
  ingredientId: string;
  purchaseQuantity: number;
  purchaseUnit: string;
  purchasePrice: number;
  convertedQuantityInBaseUnit: number;
  costPerBaseUnit: number;
  purchaseDate: string;
  expiryDate: string | null;
  notes: string;
  createdAt: string;
}

// One committed import, mirroring the server's import_batches row.
export interface ImportBatch {
  id: string;
  sourceName: string;
  sourceType: string;
  parserVersion: string;
  actor: string;
  status: string;
  summary: unknown;
  warnings: unknown;
  createdAt: string;
}

// The claim that stops an order being produced twice. On the server this is a
// row in production_runs with a unique constraint on order_id; here it is a
// record in an object store keyed by orderId, so add() fails the same way.
export interface ProductionRun {
  orderId: string;
  id: string;
  batchKey: string | null;
  actor: string;
  plannedYield: number | null;
  actualYield: number | null;
  wasteQuantity: number | null;
  qcLogId: string | null;
  createdAt: string;
}

// A row as the local database holds it.
//
// The types in src/types.ts describe what the app RENDERS. A stored row carries
// more: whether it is archived, and when it was written. The server keeps those
// in columns the bootstrap projection drops, and the local store has to keep them
// for the same reasons -- archive and restore need somewhere to restore from, and
// the paged reads sort on createdAt.
export type Stored<T> = T & {
  active?: boolean;
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

// Everything a device workspace holds.
//
// This is deliberately wider than the bootstrap snapshot the app renders from.
// Bootstrap is a filtered projection -- active rows only, non-archived orders, a
// narrowed movement window -- and a workspace that stored only that could not
// restore an archived recipe or count a full ledger. The store keeps everything
// and projects on the way out, which is what makes archive.restore and the
// dashboard aggregates behave as they do on the server.
export interface LocalWorkspace {
  suppliers: Stored<Supplier>[];
  ingredients: Stored<Ingredient>[];
  products: Stored<Product>[];
  recipes: Stored<Recipe>[];
  recipeItems: Stored<RecipeItem>[];
  orders: Stored<Order>[];
  orderItems: Stored<OrderItem>[];
  orderEvents: Stored<OrderEvent>[];
  inventoryMovements: Stored<InventoryMovement>[];
  ingredientBatches: Stored<IngredientBatch>[];
  productionQcLogs: Stored<ProductionQcLog>[];
  auditLogs: Stored<AuditLog>[];
  conversionRules: Stored<ConversionRule>[];
  purchaseLogs: PurchaseLog[];
  importBatches: ImportBatch[];
  productionRuns: ProductionRun[];
  settings: Settings;
}

export const COLLECTION_KEYS = [
  "suppliers",
  "ingredients",
  "products",
  "recipes",
  "recipeItems",
  "orders",
  "orderItems",
  "orderEvents",
  "inventoryMovements",
  "ingredientBatches",
  "productionQcLogs",
  "auditLogs",
  "conversionRules",
  "purchaseLogs",
  "importBatches"
] as const;

export type CollectionKey = (typeof COLLECTION_KEYS)[number];

// What an action changed. The engine returns these rather than mutating the
// workspace in place, so the store can write every affected collection in one
// IndexedDB transaction and a rejected action leaves nothing behind.
export interface EngineChanges {
  collections?: Partial<Record<CollectionKey, unknown[]>>;
  settings?: Settings;
  // Present when the action claims a production run. The store inserts it with
  // add() so a repeat or concurrent completion aborts the whole transaction,
  // exactly as the unique index does on the server.
  claimProductionRun?: ProductionRun;
}

export interface EngineResult {
  result: unknown;
  changes: EngineChanges;
}

export interface EngineActor {
  sub?: string;
  email?: string;
  fullName?: string;
  role?: string;
}
