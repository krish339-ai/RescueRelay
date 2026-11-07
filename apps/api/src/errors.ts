export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const fail = (
  status: number,
  code: string,
  message: string,
  details?: unknown,
): never => {
  throw new AppError(status, code, message, details);
};
export function assert(
  condition: unknown,
  status: number,
  code: string,
  message: string,
): asserts condition {
  if (!condition) fail(status, code, message);
}
