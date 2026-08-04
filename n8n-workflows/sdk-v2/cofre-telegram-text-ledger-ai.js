// cofre-telegram-text-ledger-ai.js — Telegram Trigger + AI Agent for natural responses.
// Uses OpenRouter (Claude Sonnet) + Simple Memory for contextual, human-like replies.
// Text-only; voice deferred to voice-deferred/ folder.

import {
  workflow,
  trigger,
  node,
  ifElse,
  expr,
  nodeJson,
  languageModel,
  memory,
  outputParser
} from '@n8n/workflow-sdk';

// ============================================================
//  NODES
// ============================================================

const tgTrigger = trigger({
  type: 'n8n-nodes-base.telegramTrigger',
  version: 1.2,
  config: {
    name: 'Telegram Trigger',
    parameters: {
      updates: ['message'],
      additionalFields: {
        pollingInterval: 1000
      }
    },
    credentials: { telegramApi: { id: 'vyGmtlNUsTcVNcG2', name: 'Telegram account' } }
  },
  output: [{ message: { chat: { id: 0 }, from: { id: 0 }, text: '', message_id: 0 } }]
});

const ifStart = ifElse({
  version: 2.3,
  config: {
    name: 'Route /start?',
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
        combinator: 'and',
        conditions: [{
          id: 'is-start',
          leftValue: expr("={{ $json.message?.text || '' }}"),
          rightValue: '/start',
          operator: { type: 'string', operation: 'startsWith' }
        }]
      }
    }
  },
  output: [{}]
});

const typingStart = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Typing (start)',
    parameters: {
      resource: 'message',
      operation: 'sendChatAction',
      chatId: expr("={{ $('Telegram Trigger').item.json.message.chat.id }}"),
      action: 'typing',
      additionalFields: { appendAttribution: false }
    },
    credentials: { telegramApi: { id: 'vyGmtlNUsTcVNcG2', name: 'Telegram account' } }
  },
  output: [{ ok: true }]
});

const fetchLocale = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Fetch Sender Locale',
    parameters: {
      method: 'GET',
      url: expr("={{ $env.SUPABASE_URL }}/rest/v1/profiles?select=locale,first_name&telegram_id=eq.{{ $json.message.from.id }}"),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'apikey', value: expr('={{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
        { name: 'Authorization', value: expr('={{ \'Bearer \' + $env.SUPABASE_SERVICE_ROLE_KEY }}') }
      ] },
      options: { response: { response: { responseFormat: 'json', neverError: true } }, timeout: 10000 }
    },
    onError: 'continueErrorOutput'
  },
  output: [{ locale: 'en', first_name: '' }]
});

const composeWelcome = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Compose Welcome',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const list = $input.first().json || [];\n" +
        "const profile = Array.isArray(list) ? (list[0] || { locale: 'en', first_name: '' }) : { locale: 'en', first_name: '' };\n" +
        "const locale = profile.locale || 'en';\n" +
        "const name = profile.first_name || '';\n" +
        "const site = $env.NEXT_PUBLIC_SITE_URL || 'cofre.app';\n" +
        "const text = locale === 'bn'\n" +
        "  ? 'আসসালামু আলাইকুম' + (name ? ' ' + name : '') + '। Cofre-এ স্বাগতম। সরাসরি একটি ভয়েস নোট পাঠান। আমি বাংলা ও ইংরেজি দুটোতেই বুঝি। ওয়েবসাইট: ' + site\n" +
        "  : 'Welcome' + (name ? ', ' + name : '') + '. Cofre speaks Bangla and English. Send a voice note and I will log the entry. Website: ' + site;\n" +
        "const chatId = nodeJson(tgTrigger, 'message.chat.id');\n" +
        "return [{ json: { chatId, text } }];"
    }
  },
  output: [{ chatId: 0, text: '' }]
});

const sendWelcome = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Welcome',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr("={{ $json.chatId }}"),
      text: expr("={{ $json.text }}"),
      replyMarkup: 'none',
      additionalFields: { appendAttribution: false, disable_web_page_preview: true }
    },
    credentials: { telegramApi: { id: 'vyGmtlNUsTcVNcG2', name: 'Telegram account' } },
    onError: 'continueErrorOutput'
  },
  output: [{ ok: true }]
});

