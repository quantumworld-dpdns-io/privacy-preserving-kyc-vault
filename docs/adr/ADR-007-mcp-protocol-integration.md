# ADR-007: MCP Protocol Integration for AI Agents

**Status:** Accepted  
**Date:** 2026-05-24

## Context
AI coding agents (Claude Code, Devin, Cursor) and autonomous AI systems need secure, structured access to the KYC vault's functionality.

## Decision
Implement an MCP (Model Context Protocol) server providing:
- **Tools** — DID resolution, credential verification, ZKP proof generation, KYC status check
- **Resources** — DID documents, credential schemas, platform configurations
- **Prompts** — KYC verification templates for agent guidance
- Transport via stdio (local) and SSE (remote)

## Consequences
+ Any MCP-compatible AI client can interact with the vault
+ Tool-calling interface is self-documenting via MCP schema
+ Secure by default—tools enforce existing authz policies
- MCP is relatively new protocol; upstream changes possible
- Requires rate limiting and abuse prevention for AI agent access
