import OpenAI from 'openai'

/** Lazy OpenAI client so `next build` can collect route data without env present at import time. */
export function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  return new OpenAI({ apiKey })
}
