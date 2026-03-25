import { z } from "zod";

export const skuSchema = z.string().min(1).max(100);
export const isoDateSchema = z.string().datetime();
export const quantitySchema = z.number().int().min(0).max(1_000_000);
export const priceSchema = z.number().positive().max(1_000_000);
export const purchaseOrderIdSchema = z.string().min(1).max(100);
