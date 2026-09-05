# ResolveFlow

AI-assisted dispute resolution desk for payments operations. ResolveFlow triages a
queue of payment disputes (failed-but-debited UPI transfers, refunds stuck at the
issuer, duplicate fee-portal payments, chargebacks, AutoPay mandates, recharge and
utility non-fulfilment, settlement and KYC holds, MDR/fee claims and unauthorised
payments), proposes a verdict with an auditable rationale, and gives the agent a
case assistant to work the file.

## Features

- **Dispute queue** — 100 realistic cases with amount, priority, channel, customer
  history and evidence on file.
- **AI verdicts** — one model call per case returns a verdict, confidence, cited
  policies, key evidence, risk flags, suggested actions and a customer-facing reply.
  Low confidence or a blocking policy routes the case to human review.
- **Batch review** — one control runs the AI check across 10, 50 or all cases, with
  live progress, a stop button and an option to skip already-reviewed cases.
- **Case assistant** — a streaming chat grounded in the case record and the policy
  book; drafts customer replies, internal notes and evidence requests.
- **Configuration** — every rule is editable in the browser: thresholds, policy book,
  categories, verdicts, agents, cases and both system prompts. A Credentials panel
  shows which environment variables the server actually sees (masked) and can prove
  both connections with a live test call.

## Configuration data

Everything the engine reads lives in `src/data/*.json`:

| File | Contents |
| --- | --- |
| `settings.json` | Organisation, currency, model, thresholds, system prompts |
| `policies.json` | The policy book, including blocking rules |
| `categories.json` | Dispute categories and default priority |
| `verdicts.json` | Allowed verdicts the model must choose from |
| `agents.json` | Resolution agents |
| `cases.json` | The dispute queue |

Edits made on the Configuration page are kept in the browser, so the shipped JSON
stays as the default seed. Change the JSON files to change the defaults for everyone.

## Credentials

Keys are read **only from the server environment** — never from the browser, never
from the JSON files. Copy `.env.example` to `.env` for local runs, or set the same
variable names in your host's environment-variables settings when deployed.

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | yes | Powers both the decision engine and the case assistant |
| `OPENAI_BASE_URL` | no | Point at Azure OpenAI or a proxy |
| `LANGSMITH_API_KEY` | no | Enables tracing of every model call |
| `LANGSMITH_TRACING` | no | `true` to send traces |
| `LANGSMITH_PROJECT` | no | Trace project name (default `resolveflow`) |
| `LANGSMITH_ENDPOINT` | no | LangSmith API endpoint |

Open Configuration → Credentials and press **Test connection** to confirm what the
server sees.

## Development

Requires [Bun](https://bun.sh) (or Node.js 20+ with npm).

```sh
bun install
cp .env.example .env   # then fill in OPENAI_API_KEY
bun run dev            # http://localhost:8080
```

Useful scripts: `bun run build`, `bun run lint`, `bun run typecheck`.

## Built with

- TanStack Start (React 19, Vite 7)
- TypeScript
- Tailwind CSS v4
- Vercel AI SDK with the OpenAI provider
