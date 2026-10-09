export interface WebhookRequest {
  readonly url: string;
  readonly method: 'POST' | 'PUT';
  readonly body: string;
}

/** Outbound HTTP for the webhook action. Rejects when the call fails or the status is not 2xx. */
export interface WebhookClient {
  /** Synchronous policy check, so a rule can report a forbidden destination immediately. */
  isAllowed(url: string): boolean;
  send(request: WebhookRequest): Promise<void>;
}
