#!/usr/bin/env node
/** sotto-mcp-server: pay for web resources confidentially, within an owner-set policy, over stdio. */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { clientFromEnv } from "./config.js";
import { registerTools } from "./tools.js";

const server = new McpServer({ name: "sotto-mcp-server", version: "0.0.1" });
const client = await clientFromEnv();
registerTools(server, client);
await server.connect(new StdioServerTransport());
console.error(`sotto-mcp-server ready (agent ${client.config.agentId})`);
