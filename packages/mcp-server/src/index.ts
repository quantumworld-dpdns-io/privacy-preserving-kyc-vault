import { MCPServer, Tool, Resource, Prompt } from './mcp.js';

const server = new MCPServer({
  name: 'kyc-vault-mcp',
  version: '0.1.0',
});

server.addTool({
  name: 'resolve_did',
  description: 'Resolve a DID to its DID Document',
  inputSchema: {
    type: 'object',
    properties: {
      did: { type: 'string', description: 'The DID to resolve' },
    },
    required: ['did'],
  },
  handler: async (args) => {
    return `Resolved DID: ${args.did}`;
  },
});

server.addTool({
  name: 'verify_credential',
  description: 'Verify a Verifiable Credential',
  inputSchema: {
    type: 'object',
    properties: {
      credential: { type: 'object', description: 'The credential JSON' },
    },
    required: ['credential'],
  },
  handler: async (args) => {
    return `Verified credential for subject`;
  },
});

server.addTool({
  name: 'check_kyc_status',
  description: 'Check KYC verification status for a DID',
  inputSchema: {
    type: 'object',
    properties: {
      did: { type: 'string', description: 'Subject DID' },
    },
    required: ['did'],
  },
  handler: async (args) => {
    return `KYC status for ${args.did}`;
  },
});

server.addResource({
  uri: 'did://{did}',
  name: 'DID Document',
  handler: async (uri) => {
    const did = uri.replace('did://', '');
    return `DID Document for ${did}`;
  },
});

server.start();
console.log('MCP Server started');
