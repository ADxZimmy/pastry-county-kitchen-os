// Phase 014-B: the read-only tool layer.
//
// There is deliberately no query here. The assistant reads the kitchen through
// the same snapshot the app itself reads, then through the app's own role
// filter, then through the Phase 014-A allow-list. Composing the three is the
// point: DECISION.md's residual risk is that the allow-list and the role
// projection are two places that must agree, and the only way they cannot drift
// on the role dimension is if there is one of them.
//
// Nothing in this module can write. It imports no mutation helper and builds no
// statement.

import { loadKitchenSnapshot } from "./_db.js";
import { filterKitchenSnapshotForActor } from "./bootstrap.js";
import { customerPlaceholder, findLeakedFields, redactForAssistant } from "./_assistant.js";

// A kitchen is small, but not bounded, and every row costs tokens and money.
// These caps are what stops a large workspace turning one question into an
// expensive request. They are generous enough that a real bakery is unaffected.
export const CONTEXT_LIMITS = {
  ingredients: 150,
  recipes: 60,
  recipeItems: 400,
  orders: 40,
  orderItems: 150,
  conversionRules: 100
};

const INACTIVE_ORDER_STATUSES = new Set(["Delivered", "Cancelled"]);

// Active orders first, soonest due first. If a kitchen is over the cap, the
// orders that get dropped should be the ones nobody is asking about.
function orderPriority(order) {
  return INACTIVE_ORDER_STATUSES.has(order?.status) ? 1 : 0;
}

function sortedOrders(orders = []) {
  return [...orders].sort((a, b) => {
    const byActivity = orderPriority(a) - orderPriority(b);
    if (byActivity !== 0) return byActivity;
    return String(a?.dueDate ?? "").localeCompare(String(b?.dueDate ?? ""));
  });
}

// Truncation is reported, never silent. An answer built from a partial view has
// to be able to say so, because "you have no orders due Friday" is a different
// claim when forty of them were dropped before the model saw anything.
function capped(rows, limit) {
  const list = Array.isArray(rows) ? rows : [];
  return { rows: list.slice(0, limit), omitted: Math.max(0, list.length - limit) };
}

export function boundSnapshot(snapshot = {}, limits = CONTEXT_LIMITS) {
  const ingredients = capped(snapshot.ingredients, limits.ingredients);
  const recipes = capped(snapshot.recipes, limits.recipes);
  const orders = capped(sortedOrders(snapshot.orders), limits.orders);
  const conversionRules = capped(snapshot.conversionRules, limits.conversionRules);

  // Child rows follow their parents. A recipe item whose recipe was dropped is
  // noise the model cannot resolve, and an order item pointing at an order it
  // cannot see invites an invented answer.
  const recipeIds = new Set(recipes.rows.map((row) => row.id));
  const orderIds = new Set(orders.rows.map((row) => row.id));
  const recipeItems = capped(
    (snapshot.recipeItems ?? []).filter((row) => recipeIds.has(row.recipeId)),
    limits.recipeItems
  );
  const orderItems = capped(
    (snapshot.orderItems ?? []).filter((row) => orderIds.has(row.orderId)),
    limits.orderItems
  );

  const omitted = {};
  for (const [name, part] of Object.entries({ ingredients, recipes, recipeItems, orders, orderItems, conversionRules })) {
    if (part.omitted > 0) omitted[name] = part.omitted;
  }

  return {
    snapshot: {
      ingredients: ingredients.rows,
      recipes: recipes.rows,
      recipeItems: recipeItems.rows,
      orders: orders.rows,
      orderItems: orderItems.rows,
      conversionRules: conversionRules.rows
    },
    omitted
  };
}

// The transcript the browser replays is free text, so an allow-list cannot be
// applied to it the way it is applied to rows. What can be done is to look for
// the identities this kitchen actually holds and put them back behind their
// placeholders -- the same placeholder `redactForAssistant` uses, so a name and
// the order it belongs to still line up in conversation.
//
// This exists because the browser's own deterministic helper prints real
// customer names ("Ada Lovelace: flour short 200g"), and a fallback answer sits
// in the thread until it is replayed as history on the next turn. Without this,
// a customer name would reach a provider by the side door after the front door
// was closed.
export function identityScrubs(orders = []) {
  const scrubs = [];
  for (const order of orders) {
    const placeholder = customerPlaceholder(order?.id);
    for (const value of [order?.customerName, order?.customerPhone]) {
      const text = String(value ?? "").trim();
      // Two characters or fewer is not an identity, it is a substring that would
      // wreck every other word in the transcript.
      if (text.length > 2) scrubs.push({ find: text, replace: placeholder });
    }
  }
  // Longest first, so "Ada Lovelace" is replaced before a bare "Ada" can eat
  // half of it and leave the surname stranded.
  return scrubs.sort((a, b) => b.find.length - a.find.length);
}

// A phone number that belongs to nobody in the records still should not travel.
const PHONE_SHAPED = /(?:\+?\d[\d\s().-]{7,}\d)/g;

export function scrubIdentities(text, scrubs = []) {
  let output = String(text ?? "");
  for (const { find, replace } of scrubs) {
    output = output.split(find).join(replace);
  }
  return output.replace(PHONE_SHAPED, "[redacted number]");
}

// Builds everything the model is allowed to know, for this actor, right now.
//
// Fails closed: if the leak check finds anything, no context is returned at all.
// A caller cannot accidentally proceed with a payload that did not pass, because
// there is nothing to proceed with.
export async function buildAssistantContext(sql, actor, { limits = CONTEXT_LIMITS, now = () => new Date() } = {}) {
  const role = actor?.role ?? "Viewer";
  const full = await loadKitchenSnapshot(sql);
  const forRole = filterKitchenSnapshotForActor(full, actor);
  const { snapshot, omitted } = boundSnapshot(forRole, limits);
  const redacted = redactForAssistant(snapshot, role);

  const leaked = findLeakedFields(redacted);
  if (leaked.length > 0) {
    throw Object.assign(
      new Error(`Assistant context refused: ${leaked.join(", ")} must never leave the server.`),
      { statusCode: 500 }
    );
  }

  return {
    role,
    generatedAt: now().toISOString(),
    counts: Object.fromEntries(Object.entries(redacted).map(([name, rows]) => [name, rows.length])),
    omitted,
    truncated: Object.keys(omitted).length > 0,
    data: redacted,
    // A function, not the list of names it closes over. JSON.stringify drops a
    // function, so no future `...context` spread into a response can leak an
    // identity by accident -- the pairs are simply not reachable from the
    // serialised object. The turn runner calls this to clean replayed text.
    scrub: buildScrubber(snapshot.orders)
  };
}

export function buildScrubber(orders = []) {
  const scrubs = identityScrubs(orders);
  return (text) => scrubIdentities(text, scrubs);
}
