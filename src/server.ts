#!/usr/bin/env node

import {
    createConnection,
    Diagnostic,
    DiagnosticSeverity,
    InitializeResult,
    ProposedFeatures,
    TextDocumentSyncKind,
    TextDocuments,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import ts from 'typescript';

import log from "./log";
import { provideCompletion } from './completion/completion';

type UnsupportedSyntaxRule = {
    code: string;
    message: string;
    pattern: RegExp;
    severity: DiagnosticSeverity;
};

const JSFL_ROOT_SYMBOLS = new Set(['FLfile', 'MMExecute', 'fl']);
const COMMON_JS_GLOBALS = new Set([
    'Array',
    'Boolean',
    'Date',
    'Error',
    'Function',
    'Infinity',
    'JSON',
    'Map',
    'Math',
    'NaN',
    'Number',
    'Object',
    'Promise',
    'Proxy',
    'Reflect',
    'RegExp',
    'Set',
    'String',
    'Symbol',
    'WeakMap',
    'WeakSet',
    'arguments',
    'console',
    'decodeURI',
    'decodeURIComponent',
    'encodeURI',
    'encodeURIComponent',
    'escape',
    'eval',
    'globalThis',
    'isFinite',
    'isNaN',
    'module',
    'parseFloat',
    'parseInt',
    'require',
    'undefined',
    'unescape',
]);

const UNSUPPORTED_SYNTAX_RULES: UnsupportedSyntaxRule[] = [
    {
        code: 'unsupported-arrow-function',
        message: 'Arrow functions are not part of the v0 JSFL compatibility profile.',
        pattern: /=>/g,
        severity: DiagnosticSeverity.Warning,
    },
    {
        code: 'unsupported-esm-import',
        message: 'ECMAScript module import syntax is not supported in JSFL v0.',
        pattern: /^\s*import\s.+$/gm,
        severity: DiagnosticSeverity.Warning,
    },
    {
        code: 'unsupported-esm-export',
        message: 'ECMAScript module export syntax is not supported in JSFL v0.',
        pattern: /^\s*export\s.+$/gm,
        severity: DiagnosticSeverity.Warning,
    },
    {
        code: 'unsupported-class',
        message: 'Class syntax is not part of the v0 JSFL compatibility profile.',
        pattern: /\bclass\s+[A-Za-z_$][\w$]*/g,
        severity: DiagnosticSeverity.Warning,
    },
    {
        code: 'unsupported-namespace',
        message: 'TypeScript namespace syntax is not supported in JSFL v0.',
        pattern: /\bnamespace\s+[A-Za-z_$][\w$]*/g,
        severity: DiagnosticSeverity.Warning,
    },
];

const MAX_DIAGNOSTICS = 50;

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const openJsflDocuments = new Map<string, TextDocument>();

let shutdownRequested = false;

connection.onInitialize((): InitializeResult => {
    return {
        capabilities: {
            completionProvider: {
                triggerCharacters: ['.'],
                resolveProvider: false
            },
            textDocumentSync: TextDocumentSyncKind.Incremental,
        },
        serverInfo: {
            name: 'jsfl-lsp',
            version: '0.1.0',
        },
    };
});

connection.onInitialized(() => {
    connection.console.info('jsfl-lsp initialized');
});

connection.onShutdown(() => {
    shutdownRequested = true;
});

connection.onCompletion((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return { isIncomplete: false, items: [] };
    }

    return provideCompletion(document, params);
});

connection.onExit(() => {
    process.exit(shutdownRequested ? 0 : 1);
});

documents.onDidOpen((event) => {
    handleDocumentUpdate(event.document);
});

documents.onDidChangeContent((event) => {
    handleDocumentUpdate(event.document);
});

documents.onDidClose((event) => {
    openJsflDocuments.delete(event.document.uri);

    if (isJsflDocument(event.document)) {
        connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
    }
});

documents.listen(connection);
connection.listen();

function handleDocumentUpdate(document: TextDocument): void {
    if (!isJsflDocument(document)) {
        return;
    }

    openJsflDocuments.set(document.uri, document);
    connection.sendDiagnostics({
        uri: document.uri,
        diagnostics: analyzeDocument(document),
    });
}

function analyzeDocument(document: TextDocument): Diagnostic[] {
    try {
        const sourceFile = ts.createSourceFile(
            document.uri,
            document.getText(),
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.JS,
        );

        const parseDiagnostics = (
            sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.DiagnosticWithLocation[] }
        ).parseDiagnostics ?? [];

        return finalizeDiagnostics([
            ...createParseDiagnostics(document, parseDiagnostics),
            ...createUnsupportedSyntaxDiagnostics(document),
            ...createUnknownGlobalDiagnostics(document, sourceFile),
        ]);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        connection.console.error(`Failed to analyze ${document.uri}: ${message}`);
        return [];
    }
}

function createParseDiagnostics(
    document: TextDocument,
    parseDiagnostics: readonly ts.DiagnosticWithLocation[],
): Diagnostic[] {
    return parseDiagnostics.map((diagnostic) => {
        const start = diagnostic.start ?? 0;
        const length = diagnostic.length ?? 1;

        return createDiagnostic(
            document,
            start,
            length,
            ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
            toDiagnosticSeverity(diagnostic.category),
            'typescript-parse',
        );
    });
}

