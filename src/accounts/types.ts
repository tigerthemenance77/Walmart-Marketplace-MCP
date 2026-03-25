export type Environment = "production" | "sandbox";

export interface SellerAccount {
  alias: string;
  clientId: string;
  clientSecret: string;
  sellerId: string;
  sellerName: string;
  env: Environment;
  addedAt: string;
}

export interface AccountContext {
  alias: string;
  sellerId: string;
  sellerName: string;
  env: Environment;
}

export interface TokenCache {
  accessToken: string;
  expiresAt: number;
}
