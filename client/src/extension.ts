import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const serverModule = context.asAbsolutePath(path.join('..', 'dist', 'server.js'));

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.stdio,
      args: ['--stdio'],
    },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      args: ['--stdio'],
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'jsfl' },
      { scheme: 'untitled', language: 'jsfl' },
    ],
    outputChannelName: 'JSFL LSP',
  };

  client = new LanguageClient('jsfl-lsp', 'JSFL LSP', serverOptions, clientOptions);
  context.subscriptions.push(client);
  await client.start();
}

export async function deactivate(): Promise<void> {
  if (!client) {
    return;
  }

  await client.stop();
  client = undefined;
}
