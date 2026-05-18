import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Copy .env.example to .env and paste your Neon connection string.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

function splitStatements(source) {
  return source
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function runSqlFile(filePath) {
  const source = await readFile(filePath, "utf8");
  const statements = splitStatements(source);
  for (const statement of statements) {
    await sql(statement);
  }
  console.log(`Applied ${statements.length} statements from ${path.relative(rootDir, filePath)}`);
}

await runSqlFile(path.join(rootDir, "db", "schema.sql"));
await runSqlFile(path.join(rootDir, "db", "seed.sql"));
console.log("Neon database setup complete.");
