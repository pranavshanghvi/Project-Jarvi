// Asks the AI for its steadiest answer.
//
// Every AI provider has a dial for how much its answers vary from one ask to the next
// ("temperature"). Left alone it sits around the middle, which is why the same photo of a donut
// came back as 350 calories, then 250, then 260. Turned to zero the model gives its single most
// likely answer every time. That does not make the answer right, but it stops it wandering.
//
// The router this project uses (modelRouter.js) is a byte-for-byte copy of another project's file
// and is never edited here, and it has no place to set that dial. So the dial is set at the last
// step instead: just as a request leaves for the provider, zero is added if nothing was chosen.
// Nothing else about the request changes, and a request that is not an AI call is left alone.

let installed = false;

export function withSteadyAnswers(body: string): string {
  if (!body.startsWith('{')) return body;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.model === 'string' && Array.isArray(parsed.messages)) {
      if (parsed.temperature !== undefined) return body;
      parsed.temperature = 0; // Cloudflare, Groq, Mistral, OpenRouter
    } else if (Array.isArray(parsed.contents)) {
      if (parsed.generationConfig?.temperature !== undefined) return body;
      parsed.generationConfig = { ...parsed.generationConfig, temperature: 0 }; // Gemini
    } else {
      return body;
    }
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

export function steadyAnswers(): void {
  if (installed || typeof globalThis.fetch !== 'function') return;
  installed = true;
  const send = globalThis.fetch;
  globalThis.fetch = ((input: any, init?: any) =>
    send(input, init && init.method === 'POST' && typeof init.body === 'string' ? { ...init, body: withSteadyAnswers(init.body) } : init)) as typeof fetch;
}
