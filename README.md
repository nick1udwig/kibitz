# kibitz

A chat client for the Anthropic LLM API that can use MCP tools over WebSockets.

## Prerequisites

* git
* npm

## Installation

1. Clone the repository:
```bash
git clone https://github.com/nick1udwig/kibitz.git
cd kibitz
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Configuration

1. Open the Settings panel in the UI
2. Enter your Anthropic API key ([Get one here](https://console.anthropic.com/)).
3. Optionally set a system prompt
4. Configure MCPs by running them using [ws-mcp](https://github.com/nick1udwig/ws-mcp) and then connecting to them in the Settings page

Note configuration is PER-PROJECT.
When creating a new project, it will use some, but not all, of the current project's configuration: the API key, model, and system prompt will be copied over, but MCP servers will not.
