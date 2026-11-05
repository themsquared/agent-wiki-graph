export class RefuseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RefuseError';
    this.code = code;
  }
}

export type RefuseReason = {
  code: string;
  message: string;
};