const typingEntry = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Typing (entry)',
    parameters: {
      resource: 'message',
      operation: 'sendChatAction',
      chatId: expr("={{ $('Telegram Trigger').item.json.message.chat.id }}"),
      action: 'typing',
      additionalFields: { appendAttribution: false }
    },
    credentials: { telegramApi: { id: 'vyGmtlNUsTcVNcG2', name: 'Telegram account' } }
  },
  output: [{ ok: true }]
});

const combineTranscript = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Combine Transcript',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const upstream = $input.first().json || {};\n" +
        "const message = upstream.message || {};\n" +
        "let transcript = upstream.text || '';\n" +
        "if (!transcript && message.text) transcript = message.text;\n" +
        "return [{ json: { message, message_id: message.message_id || 0, transcript, raw_transcript: transcript } }];"
    }
  },
  output: [{ message: {}, message_id: 0, transcript: '', raw_transcript: '' }]
});

const loadSenderContext = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Load Sender Context',
    parameters: {
      method: 'GET',
      url: expr("={{ $env.SUPABASE_URL }}/rest/v1/profiles?select=id,first_name,locale,default_currency&telegram_id=eq.{{ $json.message.from.id }}"),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'apikey', value: expr('={{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
        { name: 'Authorization', value: expr('={{ \'Bearer \' + $env.SUPABASE_SERVICE_ROLE_KEY }}') }
      ] },
      options: { response: { response: { responseFormat: 'json' } }, timeout: 10000 }
    },
    onError: 'continueErrorOutput'
  },
  output: [{ id: '', first_name: '', locale: 'en', default_currency: 'BDT' }]
});

const loadFriends = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Load Friends',
    parameters: {
      method: 'GET',
      url: expr("={{ $env.SUPABASE_URL }}/rest/v1/relations?select=friend:friend_id(first_name,last_name,telegram_username)&owner_id=eq.{{ $('Load Sender Context').item.json[0].id }}"),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'apikey', value: expr('={{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
        { name: 'Authorization', value: expr('={{ \'Bearer \' + $env.SUPABASE_SERVICE_ROLE_KEY }}') }
      ] },
      options: { response: { response: { responseFormat: 'json' } }, timeout: 10000 }
    },
    executeOnce: true,
    onError: 'continueErrorOutput'
  },
  output: []
});

const loadTours = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Load Active Tours',
    parameters: {
      method: 'GET',
      url: expr("={{ $env.SUPABASE_URL }}/rest/v1/tours?select=name,nickname&owner_id=eq.{{ $('Load Sender Context').item.json[0].id }}&status=eq.active"),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'apikey', value: expr('={{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
        { name: 'Authorization', value: expr('={{ \'Bearer \' + $env.SUPABASE_SERVICE_ROLE_KEY }}') }
      ] },
      options: { response: { response: { responseFormat: 'json' } }, timeout: 10000 }
    },
    executeOnce: true,
    onError: 'continueErrorOutput'
  },
  output: []
});

const gatherContext = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Gather Intent Context',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const user = $('Load Sender Context').item.json[0] || {};\n" +
        "const friends = $('Load Friends').item.json || [];\n" +
        "const tours = $('Load Active Tours').item.json || [];\n" +
        "const cur = $input.first().json;\n" +
        "const transcript = (cur && cur.transcript) || '';\n" +
        "if (!transcript) throw new Error('empty-transcript');\n" +
        "return [{ json: { transcript, user: { id: user.id || '', first_name: user.first_name || '', locale: user.locale || 'en', default_currency: user.default_currency || 'BDT' }, friends, tours } }];"
    }
  },
  output: [{ transcript: '', user: {}, friends: [], tours: [] }]
});

const extractIntent = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Extract Intent (OpenRouter Claude)',
    parameters: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'Content-Type', value: 'application/json' }
      ] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr(
        "={{ JSON.stringify({ model: 'anthropic/claude-sonnet-4.5', temperature: 0, max_tokens: 600, messages: [{ role: 'system', content: 'You are cofre intent extractor. Resolve counterparty names only against knownFriends. Resolve tour_nickname only against activeTours. Return strict JSON only. Shape: { actions: [{ kind: expense|lend|borrow|settle|unknown, amount_cents?:number, currency?:string, counterparty_name?:string, tour_nickname?:string, assign_to_member_name?:string, memo:string, confidence:number, followup_question?:string }], language: en|bn }' }, { role: 'user', content: 'TRANSCRIPT: ' + $json.transcript + '\\nLOCALE: ' + $('Gather Intent Context').item.json.user.locale + '\\nCURRENCY: ' + $('Gather Intent Context').item.json.user.default_currency + '\\nFRIENDS: ' + JSON.stringify($json.friends) + '\\nTOURS: ' + JSON.stringify($json.tours) }] }) }}"
      ),
      options: { response: { response: { responseFormat: 'json' } }, timeout: 30000 }
    },
    credentials: { httpBearerAuth: { id: 'UiaYctNyeOBrLvSo', name: 'OpenRouter account' } },
    onError: 'continueErrorOutput'
  },
  output: [{ choices: [{ message: { content: '{}' } }] }]
});

