/** Base class for errors raised by the FeatureGate Node.js SDK. */
export class FeatureGateError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Error raised when the FeatureGate API rejects the configured runtime key. */
export class FeatureGateAuthenticationError extends FeatureGateError {
  /** HTTP status returned by the FeatureGate API. */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Error raised when SDK options or a FeatureGate response are invalid. */
export class FeatureGateConfigurationError extends FeatureGateError {
  /** HTTP status associated with the error, when available. */
  readonly status: number | undefined;

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
  }
}

/** Error raised when a snapshot request fails transiently. */
export class FeatureGateRequestError extends FeatureGateError {
  /** HTTP status associated with the error, when available. */
  readonly status: number | undefined;
  /** Server-requested minimum delay before retrying, when available. */
  readonly retryAfterMs: number | undefined;

  constructor(
    message: string,
    status?: number,
    options?: ErrorOptions & { retryAfterMs?: number },
  ) {
    super(message, options);
    this.status = status;
    this.retryAfterMs = options?.retryAfterMs;
  }
}
