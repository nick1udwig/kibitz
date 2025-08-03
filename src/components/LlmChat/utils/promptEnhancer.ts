import OpenAI from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';

// Define the meta-prompt instructing the LLM how to improve the user's prompt
const META_PROMPT = `SYSTEM INSTRUCTIONS TO MODEL

You are a Prompt Improvement Assistant.
Your task is to refine a user's prompt to make it clearer, more detailed, and better structured, without changing the user's original intent.

Follow these rules carefully:

*   Structure the prompt with clear sections like "Core Features", "Visual References", and "Style Guide" when appropriate.
*   Include specific design guidelines, colors, typography, and layout information when enhancing UI/design related prompts.
*   When listing features, use bullet points for clear organization.
*   Add visual references to well-known examples when it helps clarify the request.
*   Never specify a programming language unless the user explicitly mentioned one.
*   Keep the improved prompt professional and implementation-agnostic unless specific technologies were requested.
*   Use numbered lists for sequential steps and bullet points for non-sequential items.
*   Output ONLY the improved version of the prompt. Do not explain your edits.

Examples:

User prompt: "write a button component"
Improved prompt: "Create a reusable button component with the following features:
- Primary, secondary, and disabled states
- Customizable text and icon support
- Responsive sizing (small, medium, large variants)
- Hover and active states with appropriate transitions

Visual References:
Inspired by Material Design buttons with clean, minimal styling

Style Guide:
- Colors: Primary #3B82F6, Secondary #6B7280, Disabled #E5E7EB
- Typography: 14px medium weight for default size
- Padding: 8px 16px with 4px border radius
- Transitions: 150ms ease-in-out for all state changes"

User prompt: "make tic tac toe game"
Improved prompt: "A classic web-based Tic-Tac-Toe game where two players can compete against each other on a 3x3 grid.

Core Features:
- Interactive 3x3 game board
- Alternating turns between X and O players
- Win detection and game status display
- Option to restart the game

Visual References:
Inspired by Google's Tic-Tac-Toe game interface, known for its clean and minimalist design.

Style Guide:
- Colors: Primary #007AFF (blue), Secondary #FF3B30 (red), Background #F2F2F7 (light grey), Text #1C1C1E (dark grey), Grid Lines #C7C7CC (medium grey)
- Design: System fonts, centered board layout with clear grid lines, 24px spacing, responsive square grid, smooth transitions"

---

User prompt:
"{USER_PROMPT}"

Improved prompt:`;

/**
 * Enhances a given user prompt using the configured LLM provider and model.
 * 
 * @param originalPrompt The user's original prompt text.
 * @param provider The configured LLM provider ('openai', 'anthropic', 'openrouter').
 * @param apiKey The API key for the configured provider.
 * @param model The specific model name configured by the user for the provider.
 * @returns A promise that resolves to the enhanced prompt string.
 * @throws An error if the API call fails or returns an unexpected response.
 */
export async function enhancePrompt(
  originalPrompt: string,
  provider: 'openai' | 'anthropic' | 'openrouter',
  apiKey: string,
  model: string
): Promise<string> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error(`${provider} API key is required.`);
  }
  if (!originalPrompt || !originalPrompt.trim()) {
    throw new Error('Original prompt cannot be empty.');
  }
  if (!model || !model.trim()) {
    throw new Error('Model name is required.');
  }

  const formattedMetaPrompt = META_PROMPT.replace('{USER_PROMPT}', originalPrompt);

  try {
    let improvedPrompt: string | null | undefined;

    if (provider === 'openai' || provider === 'openrouter') {
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined,
        dangerouslyAllowBrowser: true,
      });

      // Add headers for OpenRouter
      const options = provider === 'openrouter' ? {
        headers: {
          'HTTP-Referer': window.location.origin || 'https://kibitz.app',
          'X-Title': 'Kibitz Prompt Enhancer',
          // Add Authorization header explicitly for OpenRouter
          'Authorization': `Bearer ${apiKey}`
        }
      } : undefined;

      try {
        const response = await openai.chat.completions.create({
          model: model, // OpenRouter handles model names in their API
          messages: [
            {
              role: 'user',
              content: formattedMetaPrompt,
            },
          ],
          temperature: 0.5,
          max_tokens: 500,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
        }, options);
        improvedPrompt = response.choices[0]?.message?.content;
      } catch (error) {
        console.error(`OpenRouter/OpenAI API error:`, error);
        // Re-throw to be handled by the outer catch block
        throw error;
      }

    } else if (provider === 'anthropic') {
      const anthropic = new Anthropic({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true,
      });

      const response = await anthropic.messages.create({
        model: model,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: formattedMetaPrompt,
          },
        ],
        temperature: 0.5,
      });
      improvedPrompt = response.content[0]?.type === 'text' ? response.content[0].text : null;
    }

    if (!improvedPrompt) {
      throw new Error('API returned an empty or invalid response.');
    }

    // Clean up potential leading/trailing quotes or whitespace
    return improvedPrompt.trim().replace(/^"|"$/g, '');

  } catch (error) {
    console.error(`Error enhancing prompt with ${provider}:`, error);
    if (error instanceof Error) {
      // Try to provide a more specific error message (basic handling)
      throw new Error(`Failed to enhance prompt using ${provider}: ${error.message}`);
    }
    throw new Error(`An unknown error occurred while enhancing the prompt using ${provider}.`);
  }
} 