const parseIntentJson = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Parse Intent JSON',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const choices = ($input.first().json.choices || []);\n" +
        "const raw = (choices[0] && choices[0].message && choices[0].message.content) || '{}';\n" +
        "let parsed = { actions: [{ kind: 'unknown', memo: '', confidence: 0, followup_question: null }], language: 'en' };\n" +
        "try { const obj = JSON.parse(String(raw).replace(/```json/g, '').trim()); if (obj && Array.isArray(obj.actions)) parsed = obj; } catch (e) {}\n" +
        "return [{ json: parsed }];"
    }
  },
  output: [{ actions: [{ kind: 'unknown' }], language: 'en' }]
});

const ifActionable = ifElse({
  version: 2.3,
  config: {
    name: 'Actionable?',
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
        combinator: 'and',
        conditions: [{
          id: 'kind-known',
          leftValue: expr("={{ $json.actions && $json.actions[0] ? $('Parse Intent JSON').item.json.actions[0].kind : 'unknown' }}"),
          rightValue: 'unknown',
          operator: { type: 'string', operation: 'notEquals' }
        }]
      }
    }
  },
  output: [{}]
});

const buildRow = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Write Entries (Supabase Node)',
    parameters: {
      resource: 'row',
      operation: 'create',
      tableId: 'entries',
      dataToSend: 'defineBelow',
      fieldsUi: {
        fieldValues: [
          { fieldId: 'owner_id', fieldValue: expr("={{ $('Gather Intent Context').item.json.user.id }}") },
          { fieldId: 'counterparty_id', fieldValue: null },
          { fieldId: 'kind', fieldValue: expr("={{ $('Parse Intent JSON').item.json.actions[0].kind }}") },
          { fieldId: 'amount_cents', fieldValue: expr("={{ $('Parse Intent JSON').item.json.actions[0].amount_cents }}") },
          { fieldId: 'currency', fieldValue: expr("={{ $('Parse Intent JSON').item.json.actions[0].currency || $('Gather Intent Context').item.json.user.default_currency }}") },
          { fieldId: 'occurred_at', fieldValue: expr("={{ $now.toISOString() }}") },
          { fieldId: 'memo', fieldValue: expr("={{ $('Parse Intent JSON').item.json.actions[0].memo || $('Gather Intent Context').item.json.transcript }}") },
          { fieldId: 'source', fieldValue: 'telegram' },
          { fieldId: 'confirmed_by_owner', fieldValue: expr("={{ $('Parse Intent JSON').item.json.actions[0].confidence >= 0.7 }}") },
          { fieldId: 'raw_transcript', fieldValue: expr("={{ $('Gather Intent Context').item.json.transcript }}") }
        ]
      },
      options: { useCustomSchema: false, schema: 'public' }
    },
    credentials: { supabaseApi: { id: 'gaewtKQMg27QPCVM', name: 'Supabase account' } },
    onError: 'continueErrorOutput'
  },
  output: [{ created_at: '2026-08-04T00:00:00Z' }]
});

