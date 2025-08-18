/**
 * LLM Commit Message Generator
 * 
 * Generates intelligent commit messages using configured LLM providers
 * by analyzing git diffs and project context.
 */

import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ProjectSettings } from '../components/LlmChat/context/types';

export interface CommitMessageRequest {
  gitDiff: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  branchName?: string;
  conversationId?: string;
  previousMessage?: string;
}

export interface CommitMessageResult {
  success: boolean;
  message: string;
  error?: string;
  provider?: string;
  model?: string;
}

const COMMIT_MESSAGE_PROMPT = `You are an expert software developer analyzing git diffs to generate clear, concise commit messages.

RULES:
1. Generate a single line commit message (50 characters or less)
2. Use conventional commit format when applicable (feat:, fix:, docs:, etc.)
3. Focus on WHAT changed, not HOW
4. Be specific but concise
5. Use present tense, imperative mood ("Add feature" not "Added feature")
6. Don't mention file names unless critical
7. If multiple unrelated changes, pick the most significant one

EXAMPLES:
- "feat: add user authentication system"
- "fix: resolve payment processing timeout"
- "docs: update API documentation"
- "refactor: simplify database connection logic"
- "style: format code according to standards"

Analyze the following git diff and respond with ONLY the commit message, no explanations:

{GIT_DIFF}

Files changed: {FILES_CHANGED}
Lines: +{LINES_ADDED}/-{LINES_REMOVED}`;

/**
 * Generate commit message using the project's configured LLM provider
 */
export async function generateLLMCommitMessage(
  request: CommitMessageRequest,
  projectSettings: ProjectSettings
): Promise<CommitMessageResult> {
  try {
    console.log('🤖 llmCommitMessageGenerator: ===== GENERATING LLM COMMIT MESSAGE =====');
    console.log('🤖 Request details:', {
      hasGitDiff: !!request.gitDiff,
      diffLength: request.gitDiff?.length || 0,
      filesChanged: request.filesChanged.length,
      linesAdded: request.linesAdded,
      linesRemoved: request.linesRemoved,
      branchName: request.branchName,
      conversationId: request.conversationId
    });
    // Resolve provider and model strictly from settings
    const resolvedProvider = (projectSettings.commitProvider || projectSettings.provider);
    const resolvedModel = (projectSettings.commitModel || projectSettings.model);

    console.log('🤖 Project settings for LLM (resolved):', {
      provider: resolvedProvider,
      hasAnthropicKey: !!projectSettings.anthropicApiKey,
      hasOpenAIKey: !!projectSettings.openaiApiKey,
      hasOpenRouterKey: !!projectSettings.openRouterApiKey,
      model: resolvedModel
    });

    // Validate inputs
    if (!request.gitDiff || !request.gitDiff.trim()) {
      console.warn('⚠️ No git diff provided for commit message generation');
      return {
        success: false,
        message: 'Auto-commit: changes detected',
        error: 'No git diff provided'
      };
    }

    if (!resolvedProvider) {
      console.warn('⚠️ No LLM provider configured');
      return {
        success: false,
        message: '',
        error: 'No LLM provider configured'
      };
    }

    // Get the appropriate API key based on provider
    const apiKey = getApiKeyByResolvedProvider(resolvedProvider, projectSettings);
    if (!apiKey?.trim()) {
      return {
        success: false,
        message: '',
        error: `No API key configured for provider: ${resolvedProvider}`
      };
    }

    // Strictly use the resolved model from settings (no hardcoded defaults)
    if (!resolvedModel || !resolvedModel.trim()) {
      return {
        success: false,
        message: '',
        error: 'No LLM model configured'
      };
    }

    // Format the prompt with diff data
    const prompt = COMMIT_MESSAGE_PROMPT
      .replace('{GIT_DIFF}', truncateGitDiff(request.gitDiff))
      .replace('{FILES_CHANGED}', request.filesChanged.slice(0, 5).join(', '))
      .replace('{LINES_ADDED}', request.linesAdded.toString())
      .replace('{LINES_REMOVED}', request.linesRemoved.toString());

    console.log(`🤖 Generating commit message using ${resolvedProvider} (${resolvedModel})`);

    let generatedMessage: string;

    // Call the appropriate LLM provider
    switch (resolvedProvider) {
      case 'anthropic':
        generatedMessage = await callAnthropicAPI(prompt, apiKey, resolvedModel);
        break;
      case 'openai':
        generatedMessage = await callOpenAIAPI(prompt, apiKey, resolvedModel);
        break;
      case 'openrouter':
        generatedMessage = await callOpenRouterAPI(prompt, apiKey, resolvedModel);
        break;
      default:
        throw new Error(`Unsupported provider: ${resolvedProvider}`);
    }

    // Clean and validate the generated message
    const cleanMessage = cleanCommitMessage(generatedMessage);
    if (!cleanMessage || cleanMessage.length < 3) {
      return {
        success: false,
        message: '',
        error: 'LLM returned an empty or invalid commit message',
        provider: resolvedProvider,
        model: resolvedModel
      };
    }

    console.log(`✅ Generated commit message: "${cleanMessage}"`);

    return {
      success: true,
      message: cleanMessage,
      provider: resolvedProvider,
      model: resolvedModel
    };

  } catch (error) {
    console.error('❌ Error generating LLM commit message:', error);
    return {
      success: false,
      message: '',
      error: error instanceof Error ? error.message : 'Unknown error',
      provider: projectSettings.commitProvider || projectSettings.provider,
      model: projectSettings.commitModel || projectSettings.model
    };
  }
}

