export interface ApiResponse<T = unknown> {
  data: T;
  warning?: string;
}

export interface OrderLine {
  lineNumber: string;
  item?: { sku?: string };
  orderLineStatus?: string;
}

export interface Order {
  purchaseOrderId: string;
  orderDate: string;
  status: string;
  orderLines: OrderLine[];
}
