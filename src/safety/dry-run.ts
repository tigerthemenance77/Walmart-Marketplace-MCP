import { warnResponse } from "./severity.js";

export const previewAcknowledgeOrder = (purchaseOrderId: string, order: { orderDate?: string; status?: string; orderLines?: unknown[] }) =>
  warnResponse(
    "acknowledge_order",
    {
      purchaseOrderId,
      orderDate: order.orderDate,
      lineCount: order.orderLines?.length ?? 0,
      status: order.status,
    },
    "Call again with dry_run=false to acknowledge this order.",
  );

export const previewShipOrder = (purchaseOrderId: string, orderLines: Array<{ carrierName?: string; trackingNumber?: string }>) =>
  warnResponse(
    "ship_order",
    {
      purchaseOrderId,
      linesToShip: orderLines.length,
      carrier: orderLines[0]?.carrierName,
      tracking: orderLines[0]?.trackingNumber,
    },
    "Call again with dry_run=false to submit shipping confirmation.",
  );

export const previewInventory = (sku: string, currentQuantity: number, quantity: number, shipNodeId: string) =>
  warnResponse(
    "update_inventory",
    {
      sku,
      currentQuantity,
      proposedQuantity: quantity,
      delta: quantity - currentQuantity,
      shipNodeId,
    },
    "Call again with dry_run=false to apply this inventory change.",
  );

export const previewPrice = (sku: string, currentPrice: number, price: number) =>
  warnResponse(
    "update_price",
    {
      sku,
      currentPrice,
      proposedPrice: price,
      delta: price - currentPrice,
      percentChange: currentPrice === 0 ? "N/A" : `${(((price - currentPrice) / currentPrice) * 100).toFixed(1)}%`,
    },
    "Call again with dry_run=false to apply this price change.",
  );
