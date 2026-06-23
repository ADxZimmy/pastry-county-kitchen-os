const IMPORT_PARSER_VERSION = "phase006.1";
const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

const supportedUnits = new Set(["g", "kg", "ml", "litre", "pcs", "cup", "tablespoon", "teaspoon", "pack", "roll", "egg", "yolk", "white"]);
const textExtensions = new Set(["txt", "md", "csv", "tsv"]);
const imageExtensions = new Set(["jpg", "jpeg", "png", "webp", "heic"]);
const providerExtensions = new Set(["xls", "doc", ...imageExtensions]);

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slug(value, fallback = "import") {
  return (normalizeKey(value) || fallback).replace(/\s+/g, "-").slice(0, 64);
}

function titleCase(value) {
  const normalized = normalizeKey(value);
  if (!normalized) return "";
  return normalized.split(" ").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function parseNumber(value, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const raw = cleanText(value).replace(/[₦$£€,]/g, "");
  if (!raw) return fallback;
  if (/^\d+\s*\/\s*\d+$/.test(raw)) {
    const [left, right] = raw.split("/").map(Number);
    return right ? left / right : fallback;
  }
  const mixed = raw.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUnit(value, fallback = "g") {
  const unit = cleanText(value).toLowerCase().replace(/[.?!,;:]+$/g, "");
  const aliases = {
    grams: "g",
    gram: "g",
    kilogram: "kg",
    kilograms: "kg",
    litres: "litre",
    liters: "litre",
    millilitres: "ml",
    milliliters: "ml",
    tablespoons: "tablespoon",
    tbsp: "tablespoon",
    teaspoons: "teaspoon",
    tsp: "teaspoon",
    pieces: "pcs",
    piece: "pcs",
    eggs: "egg",
    yolks: "yolk",
    whites: "white",
    cups: "cup",
    packs: "pack",
    rolls: "roll"
  };
  const normalized = aliases[unit] ?? unit;
  return supportedUnits.has(normalized) ? normalized : fallback;
}

function sourceSpan(source, patch = {}) {
  return {
    sourceName: source?.name || "Pasted text",
    sourceType: source?.type || "text",
    ...patch
  };
}

function sourceReference(span = {}) {
  return [
    span.sourceName,
    span.sheet ? `sheet ${span.sheet}` : "",
    span.page ? `page ${span.page}` : "",
    span.row ? `row ${span.row}` : "",
    span.line ? `line ${span.line}` : ""
  ].filter(Boolean).join(" | ");
}

function getValue(row, keys, fallback = "") {
  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (row[normalized] !== undefined && row[normalized] !== null && cleanText(row[normalized]) !== "") return row[normalized];
  }
  return fallback;
}

function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function parseDelimited(text, delimiter = undefined) {
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const inferredDelimiter = delimiter ?? (lines.some((line) => line.includes("\t")) ? "\t" : ",");
  return lines.map((line) => parseDelimitedLine(line, inferredDelimiter));
}

function rowsToObjects(rows, source) {
  const nonEmpty = rows.filter((row) => row.some((cell) => cleanText(cell)));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map((header, index) => normalizeKey(header) || `column ${index + 1}`);
  const hasUsefulHeader = headers.some((header) => [
    "type",
    "record type",
    "recipe",
    "recipe name",
    "ingredient",
    "ingredient name",
    "supplier",
    "from unit",
    "to unit",
    "conversion factor"
  ].includes(header));
  if (!hasUsefulHeader) return [];
  return nonEmpty.slice(1).map((row, index) => ({
    values: Object.fromEntries(headers.map((header, cellIndex) => [header, row[cellIndex] ?? ""])),
    span: sourceSpan(source, { row: index + 2, text: row.join(" | ") })
  }));
}

function ingredientMaps(context = {}) {
  const ingredients = Array.isArray(context.ingredients) ? context.ingredients : [];
  return {
    byId: new Map(ingredients.map((item) => [cleanText(item.id), item])),
    byName: new Map(ingredients.map((item) => [normalizeKey(item.name), item]))
  };
}

function findIngredient(name, context = {}) {
  const normalized = normalizeKey(name);
  if (!normalized) return undefined;
  const { byId, byName } = ingredientMaps(context);
  return byId.get(cleanText(name)) || byName.get(normalized)
    || [...byName.entries()].find(([key]) => key.includes(normalized) || normalized.includes(key))?.[1];
}

function findRecipeDuplicate(name, context = {}) {
  const normalized = normalizeKey(name);
  return (Array.isArray(context.recipes) ? context.recipes : []).filter((item) => normalizeKey(item.name) === normalized);
}

function findSupplier(name, context = {}) {
  const normalized = normalizeKey(name);
  return (Array.isArray(context.suppliers) ? context.suppliers : []).find((item) => item.id === name || normalizeKey(item.name) === normalized);
}

function inferIngredientCategory(name, unit = "g") {
  const normalized = normalizeKey(name);
  if (normalized.includes("chocolate") || normalized.includes("cocoa")) return "Chocolate";
  if (/(egg|milk|cream|butter|yoghurt|yogurt|cheese)/.test(normalized)) return "Dairy";
  if (/(berry|berries|banana|lemon|apple|orange|mango|fruit)/.test(normalized)) return "Fruits";
  if (/(box|bag|cupcake liner|label|ribbon|packaging|carton|foil|wrap)/.test(normalized) || ["pack", "roll"].includes(unit)) return "Packaging";
  return "Dry Goods";
}

function confidenceForLine({ ingredientId, quantity, unit }) {
  if (!ingredientId) return "Low";
  if (!Number.isFinite(quantity) || quantity <= 0) return "Low";
  if (!supportedUnits.has(unit)) return "Medium";
  return "High";
}

function registerIngredientDraft(draft, rawName, unit, row = {}, context = {}, span = {}) {
  const name = titleCase(rawName);
  if (!name) return undefined;
  const existing = findIngredient(name, context);
  if (existing) return existing.id;
  const key = normalizeKey(name);
  if (!draft.ingredients.some((item) => normalizeKey(item.name) === key)) {
    const supplierName = cleanText(getValue(row, ["supplier", "supplier name"]));
    const supplier = supplierName ? findSupplier(supplierName, context) : undefined;
    draft.ingredients.push({
      id: `draft-ing-${slug(name)}`,
      name,
      category: cleanText(getValue(row, ["category", "ingredient category"])) || inferIngredientCategory(name, unit),
      baseUnit: unit,
      purchaseUnit: unit,
      latestUnitCost: parseNumber(getValue(row, ["latest unit cost", "unit cost", "cost per unit", "line amount", "amount"]), 0),
      supplierId: supplier?.id,
      supplierName: supplierName || undefined,
      reorderLevel: parseNumber(getValue(row, ["reorder level", "reorder", "par level"]), 0),
      notes: cleanText(getValue(row, ["notes", "ingredient notes"])),
      confidence: supplierName && !supplier ? "Medium" : "High",
      duplicateCandidates: [],
      source: span
    });
  }
  return undefined;
}

function emptyDraft(source) {
  return {
    parserVersion: IMPORT_PARSER_VERSION,
    source,
    recipes: [],
    ingredients: [],
    suppliers: [],
    conversionRules: [],
    warnings: [],
    counts: {
      recipes: 0,
      ingredients: 0,
      suppliers: 0,
      conversionRules: 0,
      reviewItems: 0
    }
  };
}

function finalizeDraft(draft) {
  draft.recipes.forEach((recipe) => {
    const reviewItems = recipe.items.filter((item) => item.needsReview).length;
    recipe.reviewCount = reviewItems + (recipe.duplicateCandidates?.length ? 1 : 0);
    recipe.confidence = recipe.items.length && reviewItems === 0 && !recipe.duplicateCandidates?.length ? "High" : reviewItems <= 1 ? "Medium" : "Low";
    if (!recipe.items.length) {
      recipe.confidence = "Low";
      recipe.warnings = [...(recipe.warnings ?? []), "Recipe has no ingredient lines."];
    }
  });
  draft.counts = {
    recipes: draft.recipes.length,
    ingredients: draft.ingredients.length,
    suppliers: draft.suppliers.length,
    conversionRules: draft.conversionRules.length,
    reviewItems: draft.recipes.reduce((sum, recipe) => sum + (recipe.reviewCount ?? 0), 0)
      + draft.ingredients.filter((item) => item.confidence !== "High").length
      + draft.conversionRules.filter((item) => item.confidence !== "High").length
  };
  if (!draft.counts.recipes && !draft.counts.ingredients && !draft.counts.suppliers && !draft.counts.conversionRules) {
    draft.warnings.push("No importable records were detected. Try a CSV template, clearer headings, or paste the recipe text.");
  }
  return draft;
}

function recipeDraftFor(map, name, row = {}, context = {}, span = {}) {
  const recipeName = cleanText(name) || "Imported Recipe";
  const key = normalizeKey(recipeName);
  if (!map.has(key)) {
    const yieldRaw = cleanText(getValue(row, ["yield", "base yield", "base yield quantity"]));
    const yieldMatch = yieldRaw.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z ]+)?/);
    const baseYieldQuantity = parseNumber(getValue(row, ["base yield quantity", "yield quantity", "qty yield"]), yieldMatch ? parseNumber(yieldMatch[1], 1) : 1);
    const yieldUnit = cleanText(getValue(row, ["yield unit"], yieldMatch?.[2] || "batch")) || "batch";
    map.set(key, {
      id: `draft-recipe-${slug(recipeName)}`,
      name: recipeName,
      category: cleanText(getValue(row, ["category", "recipe category", "product family"])) || "Imported",
      baseYieldQuantity: baseYieldQuantity || 1,
      yieldUnit,
      notes: cleanText(getValue(row, ["notes", "recipe notes"])),
      instructions: [],
      formulaMetadata: {
        productFamily: cleanText(getValue(row, ["product family"])) || undefined,
        formulaVersion: cleanText(getValue(row, ["formula version"])) || undefined,
        panProfile: cleanText(getValue(row, ["pan profile", "pan"])) || undefined,
        ovenTemperature: cleanText(getValue(row, ["oven", "oven temperature"])) || undefined,
        bakeTimeRange: cleanText(getValue(row, ["bake time", "bake time range"])) || undefined,
        mixingMethod: cleanText(getValue(row, ["mixing method", "method"])) || undefined,
        testBakeStatus: "test_bake_needed"
      },
      costProfile: {
        laborMinutes: parseNumber(getValue(row, ["labor minutes"]), 0) || undefined,
        laborRatePerHour: parseNumber(getValue(row, ["labor rate", "labor rate per hour"]), 0) || undefined,
        packagingCost: parseNumber(getValue(row, ["packaging cost"]), 0) || undefined,
        overheadCost: parseNumber(getValue(row, ["overhead cost"]), 0) || undefined,
        utilityCost: parseNumber(getValue(row, ["utility cost"]), 0) || undefined,
        failureAllowancePercentage: parseNumber(getValue(row, ["failure allowance", "failure allowance percentage"]), 0) || undefined,
        yieldLossPercentage: parseNumber(getValue(row, ["yield loss", "yield loss percentage"]), 0) || undefined
      },
      items: [],
      duplicateCandidates: findRecipeDuplicate(recipeName, context).map((item) => ({ id: item.id, name: item.name })),
      source: span,
      warnings: []
    });
  }
  return map.get(key);
}

