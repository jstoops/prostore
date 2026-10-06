// query-string v9 is ESM-only. Jest runs this suite as CommonJS, so formUrlQuery
// is exercised against a small compatible stand-in for parse/stringifyUrl.

function parse(query = '') {
  const params = new URLSearchParams(
    String(query).startsWith('?') ? String(query).slice(1) : String(query)
  );
  const result = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

function stringifyUrl(object, options = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(object.query ?? {})) {
    if (value === undefined) continue;
    if (options.skipNull && value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && !(options.skipNull && item === null)) {
          params.append(key, String(item));
        }
      }
      continue;
    }
    if (value === null) {
      params.append(key, '');
      continue;
    }
    params.set(key, String(value));
  }

  const search = params.toString();
  return search ? `${object.url}?${search}` : object.url;
}

module.exports = { parse, stringifyUrl };
module.exports.default = module.exports;
