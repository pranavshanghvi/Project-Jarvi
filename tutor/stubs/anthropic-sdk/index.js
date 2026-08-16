// Stands in for @anthropic-ai/sdk so the vendored router can be required verbatim without the
// paid path existing in this deployment at all.
//
// CLAUDE.md: "Nothing built in this repository may reach a paid AI API." The router only touches
// this module in its Anthropic fallback, which `freeOnly: true` skips. Making the module throw
// turns "we always pass the flag" from a convention someone has to remember into something the
// module graph enforces: drop the flag and you get a stack trace, not an invoice.

const MESSAGE = [
  'Refusing to call a paid AI API.',
  '',
  'Something reached the Anthropic fallback in the model router, which means a callModel()',
  'call site is missing `{ freeOnly: true }`. See CLAUDE.md — the ultimate directive is that',
  'asking this tutor a question must never cost money.',
  '',
  'The fix is at the call site, not here. When every free provider is exhausted the correct',
  'behaviour is to degrade: serve the offline pack and queue the question.',
].join('\n');

class PaidPathDisabled extends Error {
  constructor() { super(MESSAGE); this.name = 'PaidPathDisabled'; this.code = 'PAID_PATH_DISABLED'; }
}

class Anthropic {
  constructor() { throw new PaidPathDisabled(); }
}

Anthropic.default = Anthropic;
Anthropic.Anthropic = Anthropic;
Anthropic.PaidPathDisabled = PaidPathDisabled;

module.exports = Anthropic;
