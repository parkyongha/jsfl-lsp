#!/usr/bin/env node

process.stderr.write(
  [
    'jsfl-lsp scaffold is installed.',
    'Implement the actual language server in src/server.ts.',
    'The project already includes typescript-language-server as a dependency.',
  ].join('\n') + '\n',
);
