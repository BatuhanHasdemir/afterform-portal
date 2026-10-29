// @ts-check

// The token lives only in this module's memory: it is never written to storage, and a page
// load always starts without one.

/** @type {string | null} */
let token = null;
/** @type {Promise<string> | null} */
let inflight = null;
let generation = 0;

/**
 * Returns the cached token or obtains one with `fetchToken`; concurrent callers share one request.
 * @param {() => Promise<string>} fetchToken
 * @returns {Promise<string>}
 */
export function ensureToken(fetchToken) {
  if (token) return Promise.resolve(token);
  if (inflight) return inflight;
  const startedIn = generation;
  const request = fetchToken().then(
    (value) => {
      // A reset() during the request means the identity changed; the old answer is stale.
      if (startedIn === generation) {
        token = value;
        inflight = null;
      }
      return value;
    },
    (error) => {
      if (startedIn === generation) inflight = null;
      throw error;
    },
  );
  inflight = request;
  return request;
}

/** Forgets the token; call after sign-in and sign-out, when the server invalidates it. */
export function reset() {
  token = null;
  inflight = null;
  generation += 1;
}
