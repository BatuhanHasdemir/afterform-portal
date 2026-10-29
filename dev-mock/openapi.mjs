import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  FIELD_LIMITS,
  GENRES,
  PAGINATION,
  PASSWORD_RULES,
  SORT_ORDERS,
  STATUSES,
  UPLOAD_RULES,
} from '../web/js/core/config.js';
import { CSRF_HEADER, SESSION_COOKIE } from './security.mjs';

// ARCHITECTURE §7 as OpenAPI 3.1. This module is the source of docs/openapi.yaml, which
// `npm run openapi` rewrites from it; limits and enums come from the same config the frontend
// and the mock use. The contract test checks the file, the routes and the responses against it.

const OUTPUT = new URL('../docs/openapi.yaml', import.meta.url);
const ROLES = ['artist', 'admin'];
const FIELD_CODES = ['required', 'too_short', 'too_long', 'invalid_format', 'invalid_value'];

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ 'application/json': { schema } });
const text = (limits) => ({ type: 'string', minLength: limits.min, maxLength: limits.max });

/**
 * An error response whose body may carry only the listed codes.
 * @param {string} description
 * @param {string[]} codes
 * @param {{ retryAfter?: boolean }} [options]
 */
function error(description, codes, { retryAfter = false } = {}) {
  return {
    description,
    ...(retryAfter && {
      headers: {
        'Retry-After': { description: 'Beklenecek süre, saniye.', schema: { type: 'integer', minimum: 1 } },
      },
    }),
    content: json({ allOf: [ref('ErrorBody'), { properties: { code: { enum: codes } } }] }),
  };
}

const UNAUTHENTICATED = error('Oturum yok veya süresi doldu.', ['auth.unauthenticated']);
const FORBIDDEN = error('Rol yetersiz.', ['auth.forbidden']);
const DEMO_NOT_FOUND = error('Kayıt yok ya da başkasına ait; ikisi aynı yanıtı alır.', ['demo.not_found']);
const SIGNED_IN = [{ session: [] }];

/**
 * POST, PATCH and DELETE carry the CSRF token; without a valid one the request is refused with
 * 400 csrf.invalid before anything else is read.
 * @param {Record<string, any>} operation
 */
function unsafe(operation) {
  const existing = operation.responses['400'];
  const codes = existing ? existing.content['application/json'].schema.allOf[1].properties.code.enum : [];
  return {
    ...operation,
    parameters: [{ $ref: '#/components/parameters/CsrfToken' }, ...(operation.parameters ?? [])],
    responses: {
      ...operation.responses,
      400: error(
        existing ? `${existing.description} Belirteç yok veya eskiyse csrf.invalid.` : 'CSRF belirteci yok veya eski.',
        [...codes, 'csrf.invalid'],
      ),
    },
  };
}

const demoProperties = {
  id: { type: 'string', description: 'Frontend için opak.' },
  title: text(FIELD_LIMITS.title),
  genre: ref('Genre'),
  note: { type: 'string', maxLength: FIELD_LIMITS.note.max },
  status: ref('Status'),
  statusNote: { type: ['string', 'null'], maxLength: FIELD_LIMITS.statusNote.max },
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
  file: ref('DemoFile'),
};

/** @param {string} item */
const page = (item) => ({
  type: 'object',
  additionalProperties: false,
  required: ['items', 'total', 'page', 'pageSize'],
  properties: {
    items: { type: 'array', items: ref(item) },
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: PAGINATION.maxPageSize },
  },
});

const LIST_PARAMETERS = [
  { name: 'status', in: 'query', schema: ref('Status') },
  { name: 'sort', in: 'query', schema: ref('SortOrder'), description: 'Varsayılan `newest`.' },
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  {
    name: 'pageSize',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: PAGINATION.maxPageSize, default: PAGINATION.defaultPageSize },
  },
];
const ID = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };

