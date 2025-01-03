# llm-chat

A chat client for the Anthropic LLM API that can use MCP tools over WebSockets.

## Installation

1. Clone the repository:
```bash
git clone https://github.com/nick1udwig/llm-chat.git
cd llm-chat
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

1. Open the settings panel in the UI
2. Enter your Anthropic API key ([Get one here](https://console.anthropic.com/)).
3. Configure the model (default: claude-3-5-sonnet-20241022)
4. Optionally set a system prompt
5. Configure MCPs by running them using https://github.com/nick1udwig/ws-mcp and then connecting to them in the Settings page

Note configuration is PER-CHAT, but when creating a new chat, it will use the current chat's configuration.
