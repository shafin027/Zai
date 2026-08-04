import { MCPEngine } from 'n8n-mcp/dist/mcp-tools-engine.js';
import { NodeRepository } from 'n8n-mcp/dist/loaders/node-repository.js';
import { readFileSync } from 'fs';

async function validate() {
  const repo = new NodeRepository({});
  await repo.initialize();
  console.log('Repo initialized, node count:', await repo.getNodeCount());
  
  const engine = new MCPEngine(repo);
  
  const workflow = JSON.parse(readFileSync('/tmp/workflow-built.json', 'utf8'));
  
  try {
    const result = await engine.validateWorkflow({ workflow, options: { validateNodes: true, validateConnections: true, validateExpressions: true, profile: 'runtime' } });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Validation error:', err);
  }
}

validate();
