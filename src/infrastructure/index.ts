import type { InfrastructureProvider } from "./provider";
import {
  SyntheticInfrastructureProvider,
  defaultInfrastructureProvider
} from "./syntheticProvider";
import {
  CloudflareInfrastructureProvider,
  type CloudflareProviderConfig
} from "./cloudflareProvider";

export type { InfrastructureProvider, CloudflareProviderConfig };
export {
  SyntheticInfrastructureProvider,
  CloudflareInfrastructureProvider,
  defaultInfrastructureProvider
};

export function getInfrastructureProvider(
  env?: unknown
): InfrastructureProvider {
  const envObj = env as Record<string, string | undefined> | undefined;

  // 1. Check explicit DATA_PROVIDER setting
  const dataProvider =
    envObj?.DATA_PROVIDER ||
    (typeof process !== "undefined" ? process.env?.DATA_PROVIDER : undefined);

  if (dataProvider === "synthetic") {
    return defaultInfrastructureProvider;
  }

  // 2. Check for Cloudflare credentials
  const accountId =
    envObj?.CLOUDFLARE_ACCOUNT_ID ||
    (typeof process !== "undefined"
      ? process.env?.CLOUDFLARE_ACCOUNT_ID
      : undefined);

  const apiToken =
    envObj?.CLOUDFLARE_API_TOKEN ||
    (typeof process !== "undefined"
      ? process.env?.CLOUDFLARE_API_TOKEN
      : undefined);

  if (accountId && apiToken) {
    const workerNamesStr =
      envObj?.CLOUDFLARE_WORKER_NAMES ||
      (typeof process !== "undefined"
        ? process.env?.CLOUDFLARE_WORKER_NAMES
        : undefined);

    const workerNames = workerNamesStr
      ? workerNamesStr
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
      : undefined;

    return new CloudflareInfrastructureProvider({
      accountId,
      apiToken,
      workerNames
    });
  }

  // 3. Fallback to synthetic if credentials are not configured or in dev without tokens
  return defaultInfrastructureProvider;
}
