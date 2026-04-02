import type {
	CompletionItem,
	CompletionList,
	TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import ts from 'typescript';

import { MarkupKind, type Range } from './lsp';
import {
	getGlobalSymbol,
	getGlobalSymbols,
	getMembersForGlobal,
	getMembersForType,
	getTypeDefinition,
} from './catalog';
import type { JsflSymbolDefinition } from './catalogType';

type CompletionContext =
	| {
		kind: 'global';
		replaceRange: Range;
	  }
	| {
		kind: 'member';
		replaceRange: Range;
		receiverName: string;
	  };

export function provideCompletion(
	document: TextDocument,
	params: TextDocumentPositionParams,
): CompletionList {
	const context = analyzeCompletionContext(document, params);

	if (context.kind === 'member') {
		const inferredReceiverType = inferReceiverType(document, context.receiverName, params);

		if (inferredReceiverType) {
			return {
				isIncomplete: false,
				items: buildItems(getMembersForType(inferredReceiverType), context.replaceRange),
			};
		}

		return {
			isIncomplete: false,
			items: buildItems(getMembersForGlobal(context.receiverName), context.replaceRange),
		};
	}

	return {
		isIncomplete: false,
		items: buildItems(getGlobalSymbols(), context.replaceRange),
	};
}

function analyzeCompletionContext(
	document: TextDocument,
	params: TextDocumentPositionParams,
): CompletionContext {
	const text = document.getText();
	const replaceRange = createReplaceRange(document, params);
	const prefixStartOffset = document.offsetAt(replaceRange.start);

	if (prefixStartOffset > 0 && text[prefixStartOffset - 1] === '.') {
		const receiverName = readIdentifierBackward(text, prefixStartOffset - 1);

		if (receiverName) {
			return {
				kind: 'member',
				replaceRange,
				receiverName,
			};
		}
	}

	return {
		kind: 'global',
		replaceRange,
	};
}

function buildItems(
	definitions: readonly JsflSymbolDefinition[],
	replaceRange: Range,
): CompletionItem[] {
	return definitions.map((definition) => buildItem(definition, replaceRange));
}

function buildItem(
	definition: JsflSymbolDefinition,
	replaceRange: Range,
): CompletionItem {
	return {
		label: definition.name,
		kind: definition.kind,
		detail: definition.detail,
		documentation: definition.documentation
			? {
				kind: MarkupKind.Markdown,
				value: definition.documentation,
			}
			: undefined,
		textEdit: {
			range: replaceRange,
			newText: definition.insertText ?? definition.name,
		},
	};
}

function inferReceiverType(
	document: TextDocument,
	receiverName: string,
	params: TextDocumentPositionParams,
): string | undefined {
	const globalSymbol = getGlobalSymbol(receiverName);
	if (globalSymbol?.typeName) {
		return globalSymbol.typeName;
	}

	const variableTypes = inferVariableTypes(document, params);
	return variableTypes.get(receiverName);
}

function inferVariableTypes(
	document: TextDocument,
	params: TextDocumentPositionParams,
): Map<string, string> {
	const sourceFile = ts.createSourceFile(
		document.uri,
		document.getText(),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS,
	);

	const variableTypes = new Map<string, string>();
	const completionOffset = document.offsetAt(params.position);

	visitNode(sourceFile);
	return variableTypes;

	function visitNode(node: ts.Node): void {
		if (node.getStart(sourceFile) > completionOffset) {
			return;
		}

		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
			const inferredType = resolveExpressionType(node.initializer);
			if (inferredType) {
				variableTypes.set(node.name.text, inferredType);
			}
		}

		node.forEachChild(visitNode);
	}

	function resolveExpressionType(expression: ts.Expression): string | undefined {
		if (ts.isIdentifier(expression)) {
			const localType = variableTypes.get(expression.text);
			if (localType) {
				return localType;
			}

			return getGlobalSymbol(expression.text)?.typeName;
		}

		if (ts.isPropertyAccessExpression(expression)) {
			const receiverType = resolveExpressionType(expression.expression);
			if (!receiverType) {
				return undefined;
			}

			const member = getTypeDefinition(receiverType)?.members.find(
				(candidate) => candidate.name === expression.name.text,
			);

			return member?.returnType;
		}

		if (ts.isCallExpression(expression)) {
			return resolveCallableReturnType(expression.expression);
		}

		return undefined;
	}

	function resolveCallableReturnType(expression: ts.LeftHandSideExpression): string | undefined {
		if (ts.isIdentifier(expression)) {
			const globalSymbol = getGlobalSymbol(expression.text);
			return globalSymbol?.returnType;
		}

		if (ts.isPropertyAccessExpression(expression)) {
			const receiverType = resolveExpressionType(expression.expression);
			if (!receiverType) {
				return undefined;
			}

			const member = getTypeDefinition(receiverType)?.members.find(
				(candidate) => candidate.name === expression.name.text,
			);

			return member?.returnType;
		}

		return undefined;
	}
}

function createReplaceRange(
	document: TextDocument,
	params: TextDocumentPositionParams,
): Range {
	const text = document.getText();
	const offset = document.offsetAt(params.position);

	let startOffset = offset;

	while (startOffset > 0) {
		const char = text[startOffset - 1];

		if (!isIdentifierChar(char)) {
			break;
		}

		startOffset -= 1;
	}

	return {
		start: document.positionAt(startOffset),
		end: params.position,
	};
}

function readIdentifierBackward(text: string, endOffsetExclusive: number): string | undefined {
	let endOffset = endOffsetExclusive;

	while (endOffset > 0 && /\s/.test(text[endOffset - 1])) {
		endOffset -= 1;
	}

	let startOffset = endOffset;

	while (startOffset > 0) {
		const char = text[startOffset - 1];

		if (!isIdentifierChar(char)) {
			break;
		}

		startOffset -= 1;
	}

	if (startOffset === endOffset) {
		return undefined;
	}

	return text.slice(startOffset, endOffset);
}

function isIdentifierChar(char: string): boolean {
	return /[A-Za-z0-9_$]/.test(char);
}
