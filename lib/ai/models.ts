// AI model registry — composer picker + OpenAI routing
export type AiModelId =
  | 'auto'
  | 'cursor-grok-4.6'
  | 'composer-2.5'
  | 'claude-opus-5'
  | 'gpt-5.6-sol'

export interface AiModel {
  id: AiModelId
  label: string // Full name in the list
  shortLabel: string // Compact trigger label
  badge?: string // Muted performance tag (Cursor-style)
  description: string // Shown in the picker header
  openaiModel: string // Resolved OpenAI model id
}

export const AI_MODELS: AiModel[] = [
  {
    id: 'auto',
    label: 'Auto',
    shortLabel: 'Auto',
    description: 'Balanced quality and speed, recommended for most tasks.',
    openaiModel: 'gpt-4o-mini',
  },
  {
    id: 'cursor-grok-4.6',
    label: 'Cursor Grok 4.6',
    shortLabel: 'Grok 4.6',
    badge: 'High Fast',
    description: 'Fast reasoning with strong depth for complex board edits.',
    openaiModel: 'gpt-4o',
  },
  {
    id: 'composer-2.5',
    label: 'Composer 2.5',
    shortLabel: 'Composer',
    badge: 'Fast',
    description: 'Low-latency replies for quick questions and summaries.',
    openaiModel: 'gpt-4o-mini',
  },
  {
    id: 'claude-opus-5',
    label: 'Claude Opus 5',
    shortLabel: 'Opus 5',
    badge: 'High',
    description: 'Highest quality for nuanced writing and careful edits.',
    openaiModel: 'gpt-4o',
  },
  {
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    shortLabel: 'GPT-5.6',
    badge: 'Medium',
    description: 'Solid general-purpose balance between speed and depth.',
    openaiModel: 'gpt-4o',
  },
]

export const NN_AI_MODEL_KEY = 'nodnotes-ai-model-id'

export function getAiModel(id: string): AiModel {
  return AI_MODELS.find((m) => m.id === id) ?? AI_MODELS[0]
}

export function isAiModelId(value: string): value is AiModelId {
  return AI_MODELS.some((m) => m.id === value)
}

export function resolveOpenAiModel(id: string): string {
  return getAiModel(id).openaiModel
}

export function loadAiModelId(): AiModelId {
  if (typeof window === 'undefined') return 'auto'
  try {
    const raw = localStorage.getItem(NN_AI_MODEL_KEY)
    return raw && isAiModelId(raw) ? raw : 'auto'
  } catch {
    return 'auto'
  }
}

export function saveAiModelId(id: AiModelId): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(NN_AI_MODEL_KEY, id)
  } catch {
    // Quota / private mode
  }
}
