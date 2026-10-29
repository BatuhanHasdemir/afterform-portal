// @ts-check

/** @typedef {'tr'|'en'} Lang */
/** @typedef {'artist'|'admin'} Role */
/** @typedef {'pending'|'in_review'|'accepted'|'rejected'} Status */
/** @typedef {'electronic'|'hiphop'|'pop'|'rock'|'ambient'|'jazz'|'experimental'|'other'} Genre */
/** @typedef {'newest'|'oldest'|'updated'|'title'} SortOrder */
/** @typedef {'required'|'too_short'|'too_long'|'invalid_format'|'invalid_value'} FieldErrorCode */

/** @typedef {{ id: string, email: string, displayName: string, role: Role }} User */

/**
 * @typedef {{
 *   id: string, title: string, genre: Genre, note: string,
 *   status: Status, statusNote: string|null,
 *   createdAt: string, updatedAt: string,
 *   file: { originalName: string, sizeBytes: number, contentType: string, sha256: string }
 * }} Demo
 */

/** @typedef {Demo & { artist: { id: string, displayName: string } }} AdminDemo */

/**
 * @template T
 * @typedef {{ items: T[], total: number, page: number, pageSize: number }} Page
 */

/**
 * @typedef {{ code: string, fields?: Record<string, FieldErrorCode[]>, retryAfterSeconds?: number }} ErrorBody
 */

/** @typedef {'public'|'guest'|Role|Role[]} Access */

export {};
