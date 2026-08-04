import workflowSdk from '@n8n/workflow-sdk';
import { writeFileSync } from 'fs';
const { 
  workflow, 
  trigger, 
  node, 
  expr, 
  newCredential, 
  validateWorkflow 
} = workflowSdk;

// Build the workflow using SDK functions directly
const cron = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Cron 21:00 BDT',
    parameters: {
      rule: {
        interval: [
          {
            field: 'cronExpression',
            expression: '0 21 * * *',
            timezone: 'Asia/Dhaka'
          }
        ]
      }
    }
  },
  output: [{}]
});

const listTours = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'List Active Tours',
    parameters: {
      method: 'GET',
      url: expr("{{ $env.SUPABASE_URL }}/rest/v1/v_tour_summary?status=eq.active&select=tour_id,owner_id,name,nickname,currency,total_pot_cents,spent_cents,repaid_cents,leftover_cents"),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'apikey', value: expr('{{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
        { name: 'Authorization', value: expr('Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}') }
      ] },
      options: { response: { response: { responseFormat: 'json' } }, timeout: 15000 }
    },
    executeOnce: true,
    onError: 'continueErrorOutput'
  },
  output: [{ tour_id: '00000000-0000-0000-0000-000000000000', name: '', owner_id: '00000000-0000-0000-0000-000000000000' }]
});

const pickFirstTour = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Pick First Tour',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const list = $input.first().json || [];\n" +
        "const tour = Array.isArray(list) ? list[0] : null;\n" +
        "if (!tour) { return [{ json: { _skip: true } }]; }\n" +
        "return [{ json: tour }];"
    }
  },
  output: [{ tour_id: '', name: '', owner_id: '' }]
});

const loadOwner = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Load Owner Profile',
    parameters: {
      method: 'GET',
      url: expr("{{ $env.SUPABASE_URL }}/rest/v1/profiles?select=telegram_id,locale,first_name&id=eq.{{ $json.owner_id }}"),
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'apikey', value: expr('{{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
        { name: 'Authorization', value: expr('Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}') }
      ] },
      options: { response: { response: { responseFormat: 'json' } }, timeout: 10000 }
    },
    executeOnce: true,
    onError: 'continueErrorOutput'
  },
  output: [{ telegram_id: 0, locale: 'en', first_name: '' }]
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
        "const t = $('Pick First Tour').item.json || {};\n" +
        "const o = $('Load Owner Profile').item.json[0] || {};\n" +
        "const ccy = t.currency || 'BDT';\n" +
        "const fmt = (n) => ccy + ' ' + Math.round((n||0)/100).toLocaleString('en-US');\n" +
        "const left = Number(t.leftover_cents || 0);\n" +
        "const leftTxt = left >= 0 ? fmt(left) : 'short ' + fmt(-left);\n" +
        "const text = `Today on tour ${t.name || ''}. Spend ${fmt(t.spent_cents)}, repaid ${fmt(t.repaid_cents)}, leftover ${leftTxt}.`;\n" +
        "const lang = o.locale || 'en';\n" +
        "return [{ json: { chatId: o.telegram_id, lang, text } }];"
    }
  },
  output: [{ chatId: 0, lang: 'en', text: '' }]
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
      headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr(
        "={{ JSON.stringify({ input: { ssml: '<speak>' + $('Compose Text').item.json.text.replace(/[<>]/g, c => ({'<':'&lt;','>':'&gt;'}[c])) + '</speak>' }, voice: { languageCode: $('Compose Text').item.json.lang === 'bn' ? 'bn-IN' : 'en-IN', name: $('Compose Text').item.json.lang === 'bn' ? 'bn-IN-Standard-A' : 'en-IN-Neural2-A' }, audioConfig: { audioEncoding: 'MP3' } }) }}"
      ),
      options: {
        response: { response: { responseFormat: 'json', neverError: true } },
        timeout: 15000
      }
    },
    onError: 'continueErrorOutput'
  },
  output: [{ audioContent: '' }]
});

const wrapBinary = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Wrap Audio Binary',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode:
        "const b64 = $input.first().json.audioContent || '';\n" +
        "if (!b64) throw new Error('no-audio');\n" +
        "const buf = Buffer.from(b64, 'base64');\n" +
        "return [{ json: $input.first().json }, { binary: { data: { data: buf.toString('base64'), mimeType: 'audio/mpeg', fileName: 'tour.mp3' } } }];"
    },
    onError: 'continueErrorOutput'
  },
  output: [{ binary: { data: { data: '', mimeType: 'audio/mpeg' } } }]
});

const send = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Daily Voice',
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

const emptyNoOp = node({
  type: 'n8n-nodes-base.limit',
  version: 1,
  config: {
    name: 'Empty (no tours)',
    parameters: {
      maxItems: 0
    }
  },
  output: []
});

const wf = workflow('cofre-tour-daily-summary', 'Cofre Tour Daily Summary')
  .add(cron)
  .to(listTours)
  .to(pickFirstTour)
  .to(loadOwner)
  .to(compose)
  .to(synth)
  .to(wrapBinary)
  .to(send)
  .add(emptyNoOp);

listTours.onError(emptyNoOp);
loadOwner.onError(emptyNoOp);
compose.onError(emptyNoOp);
synth.onError(emptyNoOp);
wrapBinary.onError(emptyNoOp);
send.onError(emptyNoOp);

try {
  const built = wf.toJSON();
  
  // Save for n8n-mcp
  writeFileSync('/tmp/workflow-built-fixed.json', JSON.stringify(built, null, 2));
  
  // Validate with SDK
  const result = await validateWorkflow(built, { profile: 'runtime' });
  console.log('=== SDK Validation Result ===');
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error('Validation error:', err);
}
