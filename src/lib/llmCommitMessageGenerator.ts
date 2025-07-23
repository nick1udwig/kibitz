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
    console.log('🤖 Project settings for LLM:', {
      provider: projectSettings.provider,
      hasAnthropicKey: !!projectSettings.anthropicApiKey,
      hasOpenAIKey: !!projectSettings.openaiApiKey,
      hasOpenRouterKey: !!projectSettings.openRouterApiKey,
      model: projectSettings.model
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

    if (!projectSettings.provider) {
      console.warn('⚠️ No LLM provider configured');
      return {
        success: false,
        message: 'Auto-commit: changes detected',
        error: 'No LLM provider configured'
      };
    }

    // Get the appropriate API key based on provider
    const apiKey = getApiKeyForProvider(projectSettings);
    if (!apiKey?.trim()) {
      return {
        success: false,
        message: 'Auto-commit: changes detected',
        error: `No API key configured for provider: ${projectSettings.provider}`
      };
    }

    // For commit messages, always use optimized models for speed and cost efficiency
    const model = getCommitMessageModelForProvider(projectSettings.provider);

    // Format the prompt with diff data
    const prompt = COMMIT_MESSAGE_PROMPT
      .replace('{GIT_DIFF}', truncateGitDiff(request.gitDiff))
      .replace('{FILES_CHANGED}', request.filesChanged.slice(0, 5).join(', '))
      .replace('{LINES_ADDED}', request.linesAdded.toString())
      .replace('{LINES_REMOVED}', request.linesRemoved.toString());

    console.log(`🤖 Generating commit message using ${projectSettings.provider} (${model}) - optimized for commit tasks`);

    let generatedMessage: string;

    // Call the appropriate LLM provider
    switch (projectSettings.provider) {
      case 'anthropic':
        generatedMessage = await callAnthropicAPI(prompt, apiKey, model);
        break;
      case 'openai':
        generatedMessage = await callOpenAIAPI(prompt, apiKey, model);
        break;
      case 'openrouter':
        generatedMessage = await callOpenRouterAPI(prompt, apiKey, model);
        break;
      default:
        throw new Error(`Unsupported provider: ${projectSettings.provider}`);
    }

    // Clean and validate the generated message
    const cleanMessage = cleanCommitMessage(generatedMessage);

    console.log(`✅ Generated commit message: "${cleanMessage}"`);

    return {
      success: true,
      message: cleanMessage,
      provider: projectSettings.provider,
      model
    };

  } catch (error) {
    console.error('❌ Error generating LLM commit message:', error);
    
    // Return a fallback message
    const fallbackMessage = generateFallbackCommitMessage(request);
    
    return {
      success: false,
      message: fallbackMessage,
      error: error instanceof Error ? error.message : 'Unknown error',
      provider: projectSettings.provider,
      model: projectSettings.model
    };
  }
}

/**
 * Get API key for the configured provider
 */
function getApiKeyForProvider(settings: ProjectSettings): string | undefined {
  switch (settings.provider) {
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
function getDefaultModelForProvider(provider: string): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o';
    case 'openrouter':
      return 'openai/gpt-4-turbo-preview';
    case 'anthropic':
    default:
      return 'claude-3-5-haiku-20241022';
  }
}

/**
 * Get model specifically optimized for commit message generation
 * Uses fast, cost-effective models since commit messages are simple tasks
 */
function getCommitMessageModelForProvider(provider: string): string {
  switch (provider) {
    case 'anthropic':
      // Always use Haiku for Anthropic users - fast and cost-effective for commit messages
      return 'claude-3-5-haiku-20241022';
    case 'openai':
      return 'gpt-4o-mini'; // Use mini for cost efficiency
    case 'openrouter':
      return 'openai/gpt-4o-mini'; // Use mini for cost efficiency
    default:
      return 'claude-3-5-haiku-20241022';
  }
}

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

  // Ensure it's not empty
  if (!cleaned || cleaned.length < 3) {
    return 'Auto-commit: changes detected';
  }

  return cleaned;
}

/**
 * Generate fallback commit message when LLM fails
 */
function generateFallbackCommitMessage(request: CommitMessageRequest): string {
  const { filesChanged, linesAdded, linesRemoved } = request;

  // Try to determine commit type based on files
  const hasNewFiles = request.gitDiff.includes('+++ /dev/null');
  const hasDeletedFiles = request.gitDiff.includes('--- /dev/null');
  const hasDocChanges = filesChanged.some(f => f.includes('.md') || f.includes('README'));
  const hasConfigChanges = filesChanged.some(f => f.includes('.json') || f.includes('.config'));
  const hasTestChanges = filesChanged.some(f => f.includes('.test.') || f.includes('.spec.'));

  if (hasNewFiles) {
    return 'feat: add new files and functionality';
  } else if (hasDeletedFiles) {
    return 'refactor: remove unused files';
  } else if (hasDocChanges) {
    return 'docs: update documentation';
  } else if (hasConfigChanges) {
    return 'config: update configuration files';
  } else if (hasTestChanges) {
    return 'test: update tests';
  } else if (linesAdded > linesRemoved * 2) {
    return 'feat: implement new functionality';
  } else if (linesRemoved > linesAdded * 2) {
    return 'refactor: simplify and clean up code';
  } else {
    return `chore: update ${filesChanged.length} file${filesChanged.length !== 1 ? 's' : ''}`;
  }
} 