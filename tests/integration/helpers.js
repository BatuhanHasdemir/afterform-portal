import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../dev-mock/server.mjs';

export const SEED = JSON.parse(readFileSync(new URL('../../dev-mock/seed.json', import.meta.url), 'utf8'));
export const [ARTIST, ARTIST2, ADMIN] = SEED.users;

// Each test file gets its own server on a free port and its own throwaway data directory.
export async function startMock(options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'afterform-mock-'));
  const mock = await startServer({ port: 0, host: '127.0.0.1', dataDir, ...options });
  return {
    url: mock.url,
    dataDir,
    ctx: mock.ctx,
    store: mock.ctx.store,
    uploadsDir: mock.ctx.store.uploadsDir,
    client: () => new Client(mock.url),
    reset: async () => {
      const res = await fetch(`${mock.url}/dev/reset`, { method: 'POST' });
      if (res.status !== 204) throw new Error(`reset failed: ${res.status}`);
    },
    stop: async () => {
      await mock.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

// Stands in for the browser: keeps cookies and the CSRF token between requests.
export class Client {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
    this.token = null;
  }

  async fetch(path, { method = 'GET', json, body, headers = {}, csrf = true } = {}) {
    const sent = new Headers(headers);
    // Fetch the token first: that response may set the cookie this request must carry.
    if (csrf && method !== 'GET' && method !== 'HEAD') {
      sent.set('X-CSRF-TOKEN', await this.csrfToken());
    }
    if (this.cookies.size > 0) {
      sent.set('Cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    let payload = body;
    if (json !== undefined) {
      sent.set('Content-Type', 'application/json');
      payload = JSON.stringify(json);
    }
    const res = await fetch(this.base + path, { method, headers: sent, body: payload });
    this.#keepCookies(res);
    return res;
  }

  async csrfToken() {
    if (!this.token) {
      const res = await this.fetch('/api/csrf');
      this.token = (await res.json()).token;
    }
    return this.token;
  }

  async login(email, password) {
    const res = await this.fetch('/api/auth/login', { method: 'POST', json: { email, password } });
    if (res.ok) this.token = null;
    return res;
  }

  async loginAs(user) {
    const res = await this.login(user.email, user.password);
    if (res.status !== 200) throw new Error(`login failed for ${user.email}: ${res.status}`);
    return (await res.json()).user;
  }

  #keepCookies(res) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';').map((part) => part.trim());
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      const expired = attributes.some((attr) => {
        const [key, val] = attr.split('=');
        if (/^max-age$/i.test(key)) return Number(val) <= 0;
        if (/^expires$/i.test(key)) return Date.parse(val) <= Date.now();
        return false;
      });
      if (expired || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

export async function errorBody(res) {
  return { status: res.status, body: await res.json() };
}
