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
  purchaseUnit?: Unit;
  currentStock: number;
  reorderLevel: number;
  latestUnitCost: number;
  supplierId?: string;
  expiryTrackingEnabled?: boolean;
  defaultExpiryDays?: number;
  notes?: string;
  reservedStock?: number;
  expiryDate?: string;
  allergenProfile?: IngredientAllergenProfile;
  storageProfile?: IngredientStorageProfile;
}

export interface IngredientAllergenProfile {
  contains?: string[];
  mayContain?: string[];
  dietaryFlags?: string[];
  crossContactRisk?: "low" | "medium" | "high";
  labelNotes?: string;
}

export interface IngredientStorageProfile {
  storageTemperature?: "ambient" | "cool_dry" | "refrigerated" | "frozen";
  storageLocation?: string;
  humiditySensitive?: boolean;
  odorSensitive?: boolean;
  openedShelfLifeDays?: number;
  handlingNotes?: string;
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
  prepState?: RecipeItemPrepState;
}

export interface RecipeItemPrepState {
  component?: string;
  stage?: string;
  sequence?: number;
  ingredientState?: string;
  temperatureState?: string;
  dividedUse?: string;
  preparationNotes?: string;
  handlingWarning?: string;
  sourceLineName?: string;
  sourceFile?: string;
  sourceType?: string;
  sourceReference?: string;
  sourceText?: string;
  sourceSheet?: string;
  sourceWorkbook?: string;
  sourceWorkbookRevision?: string;
  sourcePage?: number;
  sourceRow?: number;
  sourceColumn?: number;
  sourcePackageQuantity?: number;
  sourcePackagePrice?: number;
  sourceNeededQuantity?: number;
  sourceLineAmount?: number;
}

export interface RecipeFormulaMetadata {
  productFamily?: string;
  formulaVersion?: string;
  panProfile?: string;
  panCount?: number;
  fillGuidance?: string;
  ovenTemperature?: string;
  bakeTimeRange?: string;
  mixingMethod?: string;
  restWindow?: string;
  chillWindow?: string;
  coolWindow?: string;
  targetDoneness?: string;
  sensoryCheckpoints?: string;
  storageServiceNotes?: string;
  testBakeStatus?: "untested" | "test_bake_needed" | "tested" | "production_ready";
}

export interface RecipeCostProfile {
  laborMinutes?: number;
  laborRatePerHour?: number;
  packagingCost?: number;
  overheadCost?: number;
  utilityCost?: number;
  failureAllowancePercentage?: number;
  yieldLossPercentage?: number;
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
  formulaMetadata?: RecipeFormulaMetadata;
  costProfile?: RecipeCostProfile;
  active: boolean;
  updatedAt: string;
}

export interface ImportSourceSpan {
  sourceName?: string;
  sourceType?: string;
  sourceFile?: string;
  sheet?: string;
  page?: number;
  row?: number;
  column?: number;
  line?: number;
  text?: string;
}

export interface ImportDraftIngredient {
  id: string;
  name: string;
  category: string;
  baseUnit: Unit;
  purchaseUnit?: Unit;
  latestUnitCost?: number;
  supplierId?: string;
  supplierName?: string;
  reorderLevel?: number;
  notes?: string;
  confidence: "High" | "Medium" | "Low";
  selected?: boolean;
  source?: ImportSourceSpan;
}

export interface ImportDraftSupplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  defaultCurrency?: string;
  leadTimeDays?: number;
  notes?: string;
  confidence: "High" | "Medium" | "Low";
  selected?: boolean;
  source?: ImportSourceSpan;
}

export interface ImportDraftRecipeItem {
  id: string;
  ingredientId?: string;
  ingredientName: string;
  quantity: number;
  unit: Unit;
  wastePercentage?: number;
  notes?: string;
  confidence: "High" | "Medium" | "Low";
  needsReview?: boolean;
  selected?: boolean;
  source?: ImportSourceSpan;
  prepState?: RecipeItemPrepState;
}

export interface ImportDraftRecipe {
  id: string;
  name: string;
  category: string;
  baseYieldQuantity: number;
  yieldUnit: string;
  notes?: string;
  instructions: string[];
  formulaMetadata?: RecipeFormulaMetadata;
  costProfile?: RecipeCostProfile;
  items: ImportDraftRecipeItem[];
  confidence: "High" | "Medium" | "Low";
  reviewCount?: number;
  duplicateCandidates?: { id: string; name: string }[];
  warnings?: string[];
  selected?: boolean;
  allowDuplicate?: boolean;
  source?: ImportSourceSpan;
}

export interface ImportDraftConversionRule {
  id: string;
  ingredientId?: string;
  ingredientName: string;
  fromUnit: Unit;
  toUnit: Unit;
  conversionFactor: number;
  confidenceLevel: "High" | "Medium" | "Low";
  sourceLabel?: string;
  verified?: boolean;
  confidence: "High" | "Medium" | "Low";
  needsReview?: boolean;
  selected?: boolean;
  source?: ImportSourceSpan;
}

export interface ImportDraftCustomerTemplate {
  id: string;
  customerName: string;
  email?: string;
  phone?: string;
  notes?: string;
  confidence: "High" | "Medium" | "Low";
  source?: ImportSourceSpan;
}

export interface ImportDraftOrderTemplate {
  id: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  dueDate?: string;
  productName?: string;
  recipeName?: string;
  requestedYieldQuantity?: number;
  yieldUnit?: string;
  deliveryMethod?: string;
  notes?: string;
  confidence: "High" | "Medium" | "Low";
  source?: ImportSourceSpan;
}

export interface ImportDraft {
  parserVersion: string;
  source: { name: string; type: string; mimeType?: string; extension?: string };
  recipes: ImportDraftRecipe[];
  ingredients: ImportDraftIngredient[];
  suppliers: ImportDraftSupplier[];
  conversionRules: ImportDraftConversionRule[];
  customerTemplates: ImportDraftCustomerTemplate[];
  orderTemplates: ImportDraftOrderTemplate[];
  warnings: string[];
  counts: {
    recipes: number;
    ingredients: number;
    suppliers: number;
    conversionRules: number;
    customerTemplates?: number;
    orderTemplates?: number;
    reviewItems: number;
  };
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
  ingredientState?: string;
  temperatureState?: string;
  formulaContext?: string;
  updatedAt: string;
}

export interface ProductionQcLog {
  id: string;
  orderId: string;
  recipeId?: string;
  batchKey?: string;
  formulaVersion?: string;
  expectedYieldQuantity?: number;
  actualYieldQuantity?: number;
  yieldUnit?: string;
  roomTemperature?: string;
  mixTemperature?: string;
  ovenTemperature?: string;
  bakeTimeMinutes?: number;
  restTimeMinutes?: number;
  sensoryNotes?: string;
  defects?: string;
  nextAdjustment?: string;
  passedQc?: boolean;
  loggedBy?: string;
  createdAt: string;
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
