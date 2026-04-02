import { CompletionItemKind } from 'vscode-languageserver/node';

import rawCatalog from './catalog.json';
import type {
	JsflCatalogData,
	JsflCompletionKindName,
	JsflGlobalDefinition,
	JsflMemberDefinition,
	JsflRawGlobalDefinition,
	JsflRawMemberDefinition,
	JsflRawSymbolDefinition,
	JsflRawTypeDefinition,
	JsflSymbolDefinition,
	JsflTypeDefinition,
	JsflTypeName,
} from './catalogType';

const COMPLETION_KIND_MAP: Record<JsflCompletionKindName, CompletionItemKind> = {
	Text: CompletionItemKind.Text,
	Method: CompletionItemKind.Method,
	Function: CompletionItemKind.Function,
	Constructor: CompletionItemKind.Constructor,
	Field: CompletionItemKind.Field,
	Variable: CompletionItemKind.Variable,
	Class: CompletionItemKind.Class,
	Interface: CompletionItemKind.Interface,
	Module: CompletionItemKind.Module,
	Property: CompletionItemKind.Property,
	Unit: CompletionItemKind.Unit,
	Value: CompletionItemKind.Value,
	Enum: CompletionItemKind.Enum,
	Keyword: CompletionItemKind.Keyword,
	Snippet: CompletionItemKind.Snippet,
	Color: CompletionItemKind.Color,
	File: CompletionItemKind.File,
	Reference: CompletionItemKind.Reference,
	Folder: CompletionItemKind.Folder,
	EnumMember: CompletionItemKind.EnumMember,
	Constant: CompletionItemKind.Constant,
	Struct: CompletionItemKind.Struct,
	Event: CompletionItemKind.Event,
	Operator: CompletionItemKind.Operator,
	TypeParameter: CompletionItemKind.TypeParameter,
};

const catalogData = normalizeCatalogData(rawCatalog as JsflCatalogData);

export const JSFL_TYPES: readonly JsflTypeDefinition[] = catalogData.types;
export const JSFL_GLOBALS: readonly JsflGlobalDefinition[] = catalogData.globals;

const JSFL_GLOBAL_MAP = new Map(JSFL_GLOBALS.map((symbol) => [symbol.name, symbol]));
const JSFL_TYPE_MAP = new Map(JSFL_TYPES.map((typeDef) => [typeDef.name, typeDef]));

export function getGlobalSymbols(): readonly JsflGlobalDefinition[] {
	return JSFL_GLOBALS;
}

export function getGlobalSymbol(name: string): JsflGlobalDefinition | undefined {
	return JSFL_GLOBAL_MAP.get(name);
}

export function getTypeDefinition(typeName: JsflTypeName): JsflTypeDefinition | undefined {
	return JSFL_TYPE_MAP.get(typeName);
}

export function getMembersForGlobal(name: string): readonly JsflMemberDefinition[] {
	const globalSymbol = getGlobalSymbol(name);
	if (!globalSymbol?.typeName) {
		return [];
	}

	return getMembersForType(globalSymbol.typeName);
}

export function getMembersForType(typeName: JsflTypeName): readonly JsflMemberDefinition[] {
	return getTypeDefinition(typeName)?.members ?? [];
}

function normalizeCatalogData(rawData: JsflCatalogData): JsflCatalogDataInternal {
	return {
		globals: rawData.globals.map(normalizeGlobalDefinition),
		types: rawData.types.map(normalizeTypeDefinition),
	};
}

function normalizeTypeDefinition(rawType: JsflRawTypeDefinition): JsflTypeDefinition {
	return {
		name: rawType.name,
		members: rawType.members.map(normalizeMemberDefinition),
	};
}

function normalizeGlobalDefinition(rawGlobal: JsflRawGlobalDefinition): JsflGlobalDefinition {
	return {
		...normalizeSymbolDefinition(rawGlobal),
		typeName: rawGlobal.typeName,
	};
}

function normalizeMemberDefinition(rawMember: JsflRawMemberDefinition): JsflMemberDefinition {
	return normalizeSymbolDefinition(rawMember);
}

function normalizeSymbolDefinition(rawSymbol: JsflRawSymbolDefinition): JsflSymbolDefinition {
	const kind = COMPLETION_KIND_MAP[rawSymbol.kind];

	if (kind === undefined) {
		throw new Error(`Unknown completion kind: ${rawSymbol.kind}`);
	}

	return {
		name: rawSymbol.name,
		kind,
		detail: rawSymbol.detail,
		documentation: rawSymbol.documentation,
		insertText: rawSymbol.insertText,
		returnType: rawSymbol.returnType,
	};
}

type JsflCatalogDataInternal = {
	globals: readonly JsflGlobalDefinition[];
	types: readonly JsflTypeDefinition[];
};
