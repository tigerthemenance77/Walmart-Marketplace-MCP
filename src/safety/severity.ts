export enum Severity {
  INFO = "INFO",
  WARN = "WARN",
  DANGER = "DANGER",
  ERROR = "ERROR",
}

export const warnResponse = (operation: string, preview: unknown, readyToExecute: string) => ({
  dry_run: true,
  severity: Severity.WARN,
  operation,
  preview,
  readyToExecute,
});

export const dangerResponse = (operation: string, warning: string, preview: unknown, readyToExecute: string) => ({
  dry_run: true,
  severity: Severity.DANGER,
  operation,
  warning,
  preview,
  readyToExecute,
});