function createUnsupportedSyntaxDiagnostics(document: TextDocument): Diagnostic[] {
    const text = document.getText();
    const diagnostics: Diagnostic[] = [];

    for (const rule of UNSUPPORTED_SYNTAX_RULES) {
        const matcher = new RegExp(rule.pattern.source, rule.pattern.flags);

        for (const match of text.matchAll(matcher)) {
            const start = match.index ?? 0;
            const length = Math.max(match[0].length, 1);

            diagnostics.push(
                createDiagnostic(document, start, length, rule.message, rule.severity, rule.code),
            );
        }
    }

    return diagnostics;
}

function createUnknownGlobalDiagnostics(
    document: TextDocument,
    sourceFile: ts.SourceFile,
): Diagnostic[] {
    const declaredNames = new Set<string>();
    const referencedRoots = new Map<string, ts.Identifier>();

    walkForSymbols(sourceFile, declaredNames, referencedRoots);

    const diagnostics: Diagnostic[] = [];

    for (const [name, identifier] of referencedRoots) {
        if (declaredNames.has(name) || JSFL_ROOT_SYMBOLS.has(name) || COMMON_JS_GLOBALS.has(name)) {
            continue;
        }

        diagnostics.push(
            createDiagnostic(
                document,
                identifier.getStart(sourceFile),
                identifier.getWidth(sourceFile),
                `Unknown global root "${name}". v0 currently recognizes only a small JSFL global set: ${[...JSFL_ROOT_SYMBOLS].join(', ')}.`,
                DiagnosticSeverity.Information,
                'unknown-global-root',
            ),
        );
    }

    return diagnostics;
}

function walkForSymbols(
    node: ts.Node,
    declaredNames: Set<string>,
    referencedRoots: Map<string, ts.Identifier>,
): void {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) {
        collectBindingNames(node.name, declaredNames);
    } else if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
        if (node.name) {
            declaredNames.add(node.name.text);
        }

        for (const parameter of node.parameters) {
            collectBindingNames(parameter.name, declaredNames);
        }
    } else if (ts.isClassDeclaration(node) && node.name) {
        declaredNames.add(node.name.text);
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
        collectBindingNames(node.variableDeclaration.name, declaredNames);
    } else if (ts.isIdentifier(node) && isRootReference(node)) {
        referencedRoots.set(node.text, node);
    }

    node.forEachChild((child) => {
        walkForSymbols(child, declaredNames, referencedRoots);
    });
}

function collectBindingNames(name: ts.BindingName, declaredNames: Set<string>): void {
    // 일반 변수
    if (ts.isIdentifier(name)) {
        declaredNames.add(name.text);
        return;
    }

    // { a, b } 같은 구조 분해 패턴
    for (const element of name.elements) {
        if (ts.isOmittedExpression(element)) {
            continue;
        }

        collectBindingNames(element.name, declaredNames);
    }
}

function isRootReference(identifier: ts.Identifier): boolean {
    const parent = identifier.parent;

    if (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) {
        return parent.expression === identifier;
    }

    if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
        return parent.expression === identifier;
    }

    return false;
}

function finalizeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    const seen = new Set<string>();
    const deduped: Diagnostic[] = [];

    for (const diagnostic of diagnostics) {
        const key = [
            diagnostic.range.start.line,
            diagnostic.range.start.character,
            diagnostic.range.end.line,
            diagnostic.range.end.character,
            diagnostic.code ?? '',
            diagnostic.message,
        ].join(':');

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        deduped.push(diagnostic);
    }

    deduped.sort((left, right) => {
        if (left.range.start.line !== right.range.start.line) {
            return left.range.start.line - right.range.start.line;
        }

        if (left.range.start.character !== right.range.start.character) {
            return left.range.start.character - right.range.start.character;
        }

        return (left.severity ?? DiagnosticSeverity.Information)
            - (right.severity ?? DiagnosticSeverity.Information);
    });

    return deduped.slice(0, MAX_DIAGNOSTICS);
}

function createDiagnostic(
    document: TextDocument,
    start: number,
    length: number,
    message: string,
    severity: DiagnosticSeverity,
    code: string,
): Diagnostic {
    return {
        range: createRange(document, start, length),
        severity,
        code,
        message,
        source: 'jsfl-lsp',
    };
}

function createRange(document: TextDocument, start: number, length: number) {
    const textLength = document.getText().length;
    const safeStart = clampOffset(start, textLength);
    const safeEnd = clampOffset(safeStart + Math.max(length, 1), textLength);

    return {
        start: document.positionAt(safeStart),
        end: document.positionAt(safeEnd),
    };
}

function clampOffset(offset: number, textLength: number): number {
    return Math.min(Math.max(offset, 0), textLength);
}

function toDiagnosticSeverity(category: ts.DiagnosticCategory): DiagnosticSeverity {
    switch (category) {
        case ts.DiagnosticCategory.Warning:
            return DiagnosticSeverity.Warning;
        case ts.DiagnosticCategory.Message:
        case ts.DiagnosticCategory.Suggestion:
            return DiagnosticSeverity.Information;
        case ts.DiagnosticCategory.Error:
        default:
            return DiagnosticSeverity.Error;
    }
}

function isJsflDocument(document: TextDocument): boolean {
    return document.uri.toLowerCase().endsWith('.jsfl');
}
