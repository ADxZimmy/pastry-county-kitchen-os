import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { extractImportDraft, parseImportText } from "./_imports.js";

const context = {
  ingredients: [
    { id: "flour", name: "Flour", category: "Dry Goods", baseUnit: "g" },
    { id: "sugar", name: "Sugar", category: "Dry Goods", baseUnit: "g" },
    { id: "eggs", name: "Eggs", category: "Dairy", baseUnit: "pcs" }
  ],
  recipes: [
    { id: "recipe-classic", name: "Classic Brownies", category: "Brownies" }
  ],
  suppliers: [
    { id: "sup-market", name: "Market Supplier" }
  ]
};

function xlsxFixtureBase64() {
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Recipes" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>record_type</t></is></c><c r="B1" t="inlineStr"><is><t>recipe</t></is></c><c r="C1" t="inlineStr"><is><t>category</t></is></c><c r="D1" t="inlineStr"><is><t>base_yield_quantity</t></is></c><c r="E1" t="inlineStr"><is><t>yield_unit</t></is></c><c r="F1" t="inlineStr"><is><t>ingredient</t></is></c><c r="G1" t="inlineStr"><is><t>quantity</t></is></c><c r="H1" t="inlineStr"><is><t>unit</t></is></c><c r="I1" t="inlineStr"><is><t>line_amount</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>recipe</t></is></c><c r="B2" t="inlineStr"><is><t>AUDIT-XLSX Cake</t></is></c><c r="C2" t="inlineStr"><is><t>Cakes</t></is></c><c r="D2"><v>12</v></c><c r="E2" t="inlineStr"><is><t>pieces</t></is></c><c r="F2" t="inlineStr"><is><t>Flour</t></is></c><c r="G2"><v>300</v></c><c r="H2" t="inlineStr"><is><t>g</t></is></c><c r="I2"><v>150</v></c></row></sheetData></worksheet>`
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, strToU8(content)])))).toString("base64");
}

const pdfFixtureBase64 = [
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUg",
  "L1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAg",
  "UiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMg",
  "NSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNh",
  "ID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggMTQ1ID4+CnN0cmVhbQpCVAovRjEgMTIgVGYKNzIgNzIwIFRkCihSZWNpcGU6",
  "IEFVRElULVBERiBCcm93bmllcykgVGoKMCAtMTYgVGQKKFlpZWxkOiA4IHBpZWNlcykgVGoKMCAtMTYgVGQKKEluZ3JlZGllbnRz",
  "OikgVGoKMCAtMTYgVGQKKDMwMCBnIGZsb3VyKSBUagpFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1",
  "MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0",
  "MSAwMDAwMCBuIAowMDAwMDAwMzExIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1Jvb3QgMSAwIFIgL1NpemUgNiA+PgpzdGFydHhyZWYK",
  "NTA2CiUlRU9G"
].join("");

