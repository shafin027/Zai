const n8nMcp = require('n8n-mcp');
const NodeRepository = require('n8n-mcp/dist/loaders/node-repository').NodeRepository;
const MCPEngine = require('n8n-mcp/dist/mcp-tools-engine').MCPEngine;
const fs = require('fs');

async function validate() {
  const repo = new NodeRepository({});
  await repo.initialize();
  console.log('Repo initialized, node count:', await repo.getNodeCount());
  
  const engine = new MCPEngine(repo);
  
  const code = fs.readFileSync('/tmp/workflow.js', 'utf8');
  
  try {
    const result = await engine.validateWorkflow({ workflow: code });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Validation error:', err);
  }
}

validate();
