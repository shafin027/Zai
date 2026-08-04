// cofre-telegram-text-ledger-trigger.js — Telegram Trigger (long polling) version.
// No webhook / BotFather setup needed; n8n polls Telegram directly.

import {
  workflow,
  trigger,
  node,
  ifElse,
  expr,
  nodeJson
} from '@n8n/workflow-sdk';

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
      chatId: expr("={{ $json.message.chat.id }}"),
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
      chatId: expr("={{ $json.message.chat.id }}"),
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
        "={{ JSON.stringify({ model: 'anthropic/claude-sonnet-4.5', temperature: 0, max_tokens: 600, messages: [{ role: 'system', content: 'You are cofre intent extractor. Resolve counterparty names only against knownFriends. Resolve tour_nickname only against activeTours. Return strict JSON only. Shape: { actions: [{ kind: expense|lend|borrow|settle|unknown, amount_cents?:number, currency?:string, counterparty_name?:string, tour_nickname?:string, assign_to_member_name?:string, memo:string, confidence:number, followup_question?:string }], language: en|bn }' }, { role: 'user', content: 'TRANSCRIPT: ' + $('Gather Intent Context').item.json.transcript + '\\nLOCALE: ' + $('Gather Intent Context').item.json.user.locale + '\\nCURRENCY: ' + $('Gather Intent Context').item.json.user.default_currency + '\\nFRIENDS: ' + JSON.stringify($('Gather Intent Context').item.json.friends) + '\\nTOURS: ' + JSON.stringify($('Gather Intent Context').item.json.tours) }] }) }}"
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
          leftValue: expr("={{ $('Parse Intent JSON').item.json.actions[0].kind }}"),
          rightValue: 'unknown',
          operator: { type: 'string', operation: 'notEquals' }
        }]
      }
    }
  },
  output: [{}]
});

const buildRow = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Row',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const parsed = $('Parse Intent JSON').item.json;\n" +
        "const ctx = $('Gather Intent Context').item.json;\n" +
        "const a = (parsed.actions || [])[0] || { kind: 'unknown' };\n" +
        "const row = {\n" +
        "  owner_id: ctx.user.id,\n" +
        "  counterparty_id: null,\n" +
        "  kind: a.kind,\n" +
        "  amount_cents: a.amount_cents,\n" +
        "  currency: a.currency || ctx.user.default_currency || 'BDT',\n" +
        "  occurred_at: new Date().toISOString(),\n" +
        "  memo: a.memo || '',\n" +
        "  source: 'telegram',\n" +
        "  confirmed_by_owner: Number(a.confidence || 0) >= 0.7,\n" +
        "  raw_transcript: ctx.transcript\n" +
        "};\n" +
        "return [{ json: row }];"
    }
  },
  output: [{ owner_id: '00000000-0000-0000-0000-000000000000', kind: 'expense' }]
});

const writeEntries = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Write Entries (Supabase)',
    parameters: {
      method: 'POST',
      url: expr("={{ $env.SUPABASE_URL }}/rest/v1/entries"),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'apikey', value: expr('={{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
        { name: 'Authorization', value: expr('={{ \'Bearer \' + $env.SUPABASE_SERVICE_ROLE_KEY }}') },
        { name: 'Content-Type', value: 'application/json' }
      ] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("={{ JSON.stringify([$('Build Row').item.json]) }}"),
      options: { response: { response: { responseFormat: 'json' } }, timeout: 15000 }
    },
    onError: 'continueErrorOutput'
  },
  output: []
});

const composeConfirmation = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Compose Confirmation',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const intent = $input.first().json || { actions: [{ kind: 'unknown' }], language: 'en' };\n" +
        "const a = (intent.actions || [])[0] || { kind: 'unknown' };\n" +
        "const locale = intent.language || 'en';\n" +
        "const user = $('Gather Intent Context').item.json.user || {};\n" +
        "const ccy = a.currency || user.default_currency || 'BDT';\n" +
        "const fmt = (n) => n == null ? '' : ((n/100).toLocaleString('en-US', { maximumFractionDigits: 2 }));\n" +
        "const cp = a.counterparty_name || '';\n" +
        "const amount = ccy + ' ' + fmt(a.amount_cents);\n" +
        "let text;\n" +
        "if (locale === 'bn') {\n" +
        "  if (a.kind === 'lend') text = (cp || 'ওনাকে') + ' ' + amount + ' ধার দিয়েছ। মনে রাখলাম।';\n" +
        "  else if (a.kind === 'borrow') text = (cp || 'ওনার থেকে') + ' ' + amount + ' ধার নিয়েছ। পরে জানাবে।';\n" +
        "  else if (a.kind === 'settle') text = amount + ' শোধ করলে।';\n" +
        "  else if (a.kind === 'expense') text = amount + ' খরচ। মনে রাখলাম।';\n" +
        "  else text = a.followup_question || 'আরেকটু পরিষ্কার বলবেন?';\n" +
        "} else {\n" +
        "  if (a.kind === 'lend') text = 'Logged. Lent ' + amount + ' to ' + (cp || 'them') + '.';\n" +
        "  else if (a.kind === 'borrow') text = 'Logged. Borrowed ' + amount + ' from ' + (cp || 'them') + '.';\n" +
        "  else if (a.kind === 'settle') text = 'Logged. Settled ' + amount + '.';\n" +
        "  else if (a.kind === 'expense') text = 'Logged. ' + amount + ' spent.';\n" +
        "  else text = a.followup_question || 'Could you say that again, please?';\n" +
        "}\n" +
        "const chatId = nodeJson(tgTrigger, 'message.chat.id');\n" +
        "return [{ json: { chatId, text, lang: locale } }];"
    }
  },
  output: [{ chatId: 0, text: '', lang: 'en' }]
});

const sendReply = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Reply',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr("={{ $('Compose Confirmation').item.json.chatId }}"),
      text: expr("={{ $('Compose Confirmation').item.json.text }}"),
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

export default workflow('cofre-telegram-text-ledger-trigger', 'Cofre Telegram Text Ledger (Trigger)')
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
          .to(composeConfirmation)
          .to(sendReply)
          .to(respondOK)
      )
      .onFalse(
        composeConfirmation
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
sendReply.onError(respondError);