function addRecipeItem(recipe, draft, row, context, span) {
  const ingredientName = cleanText(getValue(row, ["ingredient", "ingredient name", "item", "raw material", "material"]));
  if (!ingredientName) return;
  const unit = normalizeUnit(getValue(row, ["unit", "needed unit", "quantity unit"]), "g");
  const ingredient = findIngredient(ingredientName, context);
  const ingredientId = ingredient?.id ?? registerIngredientDraft(draft, ingredientName, unit, row, context, span);
  const quantity = parseNumber(getValue(row, ["quantity", "needed quantity", "needed", "qty", "amount needed"]), 0);
  const lineAmount = parseNumber(getValue(row, ["line amount", "source line amount", "cost amount", "total cost", "amount"]), 0);
  const packageQuantity = parseNumber(getValue(row, ["package quantity", "pack quantity", "pack size", "source package quantity"]), 0);
  const packagePrice = parseNumber(getValue(row, ["package price", "pack price", "source package price"]), 0);
  const confidence = confidenceForLine({ ingredientId, quantity, unit });
  recipe.items.push({
    id: `draft-item-${recipe.items.length + 1}`,
    ingredientId,
    ingredientName: ingredient?.name ?? titleCase(ingredientName),
    quantity,
    unit,
    wastePercentage: parseNumber(getValue(row, ["waste", "waste percentage"]), 0),
    notes: cleanText(getValue(row, ["notes", "item notes"])),
    confidence,
    needsReview: confidence !== "High",
    source: span,
    prepState: {
      sequence: recipe.items.length + 1,
      ingredientState: cleanText(getValue(row, ["ingredient state", "state"])) || undefined,
      temperatureState: cleanText(getValue(row, ["temperature state", "temperature"])) || undefined,
      dividedUse: cleanText(getValue(row, ["divided use", "divided"])) || undefined,
      preparationNotes: cleanText(getValue(row, ["preparation notes", "prep notes"])) || undefined,
      sourceLineName: ingredientName,
      sourceFile: span.sourceName,
      sourceType: span.sourceType,
      sourceReference: sourceReference(span),
      sourceText: span.text,
      sourceSheet: span.sheet,
      sourceRow: span.row,
      sourcePackageQuantity: packageQuantity || undefined,
      sourcePackagePrice: packagePrice || undefined,
      sourceNeededQuantity: quantity || undefined,
      sourceLineAmount: lineAmount || undefined
    }
  });
}

