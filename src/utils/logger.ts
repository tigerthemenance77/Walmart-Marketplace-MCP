const toLine = (level: string, message: string, meta?: unknown): string => {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {}),
  };
  return `${JSON.stringify(payload)}\n`;
};

const writeErr = (line: string): void => {
  process.stderr.write(line);
};

export const logger = {
  info(message: string, meta?: unknown): void {
    writeErr(toLine("info", message, meta));
  },
  warn(message: string, meta?: unknown): void {
    writeErr(toLine("warn", message, meta));
  },
  error(message: string, meta?: unknown): void {
    writeErr(toLine("error", message, meta));
  },
};
