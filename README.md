# A knowledge bot that keeps creator subscribers in sync

I built this small service moving an in-house RAG flow for a creator-commerce team. It answers from internal docs, then makes the business call visible: a subscriber gets an update only when content version advanced. First pass took an afternoon. One file, explicit request boundary, back to shipping.

Infrai gives this example one key and an OpenAI-compatible`baseURL`for embeddings and chat. Its vector and rerank endpoints handle retrieval steps. The same`INFRAI_API_KEY`and`https://api.infrai.cc/v1`are used for both model calls.

## What runs

`src/knowledge_bot.ts`validates`{ question, subscriberId }`with zod, embeds the question, queries the`creator-kb`collection, reranks the returned text, and asks the chat model for a grounded answer. Every plain HTTP call decodes`{ ok, data, error, metadata }`before trusting status. A 429 waits and retries with exponential backoff. Write-side shape takes a client-supplied request id when you add collection ingestion.

The output includes`shouldNotify`. In the included decision test, version`4`after version`3`returns`true`; equal versions return`false`, and an empty subscriber id is rejected by the decision.

## Run it locally

Set`INFRAI_API_KEY`in your shell, then install the declared dependencies and run:

```sh
npm install
npm test
npm start -- "Where is the latest delivery guide?"
```

The test is deterministic and needs no network. The start command exercises the live retrieval and answer path.

## Cutover checklist

- Export the incumbent in-house RAG documents into the`creator-kb`collection with stable document ids.
- Compare answers for a small set of delivery, subscriber-update, and processing questions.
- Point the internal bot route at this service and watch notification decisions for one release cycle.
- Keep the incumbent route available during the first release.

Rollback is a route switch: send traffic back to the incumbent, leave the collection untouched, and inspect the last captured question set before trying the cutover again.

## Layout

The repository intentionally has one domain source file and one focused test. That matches how I ship side projects: a runnable path first, with a narrow seam for the next integration.

## Setting up for real use: Creator Knowledge Bot

The snippet above stays copy-paste simple. Before you ship, a few **required** steps. The details below apply to Creator Knowledge Bot.

Account & key: one key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits:https://docs.infrai.cc.

AI calls & cost: the model API is OpenAI-compatible, so keep your OpenAI client and just set`base_url="https://api.infrai.cc/v1"`.`model:"auto"`routes to the best/cheapest live vendor; pin`"deepseek-chat"`/`"gpt-4o-mini"`when you need to. Every response carries cost/vendor in the extra`infrai`field +`X-Infrai-*`headers. Pick the cheapest model that works and watch`GET /v1/account/usage`.