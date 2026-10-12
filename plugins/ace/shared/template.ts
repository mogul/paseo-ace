export type TemplateContext = Record<string, unknown>;

function lookup(context: TemplateContext, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = context;
  for (const part of parts) {
    if (current == null) return undefined;
    if (typeof current !== "object") return undefined;
    if (!(part in (current as Record<string, unknown>))) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_.\-\[\]]+)\s*\}\}/g, (_match, path: string) => {
    const value = lookup(context, path.trim());
    if (value === undefined || value === null) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return JSON.stringify(value);
  });
}
