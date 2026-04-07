import {
	CompletionItemKind,
	type CompletionItem,
	type CompletionList,
	type TextDocumentPositionParams,
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
import type { JsflParameterInfo, JsflSymbolDefinition } from './catalogType';

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
	const localAnalysis = analyzeLocalSymbols(document, params);

	if (context.kind === 'member') {
		const inferredReceiverType = inferReceiverType(context.receiverName, localAnalysis);

		if (inferredReceiverType) {
			return {
				isIncomplete: false,
				items: buildItems(getMembersForType(inferredReceiverType), context.replaceRange),
			};
		}

		if (localAnalysis.symbolNames.has(context.receiverName)) {
			return {
				isIncomplete: false,
				items: [],
			};
		}

		return {
			isIncomplete: false,
			items: buildItems(getMembersForGlobal(context.receiverName), context.replaceRange),
		};
	}

	return {
		isIncomplete: false,
		items: buildItems(
			mergeSymbolDefinitions(localAnalysis.symbols, getGlobalSymbols()),
			context.replaceRange,
		),
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
	const signature = getSignature(definition);
	const documentation = createDocumentation(definition);

	return {
		label: definition.name,
		labelDetails: signature
			? {
				detail: signature,
			}
			: undefined,
		kind: definition.kind,
		detail: definition.detail,
		documentation: documentation
			? {
				kind: MarkupKind.Markdown,
				value: documentation,
			}
			: undefined,
		textEdit: {
			range: replaceRange,
			newText: definition.insertText ?? definition.name,
		},
	};
}

function getSignature(definition: JsflSymbolDefinition): string | undefined {
	if (definition.signature) {
		return definition.signature;
	}

	if (!definition.parameters || definition.parameters.length === 0) {
		return undefined;
	}

	return createParameterSignature(definition.parameters);
}

function createDocumentation(definition: JsflSymbolDefinition): string | undefined {
	const sections: string[] = [];

	if (definition.documentation) {
		sections.push(definition.documentation);
	}

	const parametersMarkdown = createParametersMarkdown(definition.parameters);
	if (parametersMarkdown) {
		sections.push(parametersMarkdown);
	}

	return sections.length > 0 ? sections.join('\n\n') : undefined;
}

function inferReceiverType(receiverName: string, localAnalysis: LocalAnalysis): string | undefined {
	const localType = localAnalysis.variableTypes.get(receiverName);
	if (localType) {
		return localType;
	}

	const globalSymbol = getGlobalSymbol(receiverName);
	return globalSymbol?.typeName;
}

function analyzeLocalSymbols(
	document: TextDocument,
	params: TextDocumentPositionParams,
): LocalAnalysis {
	const sourceFile = ts.createSourceFile(
		document.uri,
		document.getText(),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS,
	);

	const variableTypes = new Map<string, string>();
	const localSymbols = new Map<string, LocalSymbolEntry>();
	const completionOffset = document.offsetAt(params.position);
	const cursorScopeChain = getScopeChainAtOffset(sourceFile, completionOffset);

	visitNode(sourceFile, [sourceFile]);
	return {
		symbolNames: new Set(localSymbols.keys()),
		variableTypes,
		symbols: [...localSymbols.values()].map((entry) => entry.definition),
	};

	function visitNode(node: ts.Node, scopeChain: readonly ts.Node[]): void {
		if (node !== sourceFile && node.getStart(sourceFile) > completionOffset) {
			return;
		}

		if (ts.isFunctionDeclaration(node) && node.name) {
			registerLocalSymbol(
				scopeChain,
				node.name.text,
				CompletionItemKind.Function,
				'로컬 함수',
				createFunctionSignature(node.parameters),
			);
		} else if (ts.isClassDeclaration(node) && node.name) {
			registerLocalSymbol(scopeChain, node.name.text, CompletionItemKind.Class, '로컬 클래스');
		} else if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
			registerLocalSymbol(scopeChain, node.name.text, CompletionItemKind.Variable, '매개변수');
		} else if (ts.isCatchClause(node) && node.variableDeclaration && ts.isIdentifier(node.variableDeclaration.name)) {
			registerLocalSymbol(scopeChain, node.variableDeclaration.name.text, CompletionItemKind.Variable, 'catch 변수');
		} else if (ts.isVariableDeclaration(node)) {
			registerBindingNameSymbols(scopeChain, node.name, node.initializer);
		}

		const nextScopeChain = node !== sourceFile && createsScope(node) ? [...scopeChain, node] : scopeChain;
		node.forEachChild((child) => {
			visitNode(child, nextScopeChain);
		});
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

	function registerBindingNameSymbols(
		scopeChain: readonly ts.Node[],
		name: ts.BindingName,
		initializer?: ts.Expression,
	): void {
		const identifiers = collectBindingIdentifiers(name);
		if (identifiers.length === 0) {
			return;
		}

		let detail = '로컬 변수';
		let kind: JsflSymbolDefinition['kind'] = CompletionItemKind.Variable;
		let signature: string | undefined;
		const inferredType = initializer ? resolveExpressionType(initializer) : undefined;
		if (initializer && isFunctionInitializer(initializer)) {
			kind = CompletionItemKind.Function;
			detail = '로컬 함수';
			signature = createFunctionSignature(initializer.parameters);
		}

		if (inferredType) {
			detail = `로컬 변수 (${inferredType})`;
		}

		for (const identifier of identifiers) {
			registerLocalSymbol(scopeChain, identifier, kind, detail, signature);

			if (inferredType) {
				variableTypes.set(identifier, inferredType);
			}
		}
	}

	function registerLocalSymbol(
		scopeChain: readonly ts.Node[],
		name: string,
		kind: CompletionItemKind,
		detail: string,
		signature?: string,
	): void {
		if (!isScopeVisibleAtCursor(scopeChain, cursorScopeChain)) {
			return;
		}

		if (localSymbols.has(name)) {
			const existing = localSymbols.get(name);
			if (existing && existing.scopeDepth > scopeChain.length) {
				return;
			}
		}

		localSymbols.set(name, {
			scopeDepth: scopeChain.length,
			definition: {
				name,
				kind,
				signature,
				detail,
			},
		});
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

function mergeSymbolDefinitions(
	...groups: ReadonlyArray<readonly JsflSymbolDefinition[]>
): JsflSymbolDefinition[] {
	const merged = new Map<string, JsflSymbolDefinition>();

	for (const group of groups) {
		for (const definition of group) {
			if (merged.has(definition.name)) {
				continue;
			}

			merged.set(definition.name, definition);
		}
	}

	return [...merged.values()];
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

function collectBindingIdentifiers(name: ts.BindingName): string[] {
	if (ts.isIdentifier(name)) {
		return [name.text];
	}

	const identifiers: string[] = [];

	for (const element of name.elements) {
		if (ts.isOmittedExpression(element)) {
			continue;
		}

		identifiers.push(...collectBindingIdentifiers(element.name));
	}

	return identifiers;
}

function createFunctionSignature(parameters: readonly ts.ParameterDeclaration[]): string {
	const parts = parameters.map((parameter) => {
		const name = parameter.name.getText();
		if (parameter.dotDotDotToken) {
			return `...${name}`;
		}

		return name;
	});

	return `(${parts.join(', ')})`;
}

function createParameterSignature(parameters: readonly JsflParameterInfo[]): string {
	const parts = parameters.map((parameter) => {
		const baseName = parameter.rest ? `...${parameter.name}` : parameter.name;
		return parameter.optional ? `${baseName}?` : baseName;
	});

	return `(${parts.join(', ')})`;
}

function createParametersMarkdown(parameters?: readonly JsflParameterInfo[]): string | undefined {
	if (!parameters || parameters.length === 0) {
		return undefined;
	}

	const lines = ['**Parameters**'];

	for (const parameter of parameters) {
		const signature = parameter.optional
			? `${parameter.name}?`
			: parameter.name;
		const label = parameter.rest ? `...${signature}` : signature;

		if (parameter.description) {
			lines.push(`- \`${label}\`: ${parameter.description}`);
			continue;
		}

		lines.push(`- \`${label}\``);
	}

	return lines.join('\n');
}

function isFunctionInitializer(
	expression: ts.Expression,
): expression is ts.FunctionExpression | ts.ArrowFunction {
	return ts.isFunctionExpression(expression) || ts.isArrowFunction(expression);
}

function getScopeChainAtOffset(sourceFile: ts.SourceFile, offset: number): readonly ts.Node[] {
	const scopeChain: ts.Node[] = [sourceFile];

	visit(sourceFile);
	return scopeChain;

	function visit(node: ts.Node): void {
		node.forEachChild((child) => {
			if (offset < child.getFullStart() || offset > child.getEnd()) {
				return;
			}

			if (createsScope(child)) {
				scopeChain.push(child);
			}

			visit(child);
		});
	}
}

function isScopeVisibleAtCursor(
	declarationScopeChain: readonly ts.Node[],
	cursorScopeChain: readonly ts.Node[],
): boolean {
	if (declarationScopeChain.length > cursorScopeChain.length) {
		return false;
	}

	return declarationScopeChain.every((scope, index) => cursorScopeChain[index] === scope);
}

function createsScope(node: ts.Node): boolean {
	return (
		ts.isBlock(node)
		|| ts.isSourceFile(node)
		|| ts.isFunctionLike(node)
		|| ts.isCatchClause(node)
		|| ts.isForStatement(node)
		|| ts.isForInStatement(node)
		|| ts.isForOfStatement(node)
	);
}

type LocalAnalysis = {
	symbolNames: Set<string>;
	variableTypes: Map<string, string>;
	symbols: JsflSymbolDefinition[];
};

type LocalSymbolEntry = {
	scopeDepth: number;
	definition: JsflSymbolDefinition;
};
