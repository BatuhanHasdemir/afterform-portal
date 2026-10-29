// Every tunable number of the mock lives here; README.md lists the same values.
export const SETTINGS = Object.freeze({
  port: 3000,
  host: 'localhost',

  // Mirrors ASP.NET Core Identity's V3 format with the project's iteration count.
  password: Object.freeze({
    algorithm: 'PBKDF2-HMAC-SHA512',
    digest: 'sha512',
    iterations: 220_000,
    saltBytes: 16,
    keyBytes: 32,
  }),

  loginLockout: Object.freeze({ maxFailures: 5, lockMs: 15 * 60_000 }),
  loginRateLimit: Object.freeze({ limit: 10, windowMs: 60_000 }),
  forgotPasswordRateLimit: Object.freeze({ limit: 5, windowMs: 15 * 60_000 }),

  resetTokenTtlMs: 60 * 60_000,
  sessionIdleMs: 8 * 60 * 60_000,

  // The same limit as UPLOAD_RULES.maxBytes in web/js/core/config.js; a unit test keeps them equal.
  maxUploadBytes: 100_000_000,
  jsonBodyLimit: '16kb',
});
