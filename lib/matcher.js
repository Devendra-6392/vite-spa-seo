// lib/matcher.js
// Zero-dependency Express-style route pattern matcher

function compileRoute(pattern) {
  const paramNames = [];
  const normalized = pattern.replace(/\/+$/, '') || '/';

  // Handle root
  if (normalized === '/') {
    return {
      regex: /^\/?$/,
      paramNames: [],
    };
  }

  const regexPattern = normalized
    .replace(/([.+*?^=!:${}()|\[\]\/\\])/g, (match) => {
      // Escape regex special chars except : and *
      if (match === ':' || match === '*') return match;
      return '\\' + match;
    })
    .replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    })
    .replace(/\*/g, () => {
      paramNames.push('wildcard');
      return '(.*)';
    });

  return {
    regex: new RegExp(`^${regexPattern}\\/?$`, 'i'),
    paramNames,
  };
}

function matchRoute(compiled, pathname) {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const match = clean.match(compiled.regex);
  if (!match) return null;

  const params = {};
  for (let i = 0; i < compiled.paramNames.length; i++) {
    const name = compiled.paramNames[i];
    params[name] = decodeURIComponent(match[i + 1] || '');
  }

  return params;
}

module.exports = {
  compileRoute,
  matchRoute,
};