describe("import draft parser", () => {
  it("parses pasted recipe text with source-cost evidence", () => {
    const draft = parseImportText([
      "Recipe: Launch Brownies",
      "Category: Brownies",
      "Yield: 16 pieces",
      "Ingredients:",
      "300 g flour | package quantity: 1000 | package price: 900 | line amount: 270",
      "500 g sugar | amount: 310",
      "4 pcs eggs",
      "Instructions:",
      "Mix batter gently.",
      "Bake until set."
    ].join("\n"), { name: "photo-transcript.txt", type: "text" }, context);

    expect(draft.counts.recipes).toBe(1);
    expect(draft.recipes[0]).toMatchObject({
      name: "Launch Brownies",
      category: "Brownies",
      baseYieldQuantity: 16,
      yieldUnit: "pieces",
      confidence: "High"
    });
    expect(draft.recipes[0].instructions).toEqual(["Mix batter gently.", "Bake until set."]);
    expect(draft.recipes[0].items[0]).toMatchObject({
      ingredientId: "flour",
      quantity: 300,
      unit: "g",
      needsReview: false,
      prepState: {
        sourceFile: "photo-transcript.txt",
        sourceLineName: "flour",
        sourcePackageQuantity: 1000,
        sourcePackagePrice: 900,
        sourceLineAmount: 270
      }
    });
  });

  it("classifies mixed CSV rows into recipes, ingredients, suppliers, and conversions", () => {
    const csv = [
      "record_type,recipe,category,base_yield_quantity,yield_unit,ingredient,quantity,unit,package_quantity,package_price,line_amount,supplier,from_unit,to_unit,conversion_factor,contact,email",
      "supplier,,,,,,,,,,,New Mill,,,,Amina,orders@example.com",
      "ingredient,,,,,Butter,,g,,,1200,New Mill,,,,,",
      "recipe,Wedding Cake,Cakes,1,cake,Flour,500,g,1000,900,450,,,,,,",
      "recipe,Wedding Cake,Cakes,1,cake,Butter,250,g,500,1200,600,,,,,,",
      "conversion,,,,,Butter,,,,,,New Mill,cup,g,227,,"
    ].join("\n");

    const draft = parseImportText(csv, { name: "onboarding.csv", type: "csv", extension: "csv" }, context);

    expect(draft.counts).toMatchObject({
      recipes: 1,
      ingredients: 1,
      suppliers: 1,
      conversionRules: 1
    });
    expect(draft.suppliers[0]).toMatchObject({ name: "New Mill", contactName: "Amina", email: "orders@example.com" });
    expect(draft.ingredients[0]).toMatchObject({ name: "Butter", supplierName: "New Mill", latestUnitCost: 1200 });
    expect(draft.recipes[0].items.map((item) => [item.ingredientName, item.ingredientId, item.needsReview])).toEqual([
      ["Flour", "flour", false],
      ["Butter", undefined, true]
    ]);
    expect(draft.conversionRules[0]).toMatchObject({ ingredientName: "Butter", fromUnit: "cup", toUnit: "g", conversionFactor: 227, needsReview: true });
  });

  it("detects customer and order templates as preview-only onboarding data", () => {
    const csv = [
      "record_type,customer_name,customer_phone,email,recipe,product,due_date,quantity,yield_unit,notes",
      "customer,Ada Bakery,08030000000,ada@example.com,,,,,VIP tasting account",
      "order,Ada Bakery,08030000000,ada@example.com,Launch Brownies,Brownie Box,2026-07-18,24,pieces,Weekend pickup"
    ].join("\n");

    const draft = parseImportText(csv, { name: "customer-orders.csv", type: "csv", extension: "csv" }, context);

    expect(draft.counts.customerTemplates).toBe(1);
    expect(draft.counts.orderTemplates).toBe(1);
    expect(draft.customerTemplates[0]).toMatchObject({ customerName: "Ada Bakery", email: "ada@example.com" });
    expect(draft.orderTemplates[0]).toMatchObject({ customerName: "Ada Bakery", recipeName: "Launch Brownies", dueDate: "2026-07-18", requestedYieldQuantity: 24 });
  });

  it("parses uploaded XLSX workbooks from real spreadsheet bytes", async () => {
    const draft = await extractImportDraft({
      source: {
        name: "onboarding.xlsx",
        type: "file",
        extension: "xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        base64: xlsxFixtureBase64()
      }
    }, context);

    expect(draft.counts.recipes).toBe(1);
    expect(draft.recipes[0]).toMatchObject({ name: "AUDIT-XLSX Cake", category: "Cakes", baseYieldQuantity: 12, yieldUnit: "pieces" });
    expect(draft.recipes[0].items[0]).toMatchObject({
      ingredientId: "flour",
      quantity: 300,
      unit: "g",
      prepState: {
        sourceFile: "onboarding.xlsx",
        sourceType: "xlsx",
        sourceLineAmount: 150
      }
    });
    expect(draft.recipes[0].items[0].source.sheet).toBe("Recipes");
  });

  // Parsing a real PDF is genuinely slow and exceeds the 10s default when the
  // suite runs files in parallel. It is not flaky work, just long.
  it("parses selectable PDF text in the Node import runtime", { timeout: 45000 }, async () => {
    const draft = await extractImportDraft({
      source: {
        name: "recipe.pdf",
        type: "file",
        extension: "pdf",
        mimeType: "application/pdf",
        base64: pdfFixtureBase64
      }
    }, context);

    expect(draft.counts.recipes).toBe(1);
    expect(draft.recipes[0]).toMatchObject({ name: "AUDIT-PDF Brownies", baseYieldQuantity: 8, yieldUnit: "pieces" });
    expect(draft.recipes[0].items[0]).toMatchObject({ ingredientId: "flour", quantity: 300, unit: "g", needsReview: false });
    expect(draft.recipes[0].warnings ?? []).not.toContain("Could not parse ingredient line 5: -- 1 of 1 --");
  });

  it("does not count ingredients as new drafts when they match live pantry items", () => {
    const csv = [
      "record_type,recipe,category,base_yield_quantity,yield_unit,ingredient,quantity,unit,package_quantity,package_price,line_amount,supplier,from_unit,to_unit,conversion_factor,contact,email",
      "supplier,,,,,,,,,,,New Mill,,,,Amina,orders@example.com",
      "ingredient,,,,,Butter,,g,,,1200,New Mill,,,,,",
      "recipe,Wedding Cake,Cakes,1,cake,Butter,250,g,500,1200,600,,,,,,",
      "conversion,,,,,Butter,,,,,,New Mill,cup,g,227,,"
    ].join("\n");
    const liveContext = {
      ...context,
      ingredients: [...context.ingredients, { id: "butter", name: "Butter", category: "Dairy", baseUnit: "g" }]
    };

    const draft = parseImportText(csv, { name: "live-onboarding.csv", type: "csv", extension: "csv" }, liveContext);

    expect(draft.counts.ingredients).toBe(0);
    expect(draft.recipes[0].items[0]).toMatchObject({ ingredientName: "Butter", ingredientId: "butter", needsReview: false });
    expect(draft.conversionRules[0]).toMatchObject({ ingredientName: "Butter", ingredientId: "butter", needsReview: false });
  });

  it("uses a deterministic OCR mock for image imports", async () => {
    const previousMock = process.env.IMPORT_MOCK_PROVIDER_TEXT;
    process.env.IMPORT_MOCK_PROVIDER_TEXT = [
      "Recipe: Photo Carrot Cake",
      "Yield: 10 slices",
      "Ingredients:",
      "200 g flour",
      "100 g sugar"
    ].join("\n");
    try {
      const draft = await extractImportDraft({
        source: {
          name: "photo-recipe.png",
          type: "image",
          extension: "png",
          mimeType: "image/png",
          base64: Buffer.from("mock image bytes").toString("base64")
        }
      }, context);

      expect(draft.counts.recipes).toBe(1);
      expect(draft.recipes[0]).toMatchObject({ name: "Photo Carrot Cake", baseYieldQuantity: 10, yieldUnit: "slices" });
      expect(draft.warnings).toContain("OCR/vision mock provider used for deterministic import verification.");
    } finally {
      if (previousMock === undefined) delete process.env.IMPORT_MOCK_PROVIDER_TEXT;
      else process.env.IMPORT_MOCK_PROVIDER_TEXT = previousMock;
    }
  });

  it("uses plain language when photo reading is not configured", async () => {
    const previousMock = process.env.IMPORT_MOCK_PROVIDER_TEXT;
    const previousKey = process.env.OPENAI_API_KEY;
    delete process.env.IMPORT_MOCK_PROVIDER_TEXT;
    delete process.env.OPENAI_API_KEY;
    try {
      const draft = await extractImportDraft({
        source: {
          name: "recipe-photo.png",
          type: "image",
          extension: "png",
          mimeType: "image/png",
          base64: Buffer.from("mock image bytes").toString("base64")
        }
      }, context);

      expect(draft.counts.recipes).toBe(0);
      expect(draft.warnings[0]).toContain("photo reading");
      expect(draft.warnings[0]).not.toContain("OPENAI_API_KEY");
    } finally {
      if (previousMock === undefined) delete process.env.IMPORT_MOCK_PROVIDER_TEXT;
      else process.env.IMPORT_MOCK_PROVIDER_TEXT = previousMock;
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });

  it("flags duplicate recipe names for review before commit", () => {
    const draft = parseImportText("Recipe: Classic Brownies\nIngredients:\n300 g flour", { name: "duplicate.txt", type: "text" }, context);
    expect(draft.recipes[0].duplicateCandidates).toEqual([{ id: "recipe-classic", name: "Classic Brownies" }]);
    expect(draft.recipes[0].reviewCount).toBeGreaterThan(0);
  });
});
