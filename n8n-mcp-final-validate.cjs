const { readFileSync } = require('fs');
const { spawn } = require('child_process');

async function validate() {
  const workflow = JSON.parse(readFileSync('/tmp/workflow-built-fixed.json', 'utf8'));
  
  const server = spawn('npx', ['n8n-mcp'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, AUTH_TOKEN: 'test-token-12345678901234567890123456789012' }
  });
  
  let output = '';
  let errorOutput = '';
  
  server.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  server.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });
  
  // Send initialize request
  const initRequest = {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    },
    id: 1
  };
  
  server.stdin.write(JSON.stringify(initRequest) + '\n');
  
  // Wait a bit then send validate_workflow
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const validateRequest = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'validate_workflow',
      arguments: { 
        workflow, 
        options: { validateNodes: true, validateConnections: true, validateExpressions: true, profile: 'runtime' } 
      }
    },
    id: 2
  };
  
  server.stdin.write(JSON.stringify(validateRequest) + '\n');
  
  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  server.stdin.end();
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Parse the response
  const lines = output.trim().split('\n');
  for (const line of lines) {
    if (line.startsWith('{"result":{"content')) {
      try {
        const parsed = JSON.parse(line);
        const content = parsed.result.content[0].text;
        console.log('=== n8n-mcp Validation Result ===');
        console.log(content);
        break;
      } catch (e) {
        // Ignore parse errors
      }
    }
  }
}

validate();
