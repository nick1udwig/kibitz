# llm-chat

A client for the Anthropic Claude API built with Next.js and TypeScript.

## Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- An Anthropic API key ([Get one here](https://console.anthropic.com/))

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
2. Enter your Anthropic API key
3. Configure the model (default: claude-3-5-sonnet-20241022)
4. Optionally set a system prompt and configure tools

Note configuration is PER-CHAT, but when creating a new chat, it will use the current chat's configuration.
