/**
 * Names for icon-only buttons and similar elements. They are built here instead of in an
 * `aria-label="… {{ x }}"` template attribute because Angular does not set an interpolated,
 * translated attribute on a native element.
 */
export const deleteLabel = (name: string): string => $localize`Eliminar ${name}`;
export const editLabel = (name: string): string => $localize`Editar ${name}`;
export const moreActionsLabel = (name: string): string => $localize`Más acciones para ${name}`;
export const selectLabel = (title: string): string => $localize`Seleccionar ${title}`;
export const playbackLabel = (title: string): string => $localize`Reproducción de ${title}`;
export const liveOverlayTitle = (name: string): string => $localize`Overlay en vivo: ${name}`;
export const searchLabel = (label: string): string => $localize`${label}\: buscar`;
export const giftLabel = (name: string, diamonds: number): string =>
  $localize`${name}, ${diamonds} monedas`;
export const giftTitle = (name: string, id: number): string => $localize`${name} · ID ${id}`;
