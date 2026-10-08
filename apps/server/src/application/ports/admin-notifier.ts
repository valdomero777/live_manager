import type { AdminMessageType, AdminPayload } from '@tiklive/contracts';

/** Pushes operational updates to dashboard clients. */
export interface AdminNotifier {
  publish<T extends AdminMessageType>(type: T, payload: AdminPayload<T>): void;
}
