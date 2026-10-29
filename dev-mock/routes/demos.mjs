import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, renameSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';
import { Transform, pipeline } from 'node:stream';
import { Router } from 'express';
import multer from 'multer';
import { validateGenre, validateNote, validateTitle } from '../../web/js/core/validators.js';
import { sendError } from '../security.mjs';
import {
  fieldErrors,
  parseListQuery,
  requireAuth,
  toDemo,
  validationFailed,
} from './common.mjs';

const AUDIO_TYPE = /^audio\/[a-z0-9.+-]+$/;

// Enough of the file to recognise its format.
const HEAD_BYTES = 4;

export function demoRoutes(ctx) {
  const { store, maxUploadBytes } = ctx;
  const router = Router();

  const receiveFile = multer({
    storage: hashingStorage(store.uploadsDir),
    limits: { fileSize: maxUploadBytes, files: 1, fields: 8, fieldSize: 16 * 1024, parts: 10 },
    defParamCharset: 'utf8',
  }).single('file');

  router.get('/demos', requireAuth, (req, res) => {
    const { fields, value } = parseListQuery(req.query);
    if (fields) return validationFailed(res, fields);
    const page = store.listDemos({ ...value, ownerId: req.user.id });
    res.json({ ...page, items: page.items.map(toDemo) });
  });

  router.post('/demos', requireAuth, (req, res, next) => {
    receiveFile(req, res, (error) => {
      if (error) return uploadFailed(error, res, next);
      createDemo(req, res);
    });
  });

  router.get('/demos/:id', requireAuth, (req, res) => {
    const demo = visibleDemo(req);
    if (!demo) return sendError(res, 404, 'demo.not_found');
    res.json(toDemo(demo));
  });

  router.get('/demos/:id/audio', requireAuth, (req, res) => {
    const demo = visibleDemo(req);
    if (!demo) return sendError(res, 404, 'demo.not_found');

    // Uploads are stored as audio/mpeg, but whatever else a record says, anything that is not
    // audio is served as opaque bytes, so no stored file can ever run as a page on this origin.
    const type = AUDIO_TYPE.test(demo.file.contentType)
      ? demo.file.contentType
      : 'application/octet-stream';
    res.set({ 'Cache-Control': 'private, no-store', 'Content-Type': type });
    res.sendFile(
      demo.file.storedName,
      { root: store.uploadsDir, acceptRanges: true, cacheControl: false, etag: false, lastModified: false },
      (error) => {
        if (!error || res.headersSent) return;
        if (error.status === 416) return res.status(416).end();
        sendError(res, 500, 'server.error');
      },
    );
  });

  // Someone else's demo answers exactly like a missing one, so ids cannot be probed.
  function visibleDemo(req) {
    const demo = store.getDemo(req.params.id);
    if (!demo) return null;
    return demo.ownerId === req.user.id || req.user.role === 'admin' ? demo : null;
  }

  function createDemo(req, res) {
    const { title, genre, note } = req.body ?? {};
    const file = req.file;
    const fields = fieldErrors({
      title: validateTitle(title),
      genre: validateGenre(genre),
      note: validateNote(note),
      file: file && file.size > 0 ? null : 'required',
    });
    if (fields) {
      if (file) rmSync(file.path, { force: true });
      return validationFailed(res, fields);
    }
    if (!isMp3(file)) {
      rmSync(file.path, { force: true });
      return sendError(res, 415, 'upload.unsupported_type');
    }

    const id = randomUUID();
    const storedName = `${id}.bin`;
    renameSync(file.path, join(store.uploadsDir, storedName));
    const demo = store.createDemo({
      id,
      ownerId: req.user.id,
      title: title.trim(),
      genre,
      note: typeof note === 'string' ? note.trim() : '',
      file: {
        originalName: baseName(file.originalname),
        sizeBytes: file.size,
        contentType: 'audio/mpeg',
        sha256: file.sha256,
        storedName,
      },
    });
    res.status(201).location(`/api/demos/${id}`).json(toDemo(demo));
  }

  return router;
}

// Multer storage engine that hashes the bytes on their way to disk, so the digest describes
// exactly what was stored and the file is read only once.
function hashingStorage(dir) {
  return {
    _handleFile(req, file, cb) {
      const path = join(dir, `incoming-${randomUUID()}.part`);
      const hash = createHash('sha256');
      let size = 0;
      let head = Buffer.alloc(0);
      const meter = new Transform({
        transform(chunk, _encoding, done) {
          hash.update(chunk);
          size += chunk.length;
          if (head.length < HEAD_BYTES) head = Buffer.concat([head, chunk.subarray(0, HEAD_BYTES - head.length)]);
          done(null, chunk);
        },
      });
      pipeline(file.stream, meter, createWriteStream(path), (error) => {
        if (error) {
          rmSync(path, { force: true });
          return cb(error);
        }
        cb(null, { path, size, sha256: hash.digest('hex'), head });
      });
    },
    _removeFile(req, file, cb) {
      rmSync(file.path, { force: true });
      cb(null);
    },
  };
}

function uploadFailed(error, res, next) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return sendError(res, 413, 'upload.too_large');
    return validationFailed(res, null);
  }
  // Busboy reports malformed multipart bodies as plain errors.
  if (/multipart|boundary|unexpected end of form|malformed/i.test(error.message ?? '')) {
    return validationFailed(res, null);
  }
  next(error);
}

// The type the client declares is only its guess; the name and the first bytes decide.
function isMp3(file) {
  return extname(baseName(file.originalname)).toLowerCase() === '.mp3' && startsLikeMp3(file.head);
}

// An MP3 file opens with an ID3v2 tag or directly with an MPEG audio frame header: 11 sync
// bits, a version that is not the reserved one, Layer III, and a usable bitrate and sample rate.
function startsLikeMp3(head) {
  if (head.length >= 3 && head.toString('latin1', 0, 3) === 'ID3') return true;
  if (head.length < 3 || head[0] !== 0xff || (head[1] & 0xe0) !== 0xe0) return false;
  const version = (head[1] >> 3) & 0b11;
  const layer = (head[1] >> 1) & 0b11;
  const bitrate = head[2] >> 4;
  const sampleRate = (head[2] >> 2) & 0b11;
  return version !== 0b01 && layer === 0b01 && bitrate !== 0b1111 && sampleRate !== 0b11;
}

// Clients may send a full path; only the last segment is kept and control characters dropped.
function baseName(name) {
  const last = String(name ?? '').split(/[\\/]/).pop() ?? '';
  const clean = last.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (clean || 'audio').slice(0, 255);
}