function buildDraftFromObjectRows(objectRows, source, context = {}) {
  const draft = emptyDraft(source);
  const recipeMap = new Map();
  for (const { values: row, span } of objectRows) {
    const recordType = normalizeKey(getValue(row, ["type", "record type", "record"]));
    const recipeName = cleanText(getValue(row, ["recipe", "recipe name", "product", "product name"]));
    const ingredientName = cleanText(getValue(row, ["ingredient", "ingredient name", "item", "raw material", "material"]));
    const supplierName = cleanText(getValue(row, ["supplier", "supplier name"]));
    const fromUnit = cleanText(getValue(row, ["from unit", "from"]));
    const toUnit = cleanText(getValue(row, ["to unit", "to"]));
    const factor = parseNumber(getValue(row, ["conversion factor", "factor", "value"]), 0);
    const instruction = cleanText(getValue(row, ["instruction", "instructions", "method step", "step"]));

    if (recordType.includes("supplier") || (supplierName && !recipeName && !ingredientName && !fromUnit)) {
      if (!findSupplier(supplierName, context) && !draft.suppliers.some((item) => normalizeKey(item.name) === normalizeKey(supplierName))) {
        draft.suppliers.push({
          id: `draft-sup-${slug(supplierName)}`,
          name: supplierName,
          contactName: cleanText(getValue(row, ["contact", "contact name"])),
          phone: cleanText(getValue(row, ["phone", "telephone"])),
          email: cleanText(getValue(row, ["email"])),
          address: cleanText(getValue(row, ["address"])),
          defaultCurrency: cleanText(getValue(row, ["currency", "default currency"], "NGN")) || "NGN",
          leadTimeDays: parseNumber(getValue(row, ["lead time", "lead time days"]), 2),
          notes: cleanText(getValue(row, ["notes"])),
          confidence: supplierName ? "High" : "Low",
          source: span
        });
      }
      continue;
    }

    if (recordType.includes("conversion") || (fromUnit && toUnit && factor > 0)) {
      const ingredient = findIngredient(ingredientName, context);
      draft.conversionRules.push({
        id: `draft-conv-${draft.conversionRules.length + 1}`,
        ingredientId: ingredient?.id,
        ingredientName: ingredient?.name ?? titleCase(ingredientName),
        fromUnit: normalizeUnit(fromUnit, fromUnit),
        toUnit: normalizeUnit(toUnit, toUnit),
        conversionFactor: factor,
        confidenceLevel: cleanText(getValue(row, ["confidence", "confidence level"], "Medium")) || "Medium",
        sourceLabel: cleanText(getValue(row, ["source"], "imported source")) || "imported source",
        verified: false,
        confidence: ingredient ? "High" : "Low",
        needsReview: !ingredient,
        source: span
      });
      continue;
    }

    if (ingredientName && (!recipeName || recordType.includes("ingredient"))) {
      registerIngredientDraft(draft, ingredientName, normalizeUnit(getValue(row, ["base unit", "unit"], "g")), row, context, span);
    }

    if (recipeName) {
      const recipe = recipeDraftFor(recipeMap, recipeName, row, context, span);
      if (instruction && !recipe.instructions.includes(instruction)) recipe.instructions.push(instruction);
      if (ingredientName) addRecipeItem(recipe, draft, row, context, span);
    }
  }
  draft.recipes = [...recipeMap.values()];
  return finalizeDraft(draft);
}

