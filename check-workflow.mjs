import workflowSdk from '@n8n/workflow-sdk';
const { workflow, node, trigger, expr, newCredential } = workflowSdk;

const cron = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: { name: 'Cron', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 21 * * *', timezone: 'Asia/Dhaka' }] } } },
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

const wf = workflow('test', 'Test')
  .add(cron)
  .to(listTours);

console.log('toJSON():', wf.toJSON());
