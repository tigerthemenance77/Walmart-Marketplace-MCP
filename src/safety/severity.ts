export enum Severity {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

export const warnResponse = (operation: string, preview: unknown, readyToExecute: string) => ({
  dry_run: true,
  severity: Severity.WARN,
  operation,
  preview,
  readyToExecute,
});
