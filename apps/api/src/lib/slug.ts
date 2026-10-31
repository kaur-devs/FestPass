const MAX_LENGTH = 60;

export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, '');
  return slug.length >= 3 ? slug : `event-${slug}`.replace(/-$/, '');
}

export function withSuffix(slug: string, attempt: number): string {
  if (attempt === 0) return slug;
  const suffix = `-${attempt + 1}`;
  return `${slug.slice(0, MAX_LENGTH - suffix.length).replace(/-+$/g, '')}${suffix}`;
}
