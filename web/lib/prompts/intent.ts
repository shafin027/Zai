// Intent extraction prompt. Compiled once and reused with temperature=0.
// Input: transcribed text + the current user's profile (so we can ground names).
// Output: typed JSON for ledger entries OR a clarifying question.
//
// We expose two system-prompt builders depending on whether the original
// audio was Bengali. Both share the same JSON schema.

import fs from 'node:fs/promises';

export const INTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['expense', 'lend', 'borrow', 'settle', 'unknown'] },
          amount_cents: { type: ['number', 'null'] },
          currency: { type: ['string', 'null'] },
          counterparty_name: { type: ['string', 'null'] },
          tour_nickname: { type: ['string', 'null'] },
          assign_to_member_name: { type: ['string', 'null'] },
          memo: { type: 'string' },
          confidence: { type: 'number' },
          followup_question: { type: ['string', 'null'] }
        },
        required: ['kind', 'memo', 'confidence']
      }
    },
    language: { type: 'string', enum: ['en', 'bn'] }
  },
  required: ['actions', 'language']
} as const;

export type IntentInput = {
  transcript: string;
  userLocale: 'en' | 'bn';
  knownFriends: { first_name: string; last_name?: string | null; telegram_username?: string | null }[];
  activeTours: { name: string; nickname: string | null }[];
  defaultCurrency: string;
};

export async function loadPrompt() {
  const p = process.cwd() + '/lib/prompts/intent.system.md';
  return await fs.readFile(p, 'utf8');
}

export function userPayload(input: IntentInput) {
  const friends = input.knownFriends
    .map((f) => `- ${[f.first_name, f.last_name].filter(Boolean).join(' ')}${f.telegram_username ? ` (@${f.telegram_username})` : ''}`)
    .join('\n');
  const tours = (input.activeTours ?? [])
    .map((t) => `- ${t.name}${t.nickname ? ` (nickname: ${t.nickname})` : ''}`)
    .join('\n');
  return `
# User transcript
"""
${input.transcript}
"""

# User's locale
${input.userLocale}

# Known friends (only people in this list can be referenced as counterparty)
${friends || '(none yet)'}

# Active tours (when the user says the tour nickname, set tour_nickname)
${tours || '(none yet)'}

# Default currency
${input.defaultCurrency}

Return JSON matching the schema. Use 'unknown' if the instruction is ambiguous or you cannot identify a counterparty. Always set confidence 0..1.
`.trim();
}
