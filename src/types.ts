export type Unit = "g" | "kg" | "ml" | "litre" | "pcs" | "cup" | "tablespoon" | "teaspoon" | "pack" | "roll" | "egg" | "yolk" | "white";
export type StockStatus = "In Stock" | "Low Stock" | "Out of Stock" | "Reserved" | "Shortage";
export type OrderStatus = "Draft" | "Confirmed" | "Stock Reserved" | "In Production" | "Produced" | "Delivered" | "Cancelled";
export type ProductionStatus = "Not Started" | "Ready" | "In Progress" | "Completed";
export type MovementType = "purchase" | "production_use" | "reservation" | "reservation_release" | "adjustment" | "waste" | "return" | "correction";

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  defaultCurrency: string;
  leadTimeDays?: number;
  suppliedIngredientIds?: string[];
  notes: string;
  active?: boolean;
}

export interface AppStaffUser {
  id: string;
  email: string;
  fullName: string;
  role: "Owner/Admin" | "Baker" | "Inventory Manager" | "Viewer";
  active?: boolean;
  sessionRevokedAt?: string;
  updatedAt?: string;
}

export interface Ingredient {
  id: string;
  name: string;
  category: string;
  baseUnit: Unit;
  currentStock: number;
  reorderLevel: number;
  latestUnitCost: number;
  supplierId?: string;
  expiryTrackingEnabled?: boolean;
  defaultExpiryDays?: number;
  notes?: string;
  reservedStock?: number;
  expiryDate?: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  active: boolean;
}

export interface RecipeItem {
  id: string;
  recipeId: string;
  ingredientId: string;
  quantity: number;
  unit: Unit;
  wastePercentage?: number;
  notes?: string;
}

export interface Recipe {
  id: string;
  productId: string;
  name: string;
  category: string;
  baseYieldQuantity: number;
  yieldUnit: string;
  instructions: string[];
  notes?: string;
  active: boolean;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  recipeId: string;
  requestedYieldQuantity: number;
  yieldUnit: string;
  quantityMultiplier: number;
  notes?: string;
}

export interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  dueDate: string;
  deliveryMethod: "Delivery" | "Pickup";
  status: OrderStatus;
  paymentStatus: "Unpaid" | "Deposit Paid" | "Paid";
  productionStatus: ProductionStatus;
  stockStatus: StockStatus;
  notes?: string;
}

export interface InventoryMovement {
  id: string;
  ingredientId: string;
  movementType: MovementType;
  quantityChange: number;
  unit: Unit;
  relatedOrderId?: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface IngredientBatch {
  id: string;
  ingredientId: string;
  purchaseId?: string;
  quantityReceived: number;
  quantityRemaining: number;
  unit: Unit;
  expiryDate?: string;
  receivedDate: string;
  notes?: string;
}

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  actor: string;
  createdAt: string;
}

export interface ConversionRule {
  id: string;
  ingredientId: string;
  fromUnit: Unit;
  toUnit: Unit;
  conversionFactor: number;
  conversionType: "direct" | "ingredient_specific";
  confidenceLevel: "Low" | "Medium" | "High";
  source: "AI estimate" | "manual entry" | "measured in kitchen" | "seed rule";
  verified: boolean;
  notes?: string;
  active?: boolean;
  updatedAt: string;
}

export interface Settings {
  businessName: string;
  currency: "NGN" | "USD" | "GBP" | "EUR";
  defaultDeductionStage: "confirmation" | "production_start" | "production_completion";
  allowNegativeInventory: boolean;
  requireAiConversionConfirmation: boolean;
  gramRoundingPreference: 1 | 5 | 10;
  eggRoundingPreference: "nearest_whole_egg" | "allow_gram_conversion";
  safetyMarginPercentage?: number;
  defaultTaxPercentage?: number;
  lowStockNotificationEmail?: string;
}
