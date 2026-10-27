export function plural(count: number, singular: string, pluralForm: string): string {
  if (count === 1) {
    return `${count} ${singular}`;
  }
  return `${count} ${pluralForm}`;
}

export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

/** `/a/b/c` -> `/a/b/`; the folder a path lives in, kept with its trailing slash for display. */
export function parentDir(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(0, trimmed.lastIndexOf("/") + 1);
}