function parseIngredientLine(line) {
  const clean = cleanText(line).replace(/^[-*]\s*/, "");
  const [main, ...metaParts] = clean.split("|").map((part) => part.trim());
  const match = main.match(/^(\d+(?:\.\d+)?|\d+\s+\d+\/\d+|\d+\/\d+)\s+([a-zA-Z ]+?)\s+(.+)$/);
  if (!match) return undefined;
  const metaText = metaParts.join(" | ");
  const meta = {};
  for (const part of metaParts) {
    const [key, value] = part.split(/[:=]/).map((item) => cleanText(item));
    if (key && value) meta[normalizeKey(key)] = value;
  }
  return {
    quantity: parseNumber(match[1]),
    unit: normalizeUnit(match[2]),
    ingredient: match[3],
    "package quantity": meta["package quantity"] ?? meta.package ?? meta.pack,
    "package price": meta["package price"] ?? meta.price,
    "line amount": meta["line amount"] ?? meta.amount ?? meta.cost,
    notes: meta.notes,
    text: metaText ? `${main} | ${metaText}` : main
  };
}

function parsePlainText(text, source, context = {}) {
  const draft = emptyDraft(source);
  const recipeMap = new Map();
  const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let currentRecipe;
  let mode = "metadata";
  lines.forEach((line, index) => {
    const span = sourceSpan(source, { line: index + 1, text: line });
    const metadata = line.match(/^([a-zA-Z ]+):\s*(.+)$/);
    if (metadata) {
      const key = normalizeKey(metadata[1]);
      const value = cleanText(metadata[2]);
      if (key === "recipe" || key === "recipe name" || key === "product") {
        currentRecipe = recipeDraftFor(recipeMap, value, {}, context, span);
        return;
      }
      if (!currentRecipe) currentRecipe = recipeDraftFor(recipeMap, "Imported Recipe", {}, context, span);
      if (key === "category") currentRecipe.category = value;
      else if (key === "yield" || key === "base yield") {
        const yieldMatch = value.match(/(\d+(?:\.\d+)?)\s*(.*)$/);
        currentRecipe.baseYieldQuantity = parseNumber(yieldMatch?.[1], 1);
        currentRecipe.yieldUnit = cleanText(yieldMatch?.[2]) || currentRecipe.yieldUnit;
      } else if (key === "ingredients") mode = "ingredients";
      else if (key === "instructions" || key === "method") mode = "instructions";
      else if (key === "oven" || key === "oven temperature") currentRecipe.formulaMetadata.ovenTemperature = value;
      else if (key === "bake time" || key === "bake time range") currentRecipe.formulaMetadata.bakeTimeRange = value;
      else if (key === "notes") currentRecipe.notes = value;
      return;
    }
    if (/^ingredients\b/i.test(line)) {
      mode = "ingredients";
      return;
    }
    if (/^(instructions|method|procedure)\b/i.test(line)) {
      mode = "instructions";
      return;
    }
    if (!currentRecipe) currentRecipe = recipeDraftFor(recipeMap, "Imported Recipe", {}, context, span);
    if (mode === "instructions") {
      currentRecipe.instructions.push(line.replace(/^\d+[.)]\s*/, ""));
      return;
    }
    const parsed = parseIngredientLine(line);
    if (parsed) addRecipeItem(currentRecipe, draft, parsed, context, span);
    else if (mode === "ingredients") currentRecipe.warnings.push(`Could not parse ingredient line ${index + 1}: ${line}`);
  });
  draft.recipes = [...recipeMap.values()];
  return finalizeDraft(draft);
}

