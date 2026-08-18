// Which engine this signed-in account uses.
//
// A 'server' account is every account that existed before phase 016: its kitchen
// data lives in Postgres and the app talks to the API. A 'device' account keeps
// its data in this browser, so the same screens run against IndexedDB instead and
// the server refuses it every business read and write.
//
// This is a module-level flag rather than React state for the same reason the
// CSRF token is (see App.tsx): fetchResourcePage in src/lib/routeData.ts is a
// plain module function called from seven places, and threading a context through
// it and its hook would change every call site to answer a question that has one
// answer per session. The flag is set from the session response before any screen
// that reads data can mount, and cleared on logout.

import { COST_VISIBILITY_ROLES } from "../../shared/actionPolicy.js";

export type DataMode = "server" | "device";

export interface SessionIdentity {
  id?: string;
  email?: string;
  fullName?: string;
  role?: string;
  dataMode?: DataMode | string;
}

let currentMode: DataMode = "server";
let currentUser: SessionIdentity | null = null;
// Declared here because setDataSession below assigns it. See canSeeCosts.
let costsVisible = false;

export function setDataSession(user?: SessionIdentity | null) {
  currentMode = user?.dataMode === "device" ? "device" : "server";
  currentUser = user ?? null;
  // Derived here rather than at the six call sites, so establishing a session
  // cannot forget it. Signed out defaults to hidden: nothing should render a
  // figure before a role is known.
  costsVisible = Boolean(user?.role) && COST_VISIBILITY_ROLES.includes(String(user?.role));
}

export function isDeviceMode() {
  return currentMode === "device";
}

export function deviceUserId() {
  return currentMode === "device" ? String(currentUser?.id ?? "") : "";
}

export function dataMode(): DataMode {
  return currentMode;
}

// Whether this account may see money at all.
//
// A Viewer's snapshot no longer carries costs, which is the authoritative fix --
// but stripping the data is only half a projection. Thirty-one places render a
// figure through formatNaira, and every one of them would print a confident
// zero, or worse an invented number from estimatedUnitCost's placeholder rates.
// A fabricated cost is exactly the defect Phase 007 removed when it deleted the
// hard-coded 18,000s.
//
// So the check lives at the render boundary instead of at thirty-one call sites.
// The next screen that formats money inherits it without anyone remembering to,
// which is the same reasoning as the permission matrix deriving its action list
// from source rather than from a list someone must maintain.

export function setCostVisibility(visible: boolean) {
  costsVisible = visible;
}

export function canSeeCosts() {
  return costsVisible;
}

// Who the local engine attributes an audit entry to. Shaped like the server's
// actor so shared/actionPolicy's actorLabel resolves the same name either side.
export function sessionActor() {
  if (!currentUser) return null;
  return {
    sub: currentUser.id,
    email: currentUser.email,
    fullName: currentUser.fullName,
    role: currentUser.role
  };
}

export function deviceAccount() {
  if (currentMode !== "device" || !currentUser?.id) return null;
  return { id: String(currentUser.id), email: String(currentUser.email ?? "") };
}
