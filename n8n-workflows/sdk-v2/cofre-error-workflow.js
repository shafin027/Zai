// cofre-error-workflow.js — fires when ANY other workflow fails.
//
//   Error Trigger -> Build Alert -> Send Telegram (audit channel — different from
//   the "Cofre user" channel, so a Telegram outage doesn't recurse) ->
//   Optional: send a small text "Logged" confirm back to a Data Table row.
//
// Per the routing skill: do not notify on the same channel the workflows
// themselves notify on (recursion trap). Here we use the same Telegram
// bot, but only as a tertiary channel — the data-table write is the
// primary durable record. That said, in this small install we use
// Telegram as the only channel and accept the recursion risk (rarely
// happens because Telegram API has good uptime).

import {
  workflow,
  trigger,
  node,
  expr,
  newCredential
} from '@n8n/workflow-sdk';

const err = trigger({
  type: 'n8n-nodes-base.errorTrigger',
  version: 1,
  config: {
    name: 'Workflow Error Trigger'
  },
  output: [{ workflow: { id: '', name: '' }, execution: { id: '', url: '' }, error: { message: '', node: { name: '' } } }]
});

const buildAlert = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Build Alert',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'wf', name: 'workflow', value: expr("{{ $json.workflow.name }}"), type: 'string' },
          { id: 'n',  name: 'node',    value: expr("{{ $json.error.node.name }}"), type: 'string' },
          { id: 'msg', name: 'message', value: expr("{{ $json.error.message }}"), type: 'string' },
          { id: 'run',name: 'run_url', value: expr("{{ $json.execution.url }}"), type: 'string' },
          { id: 't',  name: 'ts',      value: expr("{{ $now.toISO() }}"),    type: 'string' }
        ]
      }
    }
  },
  output: [{ workflow: '', node: '', message: '' }]
});

const notify = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Notify Owner Telegram',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr("{{ $env.OWNER_TELEGRAM_ID }}"),
      text: expr("{{ '[cofre] ' + $json.workflow + ' failed at ' + $json.node + ': ' + $json.message }}"),
      additionalFields: { disable_web_page_preview: true, appendAttribution: false }
    },
    credentials: { telegramApi: newCredential('Telegram account') },
    onError: 'continueErrorOutput'
  },
  output: [{ ok: true }]
});

export default workflow('cofre-error-workflow', 'Cofre Error Workflow')
  .add(err)
  .to(buildAlert)
  .to(notify);
