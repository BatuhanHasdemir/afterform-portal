// @ts-check
import { FIELD_LIMITS, STATUSES } from '../core/config.js';
import { h } from '../core/dom.js';
import { errorKey, toApiError } from '../core/errors.js';
import { t } from '../core/i18n.js';
import { validateStatus, validateStatusNote } from '../core/validators.js';
import { changeStatus } from '../services/admin.js';
import { openDialog } from './dialog.js';
import { enhanceForm } from './form.js';
import { statusBadge } from './status-badge.js';
import { showToast } from './toast.js';
/** @import { AdminDemo, Demo, Status } from '../core/types.js' */

let count = 0;

/**
 * The button that opens the status dialog. Its accessible name includes the demo title, so a
 * list of these buttons stays distinguishable for screen reader and voice control users. The
 * hidden part starts with a space: name computation may add one of its own around a hidden
 * (absolutely positioned) element, and whitespace collapses either way.
 * @param {string} title
 * @param {(button: HTMLButtonElement) => void} onClick
 */
export function statusButton(title, onClick) {
  const button = h(
    'button',
    { type: 'button', class: 'btn btn--secondary' },
    h('span', { i18n: 'admin.changeStatus' }),
    h('span', { class: 'visually-hidden', text: ` (${title})` }),
  );
  button.addEventListener('click', () => onClick(button));
  return button;
}

/**
 * Asks for the new status and an optional note, then saves them. `onSaved` also runs when the
 * dialog was closed while the request was on its way, because the change was made all the same.
 * @param {{ demo: Demo | AdminDemo, opener: HTMLElement, onSaved: (demo: AdminDemo) => void }} options
 */
export function openStatusDialog({ demo, opener, onSaved }) {
  count += 1;
  const ids = {
    status: `status-dialog-status-${count}`,
    note: `status-dialog-note-${count}`,
    hint: `status-dialog-note-hint-${count}`,
    replaces: `status-dialog-note-replaces-${count}`,
  };

  const select = h(
    'select',
    { class: 'select', id: ids.status, name: 'status', autofocus: true },
    STATUSES.map((status) => h('option', { value: status, i18n: `status.${status}` })),
  );
  select.value = demo.status;

  const form = h(
    'form',
    { class: 'form-stack dialog__form' },
    h(
      'div',
      { class: 'field' },
      h('label', { class: 'field__label', for: ids.status, i18n: 'admin.statusDialog.status' }),
      select,
    ),
    h(
      'div',
      { class: 'field' },
      h('label', { class: 'field__label', for: ids.note, i18n: 'admin.statusDialog.note' }),
      h('p', { class: 'field__hint', id: ids.hint, i18n: 'admin.statusDialog.noteHint' }),
      demo.statusNote && h('p', { class: 'field__hint', id: ids.replaces, i18n: 'admin.statusDialog.noteReplaces' }),
      h('textarea', {
        class: 'textarea',
        id: ids.note,
        name: 'statusNote',
        rows: 4,
        'aria-describedby': demo.statusNote ? `${ids.hint} ${ids.replaces}` : ids.hint,
      }),
    ),
    h(
      'div',
      { class: 'dialog__actions' },
      h('button', { type: 'submit', class: 'btn btn--primary', i18n: 'admin.statusDialog.submit' }),
      h('button', {
        type: 'button',
        class: 'btn btn--secondary',
        dataset: { dialogClose: '' },
        i18n: 'admin.statusDialog.cancel',
      }),
    ),
  );

  const { close } = openDialog({ titleKey: 'admin.statusDialog.title', opener, content: [subject(demo), current(demo), form] });

  // Wired after the dialog is in the document: the error summary is placed next to the form.
  enhanceForm(form, {
    fields: {
      status: { validate: (value) => validateStatus(value) },
      statusNote: { validate: (value) => validateStatusNote(value), limits: FIELD_LIMITS.statusNote },
    },
    async submit(values) {
      try {
        const saved = await changeStatus(demo.id, {
          status: /** @type {Status} */ (values.status),
          statusNote: values.statusNote,
        });
        close();
        onSaved(saved);
        showToast(t('admin.statusSaved', { title: saved.title, status: t(`status.${saved.status}`) }), { tone: 'ok' });
      } catch (error) {
        // Closed while waiting: the form is gone, so the problem is reported where it can be seen.
        if (form.isConnected) throw error;
        showToast(t(errorKey(toApiError(error).code)), { tone: 'danger' });
      }
    },
  });
}

/** @param {Demo | AdminDemo} demo */
function subject(demo) {
  return h(
    'p',
    { class: 'dialog__subject' },
    h('span', { class: 'dialog__subject-title', text: demo.title }),
    'artist' in demo && h('span', { class: 'dialog__subject-artist', text: demo.artist.displayName }),
  );
}

/** @param {Demo | AdminDemo} demo */
function current(demo) {
  return h(
    'dl',
    { class: 'facts dialog__facts' },
    h('div', { class: 'facts__row' }, h('dt', { i18n: 'admin.statusDialog.current' }), h('dd', {}, statusBadge(demo.status))),
    demo.statusNote &&
      h(
        'div',
        { class: 'facts__row' },
        h('dt', { i18n: 'admin.statusDialog.currentNote' }),
        h('dd', { class: 'dialog__note', text: demo.statusNote }),
      ),
  );
}