export const OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'AFTER/FORM Sanatçı Portalı API',
    version: '0.1.0',
    description:
      'docs/ARCHITECTURE.md §7. JSON UTF-8, alan adları camelCase, tarihler ISO-8601 UTC. Hata gövdesi yalnızca `code` (ve gerekirse `fields`, `retryAfterSeconds`) taşır; serbest metin yoktur. Bilinmeyen `/api` yolu 404 `not_found`, sunucu hatası 5xx `server.error` döner. Tüm yanıtlar `Cache-Control: no-store` taşır.',
  },
  servers: [{ url: '/api', description: 'Uygulamayla aynı origin.' }],
  tags: [
    { name: 'auth', description: 'Oturum, kayıt ve parola.' },
    { name: 'demos', description: 'Sanatçının kendi demoları.' },
    { name: 'admin', description: 'Yönetici: tüm demolar ve değerlendirme.' },
  ],
  paths: {
    '/csrf': {
      get: {
        tags: ['auth'],
        operationId: 'getCsrfToken',
        summary: 'CSRF belirteci (ve ona bağlı çerez)',
        security: [],
        responses: { 200: { description: 'Belirteç.', content: json(ref('CsrfToken')) } },
      },
    },
    '/me': {
      get: {
        tags: ['auth'],
        operationId: 'getMe',
        summary: 'Oturumdaki kullanıcı',
        security: SIGNED_IN,
        responses: { 200: { description: 'Kullanıcı.', content: json(ref('User')) }, 401: UNAUTHENTICATED },
      },
    },
    '/auth/register': {
      post: unsafe({
        tags: ['auth'],
        operationId: 'register',
        summary: 'Sanatçı hesabı aç',
        security: [],
        requestBody: { required: true, content: json(ref('RegisterRequest')) },
        responses: {
          201: { description: 'Hesap açıldı; otomatik giriş yapılmaz.', content: json({ type: 'object', maxProperties: 0 }) },
          400: error('Alan hataları `fields` içinde.', ['validation.failed']),
          409: error('E-posta kullanımda. Backend bunun yerine her zaman 201 de dönebilir (§7 dipnot 1).', ['auth.email_taken']),
        },
      }),
    },
    '/auth/login': {
      post: unsafe({
        tags: ['auth'],
        operationId: 'login',
        summary: 'Giriş; oturum çerezi yenilenir, CSRF belirteci geçersizleşir',
        security: [],
        requestBody: { required: true, content: json(ref('LoginRequest')) },
        responses: {
          200: { description: 'Giriş yapıldı.', content: json(ref('LoginResponse')) },
          400: error('E-posta veya parola boş.', ['validation.failed']),
          401: error('E-posta veya parola hatalı; hangisi olduğu söylenmez.', ['auth.invalid_credentials']),
          429: error(
            'Aynı e-posta için 5. başarısız denemeden sonra 15 dakika bekleme (e-posta kayıtlı olmasa da) ya da IP başına dakikada 10 istek sınırı.',
            ['auth.too_many_attempts'],
            { retryAfter: true },
          ),
        },
      }),
    },
    '/auth/logout': {
      post: unsafe({
        tags: ['auth'],
        operationId: 'logout',
        summary: 'Çıkış; CSRF belirteci geçersizleşir',
        security: [],
        responses: { 204: { description: 'Oturum kapandı (yoksa da).' } },
      }),
    },
    '/auth/forgot-password': {
      post: unsafe({
        tags: ['auth'],
        operationId: 'forgotPassword',
        summary: 'Parola sıfırlama bağlantısı iste',
        security: [],
        requestBody: { required: true, content: json(ref('ForgotPasswordRequest')) },
        responses: {
          202: { description: 'E-posta kayıtlı olsun olmasın aynı yanıt.' },
          429: error('IP başına 15 dakikada 5 istek sınırı.', ['rate.limited'], { retryAfter: true }),
        },
      }),
    },
    '/auth/reset-password': {
      post: unsafe({
        tags: ['auth'],
        operationId: 'resetPassword',
        summary: 'Bağlantıdaki belirteçle yeni parola belirle',
        security: [],
        requestBody: { required: true, content: json(ref('ResetPasswordRequest')) },
        responses: {
          204: { description: 'Parola değişti; kullanıcının açık oturumları kapandı.' },
          400: error('Belirteç geçersiz, kullanılmış veya süresi dolmuş; ya da yeni parola kurala uymuyor.', [
            'auth.reset_token_invalid',
            'validation.failed',
          ]),
        },
      }),
    },
    '/demos': {
      get: {
        tags: ['demos'],
        operationId: 'listDemos',
        summary: 'Sanatçının kendi demoları',
        security: SIGNED_IN,
        parameters: LIST_PARAMETERS,
        responses: {
          200: { description: 'Bir sayfa demo.', content: json(ref('DemoPage')) },
          400: error('Geçersiz süzgeç, sıralama veya sayfa değeri.', ['validation.failed']),
          401: UNAUTHENTICATED,
        },
      },
      post: unsafe({
        tags: ['demos'],
        operationId: 'uploadDemo',
        summary: 'Demo yükle',
        description: `Yalnızca MP3, en fazla ${UPLOAD_RULES.maxBytes} bayt. Biçimi uzantı (\`.mp3\`) ve dosyanın ilk baytları (ID3v2 etiketi ya da MPEG Layer III çerçeve başlığı) belirler; istemcinin bildirdiği tür belirleyici değildir. Alan hataları biçimden önce denetlenir. SHA-256 özeti dosya okunurken hesaplanır.`,
        security: SIGNED_IN,
        requestBody: { required: true, content: { 'multipart/form-data': { schema: ref('DemoUpload') } } },
        responses: {
          201: {
            description: 'Kayıt oluştu.',
            headers: { Location: { description: '`/api/demos/{id}`', schema: { type: 'string' } } },
            content: json(ref('Demo')),
          },
          400: error('Alan hataları `fields` içinde.', ['validation.failed']),
          401: UNAUTHENTICATED,
          413: error('Dosya sınırdan büyük; okuma sırasında kesilir.', ['upload.too_large']),
          415: error('Dosya MP3 değil.', ['upload.unsupported_type']),
        },
      }),
    },
    '/demos/{id}': {
      get: {
        tags: ['demos'],
        operationId: 'getDemo',
        summary: 'Tek demo (sahibi ya da yönetici)',
        security: SIGNED_IN,
        parameters: [ID],
        responses: { 200: { description: 'Demo.', content: json(ref('Demo')) }, 401: UNAUTHENTICATED, 404: DEMO_NOT_FOUND },
      },
    },
    '/demos/{id}/audio': {
      get: {
        tags: ['demos'],
        operationId: 'getDemoAudio',
        summary: 'Ses dosyası; `Range` desteklenir',
        description: 'Sahibine ve yöneticiye açıktır. `Cache-Control: private, no-store` ve `X-Content-Type-Options: nosniff` taşır.',
        security: SIGNED_IN,
        parameters: [ID, { name: 'Range', in: 'header', schema: { type: 'string' }, example: 'bytes=0-1023' }],
        responses: {
          200: { description: 'Dosyanın tamamı.', content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } } },
          206: {
            description: 'İstenen aralık.',
            headers: { 'Content-Range': { schema: { type: 'string' } } },
            content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } },
          },
          401: UNAUTHENTICATED,
          404: DEMO_NOT_FOUND,
          416: { description: 'Aralık dosyanın dışında.' },
        },
      },
    },
    '/admin/demos': {
      get: {
        tags: ['admin'],
        operationId: 'listAllDemos',
        summary: 'Tüm demolar, sanatçısıyla',
        security: SIGNED_IN,
        parameters: [...LIST_PARAMETERS, { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Parça veya sanatçı adında; büyük/küçük harf ve aksan duyarsız.' }],
        responses: {
          200: { description: 'Bir sayfa demo.', content: json(ref('AdminDemoPage')) },
          400: error('Geçersiz süzgeç, sıralama veya sayfa değeri.', ['validation.failed']),
          401: UNAUTHENTICATED,
          403: FORBIDDEN,
        },
      },
    },
    '/admin/demos/{id}': {
      get: {
        tags: ['admin'],
        operationId: 'getAnyDemo',
        summary: 'Tek demo, sanatçısıyla',
        security: SIGNED_IN,
        parameters: [ID],
        responses: {
          200: { description: 'Demo.', content: json(ref('AdminDemo')) },
          401: UNAUTHENTICATED,
          403: FORBIDDEN,
          404: DEMO_NOT_FOUND,
        },
      },
    },
    '/admin/demos/{id}/status': {
      patch: unsafe({
        tags: ['admin'],
        operationId: 'changeDemoStatus',
        summary: 'Değerlendirme durumunu değiştir',
        description: '`statusNote` gönderilmezse veya boşsa `null` olur; önceki not yeni duruma taşınmaz.',
        security: SIGNED_IN,
        parameters: [ID],
        requestBody: { required: true, content: json(ref('StatusChange')) },
        responses: {
          200: { description: 'Güncel kayıt.', content: json(ref('AdminDemo')) },
          400: error('Alan hataları `fields` içinde.', ['validation.failed']),
          401: UNAUTHENTICATED,
          403: FORBIDDEN,
          404: DEMO_NOT_FOUND,
        },
      }),
    },
  },
  components: {
    securitySchemes: {
      session: {
        type: 'apiKey',
        in: 'cookie',
        name: SESSION_COOKIE,
        description: '`HttpOnly`, `SameSite=Lax` (HTTPS’te `Secure`) oturum çerezi. Adı sunucuya bağlıdır; frontend çerezi hiç okumaz.',
      },
    },
    parameters: {
      CsrfToken: {
        name: CSRF_HEADER,
        in: 'header',
        required: true,
        description: '`GET /api/csrf` ile alınan belirteç; giriş ve çıkışta geçersizleşir.',
        schema: { type: 'string' },
      },
    },
    schemas: {
      Status: { type: 'string', enum: [...STATUSES] },
      Genre: { type: 'string', enum: [...GENRES] },
      SortOrder: { type: 'string', enum: [...SORT_ORDERS] },
      Role: { type: 'string', enum: ROLES },
      FieldErrorCode: { type: 'string', enum: FIELD_CODES },
      ErrorBody: {
        type: 'object',
        additionalProperties: false,
        required: ['code'],
        properties: {
          code: { type: 'string' },
          fields: {
            type: 'object',
            additionalProperties: { type: 'array', minItems: 1, items: ref('FieldErrorCode') },
          },
          retryAfterSeconds: { type: 'integer', minimum: 1 },
        },
      },
      CsrfToken: {
        type: 'object',
        additionalProperties: false,
        required: ['token'],
        properties: { token: { type: 'string', minLength: 1 } },
      },
      User: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'email', 'displayName', 'role'],
        properties: {
          id: { type: 'string' },
          email: { type: 'string', maxLength: FIELD_LIMITS.email.max },
          displayName: text(FIELD_LIMITS.displayName),
          role: ref('Role'),
        },
      },
      LoginResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['user'],
        properties: { user: ref('User') },
      },
      DemoFile: {
        type: 'object',
        additionalProperties: false,
        required: ['originalName', 'sizeBytes', 'contentType', 'sha256'],
        properties: {
          originalName: { type: 'string', minLength: 1, maxLength: 255, description: 'Yalnızca metin olarak gösterilir.' },
          sizeBytes: { type: 'integer', minimum: 1 },
          contentType: { type: 'string' },
          sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        },
      },
      Demo: {
        type: 'object',
        additionalProperties: false,
        required: Object.keys(demoProperties),
        properties: demoProperties,
      },
      AdminDemo: {
        type: 'object',
        additionalProperties: false,
        required: [...Object.keys(demoProperties), 'artist'],
        properties: {
          ...demoProperties,
          artist: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'displayName'],
            properties: { id: { type: 'string' }, displayName: text(FIELD_LIMITS.displayName) },
          },
        },
      },
      DemoPage: page('Demo'),
      AdminDemoPage: page('AdminDemo'),
      RegisterRequest: {
        type: 'object',
        required: ['displayName', 'email', 'password'],
        properties: {
          displayName: text(FIELD_LIMITS.displayName),
          email: { type: 'string', format: 'email', maxLength: FIELD_LIMITS.email.max },
          password: { type: 'string', minLength: PASSWORD_RULES.minLength, maxLength: PASSWORD_RULES.maxLength },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string' }, password: { type: 'string' } },
      },
      ForgotPasswordRequest: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string' } },
      },
      ResetPasswordRequest: {
        type: 'object',
        required: ['email', 'token', 'newPassword'],
        properties: {
          email: { type: 'string' },
          token: { type: 'string' },
          newPassword: { type: 'string', minLength: PASSWORD_RULES.minLength, maxLength: PASSWORD_RULES.maxLength },
        },
      },
      StatusChange: {
        type: 'object',
        required: ['status'],
        properties: {
          status: ref('Status'),
          statusNote: { type: ['string', 'null'], maxLength: FIELD_LIMITS.statusNote.max },
        },
      },
      DemoUpload: {
        type: 'object',
        required: ['title', 'genre', 'file'],
        properties: {
          title: text(FIELD_LIMITS.title),
          genre: ref('Genre'),
          note: { type: 'string', maxLength: FIELD_LIMITS.note.max },
          file: { type: 'string', format: 'binary', description: 'MP3' },
        },
      },
    },
  },
};

