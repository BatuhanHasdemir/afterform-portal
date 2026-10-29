import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Source scan for the frontend rules in ARCHITECTURE §8. It is deliberately blunt: a match in a
// comment fails too, which keeps the forbidden names out of the code base entirely.

const WEB_DIR = fileURLToPath(new URL('../../web/', import.meta.url));

const SCRIPT_RULES = [
  ['innerHTML', /\binnerHTML\b/],
  ['outerHTML', /\bouterHTML\b/],
  ['insertAdjacentHTML', /\binsertAdjacentHTML\b/],
  ['createContextualFragment', /\bcreateContextualFragment\b/],
  ['document.write', /\bdocument\s*\.\s*write(?:ln)?\b/],
  ['eval', /(?<![\w$.])eval\s*\(/],
  ['new Function', /\bnew\s+Function\s*\(/],
  ['string passed to a timer', /\bset(?:Timeout|Interval)\s*\(\s*['"`]/],
  ['event handler set as an attribute', /\bsetAttribute\s*\(\s*['"`]on/i],
  ['inline style attribute', /\bsetAttribute\s*\(\s*['"`]style['"`]/i],
  ['srcdoc', /\bsrcdoc\b/],
  ['console.log', /\bconsole\s*\.\s*log\s*\(/],
];

const PAGE_RULES = [
  ['inline script', /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i],
  ['inline event handler', /<[a-z][^>]*\son[a-z]+\s*=/i],
  ['inline style attribute', /<[a-z][^>]*\sstyle\s*=/i],
  ['style element', /<style\b/i],
  ['javascript: URL', /javascript:/i],
  [
    'third-party resource',
    /<(?:script|link|img|iframe|source|audio|video)\b[^>]*\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i,
  ],
];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

function violations(text, rules) {
  const found = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const [name, pattern] of rules) {
      if (pattern.test(line)) found.push(`${index + 1}: ${name}`);
    }
  });
  return found;
}

function scan(extensions, rules) {
  const report = [];
  for (const path of walk(WEB_DIR)) {
    if (!extensions.includes(extname(path))) continue;
    for (const hit of violations(readFileSync(path, 'utf8'), rules)) {
      report.push(`web/${relative(WEB_DIR, path).replaceAll('\\', '/')}:${hit}`);
    }
  }
  return report;
}

test('scripts contain no unsafe DOM sinks, dynamic code or console.log', () => {
  assert.deepEqual(scan(['.js', '.mjs'], SCRIPT_RULES), []);
});

test('pages contain no inline script, handlers, styles or third-party resources', () => {
  assert.deepEqual(scan(['.html'], PAGE_RULES), []);
});

test('the rules catch what they are meant to catch', () => {
  const badScript = [
    'el.innerHTML = x;',
    'node.outerHTML = y;',
    "el.insertAdjacentHTML('beforeend', x);",
    'range.createContextualFragment(s);',
    'document.write(s);',
    'eval(code);',
    "new Function('return 1');",
    "setTimeout('run()', 10);",
    "el.setAttribute('onclick', 'run()');",
    "el.setAttribute('style', 'color:red');",
    'frame.srcdoc = s;',
    "console.log('debug');",
  ];
  for (const line of badScript) assert.notDeepEqual(violations(line, SCRIPT_RULES), [], line);

  const badPage = [
    '<script>alert(1)</script>',
    '<button onclick="go()">',
    '<p style="color:red">',
    '<style>p{}</style>',
    '<a href="javascript:void(0)">',
    '<script type="module" src="https://cdn.example/x.js"></script>',
    '<link rel="stylesheet" href="//fonts.example/css">',
  ];
  for (const line of badPage) assert.notDeepEqual(violations(line, PAGE_RULES), [], line);

  const fine = [
    '<script type="module" src="/js/pages/home.js"></script>',
    '<link rel="stylesheet" href="/css/base.css">',
    '<a href="https://example.org" rel="noopener noreferrer">',
  ];
  for (const line of fine) assert.deepEqual(violations(line, PAGE_RULES), [], line);
  assert.deepEqual(violations("el.addEventListener('click', go); console.warn('x');", SCRIPT_RULES), []);
});
