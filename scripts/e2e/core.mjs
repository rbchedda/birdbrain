// Shared plumbing for scripts/hosted-e2e.mjs: URL guard, secret redaction, CLI args,
// and a cleanup tracker. No network or database access in here, so it's unit-testable.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', 'host.docker.internal']);

/** True for loopback/local-dev hosts (localhost, 127.x.x.x, ::1, *.localhost). */
export function isLocalUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const h = u.hostname.toLowerCase();
  return LOCAL_HOSTS.has(h) || /^127(\.\d{1,3}){3}$/.test(h) || h.endsWith('.localhost');
}

/**
 * Refuses any non-local URL unless allowHosted is set (the --allow-hosted flag).
 * Throws on a missing or malformed URL either way.
 */
export function assertTargetAllowed(url, { allowHosted = false, what = 'Supabase URL' } = {}) {
  if (!url) throw new Error(`${what} is not set`);
  try { new URL(url); } catch { throw new Error(`${what} is not a valid URL`); }
  if (isLocalUrl(url) || allowHosted) return;
  throw new Error(`refusing to run against non-local ${what} (${new URL(url).host}); pass --allow-hosted to override`);
}

const SECRET_PATTERNS = [
  /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, // JWTs (anon/user tokens)
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/g, // new-style API keys
  /sbp_[A-Za-z0-9]{20,}/g, // management access tokens
  /(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/g, // passwords in connection strings
];

/** Replaces known secrets and anything shaped like a key/token/password-in-URL with [REDACTED]. */
export function redact(value, secrets = []) {
  let s = typeof value === 'string' ? value : (() => { try { return JSON.stringify(value); } catch { return String(value); } })();
  if (s === undefined) return '';
  for (const k of secrets) if (k && k.length >= 6) s = s.split(k).join('[REDACTED]');
  for (const re of SECRET_PATTERNS) s = s.replace(re, (m, p1) => (p1 && m.startsWith(p1) ? `${p1}[REDACTED]@` : '[REDACTED]'));
  return s;
}

/** A logger whose every line goes through redact(). */
export function makeLogger(secrets = [], sink = console.log) {
  return (...parts) => sink(parts.map((p) => redact(p, secrets)).join(' '));
}

export function parseArgs(argv) {
  const known = new Set(['--read-only', '--allow-hosted', '--help']);
  const bad = argv.filter((a) => !known.has(a));
  if (bad.length) throw new Error(`unknown argument(s): ${bad.join(' ')}`);
  return { readOnly: argv.includes('--read-only'), allowHosted: argv.includes('--allow-hosted'), help: argv.includes('--help') };
}

/**
 * Tracks created resources and undoes them LIFO. run() is idempotent (each step runs at
 * most once, successful or not), keeps going past failures, and reports them.
 */
export class Cleanup {
  #steps = [];
  #running = null;
  add(label, fn) { this.#steps.push({ label, fn }); return label; }
  get pending() { return this.#steps.map((s) => s.label); }
  run(log = () => {}) {
    // Concurrent callers (finally + SIGINT) share one pass.
    this.#running ??= (async () => {
      const failures = []; let done = 0;
      while (this.#steps.length) {
        const { label, fn } = this.#steps.pop();
        try { await fn(); done += 1; log('cleanup ok', label); } catch (e) { failures.push({ label, error: e?.message ?? String(e) }); log('cleanup FAILED', label, e?.message ?? String(e)); }
      }
      return { done, failures };
    })().finally(() => { this.#running = null; });
    return this.#running;
  }
}
