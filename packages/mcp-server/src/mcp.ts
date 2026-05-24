export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export interface Resource {
  uri: string;
  name: string;
  handler: (uri: string) => Promise<string>;
}

export interface PromptTemplate {
  name: string;
  description: string;
  template: string;
}

interface MCPServerConfig {
  name: string;
  version: string;
}

export class MCPServer {
  private tools: Map<string, Tool> = new Map();
  private resources: Map<string, Resource> = new Map();
  private prompts: Map<string, PromptTemplate> = new Map();

  constructor(private config: MCPServerConfig) {}

  addTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  addResource(resource: Resource): void {
    this.resources.set(resource.uri, resource);
  }

  addPrompt(prompt: PromptTemplate): void {
    this.prompts.set(prompt.name, prompt);
  }

  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  getResources(): Resource[] {
    return Array.from(this.resources.values());
  }

  getPrompts(): PromptTemplate[] {
    return Array.from(this.prompts.values());
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool not found: ${name}`);
    return tool.handler(args);
  }

  start(): void {
    if (process.argv.includes('--stdio')) {
      this.startStdio();
    } else {
      this.startSSE();
    }
  }

  private startStdio(): void {
    process.stdin.on('data', async (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === 'tools/list') {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          result: { tools: this.getTools() },
        }) + '\n');
      }
    });
  }

  private startSSE(): void {
    console.log('SSE transport not implemented in this version');
  }
}
