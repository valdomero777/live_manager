import type { APIRequestContext } from '@playwright/test';

interface Health {
  screens: Record<string, number>;
}

/** How many overlay screens of each kind are connected right now (public `/health`). */
export async function connectedScreens(
  request: APIRequestContext,
): Promise<Record<string, number>> {
  const response = await request.get('/api/v1/health');
  return ((await response.json()) as Health).screens;
}
