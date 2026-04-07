import type {
	ParameterInformation,
	SignatureHelp,
	SignatureHelpParams,
	SignatureInformation,
} from 'vscode-languageserver/node';
import { CompletionItemKind, MarkupKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import ts from 'typescript';

import {
	getGlobalSymbol,
	getTypeDefinition,
} from './completion/catalog';
import type { JsflParameterInfo, JsflSymbolDefinition } from './completion/catalogType';

export function provideSignatureHelp(
	document: TextDocument,
	params: SignatureHelpParams,
): SignatureHelp | null {
	const sourceFile = ts.createSourceFile(
		document.uri,
		document.getText(),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS,
	);
	const offset = document.offsetAt(params.position);
	const localAnalysis = analyzeLocalTypes(sourceFile, offset);
	const callContext = findCallContext(sourceFile, offset);

	if (!callContext) {
		return null;
	}

	const symbol = resolveCallSymbol(callContext.callExpression.expression, localAnalysis);
	if (!symbol) {
		return null;
	}

	const signature = buildSignatureInformation(symbol);
	if (!signature) {
		return null;
	}

	return {
		signatures: [signature],
		activeSignature: 0,
		activeParameter: clampActiveParameter(callContext.activeParameter, signature.parameters?.length ?? 0),
	};
}

function buildSignatureInformation(symbol: JsflSymbolDefinition): SignatureInformation | null {
	const label = buildSignatureLabel(symbol);
	if (!label) {
		return null;
	}

	const documentation = buildSignatureDocumentation(symbol);
	const parameters = symbol.parameters?.map(buildParameterInformation);

	return {
		label,
		documentation: documentation
			? {
				kind: MarkupKind.Markdown,
				value: documentation,
			}
			: undefined,
		parameters,
	};
}

function buildSignatureLabel(symbol: JsflSymbolDefinition): string | undefined {
	if (symbol.signature) {
		return `${symbol.name}${symbol.signature}`;
	}

	if (!symbol.parameters || symbol.parameters.length === 0) {
		return symbol.kind === CompletionItemKind.Function || symbol.kind === CompletionItemKind.Method
			? `${symbol.name}()`
			: undefined;
	}

	return `${symbol.name}${createParameterSignature(symbol.parameters)}`;
}

function buildSignatureDocumentation(symbol: JsflSymbolDefinition): string | undefined {
	const sections: string[] = [];

	if (symbol.documentation) {
		sections.push(symbol.documentation);
	}

	const paramsMarkdown = buildParametersMarkdown(symbol.parameters);
	if (paramsMarkdown) {
		sections.push(paramsMarkdown);
	}

	return sections.length > 0 ? sections.join('\n\n') : undefined;
}

function buildParameterInformation(parameter: JsflParameterInfo): ParameterInformation {
	const label = parameter.rest
		? `...${parameter.name}${parameter.optional ? '?' : ''}`
		: `${parameter.name}${parameter.optional ? '?' : ''}`;

	return {
		label,
		documentation: parameter.description
			? {
				kind: MarkupKind.Markdown,
				value: parameter.description,
			}
			: undefined,
	};
}

function resolveCallSymbol(
	expression: ts.LeftHandSideExpression,
	localAnalysis: LocalTypeAnalysis,
): JsflSymbolDefinition | undefined {
	if (ts.isIdentifier(expression)) {
		return localAnalysis.functionSymbols.get(expression.text) ?? getGlobalSymbol(expression.text);
	}

	if (ts.isPropertyAccessExpression(expression)) {
		const receiverType = resolveExpressionType(expression.expression, localAnalysis);
		if (!receiverType) {
			return undefined;
		}

		return getTypeDefinition(receiverType)?.members.find(
			(candidate) => candidate.name === expression.name.text,
		);
	}

	return undefined;
}

function resolveExpressionType(
	expression: ts.Expression,
	localAnalysis: LocalTypeAnalysis,
): string | undefined {
	if (ts.isIdentifier(expression)) {
		return localAnalysis.variableTypes.get(expression.text) ?? getGlobalSymbol(expression.text)?.typeName;
	}

	if (ts.isPropertyAccessExpression(expression)) {
		const receiverType = resolveExpressionType(expression.expression, localAnalysis);
		if (!receiverType) {
			return undefined;
		}

		const member = getTypeDefinition(receiverType)?.members.find(
			(candidate) => candidate.name === expression.name.text,
		);

		return member?.returnType;
	}

	if (ts.isCallExpression(expression)) {
		const symbol = resolveCallSymbol(expression.expression, localAnalysis);
		return symbol?.returnType;
	}

	return undefined;
}

function analyzeLocalTypes(sourceFile: ts.SourceFile, completionOffset: number): LocalTypeAnalysis {
	const variableTypes = new Map<string, string>();
	const functionSymbols = new Map<string, JsflSymbolDefinition>();

	visitNode(sourceFile);
	return {
		variableTypes,
		functionSymbols,
	};

	function visitNode(node: ts.Node): void {
		if (node !== sourceFile && node.getStart(sourceFile) > completionOffset) {
			return;
		}

		if (ts.isFunctionDeclaration(node) && node.name) {
			functionSymbols.set(node.name.text, createLocalFunctionSymbol(node.name.text, node.parameters));
		} else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
			if (isFunctionInitializer(node.initializer)) {
				functionSymbols.set(
					node.name.text,
					createLocalFunctionSymbol(node.name.text, node.initializer.parameters),
				);
			}

			const inferredType = resolveInitializerType(node.initializer);
			if (inferredType) {
				variableTypes.set(node.name.text, inferredType);
			}
		}

		node.forEachChild(visitNode);
	}

	function resolveInitializerType(expression: ts.Expression): string | undefined {
		if (ts.isIdentifier(expression)) {
			return variableTypes.get(expression.text) ?? getGlobalSymbol(expression.text)?.typeName;
		}

		if (ts.isPropertyAccessExpression(expression)) {
			const receiverType = resolveInitializerType(expression.expression);
			if (!receiverType) {
				return undefined;
			}

			const member = getTypeDefinition(receiverType)?.members.find(
				(candidate) => candidate.name === expression.name.text,
			);

			return member?.returnType;
		}

		if (ts.isCallExpression(expression)) {
			const symbol = resolveCallSymbol(expression.expression, { variableTypes, functionSymbols });
			return symbol?.returnType;
		}

		return undefined;
	}
}