const HEADER = '# Kaynak: dev-mock/openapi.mjs. Değişiklik orada yapılır; bu dosyayı `npm run openapi` yeniden yazar.\n';

/** The text of docs/openapi.yaml. */
export function openapiYaml() {
  return HEADER + toYaml(OPENAPI);
}

// A small YAML writer for plain data: block mappings, block sequences of mappings, flow
// sequences of scalars. Anything that is not a bare word is written as a JSON string, which
// is also a valid YAML double-quoted scalar.
const BARE = /^[A-Za-z][A-Za-z0-9_.\/-]*$/;
const KEYWORDS = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', 'y', 'n', '~']);

function scalar(value) {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return BARE.test(value) && !KEYWORDS.has(value.toLowerCase()) ? value : JSON.stringify(value);
}

const isScalar = (value) => value === null || typeof value !== 'object';

function lines(value, indent) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (isScalar(item)) return [`${pad}- ${scalar(item)}`];
      if (Array.isArray(item) || Object.keys(item).length === 0) throw new TypeError('Unsupported sequence item.');
      const body = lines(item, indent + 2);
      body[0] = `${pad}- ${body[0].slice(indent + 2)}`;
      return body;
    });
  }
  return Object.entries(value).flatMap(([key, item]) => {
    const name = scalar(key);
    if (isScalar(item)) return [`${pad}${name}: ${scalar(item)}`];
    if (Array.isArray(item)) {
      if (item.length === 0) return [`${pad}${name}: []`];
      if (item.every(isScalar)) return [`${pad}${name}: [${item.map(scalar).join(', ')}]`];
      return [`${pad}${name}:`, ...lines(item, indent + 2)];
    }
    if (Object.keys(item).length === 0) return [`${pad}${name}: {}`];
    return [`${pad}${name}:`, ...lines(item, indent + 2)];
  });
}

export function toYaml(value) {
  return `${lines(value, 0).join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(OUTPUT, openapiYaml());
  console.log('docs/openapi.yaml');
}
