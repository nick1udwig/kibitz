/**
 * Feature flags used across client and server.
 * Keep simple, environment-driven, and side-effect free.
 */

/**
 * Determine if the server-first push orchestrator is enabled.
 * Defaults to true in all environments unless explicitly disabled.
 * - Browser reads NEXT_PUBLIC_*
 * - Server can read PUSH_ORCHESTRATOR_ENABLED or NEXT_PUBLIC_*
 */
export function isPushOrchestratorEnabled(): boolean {
  try {
    const serverValue = (typeof process !== 'undefined' && process.env && process.env.PUSH_ORCHESTRATOR_ENABLED) || undefined;
    const clientValue = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_PUSH_ORCHESTRATOR_ENABLED) || undefined;
    const raw = serverValue ?? clientValue;
    if (typeof raw === 'string') {
      const v = raw.trim().toLowerCase();
      if (v === 'true') return true;
      if (v === 'false') return false;
    }
  } catch {}
  // Default ON
  return true;
}


