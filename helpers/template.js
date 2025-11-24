// helpers/template.js

// Very simple token replacement: {{title}}, {{notes}}, {{text}}, {{scenario}}
export function fillTemplate(template, values) {
  let result = String(template);

  const map = values || {};
  Object.keys(map).forEach(function (key) {
    const pattern = new RegExp("\\{\\{" + key + "\\}\\}", "g");
    result = result.replace(pattern, map[key] == null ? "" : String(map[key]));
  });

  return result;
}
