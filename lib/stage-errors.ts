export class StageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageValidationError";
  }
}

export class StageApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageApiError";
  }
}
