> ## Documentation Index
> Fetch the complete documentation index at: https://docs.langchain.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Subagents

> Learn how to use subagents to delegate work and keep context clean

A deep agent can create subagents to delegate work. You can specify custom subagents in the `subagents` parameter. Subagents are useful for [context quarantine](https://www.dbreunig.com/2025/06/26/how-to-fix-your-context.html#context-quarantine) (keeping the main agent's context clean) and for providing specialized instructions.

This page covers **synchronous** subagents, where the supervisor blocks until the subagent finishes. For long-running tasks, parallel workstreams, or cases where you need mid-flight steering and cancellation, see [Async subagents](/oss/javascript/deepagents/async-subagents).

```mermaid theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
graph TB
    Main[Main Agent] --> |task tool| Sub[Subagent]

    Sub --> Research[Research]
    Sub --> Code[Code]
    Sub --> General[General]

    Research --> |isolated work| Result[Final Result]
    Code --> |isolated work| Result
    General --> |isolated work| Result

    Result --> Main
```

## Why use subagents?

Subagents solve the **context bloat problem**. When agents use tools with large outputs (web search, file reads, database queries), the context window fills up quickly with intermediate results. Subagents isolate this detailed work—the main agent receives only the final result, not the dozens of tool calls that produced it.

**When to use subagents:**

* ✅ Multi-step tasks that would clutter the main agent's context
* ✅ Specialized domains that need custom instructions or tools
* ✅ Tasks requiring different model capabilities
* ✅ When you want to keep the main agent focused on high-level coordination

**When NOT to use subagents:**

* ❌ Simple, single-step tasks
* ❌ When you need to maintain intermediate context
* ❌ When the overhead outweighs benefits

## Configuration

`subagents` should be a list of dictionaries or [`CompiledSubAgent`](https://reference.langchain.com/javascript/deepagents/middleware/CompiledSubAgent) objects. There are two types:

### Default subagent

Deep Agents automatically adds a synchronous `general-purpose` subagent unless you already provide a synchronous subagent with that name.

The `general-purpose` subagent has filesystem tools by default and can be customized with additional tools/middleware.

* To replace it, pass your own subagent named `general-purpose`.
* To rename or re-prompt the auto-added version, set `general_purpose_subagent=GeneralPurposeSubagentProfile(...)` on the active [harness profile](/oss/javascript/deepagents/profiles#harness-profiles).
* To disable it, see [Running without subagents](#running-without-subagents) below.

### Running without subagents

To run an agent without the `task` tool, do two things:

1. Set `general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False)` on the active [harness profile](/oss/javascript/deepagents/profiles#harness-profiles).
2. Pass no synchronous subagents via `subagents=` on `create_deep_agent`.

Deep Agents only attaches [`SubAgentMiddleware`](https://reference.langchain.com/javascript/deepagents/middleware/createSubAgentMiddleware) (and the `task` tool) when at least one synchronous subagent exists. With neither the default nor a caller-provided one, the agent runs without delegation.

Async subagents are unaffected—they flow through their own middleware and tools, described in [Async subagents](/oss/javascript/deepagents/async-subagents).

<Tip>
  Don't reach for `excluded_middleware` here—`SubAgentMiddleware` is required scaffolding and listing it raises `ValueError`. The `general_purpose_subagent.enabled = False` knob is the supported path.
</Tip>

## Custom subagents

You can define specialized subagents with specific tool by using the `subagents` parameter. For example to serve as a code reviewer, web researcher, or test runner.

For most use cases, define subagents as dictionaries with [SubAgent dictionaries](#subagent-dictionary-based). For complex workflows, use a [`CompiledSubAgent`](#compiledsubagent):

### SubAgent (Dictionary-based)

Define subagents as dictionaries matching the [`SubAgent`](https://reference.langchain.com/javascript/deepagents/middleware/SubAgent) spec with the following fields:

| Field | Type | Description |
| - | - | - |
| `name` | `string` | Required. Unique identifier for the subagent. The main agent uses this name when calling the `task()` tool. The subagent name becomes metadata for `AIMessage`s and for streaming, which helps to differentiate between agents. |
| `description` | `string` | Required. Description of what this subagent does. Be specific and action-oriented. The main agent uses this to decide when to delegate. |
| `systemPrompt` | `string` | Required for `mode: "isolated"` (the default). Instructions for the subagent. Custom isolated subagents must define their own. Include tool usage guidance and output format requirements.<br />Does not inherit from main agent. For `mode: "fork"`, omit this field unless you need a fork-only addendum. See [Forked subagents](#forked-subagents). |
| `mode` | `"isolated"` \| `"fork"` | Optional. Context mode. Defaults to `"isolated"`, where the subagent only sees the delegated task. Set to `"fork"` to inherit the parent's conversation and system prompt instead. See [Forked subagents](#forked-subagents). |
| `tools` | `StructuredTool[]` | Optional. Tools the subagent can use. Keep this minimal and include only what's needed.<br />Inherits from main agent by default. When specified, overrides the inherited tools entirely. |
| `model` | `LanguageModelLike \| string` | Optional. Overrides the main agent's model. Omit to use the main agent's model.<br />Inherits from main agent by default. You can pass either a model identifier string like `'openai:gpt-5.5'` (using the `'provider:model'` format) or a LangChain chat model object (`await initChatModel("gpt-5.5")` or `new ChatOpenAI({ model: "gpt-5.5" })`). |
| `middleware` | `AgentMiddleware[]` | Optional. Additional middleware for custom behavior, logging, or rate limiting.<br />Does not inherit from the main agent. Appended to the [synchronous subagent stack](/oss/javascript/deepagents/customization#synchronous-subagent-stack). |
| `interruptOn` | `Record<string, boolean \| InterruptOnConfig>` | Optional. Configure [human-in-the-loop](/oss/javascript/deepagents/human-in-the-loop) for specific tools. Options: `True`, `False`. or an `InterruptOnConfig` with `allowed_decisions`. Requires checkpointer.<br />Inherits from main agent by default. Subagent value overrides the default. |
| `skills` | `string[]` | Optional. [Skills](/oss/javascript/deepagents/skills) source paths. When specified, the subagent will load skills from these directories (e.g., `["/skills/research/", "/skills/web-search/"]`). This allows subagents to have different skill sets than the main agent.<br />Does not inherit from main agent. Only the general-purpose subagent inherits the main agent's skills. When a subagent has skills, it runs its own independent [`SkillsMiddleware`](https://reference.langchain.com/javascript/deepagents/middleware/createSkillsMiddleware) instance. Skill state is fully isolated—a subagent's loaded skills are not visible to the parent, and vice versa. |
| `responseFormat` | `ResponseFormat` | Optional. [Structured output](/oss/javascript/langchain/structured-output) schema for the subagent. When set, the parent receives the subagent's result as JSON instead of free-form text. Accepts Zod schemas, JSON schema objects, `toolStrategy(...)`, or `providerStrategy(...)`. See [Structured output](#structured-output). |
| `permissions` | `FilesystemPermission[]` | Optional. [Filesystem permission rules](/oss/javascript/deepagents/permissions) for the subagent. When set, **replaces** the parent agent's permissions entirely.<br />Inherits from main agent by default. |

### CompiledSubAgent

For complex workflows, use a prebuilt LangGraph graph as a [`CompiledSubAgent`](https://reference.langchain.com/javascript/deepagents/middleware/CompiledSubAgent):

| Field | Type | Description |
| - | - | - |
| `name` | `str` | Required. Unique identifier for the subagent. The subagent name becomes metadata for `AIMessage`s and for streaming, which helps to differentiate between agents. |
| `description` | `str` | Required. What this subagent does. |
| `runnable` | `Runnable` | Required. A compiled LangGraph graph (must call `.compile()` first). |
| `mode` | `"isolated"` \| `"fork"` | Optional. Defaults to `"isolated"`. Set to `"fork"` to inherit the parent's message history. The compiled graph keeps its own system prompt either way. See [Forked subagents](#forked-subagents). |

## Using SubAgent

<CodeGroup>
  ```ts Google theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { tool } from "langchain";
  import { TavilySearch } from "@langchain/tavily";
  import { createDeepAgent, type SubAgent } from "deepagents";
  import { z } from "zod";

  const internetSearch = tool(
    async ({
      query,
      maxResults = 5,
      topic = "general",
      includeRawContent = false,
    }: {
      query: string;
      maxResults?: number;
      topic?: "general" | "news" | "finance";
      includeRawContent?: boolean;
    }) => {
      const tavilySearch = new TavilySearch({
        maxResults,
        tavilyApiKey: process.env.TAVILY_API_KEY,
        includeRawContent,
        topic,
      });
      return await tavilySearch._call({ query });
    },
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({
        query: z.string().describe("The search query"),
        maxResults: z.number().optional().default(5),
        topic: z
          .enum(["general", "news", "finance"])
          .optional()
          .default("general"),
        includeRawContent: z.boolean().optional().default(false),
      }),
    },
  );

  const researchSubagent: SubAgent = {
    name: "research-agent",
    description: "Used to research more in depth questions",
    systemPrompt: "You are a great researcher",
    tools: [internetSearch],
    model: "google:gemini-3.6-flash", // Optional override, defaults to main agent model
  };
  const subagents = [researchSubagent];

  const agent = createDeepAgent({
    model: "google:gemini-3.6-flash",
    subagents,
  });
  ```

  ```ts OpenAI theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { tool } from "langchain";
  import { TavilySearch } from "@langchain/tavily";
  import { createDeepAgent, type SubAgent } from "deepagents";
  import { z } from "zod";

  const internetSearch = tool(
    async ({
      query,
      maxResults = 5,
      topic = "general",
      includeRawContent = false,
    }: {
      query: string;
      maxResults?: number;
      topic?: "general" | "news" | "finance";
      includeRawContent?: boolean;
    }) => {
      const tavilySearch = new TavilySearch({
        maxResults,
        tavilyApiKey: process.env.TAVILY_API_KEY,
        includeRawContent,
        topic,
      });
      return await tavilySearch._call({ query });
    },
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({
        query: z.string().describe("The search query"),
        maxResults: z.number().optional().default(5),
        topic: z
          .enum(["general", "news", "finance"])
          .optional()
          .default("general"),
        includeRawContent: z.boolean().optional().default(false),
      }),
    },
  );

  const researchSubagent: SubAgent = {
    name: "research-agent",
    description: "Used to research more in depth questions",
    systemPrompt: "You are a great researcher",
    tools: [internetSearch],
    model: "openai:gpt-5.5", // Optional override, defaults to main agent model
  };
  const subagents = [researchSubagent];

  const agent = createDeepAgent({
    model: "google:gemini-3.6-flash",
    subagents,
  });
  ```

  ```ts Anthropic theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { tool } from "langchain";
  import { TavilySearch } from "@langchain/tavily";
  import { createDeepAgent, type SubAgent } from "deepagents";
  import { z } from "zod";

  const internetSearch = tool(
    async ({
      query,
      maxResults = 5,
      topic = "general",
      includeRawContent = false,
    }: {
      query: string;
      maxResults?: number;
      topic?: "general" | "news" | "finance";
      includeRawContent?: boolean;
    }) => {
      const tavilySearch = new TavilySearch({
        maxResults,
        tavilyApiKey: process.env.TAVILY_API_KEY,
        includeRawContent,
        topic,
      });
      return await tavilySearch._call({ query });
    },
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({
        query: z.string().describe("The search query"),
        maxResults: z.number().optional().default(5),
        topic: z
          .enum(["general", "news", "finance"])
          .optional()
          .default("general"),
        includeRawContent: z.boolean().optional().default(false),
      }),
    },
  );

  const researchSubagent: SubAgent = {
    name: "research-agent",
    description: "Used to research more in depth questions",
    systemPrompt: "You are a great researcher",
    tools: [internetSearch],
    model: "anthropic:claude-sonnet-5", // Optional override, defaults to main agent model
  };
  const subagents = [researchSubagent];

  const agent = createDeepAgent({
    model: "google:gemini-3.6-flash",
    subagents,
  });
  ```

  ```ts OpenRouter theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { tool } from "langchain";
  import { TavilySearch } from "@langchain/tavily";
  import { createDeepAgent, type SubAgent } from "deepagents";
  import { z } from "zod";

  const internetSearch = tool(
    async ({
      query,
      maxResults = 5,
      topic = "general",
      includeRawContent = false,
    }: {
      query: string;
      maxResults?: number;
      topic?: "general" | "news" | "finance";
      includeRawContent?: boolean;
    }) => {
      const tavilySearch = new TavilySearch({
        maxResults,
        tavilyApiKey: process.env.TAVILY_API_KEY,
        includeRawContent,
        topic,
      });
      return await tavilySearch._call({ query });
    },
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({
        query: z.string().describe("The search query"),
        maxResults: z.number().optional().default(5),
        topic: z
          .enum(["general", "news", "finance"])
          .optional()
          .default("general"),
        includeRawContent: z.boolean().optional().default(false),
      }),
    },
  );

  const researchSubagent: SubAgent = {
    name: "research-agent",
    description: "Used to research more in depth questions",
    systemPrompt: "You are a great researcher",
    tools: [internetSearch],
    model: "openrouter:z-ai/glm-5.2", // Optional override, defaults to main agent model
  };
  const subagents = [researchSubagent];

  const agent = createDeepAgent({
    model: "google:gemini-3.6-flash",
    subagents,
  });
  ```

  ```ts Fireworks theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { tool } from "langchain";
  import { TavilySearch } from "@langchain/tavily";
  import { createDeepAgent, type SubAgent } from "deepagents";
  import { z } from "zod";

  const internetSearch = tool(
    async ({
      query,
      maxResults = 5,
      topic = "general",
      includeRawContent = false,
    }: {
      query: string;
      maxResults?: number;
      topic?: "general" | "news" | "finance";
      includeRawContent?: boolean;
    }) => {
      const tavilySearch = new TavilySearch({
        maxResults,
        tavilyApiKey: process.env.TAVILY_API_KEY,
        includeRawContent,
        topic,
      });
      return await tavilySearch._call({ query });
    },
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({
        query: z.string().describe("The search query"),
        maxResults: z.number().optional().default(5),
        topic: z
          .enum(["general", "news", "finance"])
          .optional()
          .default("general"),
        includeRawContent: z.boolean().optional().default(false),
      }),
    },
  );

  const researchSubagent: SubAgent = {
    name: "research-agent",
    description: "Used to research more in depth questions",
    systemPrompt: "You are a great researcher",
    tools: [internetSearch],
    model: "fireworks:accounts/fireworks/models/glm-5p2", // Optional override, defaults to main agent model
  };
  const subagents = [researchSubagent];

  const agent = createDeepAgent({
    model: "google:gemini-3.6-flash",
    subagents,
  });
  ```

  ```ts Baseten theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { tool } from "langchain";
  import { TavilySearch } from "@langchain/tavily";
  import { createDeepAgent, type SubAgent } from "deepagents";
  import { z } from "zod";

  const internetSearch = tool(
    async ({
      query,
      maxResults = 5,
      topic = "general",
      includeRawContent = false,
    }: {
      query: string;
      maxResults?: number;
      topic?: "general" | "news" | "finance";
      includeRawContent?: boolean;
    }) => {
      const tavilySearch = new TavilySearch({
        maxResults,
        tavilyApiKey: process.env.TAVILY_API_KEY,
        includeRawContent,
        topic,
      });
      return await tavilySearch._call({ query });
    },
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({
        query: z.string().describe("The search query"),
        maxResults: z.number().optional().default(5),
        topic: z
          .enum(["general", "news", "finance"])
          .optional()
          .default("general"),
        includeRawContent: z.boolean().optional().default(false),
      }),
    },
  );

  const researchSubagent: SubAgent = {
    name: "research-agent",
    description: "Used to research more in depth questions",
    systemPrompt: "You are a great researcher",
    tools: [internetSearch],
    model: "baseten:zai-org/GLM-5.2", // Optional override, defaults to main agent model
  };
  const subagents = [researchSubagent];

  const agent = createDeepAgent({
    model: "google:gemini-3.6-flash",
    subagents,
  });
  ```

  ```ts Ollama theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { tool } from "langchain";
  import { TavilySearch } from "@langchain/tavily";
  import { createDeepAgent, type SubAgent } from "deepagents";
  import { z } from "zod";

  const internetSearch = tool(
    async ({
      query,
      maxResults = 5,
      topic = "general",
      includeRawContent = false,
    }: {
      query: string;
      maxResults?: number;
      topic?: "general" | "news" | "finance";
      includeRawContent?: boolean;
    }) => {
      const tavilySearch = new TavilySearch({
        maxResults,
        tavilyApiKey: process.env.TAVILY_API_KEY,
        includeRawContent,
        topic,
      });
      return await tavilySearch._call({ query });
    },
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({
        query: z.string().describe("The search query"),
        maxResults: z.number().optional().default(5),
        topic: z
          .enum(["general", "news", "finance"])
          .optional()
          .default("general"),
        includeRawContent: z.boolean().optional().default(false),
      }),
    },
  );

  const researchSubagent: SubAgent = {
    name: "research-agent",
    description: "Used to research more in depth questions",
    systemPrompt: "You are a great researcher",
    tools: [internetSearch],
    model: "ollama:north-mini-code-1.0", // Optional override, defaults to main agent model
  };
  const subagents = [researchSubagent];

  const agent = createDeepAgent({
    model: "google:gemini-3.6-flash",
    subagents,
  });
  ```
</CodeGroup>

## Using CompiledSubAgent

For more complex use cases, you can provide your custom subagents with [`CompiledSubAgent`](https://reference.langchain.com/javascript/deepagents/middleware/CompiledSubAgent).
You can create a custom subagent using LangChain's [`create_agent`](https://reference.langchain.com/javascript/langchain/index/createAgent) or by making a custom LangGraph graph using the [graph API](/oss/javascript/langgraph/graph-api).

If you're creating a custom LangGraph graph, make sure that the graph has a [state key called `"messages"`](/oss/javascript/langgraph/quickstart#2-define-state):

<CodeGroup>
  ```ts Google theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { CompiledSubAgent, createDeepAgent } from "deepagents";
  import { createAgent } from "langchain";
  import { tool } from "langchain";
  import { z } from "zod";

  const internetSearch = tool(
    async ({ query }: { query: string }) => `search results for ${query}`,
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({ query: z.string() }),
    },
  );

  const researchInstructions = "You are a research coordinator.";
  const yourModel = "google:gemini-3.6-flash";
  const specializedTools: never[] = [];

  // Create a custom agent graph
  const customGraph = createAgent({
    model: yourModel,
    tools: specializedTools,
    prompt: "You are a specialized agent for data analysis...",
  });

  // Use it as a custom subagent
  const customSubagent: CompiledSubAgent = {
    name: "data-analyzer",
    description: "Specialized agent for complex data analysis tasks",
    runnable: customGraph,
  };

  const subagents = [customSubagent];

  const agent = createDeepAgent({
    model: "google:gemini-3.6-flash",
    tools: [internetSearch],
    systemPrompt: researchInstructions,
    subagents: subagents,
  });
  ```

  ```ts OpenAI theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { CompiledSubAgent, createDeepAgent } from "deepagents";
  import { createAgent } from "langchain";
  import { tool } from "langchain";
  import { z } from "zod";

  const internetSearch = tool(
    async ({ query }: { query: string }) => `search results for ${query}`,
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({ query: z.string() }),
    },
  );

  const researchInstructions = "You are a research coordinator.";
  const yourModel = "google:gemini-3.6-flash";
  const specializedTools: never[] = [];

  // Create a custom agent graph
  const customGraph = createAgent({
    model: yourModel,
    tools: specializedTools,
    prompt: "You are a specialized agent for data analysis...",
  });

  // Use it as a custom subagent
  const customSubagent: CompiledSubAgent = {
    name: "data-analyzer",
    description: "Specialized agent for complex data analysis tasks",
    runnable: customGraph,
  };

  const subagents = [customSubagent];

  const agent = createDeepAgent({
    model: "openai:gpt-5.5",
    tools: [internetSearch],
    systemPrompt: researchInstructions,
    subagents: subagents,
  });
  ```

  ```ts Anthropic theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { CompiledSubAgent, createDeepAgent } from "deepagents";
  import { createAgent } from "langchain";
  import { tool } from "langchain";
  import { z } from "zod";

  const internetSearch = tool(
    async ({ query }: { query: string }) => `search results for ${query}`,
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({ query: z.string() }),
    },
  );

  const researchInstructions = "You are a research coordinator.";
  const yourModel = "google:gemini-3.6-flash";
  const specializedTools: never[] = [];

  // Create a custom agent graph
  const customGraph = createAgent({
    model: yourModel,
    tools: specializedTools,
    prompt: "You are a specialized agent for data analysis...",
  });

  // Use it as a custom subagent
  const customSubagent: CompiledSubAgent = {
    name: "data-analyzer",
    description: "Specialized agent for complex data analysis tasks",
    runnable: customGraph,
  };

  const subagents = [customSubagent];

  const agent = createDeepAgent({
    model: "anthropic:claude-sonnet-5",
    tools: [internetSearch],
    systemPrompt: researchInstructions,
    subagents: subagents,
  });
  ```

  ```ts OpenRouter theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { CompiledSubAgent, createDeepAgent } from "deepagents";
  import { createAgent } from "langchain";
  import { tool } from "langchain";
  import { z } from "zod";

  const internetSearch = tool(
    async ({ query }: { query: string }) => `search results for ${query}`,
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({ query: z.string() }),
    },
  );

  const researchInstructions = "You are a research coordinator.";
  const yourModel = "google:gemini-3.6-flash";
  const specializedTools: never[] = [];

  // Create a custom agent graph
  const customGraph = createAgent({
    model: yourModel,
    tools: specializedTools,
    prompt: "You are a specialized agent for data analysis...",
  });

  // Use it as a custom subagent
  const customSubagent: CompiledSubAgent = {
    name: "data-analyzer",
    description: "Specialized agent for complex data analysis tasks",
    runnable: customGraph,
  };

  const subagents = [customSubagent];

  const agent = createDeepAgent({
    model: "openrouter:z-ai/glm-5.2",
    tools: [internetSearch],
    systemPrompt: researchInstructions,
    subagents: subagents,
  });
  ```

  ```ts Fireworks theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { CompiledSubAgent, createDeepAgent } from "deepagents";
  import { createAgent } from "langchain";
  import { tool } from "langchain";
  import { z } from "zod";

  const internetSearch = tool(
    async ({ query }: { query: string }) => `search results for ${query}`,
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({ query: z.string() }),
    },
  );

  const researchInstructions = "You are a research coordinator.";
  const yourModel = "google:gemini-3.6-flash";
  const specializedTools: never[] = [];

  // Create a custom agent graph
  const customGraph = createAgent({
    model: yourModel,
    tools: specializedTools,
    prompt: "You are a specialized agent for data analysis...",
  });

  // Use it as a custom subagent
  const customSubagent: CompiledSubAgent = {
    name: "data-analyzer",
    description: "Specialized agent for complex data analysis tasks",
    runnable: customGraph,
  };

  const subagents = [customSubagent];

  const agent = createDeepAgent({
    model: "fireworks:accounts/fireworks/models/glm-5p2",
    tools: [internetSearch],
    systemPrompt: researchInstructions,
    subagents: subagents,
  });
  ```

  ```ts Baseten theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { CompiledSubAgent, createDeepAgent } from "deepagents";
  import { createAgent } from "langchain";
  import { tool } from "langchain";
  import { z } from "zod";

  const internetSearch = tool(
    async ({ query }: { query: string }) => `search results for ${query}`,
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({ query: z.string() }),
    },
  );

  const researchInstructions = "You are a research coordinator.";
  const yourModel = "google:gemini-3.6-flash";
  const specializedTools: never[] = [];

  // Create a custom agent graph
  const customGraph = createAgent({
    model: yourModel,
    tools: specializedTools,
    prompt: "You are a specialized agent for data analysis...",
  });

  // Use it as a custom subagent
  const customSubagent: CompiledSubAgent = {
    name: "data-analyzer",
    description: "Specialized agent for complex data analysis tasks",
    runnable: customGraph,
  };

  const subagents = [customSubagent];

  const agent = createDeepAgent({
    model: "baseten:zai-org/GLM-5.2",
    tools: [internetSearch],
    systemPrompt: researchInstructions,
    subagents: subagents,
  });
  ```

  ```ts Ollama theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { CompiledSubAgent, createDeepAgent } from "deepagents";
  import { createAgent } from "langchain";
  import { tool } from "langchain";
  import { z } from "zod";

  const internetSearch = tool(
    async ({ query }: { query: string }) => `search results for ${query}`,
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({ query: z.string() }),
    },
  );

  const researchInstructions = "You are a research coordinator.";
  const yourModel = "google:gemini-3.6-flash";
  const specializedTools: never[] = [];

  // Create a custom agent graph
  const customGraph = createAgent({
    model: yourModel,
    tools: specializedTools,
    prompt: "You are a specialized agent for data analysis...",
  });

  // Use it as a custom subagent
  const customSubagent: CompiledSubAgent = {
    name: "data-analyzer",
    description: "Specialized agent for complex data analysis tasks",
    runnable: customGraph,
  };

  const subagents = [customSubagent];

  const agent = createDeepAgent({
    model: "ollama:north-mini-code-1.0",
    tools: [internetSearch],
    systemPrompt: researchInstructions,
    subagents: subagents,
  });
  ```
</CodeGroup>

## Forked subagents

By default, a subagent runs with `mode: "isolated"`: it sees only the task description you give it and has no memory of the conversation that led up to the delegation. A **forked subagent** (`mode: "fork"`) inherits the parent's full conversation history and exact system prompt instead.

Use forked subagents when the subagent's task is to continue the work the parent already started, like a worker agent that picks up a fix the parent has already diagnosed, or a subagent that drafts the postmortem for an incident investigation. Since forking is a mode you set on the subagent itself, that's a decision you make when you define it.

```mermaid theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
%%{init: {"flowchart": {"subGraphTitleMargin": {"top": 12, "bottom": 4}}}}%%
graph TD
    Message["'Review PR #482'"]
    Analysis["Parent already found:<br/>tokens logged in plaintext,<br/>no expiry check on refresh"]
    Delegate["Delegate: draft comments<br/>for the issues found"]
    Message --> Analysis --> Delegate

    subgraph Isolated["`**Isolated subagent**`"]
        IOut["Sees only the task description<br/>starts from nothing, re-reviews the diff"]
    end

    subgraph Forked["`**Forked subagent**`"]
        FOut["Sees parent history + continuation preamble<br/>already knows the issues, writes comments directly"]
    end

    Delegate -->|task description only| Isolated
    Delegate -->|parent history + continuation preamble| Forked

    classDef process fill:#E5F4FF,stroke:#006DDD,stroke-width:2px,color:#030710
    classDef output fill:#F6FFDB,stroke:#6E8900,stroke-width:2px,color:#2E3900
    class Message,Analysis,Delegate process
    class IOut,FOut output
```

<Note>
  Subagent forking requires `deepagents>=1.13.3`. It is in [**beta**](/oss/javascript/versioning); APIs and behavior may change between releases.
</Note>

### Configure a forked subagent

Set `mode: "fork"` on a [`SubAgent`](https://reference.langchain.com/javascript/deepagents/middleware/SubAgent) (the default is `mode: "isolated"`). All [`SubAgent`](https://reference.langchain.com/javascript/deepagents/middleware/SubAgent) fields are available:
`name`, `description`, `tools`, `model`, `middleware`, `interruptOn`, `permissions`, and `responseFormat`.

`skills` is rejected if provided. `systemPrompt` is allowed and is appended to the parent's inherited prompt as an addendum, but doing so typically breaks the prompt cache, so leave it unset unless you have a specific need for fork-only instructions.

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { createDeepAgent } from "deepagents";
import { tool } from "langchain";
import { z } from "zod";

const readDiff = tool(
  async ({ path }: { path: string }) => `diff for ${path}`,
  {
    name: "read_diff",
    description: "Read a file's diff",
    schema: z.object({ path: z.string() }),
  },
);

const commentWriter = {
  name: "comment-writer",
  description: "Continues an in-progress PR review and drafts review comments",
  mode: "fork" as const,
  tools: [readDiff],
};

const agent = await createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  tools: [readDiff],
  subagents: [commentWriter],
});

const result = await agent.invoke({
  messages: [
    {
      role: "user",
      content:
        "Review PR #482 and hand it off to comment-writer to draft comments for the issues found",
    },
  ],
});
```

### How it works

A fork does not get a fresh task description. It gets the parent's own conversation, with one change: the trailing call that delegated to it is dropped and replaced with a short preamble marking the messages above as a continuation, not a fresh request. When the fork finishes, its answer comes back as a normal tool result, and the parent picks up right where it left off.

```javascript theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// What the parent has, right before delegating
[
  new HumanMessage("Review the changes in PR #482"),
  new AIMessage({ content: "", tool_calls: [{ name: "read_diff", args: { path: "src/auth/session.py" } }] }),
  new ToolMessage({ content: "- session tokens are logged in plaintext\n- no expiry check on refresh", tool_call_id: "1" }),
  new AIMessage("Found two issues: session tokens are logged in plaintext, and there's no expiry check on refresh."),
  new HumanMessage("Good catch. Draft review comments for those."),
  new AIMessage({ content: "", tool_calls: [{ name: "task", args: { subagentType: "comment-writer", description: "Draft review comments for the two issues found above." } }] }),
]

// What the fork actually sees
[
  new HumanMessage("Review the changes in PR #482"),
  new AIMessage({ content: "", tool_calls: [{ name: "read_diff", args: { path: "src/auth/session.py" } }] }),
  new ToolMessage({ content: "- session tokens are logged in plaintext\n- no expiry check on refresh", tool_call_id: "1" }),
  new AIMessage("Found two issues: session tokens are logged in plaintext, and there's no expiry check on refresh."),
  new HumanMessage("Good catch. Draft review comments for those."),
  new HumanMessage("Continuing as the subagent that was just invoked. Draft review comments for the two issues found above."),
]
```

Reusing the parent's exact prefix also means the fork can reuse the parent's prompt cache instead of starting cold, though tool use that diverges from the parent's will still miss.

A [`CompiledSubAgent`](https://reference.langchain.com/javascript/deepagents/middleware/CompiledSubAgent) supports `mode: "fork"` too, though it keeps its own system prompt since the graph is already built.

### When to use forking

Compare isolated and forked modes along these dimensions:

| Dimension | Isolated (default) | Forked |
| - | - | - |
| **Context** | Only the task description you pass in | The parent's full conversation history and system prompt |
| **System prompt and skills** | You set them on the subagent | Skills not settable; system prompt appends to the parent's (breaks caching, so usually left unset) |
| **Calling other subagents** | Can use the `task` tool | Cannot use `task`; must finish the work itself |
| **Best for** | Focused work that needs little prior context | Continuing an investigation the parent has already started |

## Dynamic subagents

By default, the main agent delegates to subagents through `task` tool calls (it can issue several in a single turn to run them in parallel). With an [interpreter](/oss/javascript/deepagents/interpreters) attached, the agent can instead dispatch subagents **from code**—using loops, branches, and parallel batches to fan work out across many items and synthesize the results programmatically. This is called [dynamic subagents](/oss/javascript/deepagents/dynamic-subagents).

Reach for dynamic subagents when work spans many independent units (reviewing every file in a directory, triaging a batch of tickets), needs multiple perspectives, or benefits from recursive analysis.

<Warning>
  Dynamic subagents use the interpreter runtime, which is in [**beta**](/oss/javascript/versioning). APIs and lifecycle behavior may change between releases.
</Warning>

### Enable dynamic subagents

Dynamic subagents become available as soon as the agent has both subagents and the interpreter middleware. Install the QuickJS interpreter package, then add `CodeInterpreterMiddleware` to your agent.

<CodeGroup>
  ```bash npm theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  npm install deepagents @langchain/quickjs
  ```

  ```bash pnpm theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  pnpm add deepagents @langchain/quickjs
  ```

  ```bash yarn theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  yarn add deepagents @langchain/quickjs
  ```
</CodeGroup>

<CodeGroup>
  ```ts Google theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { createCodeInterpreterMiddleware } from "@langchain/quickjs";

  const agent = createDeepAgent({
    model: "google:gemini-3.6-flash",
    subagents: [{
      name: "reviewer",
      description: "Reviews code for security issues, citing lines and severity",
      systemPrompt: "You are a security-focused code reviewer. Report issues with line numbers and severity.",
    }],
    middleware: [createCodeInterpreterMiddleware()],
  });
  ```

  ```ts OpenAI theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { createCodeInterpreterMiddleware } from "@langchain/quickjs";

  const agent = createDeepAgent({
    model: "openai:gpt-5.5",
    subagents: [{
      name: "reviewer",
      description: "Reviews code for security issues, citing lines and severity",
      systemPrompt: "You are a security-focused code reviewer. Report issues with line numbers and severity.",
    }],
    middleware: [createCodeInterpreterMiddleware()],
  });
  ```

  ```ts Anthropic theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { createCodeInterpreterMiddleware } from "@langchain/quickjs";

  const agent = createDeepAgent({
    model: "anthropic:claude-sonnet-5",
    subagents: [{
      name: "reviewer",
      description: "Reviews code for security issues, citing lines and severity",
      systemPrompt: "You are a security-focused code reviewer. Report issues with line numbers and severity.",
    }],
    middleware: [createCodeInterpreterMiddleware()],
  });
  ```

  ```ts OpenRouter theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { createCodeInterpreterMiddleware } from "@langchain/quickjs";

  const agent = createDeepAgent({
    model: "openrouter:z-ai/glm-5.2",
    subagents: [{
      name: "reviewer",
      description: "Reviews code for security issues, citing lines and severity",
      systemPrompt: "You are a security-focused code reviewer. Report issues with line numbers and severity.",
    }],
    middleware: [createCodeInterpreterMiddleware()],
  });
  ```

  ```ts Fireworks theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { createCodeInterpreterMiddleware } from "@langchain/quickjs";

  const agent = createDeepAgent({
    model: "fireworks:accounts/fireworks/models/glm-5p2",
    subagents: [{
      name: "reviewer",
      description: "Reviews code for security issues, citing lines and severity",
      systemPrompt: "You are a security-focused code reviewer. Report issues with line numbers and severity.",
    }],
    middleware: [createCodeInterpreterMiddleware()],
  });
  ```

  ```ts Baseten theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { createCodeInterpreterMiddleware } from "@langchain/quickjs";

  const agent = createDeepAgent({
    model: "baseten:zai-org/GLM-5.2",
    subagents: [{
      name: "reviewer",
      description: "Reviews code for security issues, citing lines and severity",
      systemPrompt: "You are a security-focused code reviewer. Report issues with line numbers and severity.",
    }],
    middleware: [createCodeInterpreterMiddleware()],
  });
  ```

  ```ts Ollama theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { createCodeInterpreterMiddleware } from "@langchain/quickjs";

  const agent = createDeepAgent({
    model: "ollama:north-mini-code-1.0",
    subagents: [{
      name: "reviewer",
      description: "Reviews code for security issues, citing lines and severity",
      systemPrompt: "You are a security-focused code reviewer. Report issues with line numbers and severity.",
    }],
    middleware: [createCodeInterpreterMiddleware()],
  });
  ```
</CodeGroup>

<Note>
  Dynamic subagent dispatch is on by default whenever the agent has subagents and the interpreter middleware. Pass `createCodeInterpreterMiddleware({ subagents: false })` to require dispatch through the normal `task` tool path.
</Note>

### Trigger dynamic orchestration

Dynamic dispatch is implicit: the agent decides to fan work out from code based on the shape of the task, not a per-call flag.

<Tip>
  **The word "workflow" is a useful trigger.** The built-in interpreter system prompt treats a "workflow" as a signal to organize work through the interpreter—dispatching subagents with `task()` from code. Phrasing a request as a "workflow" is a deliberate lever you can pull to opt into dynamic orchestration: include it when you want the agent to fan work out from code. For a single, direct delegation, phrase the request plainly instead.
</Tip>

For example, phrasing the request as a "workflow" opts into fan-out from code:

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const result = await agent.invoke({
  messages: [{ role: "user", content: "Run a workflow that reviews every file in src/routes/ and summarizes the top risks." }],
});
```

For configuration, advanced orchestration patterns, and safety notes, see [Dynamic subagents](/oss/javascript/deepagents/dynamic-subagents).

### Use with a coding agent

The fastest way to try dynamic subagents is with `dcode`, the LangChain terminal coding agent built on a Deep Agent. It ships with the code interpreter enabled, so dynamic subagents work out of the box with nothing to wire up.

Install `dcode`:

```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
curl -LsSf https://langch.in/dcode | bash
```

Run it:

```bash theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
dcode
```

To trigger dynamic subagents, ask for a "workflow". Instead of grinding through the work itself or managing fan-out through its native `task` tool, the agent writes an orchestration script that calls the built-in `task()` global and runs it in the code interpreter. For example: "Run a workflow to review every file in src/ for SQL injection."

As subagents spawn, `dcode` shows them live in the dynamic subagents panel, grouped into phases by dispatch.

<Frame>
  <img src="https://mintcdn.com/langchain-5e9cc07a/mcM5dSw40KzBUENf/oss/images/deepagents/dcode-dynamic-subagents-panel.png?fit=max&auto=format&n=mcM5dSw40KzBUENf&q=85&s=bc20632b54e21fecfc5ff4f8d169a2c7" alt="The dcode dynamic subagents panel showing spawned subagents grouped into phases by dispatch" width="3134" height="1832" data-path="oss/images/deepagents/dcode-dynamic-subagents-panel.png" />
</Frame>

`dcode` is the fastest way to try this, but you can also use dynamic subagents in the coding agent of your choice over [ACP](/oss/javascript/deepagents/acp) (for example, Zed).

## Streaming

Deep Agents support streaming updates from both the coordinator and every delegated subagent.

Use [`streamEvents`](/oss/javascript/deepagents/event-streaming) to get typed projections—separate iterators for subagents, messages, tool calls, and values—so you can consume each independently.

### Stream subagent progress

The simplest pattern is to iterate `stream.subagents` to track each delegated task as it starts, runs, and completes. Each subagent handle exposes `.name`, `.messages`, `.tool_calls`, and `.output`.

<CodeGroup>
  ```ts Google theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";

  const agent = createDeepAgent({
    model: "google:gemini-3.6-flash",
    name: "main-agent",
    systemPrompt:
      "You are a project coordinator with no research knowledge. " +
      "For every user request, you must call the task() tool with " +
      "subagent_type set to research-agent. Never answer research " +
      "questions yourself.",
    subagents: [
      {
        name: "research-agent",
        description:
          "Delegate research to this subagent. Give one topic at a time.",
        systemPrompt: "You are a great researcher. Return a brief summary.",
      },
    ],
  });

  async function streamSubagentProgress() {
    const stream = await agent.streamEvents(
      {
        messages: [
          {
            role: "user",
            content: "Research one recent advance in quantum computing.",
          },
        ],
      },
      { version: "v3" },
    );

    const coordinatorMessages: string[] = [];
    const subagentHandles: { name: string }[] = [];

    await Promise.all([
      (async () => {
        for await (const message of stream.messages) {
          const text = await message.text;
          console.log("[coordinator]", text);
          coordinatorMessages.push(text);
        }
      })(),
      (async () => {
        for await (const subagent of stream.subagents) {
          console.log(`[${subagent.name}] started`);
          subagentHandles.push({ name: subagent.name });
          for await (const message of subagent.messages) {
            console.log(`[${subagent.name}]`, await message.text);
          }
        }
      })(),
      stream.output,
    ]);

    return { coordinatorMessages, subagentHandles };
  }
  ```

  ```ts OpenAI theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";

  const agent = createDeepAgent({
    model: "openai:gpt-5.5",
    name: "main-agent",
    systemPrompt:
      "You are a project coordinator with no research knowledge. " +
      "For every user request, you must call the task() tool with " +
      "subagent_type set to research-agent. Never answer research " +
      "questions yourself.",
    subagents: [
      {
        name: "research-agent",
        description:
          "Delegate research to this subagent. Give one topic at a time.",
        systemPrompt: "You are a great researcher. Return a brief summary.",
      },
    ],
  });

  async function streamSubagentProgress() {
    const stream = await agent.streamEvents(
      {
        messages: [
          {
            role: "user",
            content: "Research one recent advance in quantum computing.",
          },
        ],
      },
      { version: "v3" },
    );

    const coordinatorMessages: string[] = [];
    const subagentHandles: { name: string }[] = [];

    await Promise.all([
      (async () => {
        for await (const message of stream.messages) {
          const text = await message.text;
          console.log("[coordinator]", text);
          coordinatorMessages.push(text);
        }
      })(),
      (async () => {
        for await (const subagent of stream.subagents) {
          console.log(`[${subagent.name}] started`);
          subagentHandles.push({ name: subagent.name });
          for await (const message of subagent.messages) {
            console.log(`[${subagent.name}]`, await message.text);
          }
        }
      })(),
      stream.output,
    ]);

    return { coordinatorMessages, subagentHandles };
  }
  ```

  ```ts Anthropic theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";

  const agent = createDeepAgent({
    model: "anthropic:claude-sonnet-5",
    name: "main-agent",
    systemPrompt:
      "You are a project coordinator with no research knowledge. " +
      "For every user request, you must call the task() tool with " +
      "subagent_type set to research-agent. Never answer research " +
      "questions yourself.",
    subagents: [
      {
        name: "research-agent",
        description:
          "Delegate research to this subagent. Give one topic at a time.",
        systemPrompt: "You are a great researcher. Return a brief summary.",
      },
    ],
  });

  async function streamSubagentProgress() {
    const stream = await agent.streamEvents(
      {
        messages: [
          {
            role: "user",
            content: "Research one recent advance in quantum computing.",
          },
        ],
      },
      { version: "v3" },
    );

    const coordinatorMessages: string[] = [];
    const subagentHandles: { name: string }[] = [];

    await Promise.all([
      (async () => {
        for await (const message of stream.messages) {
          const text = await message.text;
          console.log("[coordinator]", text);
          coordinatorMessages.push(text);
        }
      })(),
      (async () => {
        for await (const subagent of stream.subagents) {
          console.log(`[${subagent.name}] started`);
          subagentHandles.push({ name: subagent.name });
          for await (const message of subagent.messages) {
            console.log(`[${subagent.name}]`, await message.text);
          }
        }
      })(),
      stream.output,
    ]);

    return { coordinatorMessages, subagentHandles };
  }
  ```

  ```ts OpenRouter theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";

  const agent = createDeepAgent({
    model: "openrouter:z-ai/glm-5.2",
    name: "main-agent",
    systemPrompt:
      "You are a project coordinator with no research knowledge. " +
      "For every user request, you must call the task() tool with " +
      "subagent_type set to research-agent. Never answer research " +
      "questions yourself.",
    subagents: [
      {
        name: "research-agent",
        description:
          "Delegate research to this subagent. Give one topic at a time.",
        systemPrompt: "You are a great researcher. Return a brief summary.",
      },
    ],
  });

  async function streamSubagentProgress() {
    const stream = await agent.streamEvents(
      {
        messages: [
          {
            role: "user",
            content: "Research one recent advance in quantum computing.",
          },
        ],
      },
      { version: "v3" },
    );

    const coordinatorMessages: string[] = [];
    const subagentHandles: { name: string }[] = [];

    await Promise.all([
      (async () => {
        for await (const message of stream.messages) {
          const text = await message.text;
          console.log("[coordinator]", text);
          coordinatorMessages.push(text);
        }
      })(),
      (async () => {
        for await (const subagent of stream.subagents) {
          console.log(`[${subagent.name}] started`);
          subagentHandles.push({ name: subagent.name });
          for await (const message of subagent.messages) {
            console.log(`[${subagent.name}]`, await message.text);
          }
        }
      })(),
      stream.output,
    ]);

    return { coordinatorMessages, subagentHandles };
  }
  ```

  ```ts Fireworks theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";

  const agent = createDeepAgent({
    model: "fireworks:accounts/fireworks/models/glm-5p2",
    name: "main-agent",
    systemPrompt:
      "You are a project coordinator with no research knowledge. " +
      "For every user request, you must call the task() tool with " +
      "subagent_type set to research-agent. Never answer research " +
      "questions yourself.",
    subagents: [
      {
        name: "research-agent",
        description:
          "Delegate research to this subagent. Give one topic at a time.",
        systemPrompt: "You are a great researcher. Return a brief summary.",
      },
    ],
  });

  async function streamSubagentProgress() {
    const stream = await agent.streamEvents(
      {
        messages: [
          {
            role: "user",
            content: "Research one recent advance in quantum computing.",
          },
        ],
      },
      { version: "v3" },
    );

    const coordinatorMessages: string[] = [];
    const subagentHandles: { name: string }[] = [];

    await Promise.all([
      (async () => {
        for await (const message of stream.messages) {
          const text = await message.text;
          console.log("[coordinator]", text);
          coordinatorMessages.push(text);
        }
      })(),
      (async () => {
        for await (const subagent of stream.subagents) {
          console.log(`[${subagent.name}] started`);
          subagentHandles.push({ name: subagent.name });
          for await (const message of subagent.messages) {
            console.log(`[${subagent.name}]`, await message.text);
          }
        }
      })(),
      stream.output,
    ]);

    return { coordinatorMessages, subagentHandles };
  }
  ```

  ```ts Baseten theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";

  const agent = createDeepAgent({
    model: "baseten:zai-org/GLM-5.2",
    name: "main-agent",
    systemPrompt:
      "You are a project coordinator with no research knowledge. " +
      "For every user request, you must call the task() tool with " +
      "subagent_type set to research-agent. Never answer research " +
      "questions yourself.",
    subagents: [
      {
        name: "research-agent",
        description:
          "Delegate research to this subagent. Give one topic at a time.",
        systemPrompt: "You are a great researcher. Return a brief summary.",
      },
    ],
  });

  async function streamSubagentProgress() {
    const stream = await agent.streamEvents(
      {
        messages: [
          {
            role: "user",
            content: "Research one recent advance in quantum computing.",
          },
        ],
      },
      { version: "v3" },
    );

    const coordinatorMessages: string[] = [];
    const subagentHandles: { name: string }[] = [];

    await Promise.all([
      (async () => {
        for await (const message of stream.messages) {
          const text = await message.text;
          console.log("[coordinator]", text);
          coordinatorMessages.push(text);
        }
      })(),
      (async () => {
        for await (const subagent of stream.subagents) {
          console.log(`[${subagent.name}] started`);
          subagentHandles.push({ name: subagent.name });
          for await (const message of subagent.messages) {
            console.log(`[${subagent.name}]`, await message.text);
          }
        }
      })(),
      stream.output,
    ]);

    return { coordinatorMessages, subagentHandles };
  }
  ```

  ```ts Ollama theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";

  const agent = createDeepAgent({
    model: "ollama:north-mini-code-1.0",
    name: "main-agent",
    systemPrompt:
      "You are a project coordinator with no research knowledge. " +
      "For every user request, you must call the task() tool with " +
      "subagent_type set to research-agent. Never answer research " +
      "questions yourself.",
    subagents: [
      {
        name: "research-agent",
        description:
          "Delegate research to this subagent. Give one topic at a time.",
        systemPrompt: "You are a great researcher. Return a brief summary.",
      },
    ],
  });

  async function streamSubagentProgress() {
    const stream = await agent.streamEvents(
      {
        messages: [
          {
            role: "user",
            content: "Research one recent advance in quantum computing.",
          },
        ],
      },
      { version: "v3" },
    );

    const coordinatorMessages: string[] = [];
    const subagentHandles: { name: string }[] = [];

    await Promise.all([
      (async () => {
        for await (const message of stream.messages) {
          const text = await message.text;
          console.log("[coordinator]", text);
          coordinatorMessages.push(text);
        }
      })(),
      (async () => {
        for await (const subagent of stream.subagents) {
          console.log(`[${subagent.name}] started`);
          subagentHandles.push({ name: subagent.name });
          for await (const message of subagent.messages) {
            console.log(`[${subagent.name}]`, await message.text);
          }
        }
      })(),
      stream.output,
    ]);

    return { coordinatorMessages, subagentHandles };
  }
  ```
</CodeGroup>

### LangSmith tracing

As your deep agent runs, all runs executed by a subagent or the coordinator will have the agent name in their metadata under the `lc_agent_name` key—for example, `{'lc_agent_name': 'research-agent'}`. This lets you identify and filter runs by subagent in LangSmith.

<img src="https://mintcdn.com/langchain-5e9cc07a/IlqYrcANJ39avG84/oss/images/deepagents/deepagents-langsmith.png?fit=max&auto=format&n=IlqYrcANJ39avG84&q=85&s=4c3a1512fb27abc30da37751aee19afd" alt="LangSmith Example trace showing the metadata" width="907" height="866" data-path="oss/images/deepagents/deepagents-langsmith.png" />

<Tip>
  Open the run in [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-deepagents-subagents) to compare the coordinator trace with each subagent run. Follow the [observability quickstart](/langsmith/observability-quickstart) to get set up. We recommend you also set up [LangSmith Engine](/langsmith/engine) which monitors your traces, detects issues, and proposes fixes.
</Tip>

## Filter by subagent in LangSmith

Because each subagent's `name` is written to the `lc_agent_name` metadata key on every run it produces, you can use LangSmith's metadata filtering to isolate all runs from a specific subagent — useful for debugging, monitoring, or comparing subagent behavior over time.

### Filter in the LangSmith UI

1. Open your tracing project in [LangSmith](https://smith.langchain.com?utm_source=docs\&utm_medium=cta\&utm_campaign=langsmith-signup\&utm_content=oss-deepagents-subagents).
2. Switch the view to **Runs** on the Tracing project page to see individual spans.
3. Click **Add filter** and select **Metadata**.
4. Set the **Key** to `lc_agent_name` and the **Value** to the subagent name, for example `coordinator`.

<img src="https://mintcdn.com/langchain-5e9cc07a/t_yuR4Fo_XGdcWGH/langsmith/images/deepagents-lc-agent-name-filter.png?fit=max&auto=format&n=t_yuR4Fo_XGdcWGH&q=85&s=ffc65c0b9b5292fce5f0589b8f2478ce" alt="LangSmith Runs view with a metadata filter on lc_agent_name set to coordinator" width="1024" height="533" data-path="langsmith/images/deepagents-lc-agent-name-filter.png" />

This shows only the runs produced by that subagent. You can save the filter as a named view for reuse. For a full reference on filtering options, see [Filter traces](/langsmith/filter-traces).

### Filter programmatically with the SDK

Use the `has` comparator in the LangSmith filter query language to match runs by metadata key-value pair:

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
from langsmith import Client

client = Client()

runs = client.list_runs(
    project_name="<your-project>",
    filter='has(metadata, \'{"lc_agent_name": "research-agent"}\')',
)

for run in runs:
    print(run.name, run.start_time, run.status)
```

To fetch runs from *any* named subagent (excluding the main agent), filter for runs that have the `lc_agent_name` key at all:

```python theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
runs = client.list_runs(
    project_name="<your-project>",
    filter="has(metadata, 'lc_agent_name')",
)
```

For the full filter query language reference, see [Trace query syntax](/langsmith/trace-query-syntax).

## Structured output

Subagents support [structured output](/oss/javascript/langchain/structured-output), so the parent agent receives predictable, parseable JSON instead of free-form text.

<Note>
  Structured output for subagents requires `deepagents>=1.8.4`.
</Note>

Pass `responseFormat` on the subagent config. When the subagent finishes, its structured response is JSON-serialized and returned as the `ToolMessage` content to the parent agent. The schema accepts anything supported by `createAgent`: Zod schemas, JSON schema objects, `toolStrategy(...)`, or `providerStrategy(...)`.

<CodeGroup>
  ```ts Google theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { z } from "zod";
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";

  const webSearch = tool(
    async ({ query }: { query: string }) => `web results for ${query}`,
    {
      name: "web_search",
      description: "Search the web",
      schema: z.object({ query: z.string() }),
    },
  );

  const ResearchFindings = z.object({
    summary: z.string().describe("Summary of findings"),
    confidence: z.number().describe("Confidence score from 0 to 1"),
    sources: z.array(z.string()).describe("List of source URLs"),
  });

  const researchSubagent = {
    name: "researcher",
    description: "Researches topics and returns structured findings",
    systemPrompt: "Research the given topic thoroughly. Return your findings.",
    tools: [webSearch],
    responseFormat: ResearchFindings,
  };

  const agent = createDeepAgent({
    model: "google:gemini-3.6-flash",
    subagents: [researchSubagent],
  });

  const result = await agent.invoke({
    messages: [
      { role: "user", content: "Research recent advances in quantum computing" },
    ],
  });

  // The parent's ToolMessage contains JSON-serialized structured data:
  // '{"summary": "...", "confidence": 0.87, "sources": ["https://..."]}'
  ```

  ```ts OpenAI theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { z } from "zod";
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";

  const webSearch = tool(
    async ({ query }: { query: string }) => `web results for ${query}`,
    {
      name: "web_search",
      description: "Search the web",
      schema: z.object({ query: z.string() }),
    },
  );

  const ResearchFindings = z.object({
    summary: z.string().describe("Summary of findings"),
    confidence: z.number().describe("Confidence score from 0 to 1"),
    sources: z.array(z.string()).describe("List of source URLs"),
  });

  const researchSubagent = {
    name: "researcher",
    description: "Researches topics and returns structured findings",
    systemPrompt: "Research the given topic thoroughly. Return your findings.",
    tools: [webSearch],
    responseFormat: ResearchFindings,
  };

  const agent = createDeepAgent({
    model: "openai:gpt-5.5",
    subagents: [researchSubagent],
  });

  const result = await agent.invoke({
    messages: [
      { role: "user", content: "Research recent advances in quantum computing" },
    ],
  });

  // The parent's ToolMessage contains JSON-serialized structured data:
  // '{"summary": "...", "confidence": 0.87, "sources": ["https://..."]}'
  ```

  ```ts Anthropic theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { z } from "zod";
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";

  const webSearch = tool(
    async ({ query }: { query: string }) => `web results for ${query}`,
    {
      name: "web_search",
      description: "Search the web",
      schema: z.object({ query: z.string() }),
    },
  );

  const ResearchFindings = z.object({
    summary: z.string().describe("Summary of findings"),
    confidence: z.number().describe("Confidence score from 0 to 1"),
    sources: z.array(z.string()).describe("List of source URLs"),
  });

  const researchSubagent = {
    name: "researcher",
    description: "Researches topics and returns structured findings",
    systemPrompt: "Research the given topic thoroughly. Return your findings.",
    tools: [webSearch],
    responseFormat: ResearchFindings,
  };

  const agent = createDeepAgent({
    model: "anthropic:claude-sonnet-5",
    subagents: [researchSubagent],
  });

  const result = await agent.invoke({
    messages: [
      { role: "user", content: "Research recent advances in quantum computing" },
    ],
  });

  // The parent's ToolMessage contains JSON-serialized structured data:
  // '{"summary": "...", "confidence": 0.87, "sources": ["https://..."]}'
  ```

  ```ts OpenRouter theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { z } from "zod";
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";

  const webSearch = tool(
    async ({ query }: { query: string }) => `web results for ${query}`,
    {
      name: "web_search",
      description: "Search the web",
      schema: z.object({ query: z.string() }),
    },
  );

  const ResearchFindings = z.object({
    summary: z.string().describe("Summary of findings"),
    confidence: z.number().describe("Confidence score from 0 to 1"),
    sources: z.array(z.string()).describe("List of source URLs"),
  });

  const researchSubagent = {
    name: "researcher",
    description: "Researches topics and returns structured findings",
    systemPrompt: "Research the given topic thoroughly. Return your findings.",
    tools: [webSearch],
    responseFormat: ResearchFindings,
  };

  const agent = createDeepAgent({
    model: "openrouter:z-ai/glm-5.2",
    subagents: [researchSubagent],
  });

  const result = await agent.invoke({
    messages: [
      { role: "user", content: "Research recent advances in quantum computing" },
    ],
  });

  // The parent's ToolMessage contains JSON-serialized structured data:
  // '{"summary": "...", "confidence": 0.87, "sources": ["https://..."]}'
  ```

  ```ts Fireworks theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { z } from "zod";
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";

  const webSearch = tool(
    async ({ query }: { query: string }) => `web results for ${query}`,
    {
      name: "web_search",
      description: "Search the web",
      schema: z.object({ query: z.string() }),
    },
  );

  const ResearchFindings = z.object({
    summary: z.string().describe("Summary of findings"),
    confidence: z.number().describe("Confidence score from 0 to 1"),
    sources: z.array(z.string()).describe("List of source URLs"),
  });

  const researchSubagent = {
    name: "researcher",
    description: "Researches topics and returns structured findings",
    systemPrompt: "Research the given topic thoroughly. Return your findings.",
    tools: [webSearch],
    responseFormat: ResearchFindings,
  };

  const agent = createDeepAgent({
    model: "fireworks:accounts/fireworks/models/glm-5p2",
    subagents: [researchSubagent],
  });

  const result = await agent.invoke({
    messages: [
      { role: "user", content: "Research recent advances in quantum computing" },
    ],
  });

  // The parent's ToolMessage contains JSON-serialized structured data:
  // '{"summary": "...", "confidence": 0.87, "sources": ["https://..."]}'
  ```

  ```ts Baseten theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { z } from "zod";
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";

  const webSearch = tool(
    async ({ query }: { query: string }) => `web results for ${query}`,
    {
      name: "web_search",
      description: "Search the web",
      schema: z.object({ query: z.string() }),
    },
  );

  const ResearchFindings = z.object({
    summary: z.string().describe("Summary of findings"),
    confidence: z.number().describe("Confidence score from 0 to 1"),
    sources: z.array(z.string()).describe("List of source URLs"),
  });

  const researchSubagent = {
    name: "researcher",
    description: "Researches topics and returns structured findings",
    systemPrompt: "Research the given topic thoroughly. Return your findings.",
    tools: [webSearch],
    responseFormat: ResearchFindings,
  };

  const agent = createDeepAgent({
    model: "baseten:zai-org/GLM-5.2",
    subagents: [researchSubagent],
  });

  const result = await agent.invoke({
    messages: [
      { role: "user", content: "Research recent advances in quantum computing" },
    ],
  });

  // The parent's ToolMessage contains JSON-serialized structured data:
  // '{"summary": "...", "confidence": 0.87, "sources": ["https://..."]}'
  ```

  ```ts Ollama theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { z } from "zod";
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";

  const webSearch = tool(
    async ({ query }: { query: string }) => `web results for ${query}`,
    {
      name: "web_search",
      description: "Search the web",
      schema: z.object({ query: z.string() }),
    },
  );

  const ResearchFindings = z.object({
    summary: z.string().describe("Summary of findings"),
    confidence: z.number().describe("Confidence score from 0 to 1"),
    sources: z.array(z.string()).describe("List of source URLs"),
  });

  const researchSubagent = {
    name: "researcher",
    description: "Researches topics and returns structured findings",
    systemPrompt: "Research the given topic thoroughly. Return your findings.",
    tools: [webSearch],
    responseFormat: ResearchFindings,
  };

  const agent = createDeepAgent({
    model: "ollama:north-mini-code-1.0",
    subagents: [researchSubagent],
  });

  const result = await agent.invoke({
    messages: [
      { role: "user", content: "Research recent advances in quantum computing" },
    ],
  });

  // The parent's ToolMessage contains JSON-serialized structured data:
  // '{"summary": "...", "confidence": 0.87, "sources": ["https://..."]}'
  ```
</CodeGroup>

<Card title="View example trace" icon="chart-line" href="https://smith.langchain.com/public/6df55bfb-81cc-4272-a5b3-415569581188/r" arrow horizontal>
  Open a public LangSmith run for this example.
</Card>

Without `response_format`, the parent receives the subagent's last message text as-is. With it, the parent always gets valid JSON matching the schema, which is useful when the parent needs to process the result programmatically or pass it to downstream tools.

For full details on schema types and strategies (tool calling vs. provider-native), see [Structured output](/oss/javascript/langchain/structured-output).

## The general-purpose subagent

In addition to any user-defined subagents, every deep agent has access to a `general-purpose` subagent at all times. This subagent:

* Uses its own [default system prompt with profile overlays applied](/oss/javascript/deepagents/customization#system-prompt)
* Has access to all the same tools
* Uses the same model (unless overridden)
* Inherits skills from the main agent (when skills are configured)

### Override the general-purpose subagent

Include a subagent with `name: "general-purpose"` in your `subagents` list to replace the default. Use this to configure a different model, tools, or system prompt for the general-purpose subagent:

<CodeGroup>
  ```ts Google theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";
  import { z } from "zod";

  const internetSearch = tool(
    async ({ query }: { query: string }) => `search results for ${query}`,
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({ query: z.string() }),
    },
  );

  // Main agent uses Gemini; general-purpose subagent uses GPT
  const agent = await createDeepAgent({
    model: "google:gemini-3.6-flash",
    tools: [internetSearch],
    subagents: [
      {
        name: "general-purpose",
        description: "General-purpose agent for research and multi-step tasks",
        systemPrompt: "You are a general-purpose assistant.",
        tools: [internetSearch],
        model: "openai:gpt-5.5", // Different model for delegated tasks
      },
    ],
  });
  ```

  ```ts OpenAI theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";
  import { z } from "zod";

  const internetSearch = tool(
    async ({ query }: { query: string }) => `search results for ${query}`,
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({ query: z.string() }),
    },
  );

  // Main agent uses Gemini; general-purpose subagent uses GPT
  const agent = await createDeepAgent({
    model: "openai:gpt-5.5",
    tools: [internetSearch],
    subagents: [
      {
        name: "general-purpose",
        description: "General-purpose agent for research and multi-step tasks",
        systemPrompt: "You are a general-purpose assistant.",
        tools: [internetSearch],
        model: "openai:gpt-5.5", // Different model for delegated tasks
      },
    ],
  });
  ```

  ```ts Anthropic theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";
  import { z } from "zod";

  const internetSearch = tool(
    async ({ query }: { query: string }) => `search results for ${query}`,
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({ query: z.string() }),
    },
  );

  // Main agent uses Gemini; general-purpose subagent uses GPT
  const agent = await createDeepAgent({
    model: "anthropic:claude-sonnet-5",
    tools: [internetSearch],
    subagents: [
      {
        name: "general-purpose",
        description: "General-purpose agent for research and multi-step tasks",
        systemPrompt: "You are a general-purpose assistant.",
        tools: [internetSearch],
        model: "openai:gpt-5.5", // Different model for delegated tasks
      },
    ],
  });
  ```

  ```ts OpenRouter theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";
  import { z } from "zod";

  const internetSearch = tool(
    async ({ query }: { query: string }) => `search results for ${query}`,
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({ query: z.string() }),
    },
  );

  // Main agent uses Gemini; general-purpose subagent uses GPT
  const agent = await createDeepAgent({
    model: "openrouter:z-ai/glm-5.2",
    tools: [internetSearch],
    subagents: [
      {
        name: "general-purpose",
        description: "General-purpose agent for research and multi-step tasks",
        systemPrompt: "You are a general-purpose assistant.",
        tools: [internetSearch],
        model: "openai:gpt-5.5", // Different model for delegated tasks
      },
    ],
  });
  ```

  ```ts Fireworks theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";
  import { z } from "zod";

  const internetSearch = tool(
    async ({ query }: { query: string }) => `search results for ${query}`,
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({ query: z.string() }),
    },
  );

  // Main agent uses Gemini; general-purpose subagent uses GPT
  const agent = await createDeepAgent({
    model: "fireworks:accounts/fireworks/models/glm-5p2",
    tools: [internetSearch],
    subagents: [
      {
        name: "general-purpose",
        description: "General-purpose agent for research and multi-step tasks",
        systemPrompt: "You are a general-purpose assistant.",
        tools: [internetSearch],
        model: "openai:gpt-5.5", // Different model for delegated tasks
      },
    ],
  });
  ```

  ```ts Baseten theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";
  import { z } from "zod";

  const internetSearch = tool(
    async ({ query }: { query: string }) => `search results for ${query}`,
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({ query: z.string() }),
    },
  );

  // Main agent uses Gemini; general-purpose subagent uses GPT
  const agent = await createDeepAgent({
    model: "baseten:zai-org/GLM-5.2",
    tools: [internetSearch],
    subagents: [
      {
        name: "general-purpose",
        description: "General-purpose agent for research and multi-step tasks",
        systemPrompt: "You are a general-purpose assistant.",
        tools: [internetSearch],
        model: "openai:gpt-5.5", // Different model for delegated tasks
      },
    ],
  });
  ```

  ```ts Ollama theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";
  import { z } from "zod";

  const internetSearch = tool(
    async ({ query }: { query: string }) => `search results for ${query}`,
    {
      name: "internet_search",
      description: "Run a web search",
      schema: z.object({ query: z.string() }),
    },
  );

  // Main agent uses Gemini; general-purpose subagent uses GPT
  const agent = await createDeepAgent({
    model: "ollama:north-mini-code-1.0",
    tools: [internetSearch],
    subagents: [
      {
        name: "general-purpose",
        description: "General-purpose agent for research and multi-step tasks",
        systemPrompt: "You are a general-purpose assistant.",
        tools: [internetSearch],
        model: "openai:gpt-5.5", // Different model for delegated tasks
      },
    ],
  });
  ```
</CodeGroup>

When you provide a subagent with the general-purpose name, the default general-purpose subagent is not added. Your spec fully replaces it.

To remove the built-in general-purpose subagent entirely instead of replacing it, set the active harness profile's general-purpose subagent `enabled` flag to `False`.

### When to use it

The general-purpose subagent is ideal for context isolation without specialized behavior. The main agent can delegate a complex multi-step task to this subagent and get a concise result back without bloat from intermediate tool calls.

<Card title="Example">
  Instead of the main agent making 10 web searches and filling its context with results, it delegates to the general-purpose subagent: `task(name="general-purpose", task="Research quantum computing trends")`. The subagent performs all the searches internally and returns only a summary.
</Card>

### Skills inheritance

When configuring [skills](/oss/javascript/deepagents/skills) with `create_deep_agent`:

* **General-purpose subagent**: Automatically inherits skills from the main agent
* **Custom subagents**: Do NOT inherit skills by default—use the `skills` parameter to give them their own skills

<Note>
  Only subagents configured with skills get a `SkillsMiddleware` instance—custom subagents without a `skills` parameter do not. When present, skill state is fully isolated in both directions: the parent's skills are not visible to the child, and the child's skills are not propagated back to the parent.
</Note>

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { createDeepAgent } from "deepagents";

const researchSubagent = {
  name: "researcher",
  description: "Research assistant with specialized skills",
  systemPrompt: "You are a researcher.",
  tools: [webSearch],
  skills: ["/skills/research/", "/skills/web-search/"], // Subagent-specific skills
};

const agent = await createDeepAgent({
  model: "google:gemini-3.6-flash",
  skills: ["/skills/main/"], // Main agent and GP subagent get these
  subagents: [researchSubagent], // Researcher gets only its own skills
});
```

## Best practices

### Write clear descriptions

The main agent uses descriptions to decide which subagent to call. Be specific:

✅ **Good:** `"Analyzes financial data and generates investment insights with confidence scores"`

❌ **Bad:** `"Does finance stuff"`

### Keep system prompts detailed

Include specific guidance on how to use tools and format outputs:

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const researchSubagent = {
  name: "research-agent",
  description:
    "Conducts in-depth research using web search and synthesizes findings",
  systemPrompt: `You are a thorough researcher. Your job is to:

  1. Break down the research question into searchable queries
  2. Use internet_search to find relevant information
  3. Synthesize findings into a comprehensive but concise summary
  4. Cite sources when making claims

  Output format:
  - Summary (2-3 paragraphs)
  - Key findings (bullet points)
  - Sources (with URLs)

  Keep your response under 500 words to maintain clean context.`,
  tools: [internetSearch],
};
```

### Minimize tool sets

Only give subagents the tools they need. This improves focus and security:

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// ✅ Good: Focused tool set
const emailAgent = {
  name: "email-sender",
  tools: [sendEmail, validateEmail], // Only email-related
};
```

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
// ❌ Bad: Too many tools
const emailAgentBad = {
  name: "email-sender",
  tools: [sendEmail, webSearch, databaseQuery, fileUpload], // Unfocused
};
```

### Choose models by task

Different models excel at different tasks:

<CodeGroup>
  ```ts Google theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  const subagents = [
    {
      name: "contract-reviewer",
      description: "Reviews legal documents and contracts",
      systemPrompt: "You are an expert legal reviewer...",
      tools: [readDocument, analyzeContract],
      model: "google:gemini-3.6-flash", // Large context for long documents
    },
    {
      name: "financial-analyst",
      description: "Analyzes financial data and market trends",
      systemPrompt: "You are an expert financial analyst...",
      tools: [getStockPrice, analyzeFundamentals],
      model: "openai:gpt-5.5", // Better for numerical analysis
    },
  ];
  ```

  ```ts OpenAI theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  const subagents = [
    {
      name: "contract-reviewer",
      description: "Reviews legal documents and contracts",
      systemPrompt: "You are an expert legal reviewer...",
      tools: [readDocument, analyzeContract],
      model: "openai:gpt-5.5", // Large context for long documents
    },
    {
      name: "financial-analyst",
      description: "Analyzes financial data and market trends",
      systemPrompt: "You are an expert financial analyst...",
      tools: [getStockPrice, analyzeFundamentals],
      model: "openai:gpt-5.5", // Better for numerical analysis
    },
  ];
  ```

  ```ts Anthropic theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  const subagents = [
    {
      name: "contract-reviewer",
      description: "Reviews legal documents and contracts",
      systemPrompt: "You are an expert legal reviewer...",
      tools: [readDocument, analyzeContract],
      model: "anthropic:claude-sonnet-5", // Large context for long documents
    },
    {
      name: "financial-analyst",
      description: "Analyzes financial data and market trends",
      systemPrompt: "You are an expert financial analyst...",
      tools: [getStockPrice, analyzeFundamentals],
      model: "openai:gpt-5.5", // Better for numerical analysis
    },
  ];
  ```

  ```ts OpenRouter theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  const subagents = [
    {
      name: "contract-reviewer",
      description: "Reviews legal documents and contracts",
      systemPrompt: "You are an expert legal reviewer...",
      tools: [readDocument, analyzeContract],
      model: "openrouter:z-ai/glm-5.2", // Large context for long documents
    },
    {
      name: "financial-analyst",
      description: "Analyzes financial data and market trends",
      systemPrompt: "You are an expert financial analyst...",
      tools: [getStockPrice, analyzeFundamentals],
      model: "openai:gpt-5.5", // Better for numerical analysis
    },
  ];
  ```

  ```ts Fireworks theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  const subagents = [
    {
      name: "contract-reviewer",
      description: "Reviews legal documents and contracts",
      systemPrompt: "You are an expert legal reviewer...",
      tools: [readDocument, analyzeContract],
      model: "fireworks:accounts/fireworks/models/glm-5p2", // Large context for long documents
    },
    {
      name: "financial-analyst",
      description: "Analyzes financial data and market trends",
      systemPrompt: "You are an expert financial analyst...",
      tools: [getStockPrice, analyzeFundamentals],
      model: "openai:gpt-5.5", // Better for numerical analysis
    },
  ];
  ```

  ```ts Baseten theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  const subagents = [
    {
      name: "contract-reviewer",
      description: "Reviews legal documents and contracts",
      systemPrompt: "You are an expert legal reviewer...",
      tools: [readDocument, analyzeContract],
      model: "baseten:zai-org/GLM-5.2", // Large context for long documents
    },
    {
      name: "financial-analyst",
      description: "Analyzes financial data and market trends",
      systemPrompt: "You are an expert financial analyst...",
      tools: [getStockPrice, analyzeFundamentals],
      model: "openai:gpt-5.5", // Better for numerical analysis
    },
  ];
  ```

  ```ts Ollama theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  const subagents = [
    {
      name: "contract-reviewer",
      description: "Reviews legal documents and contracts",
      systemPrompt: "You are an expert legal reviewer...",
      tools: [readDocument, analyzeContract],
      model: "ollama:north-mini-code-1.0", // Large context for long documents
    },
    {
      name: "financial-analyst",
      description: "Analyzes financial data and market trends",
      systemPrompt: "You are an expert financial analyst...",
      tools: [getStockPrice, analyzeFundamentals],
      model: "openai:gpt-5.5", // Better for numerical analysis
    },
  ];
  ```
</CodeGroup>

### Return concise results

Instruct subagents to return summaries, not raw data:

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const dataAnalyst = {
  systemPrompt: `Analyze the data and return:
  1. Key insights (3-5 bullet points)
  2. Overall confidence score
  3. Recommended next actions

  Do NOT include:
  - Raw data
  - Intermediate calculations
  - Detailed tool outputs

  Keep response under 300 words.`,
};
```

## Common patterns

### Multiple specialized subagents

Create specialized subagents for different domains:

<CodeGroup>
  ```ts Google theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";

  const subagents = [
    {
      name: "data-collector",
      description: "Gathers raw data from various sources",
      systemPrompt: "Collect comprehensive data on the topic",
      tools: [webSearch, apiCall, databaseQuery],
    },
    {
      name: "data-analyzer",
      description: "Analyzes collected data for insights",
      systemPrompt: "Analyze data and extract key insights",
      tools: [statisticalAnalysis],
    },
    {
      name: "report-writer",
      description: "Writes polished reports from analysis",
      systemPrompt: "Create professional reports from insights",
      tools: [formatDocument],
    },
  ];

  const agent = createDeepAgent({
    model: "google:gemini-3.6-flash",
    systemPrompt:
      "You coordinate data analysis and reporting. Use subagents for specialized tasks.",
    subagents: subagents,
  });
  ```

  ```ts OpenAI theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";

  const subagents = [
    {
      name: "data-collector",
      description: "Gathers raw data from various sources",
      systemPrompt: "Collect comprehensive data on the topic",
      tools: [webSearch, apiCall, databaseQuery],
    },
    {
      name: "data-analyzer",
      description: "Analyzes collected data for insights",
      systemPrompt: "Analyze data and extract key insights",
      tools: [statisticalAnalysis],
    },
    {
      name: "report-writer",
      description: "Writes polished reports from analysis",
      systemPrompt: "Create professional reports from insights",
      tools: [formatDocument],
    },
  ];

  const agent = createDeepAgent({
    model: "openai:gpt-5.5",
    systemPrompt:
      "You coordinate data analysis and reporting. Use subagents for specialized tasks.",
    subagents: subagents,
  });
  ```

  ```ts Anthropic theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";

  const subagents = [
    {
      name: "data-collector",
      description: "Gathers raw data from various sources",
      systemPrompt: "Collect comprehensive data on the topic",
      tools: [webSearch, apiCall, databaseQuery],
    },
    {
      name: "data-analyzer",
      description: "Analyzes collected data for insights",
      systemPrompt: "Analyze data and extract key insights",
      tools: [statisticalAnalysis],
    },
    {
      name: "report-writer",
      description: "Writes polished reports from analysis",
      systemPrompt: "Create professional reports from insights",
      tools: [formatDocument],
    },
  ];

  const agent = createDeepAgent({
    model: "anthropic:claude-sonnet-5",
    systemPrompt:
      "You coordinate data analysis and reporting. Use subagents for specialized tasks.",
    subagents: subagents,
  });
  ```

  ```ts OpenRouter theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";

  const subagents = [
    {
      name: "data-collector",
      description: "Gathers raw data from various sources",
      systemPrompt: "Collect comprehensive data on the topic",
      tools: [webSearch, apiCall, databaseQuery],
    },
    {
      name: "data-analyzer",
      description: "Analyzes collected data for insights",
      systemPrompt: "Analyze data and extract key insights",
      tools: [statisticalAnalysis],
    },
    {
      name: "report-writer",
      description: "Writes polished reports from analysis",
      systemPrompt: "Create professional reports from insights",
      tools: [formatDocument],
    },
  ];

  const agent = createDeepAgent({
    model: "openrouter:z-ai/glm-5.2",
    systemPrompt:
      "You coordinate data analysis and reporting. Use subagents for specialized tasks.",
    subagents: subagents,
  });
  ```

  ```ts Fireworks theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";

  const subagents = [
    {
      name: "data-collector",
      description: "Gathers raw data from various sources",
      systemPrompt: "Collect comprehensive data on the topic",
      tools: [webSearch, apiCall, databaseQuery],
    },
    {
      name: "data-analyzer",
      description: "Analyzes collected data for insights",
      systemPrompt: "Analyze data and extract key insights",
      tools: [statisticalAnalysis],
    },
    {
      name: "report-writer",
      description: "Writes polished reports from analysis",
      systemPrompt: "Create professional reports from insights",
      tools: [formatDocument],
    },
  ];

  const agent = createDeepAgent({
    model: "fireworks:accounts/fireworks/models/glm-5p2",
    systemPrompt:
      "You coordinate data analysis and reporting. Use subagents for specialized tasks.",
    subagents: subagents,
  });
  ```

  ```ts Baseten theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";

  const subagents = [
    {
      name: "data-collector",
      description: "Gathers raw data from various sources",
      systemPrompt: "Collect comprehensive data on the topic",
      tools: [webSearch, apiCall, databaseQuery],
    },
    {
      name: "data-analyzer",
      description: "Analyzes collected data for insights",
      systemPrompt: "Analyze data and extract key insights",
      tools: [statisticalAnalysis],
    },
    {
      name: "report-writer",
      description: "Writes polished reports from analysis",
      systemPrompt: "Create professional reports from insights",
      tools: [formatDocument],
    },
  ];

  const agent = createDeepAgent({
    model: "baseten:zai-org/GLM-5.2",
    systemPrompt:
      "You coordinate data analysis and reporting. Use subagents for specialized tasks.",
    subagents: subagents,
  });
  ```

  ```ts Ollama theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";

  const subagents = [
    {
      name: "data-collector",
      description: "Gathers raw data from various sources",
      systemPrompt: "Collect comprehensive data on the topic",
      tools: [webSearch, apiCall, databaseQuery],
    },
    {
      name: "data-analyzer",
      description: "Analyzes collected data for insights",
      systemPrompt: "Analyze data and extract key insights",
      tools: [statisticalAnalysis],
    },
    {
      name: "report-writer",
      description: "Writes polished reports from analysis",
      systemPrompt: "Create professional reports from insights",
      tools: [formatDocument],
    },
  ];

  const agent = createDeepAgent({
    model: "ollama:north-mini-code-1.0",
    systemPrompt:
      "You coordinate data analysis and reporting. Use subagents for specialized tasks.",
    subagents: subagents,
  });
  ```
</CodeGroup>

**Workflow:**

1. Main agent creates high-level plan
2. Delegates data collection to data-collector
3. Passes results to data-analyzer
4. Sends insights to report-writer
5. Compiles final output

Each subagent works with clean context focused only on its task.

## Context management

When you invoke a parent agent with [runtime context](/oss/javascript/langchain/runtime), that context automatically propagates to all subagents. Each subagent run receives the same runtime context you passed on the parent `invoke` / `ainvoke` call.

This means tools running inside any subagent can access the same context values you provided to the parent:

<CodeGroup>
  ```ts Google theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";
  import type { ToolRuntime } from "@langchain/core/tools";
  import { z } from "zod";

  const contextSchema = z.object({
    userId: z.string(),
    sessionId: z.string(),
  });

  const getUserData = tool(
    async (input, runtime: ToolRuntime<unknown, typeof contextSchema>) => {
      const userId = runtime.context?.userId;
      return `Data for user ${userId}: ${input.query}`;
    },
    {
      name: "get_user_data",
      description: "Fetch data for the current user",
      schema: z.object({ query: z.string() }),
    },
  );

  const researchSubagent = {
    name: "researcher",
    description: "Conducts research for the current user",
    systemPrompt: "You are a research assistant.",
    tools: [getUserData],
  };

  const agent = createDeepAgent({
    model: "google:gemini-3.6-flash",
    subagents: [researchSubagent],
    contextSchema,
  });

  // Context flows to the researcher subagent and its tools automatically
  const result = await agent.invoke(
    { messages: [new HumanMessage("Look up my recent activity")] },
    { context: { userId: "user-123", sessionId: "abc" } },
  );
  ```

  ```ts OpenAI theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";
  import type { ToolRuntime } from "@langchain/core/tools";
  import { z } from "zod";

  const contextSchema = z.object({
    userId: z.string(),
    sessionId: z.string(),
  });

  const getUserData = tool(
    async (input, runtime: ToolRuntime<unknown, typeof contextSchema>) => {
      const userId = runtime.context?.userId;
      return `Data for user ${userId}: ${input.query}`;
    },
    {
      name: "get_user_data",
      description: "Fetch data for the current user",
      schema: z.object({ query: z.string() }),
    },
  );

  const researchSubagent = {
    name: "researcher",
    description: "Conducts research for the current user",
    systemPrompt: "You are a research assistant.",
    tools: [getUserData],
  };

  const agent = createDeepAgent({
    model: "openai:gpt-5.5",
    subagents: [researchSubagent],
    contextSchema,
  });

  // Context flows to the researcher subagent and its tools automatically
  const result = await agent.invoke(
    { messages: [new HumanMessage("Look up my recent activity")] },
    { context: { userId: "user-123", sessionId: "abc" } },
  );
  ```

  ```ts Anthropic theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";
  import type { ToolRuntime } from "@langchain/core/tools";
  import { z } from "zod";

  const contextSchema = z.object({
    userId: z.string(),
    sessionId: z.string(),
  });

  const getUserData = tool(
    async (input, runtime: ToolRuntime<unknown, typeof contextSchema>) => {
      const userId = runtime.context?.userId;
      return `Data for user ${userId}: ${input.query}`;
    },
    {
      name: "get_user_data",
      description: "Fetch data for the current user",
      schema: z.object({ query: z.string() }),
    },
  );

  const researchSubagent = {
    name: "researcher",
    description: "Conducts research for the current user",
    systemPrompt: "You are a research assistant.",
    tools: [getUserData],
  };

  const agent = createDeepAgent({
    model: "anthropic:claude-sonnet-5",
    subagents: [researchSubagent],
    contextSchema,
  });

  // Context flows to the researcher subagent and its tools automatically
  const result = await agent.invoke(
    { messages: [new HumanMessage("Look up my recent activity")] },
    { context: { userId: "user-123", sessionId: "abc" } },
  );
  ```

  ```ts OpenRouter theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";
  import type { ToolRuntime } from "@langchain/core/tools";
  import { z } from "zod";

  const contextSchema = z.object({
    userId: z.string(),
    sessionId: z.string(),
  });

  const getUserData = tool(
    async (input, runtime: ToolRuntime<unknown, typeof contextSchema>) => {
      const userId = runtime.context?.userId;
      return `Data for user ${userId}: ${input.query}`;
    },
    {
      name: "get_user_data",
      description: "Fetch data for the current user",
      schema: z.object({ query: z.string() }),
    },
  );

  const researchSubagent = {
    name: "researcher",
    description: "Conducts research for the current user",
    systemPrompt: "You are a research assistant.",
    tools: [getUserData],
  };

  const agent = createDeepAgent({
    model: "openrouter:z-ai/glm-5.2",
    subagents: [researchSubagent],
    contextSchema,
  });

  // Context flows to the researcher subagent and its tools automatically
  const result = await agent.invoke(
    { messages: [new HumanMessage("Look up my recent activity")] },
    { context: { userId: "user-123", sessionId: "abc" } },
  );
  ```

  ```ts Fireworks theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";
  import type { ToolRuntime } from "@langchain/core/tools";
  import { z } from "zod";

  const contextSchema = z.object({
    userId: z.string(),
    sessionId: z.string(),
  });

  const getUserData = tool(
    async (input, runtime: ToolRuntime<unknown, typeof contextSchema>) => {
      const userId = runtime.context?.userId;
      return `Data for user ${userId}: ${input.query}`;
    },
    {
      name: "get_user_data",
      description: "Fetch data for the current user",
      schema: z.object({ query: z.string() }),
    },
  );

  const researchSubagent = {
    name: "researcher",
    description: "Conducts research for the current user",
    systemPrompt: "You are a research assistant.",
    tools: [getUserData],
  };

  const agent = createDeepAgent({
    model: "fireworks:accounts/fireworks/models/glm-5p2",
    subagents: [researchSubagent],
    contextSchema,
  });

  // Context flows to the researcher subagent and its tools automatically
  const result = await agent.invoke(
    { messages: [new HumanMessage("Look up my recent activity")] },
    { context: { userId: "user-123", sessionId: "abc" } },
  );
  ```

  ```ts Baseten theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";
  import type { ToolRuntime } from "@langchain/core/tools";
  import { z } from "zod";

  const contextSchema = z.object({
    userId: z.string(),
    sessionId: z.string(),
  });

  const getUserData = tool(
    async (input, runtime: ToolRuntime<unknown, typeof contextSchema>) => {
      const userId = runtime.context?.userId;
      return `Data for user ${userId}: ${input.query}`;
    },
    {
      name: "get_user_data",
      description: "Fetch data for the current user",
      schema: z.object({ query: z.string() }),
    },
  );

  const researchSubagent = {
    name: "researcher",
    description: "Conducts research for the current user",
    systemPrompt: "You are a research assistant.",
    tools: [getUserData],
  };

  const agent = createDeepAgent({
    model: "baseten:zai-org/GLM-5.2",
    subagents: [researchSubagent],
    contextSchema,
  });

  // Context flows to the researcher subagent and its tools automatically
  const result = await agent.invoke(
    { messages: [new HumanMessage("Look up my recent activity")] },
    { context: { userId: "user-123", sessionId: "abc" } },
  );
  ```

  ```ts Ollama theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
  import { createDeepAgent } from "deepagents";
  import { tool } from "langchain";
  import type { ToolRuntime } from "@langchain/core/tools";
  import { z } from "zod";

  const contextSchema = z.object({
    userId: z.string(),
    sessionId: z.string(),
  });

  const getUserData = tool(
    async (input, runtime: ToolRuntime<unknown, typeof contextSchema>) => {
      const userId = runtime.context?.userId;
      return `Data for user ${userId}: ${input.query}`;
    },
    {
      name: "get_user_data",
      description: "Fetch data for the current user",
      schema: z.object({ query: z.string() }),
    },
  );

  const researchSubagent = {
    name: "researcher",
    description: "Conducts research for the current user",
    systemPrompt: "You are a research assistant.",
    tools: [getUserData],
  };

  const agent = createDeepAgent({
    model: "ollama:north-mini-code-1.0",
    subagents: [researchSubagent],
    contextSchema,
  });

  // Context flows to the researcher subagent and its tools automatically
  const result = await agent.invoke(
    { messages: [new HumanMessage("Look up my recent activity")] },
    { context: { userId: "user-123", sessionId: "abc" } },
  );
  ```
</CodeGroup>

### Per-subagent context

All subagents receive the same parent context. To pass configuration that is specific to a particular subagent, use **namespaced keys** (prefix keys with the subagent name, for example `researcher:max_depth`) in a flat `context` mapping, **or** model those settings as separate fields on your context type:

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { tool } from "langchain";
import type { ToolRuntime } from "@langchain/core/tools";
import { z } from "zod";

const contextSchema = z.object({
  userId: z.string(),
  researcherMaxDepth: z.number().optional(),
  factCheckerStrictMode: z.boolean().optional(),
});

const verifyClaim = tool(
  async (input, runtime: ToolRuntime<unknown, typeof contextSchema>) => {
    const strictMode = runtime.context?.factCheckerStrictMode ?? false;
    if (strictMode) {
      return strictVerification(input.claim);
    }
    return basicVerification(input.claim);
  },
  {
    name: "verify_claim",
    description: "Verify a factual claim",
    schema: z.object({ claim: z.string() }),
  },
);
```

### Identifying which subagent called a tool

When the same tool is shared between the parent and multiple subagents, you can use the `lc_agent_name` metadata (the same value used in [streaming](#streaming)) to determine which agent initiated the call:

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { tool } from "langchain";
import type { ToolRuntime } from "@langchain/core/tools";
import { z } from "zod";

const sharedLookup = tool(
  async (input, runtime: ToolRuntime) => {
    const agentName = runtime.config?.metadata?.lc_agent_name;
    if (agentName === "fact-checker") {
      return strictLookup(input.query);
    }
    return generalLookup(input.query);
  },
  {
    name: "shared_lookup",
    description: "Look up information from various sources",
    schema: z.object({ query: z.string() }),
  },
);
```

You can combine both patterns—read agent-specific settings from `runtime.context` and read `lc_agent_name` from `runtime.config` metadata when branching tool behavior.

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
import { tool } from "langchain";
import type { ToolRuntime } from "@langchain/core/tools";
import { z } from "zod";

const contextSchema = z.object({
  userId: z.string(),
  researcherMaxDepth: z.number().optional(),
  factCheckerStrictMode: z.boolean().optional(),
});

const flexibleSearch = tool(
  async (input, runtime: ToolRuntime<unknown, typeof contextSchema>) => {
    const agentName = runtime.config?.metadata?.lc_agent_name ?? "unknown";
    const ctx = runtime.context;
    const maxResults =
      agentName === "researcher" ? (ctx?.researcherMaxDepth ?? 5) : 5;
    const includeRaw = false;

    return performSearch(input.query, { maxResults, includeRaw });
  },
  {
    name: "flexible_search",
    description: "Search with agent-specific settings",
    schema: z.object({ query: z.string() }),
  },
);
```

## Troubleshooting

### Subagent not being called

**Problem**: Main agent tries to do work itself instead of delegating.

**Solutions**:

1. **Make descriptions more specific:**

   ```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
   // ✅ Good
   const goodDescription = {
     name: "research-specialist",
     description:
       "Conducts in-depth research on specific topics using web search. Use when you need detailed information that requires multiple searches.",
   };
   ```

   ```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
   // ❌ Bad
   const badDescription = {
     name: "helper",
     description: "helps with stuff",
   };
   ```

2. **Instruct main agent to delegate:**

   ```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
   import { createDeepAgent } from "deepagents";

   const agent = createDeepAgent({
     systemPrompt: `...your instructions...

     IMPORTANT: For complex tasks, delegate to your subagents using the task() tool.
     This keeps your context clean and improves results.`,
     subagents: [
       {
         name: "research-agent",
         description: "Conducts research",
         systemPrompt: "You are a researcher.",
       },
     ],
   });
   ```

### Context still getting bloated

**Problem**: Context fills up despite using subagents.

**Solutions**:

1. **Instruct subagent to return concise results:**

   ```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
   const systemPrompt = `...

   IMPORTANT: Return only the essential summary.
   Do NOT include raw data, intermediate search results, or detailed tool outputs.
   Your response should be under 500 words.`;
   ```

2. **Use filesystem for large data:**

   ```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
   const filesystemPrompt = `When you gather large amounts of data:
   1. Save raw data to /data/raw_results.txt
   2. Process and analyze the data
   3. Return only the analysis summary

   This keeps context clean.`;
   ```

### Wrong subagent being selected

**Problem**: Main agent calls inappropriate subagent for the task.

**Solution**: Differentiate subagents clearly in descriptions:

```ts theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
const subagents = [
  {
    name: "quick-researcher",
    description:
      "For simple, quick research questions that need 1-2 searches. Use when you need basic facts or definitions.",
    systemPrompt: "You are the quick-researcher subagent.",
  },
  {
    name: "deep-researcher",
    description:
      "For complex, in-depth research requiring multiple searches, synthesis, and analysis. Use for comprehensive reports.",
    systemPrompt: "You are the deep-researcher subagent.",
  },
];
```

***

<div className="source-links">
  <Callout icon="terminal-2">
    [Connect these docs](/use-these-docs) to your agent of choice via MCP for real-time answers.
  </Callout>

  <Callout icon="edit">
    [Edit this page on GitHub](https://github.com/langchain-ai/docs/edit/main/src/oss/deepagents/subagents.mdx) or [file an issue](https://github.com/langchain-ai/docs/issues/new/choose).
  </Callout>
</div>
