// helpers/template.js

// Very simple token replacement: {{title}}, {{notes}}, {{text}}, {{scenario}}
export function fillTemplate(template, values) {
  let result = String(template);
  const map = values || {};

  for (const key in map) {
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      const value =
        map[key] === null || map[key] === undefined
          ? ""
          : String(map[key]);
      const pattern = new RegExp("\\{\\{" + key + "\\}\\}", "g");
      result = result.replace(pattern, value);
    }
  }

  return result;
}
