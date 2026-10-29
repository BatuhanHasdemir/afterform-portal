import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeEmail } from '../web/js/core/validators.js';
import { toneMp3 } from './make-fixtures.mjs';
import { hashPassword } from './security.mjs';

const SEED_FILE = new URL('./seed.json', import.meta.url);
const DAY_MS = 24 * 60 * 60_000;

const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });

const SORTERS = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  title: (a, b) => collator.compare(a.title, b.title),
};

export function isoTime(ms = Date.now()) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

// Case- and accent-insensitive matching that also treats Turkish dotted/dotless i alike.
function fold(text) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replaceAll('ı', 'i');
}

// A JSON file is enough for a development stand-in; it keeps the stored records inspectable.
export class Store {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
    this.file = join(dataDir, 'db.json');
    this.uploadsDir = join(dataDir, 'uploads');
    this.data = { users: [], demos: [], resetTokens: [] };
  }

  async init() {
    mkdirSync(this.uploadsDir, { recursive: true });
    if (existsSync(this.file)) {
      this.data = JSON.parse(readFileSync(this.file, 'utf8'));
      return;
    }
    await this.reset();
  }

  async reset() {
    const seed = JSON.parse(await readFile(SEED_FILE, 'utf8'));
    rmSync(this.uploadsDir, { recursive: true, force: true });
    mkdirSync(this.uploadsDir, { recursive: true });
    const now = Date.now();

    const users = [];
    for (const entry of seed.users) {
      users.push({
        id: randomUUID(),
        email: normalizeEmail(entry.email),
        displayName: entry.displayName,
        role: entry.role,
        password: await hashPassword(entry.password),
        createdAt: isoTime(now - 30 * DAY_MS),
      });
    }

    const demos = seed.demos.map((entry) => {
      const owner = users.find((user) => user.email === normalizeEmail(entry.owner));
      const audio = toneMp3(entry.audio);
      const id = randomUUID();
      const storedName = `${id}.bin`;
      writeFileSync(join(this.uploadsDir, storedName), audio);
      return {
        id,
        ownerId: owner.id,
        title: entry.title,
        genre: entry.genre,
        note: entry.note,
        status: entry.status,
        statusNote: entry.statusNote,
        createdAt: isoTime(now - entry.createdDaysAgo * DAY_MS),
        updatedAt: isoTime(now - entry.updatedDaysAgo * DAY_MS),
        file: {
          originalName: entry.audio.originalName,
          sizeBytes: audio.length,
          contentType: 'audio/mpeg',
          sha256: sha256Hex(audio),
          storedName,
        },
      };
    });

    this.data = { users, demos, resetTokens: [] };
    this.save();
  }

  save() {
    const json = `${JSON.stringify(this.data, null, 2)}\n`;
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, json);
    try {
      renameSync(temp, this.file);
    } catch (error) {
      // Windows refuses the rename while another program holds db.json open.
      if (error.code !== 'EPERM' && error.code !== 'EBUSY') throw error;
      writeFileSync(this.file, json);
      rmSync(temp, { force: true });
    }
  }

  getUser(id) {
    return this.data.users.find((user) => user.id === id) ?? null;
  }

  findUserByEmail(email) {
    const normalized = normalizeEmail(email);
    return this.data.users.find((user) => user.email === normalized) ?? null;
  }

  async createUser({ email, displayName, password, role = 'artist' }) {
    const user = {
      id: randomUUID(),
      email: normalizeEmail(email),
      displayName,
      role,
      password: await hashPassword(password),
      createdAt: isoTime(),
    };
    this.data.users.push(user);
    this.save();
    return user;
  }

  async setPassword(userId, password) {
    const user = this.getUser(userId);
    user.password = await hashPassword(password);
    this.save();
  }

  getDemo(id) {
    return this.data.demos.find((demo) => demo.id === id) ?? null;
  }

  listDemos({ ownerId, status, q, sort, page, pageSize }) {
    let items = this.data.demos;
    if (ownerId) items = items.filter((demo) => demo.ownerId === ownerId);
    if (status) items = items.filter((demo) => demo.status === status);
    if (q) {
      const needle = fold(q);
      items = items.filter((demo) => {
        const artist = this.getUser(demo.ownerId);
        return fold(demo.title).includes(needle) || fold(artist?.displayName ?? '').includes(needle);
      });
    }
    const sorted = [...items].sort((a, b) => SORTERS[sort](a, b) || a.id.localeCompare(b.id));
    const start = (page - 1) * pageSize;
    return { items: sorted.slice(start, start + pageSize), total: sorted.length, page, pageSize };
  }

  createDemo({ id, ownerId, title, genre, note, file }) {
    const now = isoTime();
    const demo = {
      id,
      ownerId,
      title,
      genre,
      note,
      status: 'pending',
      statusNote: null,
      createdAt: now,
      updatedAt: now,
      file,
    };
    this.data.demos.push(demo);
    this.save();
    return demo;
  }

  updateDemoStatus(id, status, statusNote) {
    const demo = this.getDemo(id);
    if (!demo) return null;
    demo.status = status;
    demo.statusNote = statusNote;
    demo.updatedAt = isoTime();
    this.save();
    return demo;
  }

  filePath(demo) {
    return join(this.uploadsDir, demo.file.storedName);
  }

  // Only a hash of the reset token is stored, like a password: a leaked db.json cannot be used
  // to reset anyone's password.
  addResetToken(userId, token, expiresAt) {
    this.data.resetTokens.push({ userId, tokenHash: sha256Hex(token), expiresAt });
    this.save();
  }

  consumeResetToken(userId, token) {
    const now = Date.now();
    const tokenHash = sha256Hex(token);
    const match = this.data.resetTokens.find(
      (entry) => entry.userId === userId && entry.tokenHash === tokenHash && entry.expiresAt > now,
    );
    this.data.resetTokens = this.data.resetTokens.filter(
      (entry) => entry.expiresAt > now && !(match && entry.userId === userId),
    );
    this.save();
    return Boolean(match);
  }
}
