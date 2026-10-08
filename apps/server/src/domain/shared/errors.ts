export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnknownConditionError extends DomainError {
  constructor(readonly conditionType: string) {
    super(`Unknown condition type: ${conditionType}`);
  }
}

export class UnknownActionError extends DomainError {
  constructor(readonly actionType: string) {
    super(`Unknown action type: ${actionType}`);
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`Invalid connector transition: ${from} -> ${to}`);
  }
}

export class UnsafePatternError extends DomainError {
  constructor(pattern: string) {
    super(`Regex pattern rejected as unsafe: ${pattern}`);
  }
}