export function parseImportText(text, source = { name: "Pasted text", type: "text" }, context = {}) {
  const rows = parseDelimited(text, source.extension === "tsv" ? "\t" : undefined);
  const objects = rowsToObjects(rows, source);
  if (objects.length) return buildDraftFromObjectRows(objects, source, context);
  return parsePlainText(text, source, context);
}

async function parseXlsx(buffer, source, context) {
  const xlsx = await import("read-excel-file/node");
  const readXlsxFile = xlsx.default;
  const readSheetNames = xlsx.readSheetNames;
  const sheetNames = await readSheetNames(buffer);
  const objectRows = [];
  for (const sheet of sheetNames.slice(0, 12)) {
    const rows = await readXlsxFile(buffer, { sheet });
    objectRows.push(...rowsToObjects(rows, { ...source, type: "xlsx", name: source.name }).map((row) => ({
      values: row.values,
      span: { ...row.span, sheet }
    })));
  }
  return buildDraftFromObjectRows(objectRows, { ...source, type: "xlsx" }, context);
}

async function parseDocx(buffer, source, context) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const draft = parsePlainText(result.value, { ...source, type: "docx" }, context);
  if (result.messages?.length) draft.warnings.push(...result.messages.slice(0, 5).map((message) => `DOCX parser: ${message.message}`));
  return draft;
}

