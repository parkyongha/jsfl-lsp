/**
 * -2^31 ~ 2^31 - 1 범위의 정수입니다.
 * LSP 스펙에서는 별도 정수 타입으로 표기하지만 TypeScript에서는 `number`로 표현합니다.
 */
export type integer = number;

/**
 * 0 ~ 2^31 - 1 범위의 부호 없는 정수입니다.
 * LSP 스펙에서는 별도 정수 타입으로 표기하지만 TypeScript에서는 `number`로 표현합니다.
 */
export type uinteger = number;

/**
 * LSP에서 사용하는 실수 타입입니다.
 * TypeScript에서는 `number`로 표현합니다.
 */
export type decimal = number;

/**
 * LSP에서 사용하는 임의 값 타입입니다.
 *
 * 참고:
 * https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#lspAny
 */
export type LSPAny = LSPObject | LSPArray | string | integer | uinteger | decimal | boolean | null;

/**
 * LSP 객체 타입입니다.
 */
export type LSPObject = { [key: string]: LSPAny };

/**
 * LSP 배열 타입입니다.
 */
export type LSPArray = LSPAny[];

/**
 * 문서 내 위치입니다. line, character 모두 0부터 시작합니다.
 */
export interface Position {
	line: uinteger;
	character: uinteger;
}

/**
 * 문서 범위입니다. `end`는 exclusive입니다.
 */
export interface Range {
	start: Position;
	end: Position;
}

/**
 * 지원하는 마크업 종류입니다.
 */
export const MarkupKind = {
	PlainText: 'plaintext',
	Markdown: 'markdown',
} as const;

export type MarkupKind = typeof MarkupKind[keyof typeof MarkupKind];

/**
 * 마크업 본문입니다.
 */
export interface MarkupContent {
	kind: MarkupKind;
	value: string;
}

/**
 * 문서의 한 범위를 다른 텍스트로 치환하는 편집입니다.
 */
export interface TextEdit {
	range: Range;
	newText: string;
}

/**
 * insert / replace 두 범위를 함께 표현하는 특수 편집입니다.
 */
export interface InsertReplaceEdit {
	newText: string;
	insert: Range;
	replace: Range;
}

/**
 * completion 확정 뒤 실행할 명령입니다.
 */
export interface Command {
	title: string;
	command: string;
	arguments?: LSPAny[];
}

/**
 * insert text를 일반 문자열로 볼지 snippet으로 볼지 결정합니다.
 */
export const InsertTextFormat = {
	PlainText: 1,
	Snippet: 2,
} as const;

export type InsertTextFormat = typeof InsertTextFormat[keyof typeof InsertTextFormat];

/**
 * completion 삽입 시 공백과 들여쓰기 처리 방식입니다.
 */
export const InsertTextMode = {
	asIs: 1,
	adjustIndentation: 2,
} as const;

export type InsertTextMode = typeof InsertTextMode[keyof typeof InsertTextMode];
