// Types for the vendored router (modelRouter.js is copied verbatim — see PROVENANCE.md).
export interface RouterResponse {
  content: { type: string; text?: string }[];
}

export interface RouterOptions {
  freeOnly: true;
  timeoutMs?: number;
  validate?: (parsed: RouterResponse) => void;
}

export function callModel(params: Record<string, unknown>, opts: RouterOptions): Promise<RouterResponse>;
