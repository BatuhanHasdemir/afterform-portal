// The part of JSON Schema 2020-12 that docs/openapi.yaml uses: $ref into the same document,
// type (one or several), properties, required, additionalProperties (false or a schema), items,
// enum, minLength/maxLength, pattern, minimum/maximum, minItems, maxProperties, allOf and the
// date-time format. Anything else in a schema is ignored, so a schema must not rely on it.

const TYPES = {
  string: (value) => typeof value === 'string',
  integer: (value) => Number.isInteger(value),
  number: (value) => typeof value === 'number',
  boolean: (value) => typeof value === 'boolean',
  null: (value) => value === null,
  array: (value) => Array.isArray(value),
  object: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
};

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * @param {object} schema
 * @param {unknown} value
 * @param {object} root the document that `$ref` points into
 * @param {string} [path]
 * @returns {string[]} one line per problem; empty when the value conforms
 */
export function validate(schema, value, root, path = '$') {
  if (schema.$ref) return validate(resolve(root, schema.$ref), value, root, path);
  const problems = [];
  const fail = (message) => problems.push(`${path}: ${message}`);

  for (const part of schema.allOf ?? []) problems.push(...validate(part, value, root, path));

  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((type) => TYPES[type](value))) {
      fail(`expected ${types.join(' or ')}, got ${JSON.stringify(value)}`);
      return problems;
    }
  }
  if (schema.enum && !schema.enum.includes(value)) fail(`${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail(`shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail(`longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) fail(`does not match ${schema.pattern}`);
    if (schema.format === 'date-time' && !DATE_TIME.test(value)) fail('not an ISO-8601 UTC date-time');
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`fewer than ${schema.minItems} items`);
    if (schema.items) value.forEach((item, i) => problems.push(...validate(schema.items, item, root, `${path}[${i}]`)));
  }
  if (TYPES.object(value)) {
    for (const name of schema.required ?? []) if (!(name in value)) fail(`missing ${name}`);
    for (const [name, item] of Object.entries(value)) {
      if (schema.properties?.[name]) problems.push(...validate(schema.properties[name], item, root, `${path}.${name}`));
      else if (schema.additionalProperties === false) fail(`unexpected property ${name}`);
      else if (TYPES.object(schema.additionalProperties)) problems.push(...validate(schema.additionalProperties, item, root, `${path}.${name}`));
    }
    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) fail(`more than ${schema.maxProperties} properties`);
  }
  return problems;
}

/**
 * @param {object} root
 * @param {string} pointer e.g. '#/components/schemas/Demo'
 */
function resolve(root, pointer) {
  const target = pointer.slice(2).split('/').reduce((node, key) => node?.[key], root);
  if (!target) throw new Error(`Unresolved $ref ${pointer}`);
  return target;
}
