// Retired endpoint (Phase 006a security containment).
//
// This route previously mutated stock and inventory lots with no authentication,
// role check, or trusted actor attribution. All inventory changes now go through
// the authenticated, DB-revalidated `inventory.adjust` action on POST /api/actions,
// which the frontend and smoke scripts already use.
export default function handler(_req, res) {
  res.status(410).json({
    error: "This endpoint has been retired. Use the authenticated inventory.adjust action via POST /api/actions."
  });
}