/**
 * Get API key for the configured provider
 */
function getApiKeyByResolvedProvider(provider: string, settings: ProjectSettings): string | undefined {
  switch (provider) {
    case 'anthropic':
      return settings.anthropicApiKey || settings.apiKey;
    case 'openai':
      return settings.openaiApiKey;
    case 'openrouter':
      return settings.openRouterApiKey;
    default:
      return settings.apiKey;
  }
}

/**
 * Get default model for provider
 */
// Intentionally removed default model mapping to honor strict model selection from settings

/**
 * Get model specifically optimized for commit message generation
 * Uses fast, cost-effective models since commit messages are simple tasks
 */
// Intentionally removed per-provider commit model defaults to avoid hardcoding

/**
 * Call Anthropic API to generate commit message
 */
async function callAnthropicAPI(prompt: string, apiKey: string, model: string): Promise<string> {
  const anthropic = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const response = await anthropic.messages.create({
    model,
    max_tokens: 100,
    temperature: 0.3,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const content = response.content[0];
  if (content.type === 'text') {
    return content.text;
  }

  throw new Error('Invalid response format from Anthropic API');
}

/**
 * Call OpenAI API to generate commit message
 */
async function callOpenAIAPI(prompt: string, apiKey: string, model: string): Promise<string> {
  const openai = new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    max_tokens: 100,
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Invalid response from OpenAI API');
  }

  return content;
}

/**
 * Call OpenRouter API to generate commit message
 */
async function callOpenRouterAPI(prompt: string, apiKey: string, model: string): Promise<string> {
  const openai = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    dangerouslyAllowBrowser: true,
    defaultHeaders: {
      'HTTP-Referer': 'https://kibitz.app',
      'X-Title': 'Kibitz Commit Message Generator',
    },
  });

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    max_tokens: 100,
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Invalid response from OpenRouter API');
  }

  return content;
}

/**
 * Truncate git diff to prevent token limits
 */
function truncateGitDiff(gitDiff: string, maxLines: number = 50): string {
  const lines = gitDiff.split('\n');
  
  if (lines.length <= maxLines) {
    return gitDiff;
  }

  // Keep header lines and first portion of changes
  const headerLines = lines.filter(line => 
    line.startsWith('diff --git') || 
    line.startsWith('index ') || 
    line.startsWith('+++') || 
    line.startsWith('---') ||
    line.startsWith('@@')
  );

  const changeLines = lines.filter(line => 
    line.startsWith('+') && !line.startsWith('+++') ||
    line.startsWith('-') && !line.startsWith('---')
  );

  const truncatedChanges = changeLines.slice(0, maxLines - headerLines.length);
  
  return [...headerLines, ...truncatedChanges, '...'].join('\n');
}

/**
 * Clean and validate generated commit message
 */
function cleanCommitMessage(message: string): string {
  // Remove quotes, extra whitespace, and newlines
  let cleaned = message.trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\n.*/s, '') // Remove everything after first newline
    .trim();

  // Ensure it's not too long
  if (cleaned.length > 72) {
    cleaned = cleaned.substring(0, 69) + '...';
  }

  return cleaned;
}

/**
 * Generate fallback commit message when LLM fails
 */
// Fallback message generation removed to enforce LLM-only commit messages