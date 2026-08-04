import workflowSdk from '@n8n/workflow-sdk';
import { readFileSync } from 'fs';

const code = readFileSync('/Users/shafin.mahamud/Documents/Claude/Personal Project/n8n-workflows/sdk-v2/cofre-tour-daily-summary.js', 'utf8');

try {
  const workflow = await workflowSdk.compile(code);
  console.log(JSON.stringify(workflow, null, 2));
} catch (err) {
  console.error('Compilation error:', err);
}
