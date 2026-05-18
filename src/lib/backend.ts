export const backendMode = import.meta.env.VITE_API_BASE_URL ? "neon-api" : "same-origin-api";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
