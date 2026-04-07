import type { CompletionItemKind } from 'vscode-languageserver/node';

/**
 * JSFL 심볼이 가리키는 타입 이름입니다.
 * 나중에 전역 변수, 함수 반환값, 로컬 변수 추론이 모두 이 이름을 기준으로 연결됩니다.
 */
export type JsflTypeName = string;

/**
 * 함수 인자 정의입니다.
 */
export interface JsflParameterInfo {
	name: string;
	description?: string;
	optional?: boolean;
	rest?: boolean;
}

/**
 * 자동완성에 노출할 공통 심볼 정의입니다.
 */
export interface JsflSymbolDefinition {
	name: string;
	kind: CompletionItemKind;
	signature?: string;
	parameters?: readonly JsflParameterInfo[];
	detail?: string;
	documentation?: string;
	insertText?: string;
	returnType?: JsflTypeName;
}

/**
 * 전역 변수 / 전역 함수 정의입니다.
 */
export interface JsflGlobalDefinition extends JsflSymbolDefinition {
	typeName?: JsflTypeName;
}

/**
 * 특정 타입의 멤버 정의입니다.
 */
export interface JsflMemberDefinition extends JsflSymbolDefinition {}

/**
 * 멤버를 가진 JSFL 타입 정의입니다.
 */
export interface JsflTypeDefinition {
	name: JsflTypeName;
	members: readonly JsflMemberDefinition[];
}

/**
 * JSON 카탈로그에서 사용하는 completion kind 이름입니다.
 */
export type JsflCompletionKindName =
	| 'Text'
	| 'Method'
	| 'Function'
	| 'Constructor'
	| 'Field'
	| 'Variable'
	| 'Class'
	| 'Interface'
	| 'Module'
	| 'Property'
	| 'Unit'
	| 'Value'
	| 'Enum'
	| 'Keyword'
	| 'Snippet'
	| 'Color'
	| 'File'
	| 'Reference'
	| 'Folder'
	| 'EnumMember'
	| 'Constant'
	| 'Struct'
	| 'Event'
	| 'Operator'
	| 'TypeParameter';

/**
 * JSON 원본에서 읽는 공통 심볼 정의입니다.
 */
export interface JsflRawSymbolDefinition {
	name: string;
	kind: JsflCompletionKindName;
	signature?: string;
	parameters?: readonly JsflParameterInfo[];
	detail?: string;
	documentation?: string;
	insertText?: string;
	returnType?: JsflTypeName;
}

/**
 * JSON 원본의 전역 심볼 정의입니다.
 */
export interface JsflRawGlobalDefinition extends JsflRawSymbolDefinition {
	typeName?: JsflTypeName;
}

/**
 * JSON 원본의 멤버 심볼 정의입니다.
 */
export interface JsflRawMemberDefinition extends JsflRawSymbolDefinition {}

/**
 * JSON 원본의 타입 정의입니다.
 */
export interface JsflRawTypeDefinition {
	name: JsflTypeName;
	members: readonly JsflRawMemberDefinition[];
}

/**
 * JSON 카탈로그 루트 구조입니다.
 */
export interface JsflCatalogData {
	globals: readonly JsflRawGlobalDefinition[];
	types: readonly JsflRawTypeDefinition[];
}
