/** Creates an element; text always goes through textContent, never HTML (spec 12 security). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const numberFormat = new Intl.NumberFormat('es-MX');

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** Remote avatars: no referrer and a neutral fallback when the CDN fails. */
export function avatar(url: string | undefined, className: string): HTMLElement {
  const fallback = el('span', `${className} ${className}--empty`);
  if (!url) return fallback;
  const img = el('img', className);
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.loading = 'lazy';
  img.src = url;
  img.addEventListener('error', () => img.replaceWith(fallback), { once: true });
  return img;
}
