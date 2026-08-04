// cofre-notify.js — counterparty voice-notification workflow.
//
// Triggered by `web/lib/n8n/notify.ts` POSTing to N8N_WEBHOOK_INGRESS_URL.
//   Webhook  ->  Verify HMAC  ->  Typing  ->  Compose  ->  Synthesize voice  ->  Send audio  ->  Respond 200
//
// Why no @n8n/n8n-nodes-langchain.agent: see cofre-voice-ledger.js header.
//
// Credentials used:
//   - "Telegram account" (type telegramApi)
//   - "OpenRouter" Bearer not used; this workflow only emits a fixed local copy.

import {
  workflow,
  trigger,
  node,
  expr,
  newCredential
} from '@n8n/workflow-sdk';

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Notify Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'cofre-notify',
      responseMode: 'responseNode',
      authentication: 'none',
      options: { rawBody: true }
    }
  },
  output: [{ headers: {}, body: {}, query: {} }]
});

const verifyHmac = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Verify HMAC',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const crypto = require('crypto');\n" +
        "const secret = process.env.N8N_SHARED_SECRET;\n" +
        "if (!secret) throw new Error('missing N8N_SHARED_SECRET');\n" +
        "const sig = ($input.first().json.headers && $input.first().json.headers['x-cofre-signature']) || '';\n" +
        "const body = JSON.stringify($input.first().json.body || {});\n" +
        "const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');\n" +
        "const provided = Buffer.from(sig, 'hex');\n" +
        "const safe = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);\n" +
        "if (!safe) throw new Error('bad-signature');\n" +
        "return [{ json: $input.first().json.body }];"
    },
    onError: 'continueErrorOutput'
  },
  output: [{ recipient: {}, origin: {}, kind: 'lend' }]
});

const typing = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Typing',
    parameters: {
      resource: 'message',
      operation: 'sendChatAction',
      chatId: expr("{{ $json.recipient.telegram_id }}"),
      action: 'record_voice',
      additionalFields: { appendAttribution: false }
    },
    credentials: { telegramApi: newCredential('Telegram account') },
    onError: 'continueErrorOutput'
  },
  output: [{ ok: true }]
});

const compose = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Compose Text',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const r = $input.first().json.recipient || {};\n" +
        "const o = $input.first().json.origin || {};\n" +
        "const k = $input.first().json.kind;\n" +
        "const loc = r.locale || 'en';\n" +
        "const name = o.first_name || 'them';\n" +
        "let text;\n" +
        "if (loc === 'bn') {\n" +
        "  text = k === 'lend'  ? `${name} তোমাকে টাকা ধার দিয়েছে। লেজারে যোগ হয়েছে।`\n" +
        "      : k === 'borrow' ? `তুমি ${name} থেকে ধার নিয়েছ। লেজারে যোগ হয়েছে।`\n" +
        "      :                 `তুমি ${name} কে শোধ করেছ।`;\n" +
        "} else {\n" +
        "  text = k === 'lend'  ? `${name} just lent you money. Logged in the ledger.`\n" +
        "      : k === 'borrow' ? `You just borrowed from ${name}. Logged in the ledger.`\n" +
        "      :                 `You just settled with ${name}.`;\n" +
        "}\n" +
        "return [{ json: { chatId: r.telegram_id, text, lang: loc } }];"
    }
  },
  output: [{ chatId: 0, text: '', lang: 'en' }]
});

const synth = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Synthesize Voice',
    parameters: {
      method: 'POST',
      url: expr("https://texttospeech.googleapis.com/v1/text:synthesize?key={{ $env.GOOGLE_TTS_API_KEY }}"),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'Content-Type', value: 'application/json' }
      ] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr("={{ JSON.stringify({ input: { ssml: '<speak>' + $('Compose Text').item.json.text.replace(/[<>]/g, c => ({'<':'&lt;','>':'&gt;'}[c])) + '</speak>' }, voice: { languageCode: $('Compose Text').item.json.lang === 'bn' ? 'bn-IN' : 'en-IN', name: $('Compose Text').item.json.lang === 'bn' ? 'bn-IN-Standard-A' : 'en-IN-Neural2-A' }, audioConfig: { audioEncoding: 'MP3' } }) }}"),
      options: {
        response: { response: { responseFormat: 'json', neverError: true } },
        timeout: 15000
      }
    },
    onError: 'continueErrorOutput'
  },
  output: [{ audioContent: '' }]
});

const writeTtsBinary = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Wrap Audio Binary',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const audioB64 = $input.first().json.audioContent || '';\n" +
        "if (!audioB64) throw new Error('no-audio');\n" +
        "const buf = Buffer.from(audioB64, 'base64');\n" +
        "return [{ json: $input.first().json }, { binary: { data: { data: buf.toString('base64'), mimeType: 'audio/mpeg', fileName: 'voice.mp3' } } }];"
    },
    onError: 'continueErrorOutput'
  },
  output: [{ binary: { data: { data: '', mimeType: 'audio/mpeg' } } }]
});

const sendVoice = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Voice',
    parameters: {
      resource: 'message',
      operation: 'sendAudio',
      chatId: expr("{{ $('Compose Text').item.json.chatId }}"),
      binaryData: true,
      binaryPropertyName: 'data',
      additionalFields: {
        caption: expr("{{ $('Compose Text').item.json.text }}"),
        appendAttribution: false
      }
    },
    credentials: { telegramApi: newCredential('Telegram account') },
    onError: 'continueErrorOutput'
  },
  output: [{ ok: true }]
});

const respondOK = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond 200',
    parameters: {
      respondWith: 'json',
      responseBody: expr("{{ JSON.stringify({ ok: true }) }}"),
      options: { responseCode: 200 }
    }
  },
  output: [{}]
});

const respondError = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond 500',
    parameters: {
      respondWith: 'json',
      responseBody: expr("{{ JSON.stringify({ ok: false }) }}"),
      options: { responseCode: 500 }
    }
  },
  output: [{}]
});

export default workflow('cofre-notify', 'Cofre Notify')
  .add(webhook)
  .to(verifyHmac)
  .to(typing)
  .to(compose)
  .to(synth)
  .to(writeTtsBinary)
  .to(sendVoice)
  .to(respondOK);

verifyHmac.onError(respondError);
typing.onError(respondError);
synth.onError(respondError);
writeTtsBinary.onError(respondError);
sendVoice.onError(respondError);
