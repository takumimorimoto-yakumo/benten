# Security

This document describes the security posture of this service.

1. The public runtime has no database adapter, connection configuration, or
   network path to a private financial-data system.
2. Financial facts are served only from a versioned static snapshot whose
   primitive values and response fields are validated against explicit public
   allowlists when the package loads.
3. The public API and MCP server require no user credentials.
4. All ticker and mint inputs are validated against a fixed allowlist before
   any query is issued. Unknown inputs never reach the data source.
5. The service never constructs, requests, or relays a transaction
   signature. Wallet access is read-only. It never asks for a private key
   or seed phrase.
6. Secrets, local guidance, CJK text, local absolute paths, and optionally
   configured internal names are rejected by publication checks in CI.

## Reporting a vulnerability

If you believe you have found a security vulnerability in this repository,
please open a private security advisory or contact the maintainers directly
rather than filing a public issue.