const writeEntries = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Write Entries (Supabase Node)',
    parameters: {
      resource: 'row',
      operation: 'create',
      tableId: 'entries',
      dataToSend: 'defineBelow',
      fieldsUi: {
        fieldValues: [
          { fieldId: 'owner_id', fieldValue: expr("={{ $('Build Row').item.json.owner_id }}") },
          { fieldId: 'counterparty_id', fieldValue: expr("={{ $('Build Row').item.json.counterparty_id }}") },
          { fieldId: 'kind', fieldValue: expr("={{ $('Build Row').item.json.kind }}") },
          { fieldId: 'amount_cents', fieldValue: expr("={{ $('Build Row').item.json.amount_cents }}") },
          { fieldId: 'currency', fieldValue: expr("={{ $('Build Row').item.json.currency }}") },
          { fieldId: 'occurred_at', fieldValue: expr("={{ $('Build Row').item.json.occurred_at }}") },
          { fieldId: 'memo', fieldValue: expr("={{ $('Build Row').item.json.memo }}") },
          { fieldId: 'source', fieldValue: 'telegram' },
          { fieldId: 'confirmed_by_owner', fieldValue: expr("={{ $('Build Row').item.json.confirmed_by_owner }}") },
          { fieldId: 'raw_transcript', fieldValue: expr("={{ $('Build Row').item.json.raw_transcript }}") },
          { fieldId: 'tour_id', fieldValue: expr("={{ $('Build Row').item.json.tour_id || null }}") }
        ]
      },
      options: { useCustomSchema: false, schema: 'public' }
    },
    credentials: { supabaseApi: { id: 'gaewtKQMg27QPCVM', name: 'Supabase account' } },
    onError: 'continueErrorOutput'
  },
  output: [{ created_at: '2026-08-04T00:00:00Z' }]
});

const checkCreateRelation = node({
  type: 'n8n-nodes-base.supabase',
  version: 1,
  config: {
    name: 'Check/Create Relation',
    parameters: {
      resource: 'row',
      operation: 'upsert',
      tableId: 'relations',
      dataToSend: 'defineBelow',
      fieldsUi: {
        fieldValues: [
          { fieldId: 'owner_id', fieldValue: expr("={{ $('Gather Intent Context').item.json.user.id }}") },
          { fieldId: 'friend_id', fieldValue: expr("={{ (() => { const cp = $('Parse Intent JSON').item.json.actions[0].counterparty_name; if (!cp) return null; const friends = $('Gather Intent Context').item.json.friends || []; const match = friends.find(f => f.friend?.first_name?.toLowerCase() === cp.toLowerCase() || f.friend?.telegram_username?.toLowerCase() === cp.toLowerCase()); return match?.friend?.id || null; })() }}") },
          { fieldId: 'status', fieldValue: 'pending' },
          { fieldId: 'invite_token', fieldValue: expr("={{ (() => { const crypto = require('crypto'); return crypto.randomBytes(16).toString('hex'); })() }}") }
        ]
      },
      options: {
        useCustomSchema: false,
        schema: 'public',
        upsertOptions: {
          onConflict: 'owner_id,friend_id',
          ignoreDuplicate: false
        }
      }
    },
    credentials: { supabaseApi: { id: 'gaewtKQMg27QPCVM', name: 'Supabase account' } },
    onError: 'continueErrorOutput'
  },
  output: [{ id: 0, owner_id: '', friend_id: '', status: 'pending', invite_token: '' }]
});

// ============================================================
//  AI AGENT FOR NATURAL RESPONSE GENERATION
// ============================================================

const openRouterModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenRouter',
  version: 1,
  config: {
    name: 'OpenRouter Model (Claude Sonnet)',
    credentials: { openRouterApi: { id: 'UiaYctNyeOBrLvSo', name: 'OpenRouter account' } },
    parameters: {
      model: 'inclusionai/ling-3.0-flash:free',
      temperature: 0.7,
      maxTokens: 300,
      options: {
        frequencyPenalty: 0.2,
        presencePenalty: 0.2
      }
    }
  }
});

const simpleMemory = memory({
  type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
  version: 1.4,
  config: {
    name: 'Conversation Memory',
    parameters: {
      sessionIdType: 'customKey',
      sessionKey: expr("={{ $('Telegram Trigger').item.json.message.chat.id }}"),
      contextWindowLength: 5
    }
  }
});

const responseParser = outputParserStructured({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1,
  config: {
    name: 'Response Parser',
    parameters: {
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The natural response text to send to user' },
          language: { type: 'string', enum: ['en', 'bn'], description: 'Language of response' }
        },
        required: ['text', 'language']
      }
    }
  }
});


