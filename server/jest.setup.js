// Test-only placeholder credential so unit tests that mock @anthropic-ai/sdk
// can pass the "is ANTHROPIC_API_KEY set" guard without touching a real key.
// Never used to make a real network call — the SDK is always mocked in tests.
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-placeholder-key';
