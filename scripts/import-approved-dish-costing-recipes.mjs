import { readFile } from "node:fs/promises";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

dotenv.config({ path: ".env.production.local" });
dotenv.config();

const DOC_PATH = new URL("../docs/dish-costing-recipe-approval.md", import.meta.url);
const SOURCE_WORKBOOK = "Dish Costing";
const SOURCE_WORKBOOK_ID = "1LYbXObhU1vjMhaNlJyLnhxl_yTE5V1tMFjaZt0tKcwY";
const SOURCE_REVISION = "3942";
const APPROVED_MAX = 29;
const APPLY = process.env.APPLY_DISH_COSTING_RECIPES === "1";
const ACTOR = "codex-dish-costing-recipe-import";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. The live import reads it from .env.production.local.");
}

const sql = neon(process.env.DATABASE_URL);

function normalizeName(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[()]/g, " ")
    .replace(/[./_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function titleCase(value) {
  return normalizeName(value).split(" ").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function slug(value) {
  return normalizeName(value).replace(/\s+/g, "-").slice(0, 56);
}

function stableId(prefix, number, title) {
  return `${prefix}-dc-${String(number).padStart(3, "0")}-${slug(title)}`;
}

function parseNumber(value) {
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceSheetFromRange(sourceRange) {
  return String(sourceRange).split("!")[0].trim();
}

function categoryFromTitle(title) {
  const prefix = title.split(" - ")[0]?.trim() ?? "Dish Costing";
  const aliases = {
    "BAO BUN": "Bao Bun",
    BREADS: "Breads",
    CAKES: "Cakes",
    CHOUX: "Choux"
  };
  return aliases[prefix] ?? prefix;
}

function parseRecipes(markdown) {
  const headings = [...markdown.matchAll(/^### (\d+)\. ([^\r\n]+)/gm)];
  return headings
    .map((heading, index) => {
      const [, numberText, title] = heading;
      const bodyStart = heading.index + heading[0].length;
      const bodyEnd = headings[index + 1]?.index ?? markdown.length;
      const body = markdown.slice(bodyStart, bodyEnd);
      const number = Number(numberText);
      const sourceRange = body.match(/Source: `([^`]+)`/)?.[1] ?? "";
      const totalCost = parseNumber(body.match(/Total cost(?: shown)?: `([^`]+)`/)?.[1]);
      const halfRecipe = parseNumber(body.match(/half recipe(?: shown)?: `([^`]+)`/)?.[1]);
      const items = [...body.matchAll(/^- ([^:\r\n]+): package `([^`]+)`, price `([^`]+)`, needed `([^`]+)`, amount `([^`]+)`/gm)]
        .map(([, sourceName, packageQuantity, packagePrice, neededQuantity, amount]) => ({
          sourceName: sourceName.trim(),
          packageQuantity: parseNumber(packageQuantity),
          packagePrice: parseNumber(packagePrice),
          neededQuantity: parseNumber(neededQuantity),
          amount: parseNumber(amount)
        }));
      const listed = body.match(/Ingredients listed: ([^\r\n]+)/)?.[1]
        ?.split(";")
        .map((item) => item.replace(/\.$/, "").trim())
        .filter(Boolean) ?? [];
      return {
        number,
        title: title.trim(),
        category: categoryFromTitle(title),
        sourceRange,
        sourceSheet: sourceSheetFromRange(sourceRange),
        totalCost,
        halfRecipe,
        items,
        listed
      };
    })
    .filter((recipe) => recipe.number >= 1 && recipe.number <= APPROVED_MAX);
}

const canonicalAliases = new Map(Object.entries({
  "baking powder": "Baking Powder",
  "baking soda": "Baking Soda",
  "bittersweet chocolate": "Bittersweet Chocolate",
  blueberry: "Blueberries",
  blueberries: "Blueberries",
  "brown sugar": "Brown Sugar",
  butter: "Butter",
  "cake flour": "Cake Flour",
  cinnamon: "Ground Cinnamon",
  "cocoa powder": "Cocoa Powder",
  "coconut essence": "Coconut Essence",
  "coconut milk": "Coconut Milk",
  "coconut shredded": "Shredded Coconut",
  "corn flour": "Cornstarch",
  cornstarch: "Cornstarch",
  "crumble butter": "Butter",
  "crumble flour": "Flour",
  "crumble lemon zest": "Lemon Zest",
  "crumble sugar": "Sugar",
  egg: "Eggs",
  eggs: "Eggs",
  "egg whites": "Egg Whites",
  flour: "Flour",
  "garlic heads": "Garlic Heads",
  "gold leaf": "Gold Leaf",
  "ground anise": "Ground Anise",
  "ground cinnamon": "Ground Cinnamon",
  "ground cloves": "Ground Cloves",
  "ground ginger": "Ground Ginger",
  "happy birthday": "Happy Birthday Topper",
  "icing sugar": "Icing Sugar",
  "kosher salt": "Kosher Salt",
  "lemon juice": "Lemon Juice",
  "lemon zest": "Lemon Zest",
  milk: "Milk",
  "number decoration": "Number Decoration",
  "olive oil": "Olive Oil",
  oreos: "Oreos",
  "piping bag": "Piping Bag",
  salt: "Salt",
  sugar: "Sugar",
  "sugar coating": "Sugar",
  "sourdough starter flour": "Flour",
  "sourdough starter water": "Water",
  "unsalted butter": "Unsalted Butter",
  vanilla: "Vanilla Extract",
  "vanilla extract": "Vanilla Extract",
  "vanilla oil": "Vanilla Oil",
  "v oil": "Vegetable Oil",
  water: "Water",
  "white chocolate": "White Chocolate",
  "whipped cream": "Whipped Cream",
  yoghurt: "Yoghurt"
}));

const preferredExistingIds = new Map(Object.entries({
  "Baking Powder": "baking-powder",
  Blueberries: "blueberries",
  "Cocoa Powder": "cocoa",
  "Coconut Oil": "coconut-oil",
  "Dark Chocolate": "dark-chocolate",
  "Egg Whites": "egg-whites",
  "Egg Yolks": "egg-yolks",
  Eggs: "eggs",
  Flour: "flour",
  Lemon: "lemon",
  Salt: "salt",
  Sugar: "sugar",
  "Vanilla Extract": "vanilla",
  "White Chocolate": "white-chocolate"
}));

const countNames = new Set([
  "butterflies",
  "decoration ball",
  "garlic heads",
  "gold leaf",
  "happy birthday",
  "number decoration",
  "orange",
  "piping bag"
]);

const liquidWords = [
  "cream",
  "essence",
  "extract",
  "milk",
  "oil",
  "sauce",
  "vinegar",
  "water",
  "wine"
];

function inferUnit(line) {
  const name = normalizeName(line.sourceName);
  if (name === "egg" || name === "eggs") return line.packageQuantity > 1 && line.neededQuantity > 20 ? "g" : "pcs";
  if (name === "egg whites" || name === "egg yolks") return "g";
  if (name === "banana" && line.packageQuantity > 100) return "g";
  if (name === "lemon" && line.packageQuantity > 10) return "g";
  if (name === "lemon juice" || name === "lemon zest" || name === "crumble lemon zest") return "pcs";
  if (name === "vanilla") return "ml";
  if (countNames.has(name)) return "pcs";
  if (["apples", "carrot"].includes(name)) return "g";
  if (name === "yoghurt") return "g";
  if (liquidWords.some((word) => name.includes(word))) return "ml";
  return "g";
}

function canonicalNameFor(line, unit) {
  const name = normalizeName(line.sourceName);
  let canonical = canonicalAliases.get(name) ?? titleCase(line.sourceName);
  if (canonical === "Banana" && unit === "g") canonical = "Banana (Weight)";
  if (canonical === "Lemon" && unit === "g") canonical = "Lemon (Weight)";
  return canonical;
}

function inferCategory(canonicalName, unit) {
  const name = normalizeName(canonicalName);
  if (["piping bag", "decoration ball", "happy birthday topper", "number decoration", "butterflies", "gold leaf"].includes(name)) return "Packaging";
  if (name.includes("chocolate") || name === "cocoa powder") return "Chocolate";
  if (["banana weight", "blueberries", "lemon", "lemon juice", "lemon weight", "lemon zest", "orange", "apples", "carrot"].includes(name)) return "Fruits";
  if (["butter", "unsalted butter", "eggs", "egg whites", "milk", "whipped cream", "yoghurt", "coconut milk"].includes(name)) return "Dairy";
  if (["ground cinnamon", "ground cloves", "ground anise", "ground ginger", "nutmeg", "kosher salt", "salt", "parsley"].includes(name)) return "Dry Goods";
  if (name.includes("oil")) return "Dry Goods";
  if (unit === "pcs") return "Dry Goods";
  return "Dry Goods";
}

function ingredientUnitCost(line) {
  if (!line.packageQuantity) return 0;
  return Number((line.packagePrice / line.packageQuantity).toFixed(4));
}

function existingIngredientIdFor(canonicalName, unit, existingByName, existingById) {
  const preferredId = preferredExistingIds.get(canonicalName);
  const preferred = preferredId ? existingById.get(preferredId) : undefined;
  if (preferred && (preferred.base_unit === unit || preferred.id === "eggs")) return preferred.id;
  const exact = existingByName.get(normalizeName(canonicalName));
  if (exact && (exact.base_unit === unit || exact.id === "eggs")) return exact.id;
  return undefined;
}

function recipeNotes(recipe) {
  if (recipe.items.length) {
    return `Imported from Dish Costing approval #${recipe.number}. Source range ${recipe.sourceRange}. Ingredient line costs come from workbook revision ${SOURCE_REVISION}.`;
  }
  return `Approved from Dish Costing approval #${recipe.number}, but the workbook block only listed ingredient names. Quantities and prices still need completion before production costing.`;
}

function buildImport(recipes, existingIngredients) {
  const existingById = new Map(existingIngredients.map((item) => [item.id, item]));
  const existingByName = new Map();
  for (const item of existingIngredients) {
    if (!String(item.name).startsWith("AUDIT-") && !existingByName.has(normalizeName(item.name))) {
      existingByName.set(normalizeName(item.name), item);
    }
  }

  const newIngredients = new Map();
  const importRecipes = recipes.map((recipe) => {
    const productId = stableId("prod", recipe.number, recipe.title);
    const recipeId = stableId("recipe", recipe.number, recipe.title);
    const items = recipe.items
      .filter((line) => line.neededQuantity > 0)
      .map((line, index) => {
        const unit = inferUnit(line);
        const canonicalName = canonicalNameFor(line, unit);
        const existingId = existingIngredientIdFor(canonicalName, unit, existingByName, existingById);
        const ingredientId = existingId ?? `ing-dc-${slug(canonicalName)}`;
        if (!existingId && !newIngredients.has(ingredientId)) {
          newIngredients.set(ingredientId, {
            id: ingredientId,
            name: canonicalName,
            category: inferCategory(canonicalName, unit),
            baseUnit: unit,
            unitCost: ingredientUnitCost(line),
            notes: `Created from ${SOURCE_WORKBOOK} recipe approval import. First source line: ${line.sourceName}.`
          });
        }
        return {
          id: `ri-dc-${String(recipe.number).padStart(3, "0")}-${String(index + 1).padStart(2, "0")}`,
          ingredientId,
          sourceName: line.sourceName,
          quantity: line.neededQuantity,
          unit,
          amount: line.amount,
          packageQuantity: line.packageQuantity,
          packagePrice: line.packagePrice
        };
      });
    return {
      ...recipe,
      productId,
      recipeId,
      items
    };
  });

  return {
    recipes: importRecipes,
    newIngredients: [...newIngredients.values()]
  };
}

function printSummary(plan) {
  const itemCount = plan.recipes.reduce((sum, recipe) => sum + recipe.items.length, 0);
  const draftCount = plan.recipes.filter((recipe) => recipe.items.length === 0).length;
  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    recipes: plan.recipes.length,
    completeRecipes: plan.recipes.length - draftCount,
    draftRecipes: draftCount,
    recipeItems: itemCount,
    newIngredients: plan.newIngredients.length,
    newIngredientNames: plan.newIngredients.map((item) => `${item.name} (${item.baseUnit}, ${item.unitCost})`)
  }, null, 2));
}

const markdown = await readFile(DOC_PATH, "utf8");
const approvedRecipes = parseRecipes(markdown);
const existingIngredients = await sql`
  select id, name, category, base_unit, latest_unit_cost
  from ingredients
  where active = true and id not like 'AUDIT-%'
  order by name, id
`;
const plan = buildImport(approvedRecipes, existingIngredients);
printSummary(plan);

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY_DISH_COSTING_RECIPES=1 to write to Neon.");
  process.exit(0);
}

const runStamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const auditId = (entity, index) => `audit-dc-recipe-import-${runStamp}-${entity}-${String(index).padStart(3, "0")}`;

await sql.transaction((txn) => [
  txn`
    insert into conversion_rules (id, ingredient_id, from_unit, to_unit, conversion_factor, conversion_type, confidence_level, source, verified, active)
    values ('cr-egg-g-to-pcs', 'eggs', 'g', 'pcs', 0.02, 'ingredient_specific', 'Medium', 'manual entry', true, true)
    on conflict (id) do update set ingredient_id = excluded.ingredient_id, from_unit = excluded.from_unit, to_unit = excluded.to_unit,
      conversion_factor = excluded.conversion_factor, conversion_type = excluded.conversion_type, confidence_level = excluded.confidence_level,
      source = excluded.source, verified = excluded.verified, active = true, updated_at = now()
  `,
  txn`
    insert into audit_logs (id, entity_type, entity_id, action, before_data, after_data, actor)
    values (${auditId("conversion", 1)}, 'conversion_rules', 'cr-egg-g-to-pcs', 'dish_costing_recipe_import', null,
      ${JSON.stringify({ ingredientId: "eggs", fromUnit: "g", toUnit: "pcs", conversionFactor: 0.02, sourceRevision: SOURCE_REVISION })}::jsonb, ${ACTOR})
  `,
  ...plan.newIngredients.flatMap((ingredient, index) => [
    txn`
      insert into ingredients (id, name, category, base_unit, purchase_unit, current_stock, reserved_stock, reorder_level, latest_unit_cost, notes, active)
      values (${ingredient.id}, ${ingredient.name}, ${ingredient.category}, ${ingredient.baseUnit}, ${ingredient.baseUnit}, 0, 0, 0, ${ingredient.unitCost}, ${ingredient.notes}, true)
      on conflict (id) do update set name = excluded.name, category = excluded.category, base_unit = excluded.base_unit,
        purchase_unit = excluded.purchase_unit, latest_unit_cost = excluded.latest_unit_cost, notes = excluded.notes,
        active = true, updated_at = now()
    `,
    txn`
      insert into audit_logs (id, entity_type, entity_id, action, before_data, after_data, actor)
      values (${auditId("ingredient", index + 1)}, 'ingredients', ${ingredient.id}, 'dish_costing_recipe_import', null,
        ${JSON.stringify({ name: ingredient.name, baseUnit: ingredient.baseUnit, latestUnitCost: ingredient.unitCost, sourceRevision: SOURCE_REVISION })}::jsonb, ${ACTOR})
    `
  ]),
  ...plan.recipes.flatMap((recipe, recipeIndex) => {
    const formulaMetadata = {
      productFamily: recipe.category,
      formulaVersion: `${SOURCE_WORKBOOK} rev ${SOURCE_REVISION} approval #${recipe.number}`,
      testBakeStatus: recipe.items.length ? "test_bake_needed" : "untested",
      sourceWorkbook: SOURCE_WORKBOOK,
      sourceWorkbookId: SOURCE_WORKBOOK_ID,
      sourceRevision: SOURCE_REVISION,
      sourceRange: recipe.sourceRange,
      approvalNumber: recipe.number,
      sourceTotalCost: recipe.totalCost,
      sourceHalfRecipe: recipe.halfRecipe,
      listedIngredientsOnly: recipe.items.length === 0 ? recipe.listed : undefined
    };
    const costProfile = {
      notes: recipe.items.length
        ? `Ingredient subtotal uses approved source line amounts from ${SOURCE_WORKBOOK} revision ${SOURCE_REVISION}.`
        : "Draft shell only; quantities and prices were not present in the approved workbook block."
    };
    return [
      txn`
        insert into products (id, name, category, description, active)
        values (${recipe.productId}, ${recipe.title}, ${recipe.category}, ${recipeNotes(recipe)}, true)
        on conflict (id) do update set name = excluded.name, category = excluded.category, description = excluded.description,
          active = true, updated_at = now()
      `,
      txn`
        insert into recipes (id, product_id, name, category, base_yield_quantity, yield_unit, instructions, notes, formula_metadata, cost_profile, active)
        values (${recipe.recipeId}, ${recipe.productId}, ${recipe.title}, ${recipe.category}, 1, 'batch', ${[]}, ${recipeNotes(recipe)},
          ${JSON.stringify(formulaMetadata)}::jsonb, ${JSON.stringify(costProfile)}::jsonb, true)
        on conflict (id) do update set product_id = excluded.product_id, name = excluded.name, category = excluded.category,
          base_yield_quantity = excluded.base_yield_quantity, yield_unit = excluded.yield_unit, instructions = excluded.instructions,
          notes = excluded.notes, formula_metadata = excluded.formula_metadata, cost_profile = excluded.cost_profile,
          active = true, updated_at = now()
      `,
      txn`delete from recipe_items where recipe_id = ${recipe.recipeId}`,
      ...recipe.items.map((item, itemIndex) => {
        const prepState = {
          sequence: itemIndex + 1,
          sourceLineName: item.sourceName,
          sourceSheet: recipe.sourceSheet,
          sourceWorkbook: SOURCE_WORKBOOK,
          sourceWorkbookRevision: SOURCE_REVISION,
          sourcePackageQuantity: item.packageQuantity,
          sourcePackagePrice: item.packagePrice,
          sourceNeededQuantity: item.quantity,
          sourceLineAmount: item.amount
        };
        return txn`
          insert into recipe_items (id, recipe_id, ingredient_id, quantity, unit, waste_percentage, notes, prep_state)
          values (${item.id}, ${recipe.recipeId}, ${item.ingredientId}, ${item.quantity}, ${item.unit}, 0,
            ${`Source line: ${item.sourceName}; amount ${item.amount} from ${SOURCE_WORKBOOK} revision ${SOURCE_REVISION}.`},
            ${JSON.stringify(prepState)}::jsonb)
        `;
      }),
      txn`
        insert into audit_logs (id, entity_type, entity_id, action, before_data, after_data, actor)
        values (${auditId("recipe", recipeIndex + 1)}, 'recipes', ${recipe.recipeId}, 'dish_costing_recipe_import', null,
          ${JSON.stringify({
            title: recipe.title,
            approvalNumber: recipe.number,
            sourceRange: recipe.sourceRange,
            itemCount: recipe.items.length,
            listedIngredientsOnly: recipe.items.length === 0 ? recipe.listed : undefined
          })}::jsonb, ${ACTOR})
      `
    ];
  })
]);

console.log("Imported approved Dish Costing recipes 1-29 into Neon.");
