# Project notes for Claude

## About the user

The user is not a technical person. They do not know standard developer
tools, terminology, or workflows (git, virtual environments, API keys,
etc.) by default.

**Always give fully spelled-out, numbered, step-by-step instructions.**
Do not assume familiarity with terminals, file paths, package managers,
or jargon. Explain what a command does in plain language before or
alongside giving it. Tell them exactly where to click/type/paste, on
which platform (Mac vs Windows) if it differs. Confirm what to expect
to see after each step, so they can tell if something worked.

## About the project

Project-Jarvi is a push-to-talk regulatory reporting expert assistant
for banking (Basel III/IV, CCAR/DFAST stress testing, financial
statement analysis). See README.md for the full architecture and setup
steps. Main working branch: `claude/banking-regulatory-ai-agent-5oiimq`.

Scope constraint: only public regulatory text and public financial
statements go into the knowledge base -- no proprietary/internal bank
data, per the user's explicit instruction.
