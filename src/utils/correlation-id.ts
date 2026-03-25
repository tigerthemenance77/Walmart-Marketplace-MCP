import { randomUUID } from "node:crypto";

export const newCorrelationId = (): string => randomUUID();