const aiResponseAgent = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'AI Response Agent',
    parameters: {
      promptType: 'define',
      text: expr(
        "={{ 'You are Cofre, a friendly personal finance assistant for Bangla and English speakers. '\n" +
        "+ 'Generate a brief, natural, conversational confirmation message based on the action below. '\n" +
        "+ 'Match the user\\'s language (Bangla or English). Keep it under 160 chars. '\n" +
        "+ 'No emojis. No markdown. One human breath.\\n\\n'\n" +
        "+ 'USER: ' + $('Gather Intent Context').item.json.user.first_name + ' (locale: ' + $('Gather Intent Context').item.json.user.locale + ')\\n'\n" +
        "+ 'ACTION: ' + $('Parse Intent JSON').item.json.actions[0].kind + '\\n'\n" +
        "+ 'AMOUNT: ' + ($('Parse Intent JSON').item.json.actions[0].amount_cents / 100) + ' ' + ($('Parse Intent JSON').item.json.actions[0].currency || $('Gather Intent Context').item.json.user.default_currency) + '\\n'\n" +
        "+ 'COUNTERPARTY: ' + ($('Parse Intent JSON').item.json.actions[0].counterparty_name || 'none') + '\\n'\n" +
        "+ 'TOUR: ' + ($('Parse Intent JSON').item.json.actions[0].tour_nickname || 'none') + '\\n'\n" +
        "+ 'MEMO: ' + ($('Parse Intent JSON').item.json.actions[0].memo || '') + '\\n\\n'\n" +
        "+ 'DO NOT include any JSON formatting, braces, or labels in the final reply. Just return the plain text message as text, and the language code separately. Example reply text: Logged. Lent BDT 500 to Raihan. Example language: en' }}"
      ),
      hasOutputParser: true,
      options: {
        systemMessage: 'You are Cofre, a real human friend who helps with personal finances. You speak naturally — brief, warm, conversational — never robotic. Confirm each entry as a person would talk. Use Bangla or English based on the user's locale. Keep it under 160 chars. No JSON objects in the reply — just a plain text message like: 'Got it! Lent BDT 500 to Raihan.' or 'Logged! Spent BDT 200 for lunch.' Sound like a human, not a bot.',
        maxIterations: 3,
        enableStreaming: false
      }
    },
    subnodes: {
      model: openRouterModel,
      memory: simpleMemory,
      outputParser: responseParser
    }
  },
  output: [{ output: { text: '', language: 'en' } }]
});

const sendReply = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Reply',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr("={{ $('Telegram Trigger').item.json.message.chat.id }}"),
      text: expr("={{ $('AI Response Agent').item.json.output.text }}"),
      additionalFields: { disable_web_page_preview: true, appendAttribution: false }
    },
    credentials: { telegramApi: { id: 'vyGmtlNUsTcVNcG2', name: 'Telegram account' } },
    onError: 'continueErrorOutput'
  },
  output: [{ ok: true }]
});

const respondOK = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: {
    name: 'End OK',
    parameters: {}
  },
  output: [{}]
});

const respondError = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond 500 (unused)',
    parameters: {
      respondWith: 'json',
      responseBody: expr("={{ JSON.stringify({ ok: false, error: $json.message || 'unknown' }) }}"),
      options: { responseCode: 500 }
    }
  },
  output: [{}]
});

// ============================================================
//  COMPOSE
// ============================================================

export default workflow('cofre-telegram-text-ledger-ai', 'Cofre Telegram Text Ledger (AI)')
  .add(tgTrigger)
  .to(ifStart)
  .onTrue(
    typingStart
      .to(fetchLocale)
      .to(composeWelcome)
      .to(sendWelcome)
      .to(respondOK)
  )
  .onFalse(
    typingEntry
      .to(combineTranscript)
      .to(loadSenderContext)
      .to(loadFriends)
      .to(loadTours)
      .to(gatherContext)
      .to(extractIntent)
      .to(parseIntentJson)
      .to(ifActionable)
      .onTrue(
        buildRow
          .to(writeEntries)
          .to(checkCreateRelation)
          .to(aiResponseAgent)
          .to(sendReply)
          .to(respondOK)
      )
      .onFalse(
        aiResponseAgent
          .to(sendReply)
          .to(respondOK)
      )
  );

ifStart.onError(respondError);
fetchLocale.onError(respondError);
sendWelcome.onError(respondError);
loadSenderContext.onError(respondError);
loadFriends.onError(respondError);
loadTours.onError(respondError);
gatherContext.onError(respondError);
extractIntent.onError(respondError);
buildRow.onError(respondError);
writeEntries.onError(respondError);
checkCreateRelation.onError(respondError);
aiResponseAgent.onError(respondError);
sendReply.onError(respondError);