function createLocalFunctionSymbol(
	name: string,
	parameters: readonly ts.ParameterDeclaration[],
): JsflSymbolDefinition {
	const parameterInfos = parameters.map((parameter) => ({
		name: parameter.name.getText(),
		optional: Boolean(parameter.questionToken || parameter.initializer),
		rest: Boolean(parameter.dotDotDotToken),
	}));

	return {
		name,
		kind: CompletionItemKind.Function,
		signature: createParameterSignature(parameterInfos),
		parameters: parameterInfos,
		detail: '로컬 함수',
	};
}

function findCallContext(sourceFile: ts.SourceFile, offset: number): CallContext | undefined {
	let current: CallContext | undefined;

	visit(sourceFile);
	return current;

	function visit(node: ts.Node): void {
		node.forEachChild((child) => {
			if (offset < child.getFullStart() || offset > child.getEnd()) {
				return;
			}

			if (ts.isCallExpression(child)) {
				const context = getCallContext(child, offset);
				if (context) {
					current = context;
				}
			}

			visit(child);
		});
	}
}

function getCallContext(callExpression: ts.CallExpression, offset: number): CallContext | undefined {
	const openParenOffset = callExpression.expression.getEnd();
	if (offset < openParenOffset || offset > callExpression.getEnd()) {
		return undefined;
	}

	let activeParameter = 0;
	for (const argument of callExpression.arguments) {
		if (offset <= argument.end) {
			break;
		}

		activeParameter += 1;
	}

	return {
		callExpression,
		activeParameter,
	};
}

function createParameterSignature(parameters: readonly JsflParameterInfo[]): string {
	const parts = parameters.map((parameter) => {
		const base = parameter.rest ? `...${parameter.name}` : parameter.name;
		return parameter.optional ? `${base}?` : base;
	});

	return `(${parts.join(', ')})`;
}

function buildParametersMarkdown(parameters?: readonly JsflParameterInfo[]): string | undefined {
	if (!parameters || parameters.length === 0) {
		return undefined;
	}

	const lines = ['**Parameters**'];

	for (const parameter of parameters) {
		const name = parameter.rest ? `...${parameter.name}` : parameter.name;
		const label = parameter.optional ? `${name}?` : name;

		if (parameter.description) {
			lines.push(`- \`${label}\`: ${parameter.description}`);
			continue;
		}

		lines.push(`- \`${label}\``);
	}

	return lines.join('\n');
}

function clampActiveParameter(index: number, parameterCount: number): number {
	if (parameterCount <= 0) {
		return 0;
	}

	return Math.min(index, parameterCount - 1);
}

function isFunctionInitializer(
	expression: ts.Expression,
): expression is ts.FunctionExpression | ts.ArrowFunction {
	return ts.isFunctionExpression(expression) || ts.isArrowFunction(expression);
}

type LocalTypeAnalysis = {
	variableTypes: Map<string, string>;
	functionSymbols: Map<string, JsflSymbolDefinition>;
};

type CallContext = {
	callExpression: ts.CallExpression;
	activeParameter: number;
};