async function parsePdf(buffer, source, context) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const draft = parsePlainText(result.text, { ...source, type: "pdf" }, context);
    if (!result.text?.trim()) draft.warnings.push("No selectable PDF text was found. Use OCR/vision extraction for scanned PDFs.");
    return draft;
  } finally {
    await parser.destroy();
  }
}

async function parseWithOpenAiProvider({ buffer, base64, source, context }) {
  if (!process.env.OPENAI_API_KEY) {
    const draft = emptyDraft(source);
    draft.warnings.push(`${source.extension?.toUpperCase() || "This"} import needs OCR/vision extraction. Configure OPENAI_API_KEY or paste extracted text/CSV for now.`);
    return finalizeDraft(draft);
  }
  const fileData = base64 || buffer.toString("base64");
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      text: { type: "string" },
      warnings: { type: "array", items: { type: "string" } }
    },
    required: ["text", "warnings"]
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMPORT_MODEL || "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Extract all readable recipe, costing, ingredient, supplier, and conversion text from this bakery import source. Preserve table rows as CSV-like lines where possible." },
          imageExtensions.has(source.extension)
            ? { type: "input_image", image_url: `data:${source.mimeType || "image/jpeg"};base64,${fileData}` }
            : { type: "input_file", filename: source.name, file_data: `data:${source.mimeType || "application/octet-stream"};base64,${fileData}` }
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "pastry_county_import_text",
          strict: true,
          schema
        }
      }
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const draft = emptyDraft(source);
    draft.warnings.push(result.error?.message || `OCR/vision extraction failed with status ${response.status}.`);
    return finalizeDraft(draft);
  }
  const outputText = result.output_text || result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text || "{}";
  const parsed = JSON.parse(outputText);
  const draft = parsePlainText(parsed.text || "", source, context);
  draft.warnings.push(...(Array.isArray(parsed.warnings) ? parsed.warnings : []));
  return finalizeDraft(draft);
}

function extensionFromName(name = "") {
  return cleanText(name).split(".").pop()?.toLowerCase() || "";
}

export async function extractImportDraft(input = {}, context = {}) {
  const sourceInput = input.source ?? input;
  const source = {
    name: cleanText(sourceInput.name || sourceInput.filename || "Pasted text"),
    type: cleanText(sourceInput.type || sourceInput.kind || "text"),
    mimeType: cleanText(sourceInput.mimeType),
    extension: cleanText(sourceInput.extension || extensionFromName(sourceInput.name || sourceInput.filename))
  };
  if (sourceInput.text !== undefined) return parseImportText(String(sourceInput.text), source, context);
  const base64 = cleanText(sourceInput.base64);
  if (!base64) {
    const draft = emptyDraft(source);
    draft.warnings.push("No file content was supplied for import.");
    return finalizeDraft(draft);
  }
  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > MAX_IMPORT_BYTES) {
    throw Object.assign(new Error("Import file is too large. Use a file under 4MB or split the workbook into smaller sheets."), { statusCode: 413 });
  }
  if (textExtensions.has(source.extension)) return parseImportText(buffer.toString("utf8"), source, context);
  if (source.extension === "xlsx") return parseXlsx(buffer, source, context);
  if (source.extension === "docx") return parseDocx(buffer, source, context);
  if (source.extension === "pdf") return parsePdf(buffer, source, context);
  if (providerExtensions.has(source.extension)) return parseWithOpenAiProvider({ buffer, base64, source, context });
  const draft = emptyDraft(source);
  draft.warnings.push(`Unsupported import file type ".${source.extension}". Use CSV, TSV, TXT, MD, XLSX, DOCX, PDF, or an image file.`);
  return finalizeDraft(draft);
}

export function importParserVersion() {
  return IMPORT_PARSER_VERSION;
}
