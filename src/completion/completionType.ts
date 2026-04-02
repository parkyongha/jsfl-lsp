import type {
	Command,
	InsertReplaceEdit,
	InsertTextFormat,
	InsertTextMode,
	LSPAny,
	MarkupContent,
	Range,
	TextEdit,
} from './lsp';

/**
 * completion label 옆에 붙는 보조 정보입니다.
 */
export interface CompletionItemLabelDetails {
	detail?: string;
	description?: string;
}

/**
 * completion 항목 종류입니다.
 */
export const CompletionItemKind = {
	Text: 1,
	Method: 2,
	Function: 3,
	Constructor: 4,
	Field: 5,
	Variable: 6,
	Class: 7,
	Interface: 8,
	Module: 9,
	Property: 10,
	Unit: 11,
	Value: 12,
	Enum: 13,
	Keyword: 14,
	Snippet: 15,
	Color: 16,
	File: 17,
	Reference: 18,
	Folder: 19,
	EnumMember: 20,
	Constant: 21,
	Struct: 22,
	Event: 23,
	Operator: 24,
	TypeParameter: 25,
} as const;

export type CompletionItemKind = typeof CompletionItemKind[keyof typeof CompletionItemKind];

/**
 * completion 항목 렌더링에 영향을 주는 태그입니다.
 */
export const CompletionItemTag = {
	Deprecated: 1,
} as const;

export type CompletionItemTag = typeof CompletionItemTag[keyof typeof CompletionItemTag];

/**
 * `CompletionList.itemDefaults.editRange`에서 insert / replace 범위를 함께 표현할 때 사용합니다.
 */
export interface CompletionItemEditRange {
	insert: Range;
	replace: Range;
}

/**
 * CompletionList에 공통으로 적용할 기본값입니다.
 */
export interface CompletionListItemDefaults {
	commitCharacters?: string[];
	editRange?: Range | CompletionItemEditRange;
	insertTextFormat?: InsertTextFormat;
	insertTextMode?: InsertTextMode;
	data?: LSPAny;
}

export interface CompletionItem {
	/**
	 * 이 completion 항목의 표시 이름입니다.
	 *
	 * 기본적으로 `label` 값은 이 completion 항목을 선택했을 때
	 * 문서에 삽입되는 텍스트로도 사용됩니다.
	 *
	 * label 세부 정보가 함께 제공되는 경우, `label` 자체는
	 * 수식어가 붙지 않은 completion 항목 이름이어야 합니다.
	 */
	label: string;

	/**
	 * label에 대한 추가 정보입니다.
	 */
	labelDetails?: CompletionItemLabelDetails;

	/**
	 * 이 completion 항목의 종류입니다. 에디터는 이 종류를 기준으로
	 * 아이콘을 선택합니다. 사용할 수 있는 표준 값은
	 * `CompletionItemKind`에 정의되어 있습니다.
	 */
	kind?: CompletionItemKind;

	/**
	 * 이 completion 항목의 태그입니다.
	 */
	tags?: CompletionItemTag[];

	/**
	 * 타입이나 심볼 정보 같은 추가 설명을 담는
	 * 사람이 읽을 수 있는 문자열입니다.
	 */
	detail?: string;

	/**
	 * 문서 주석을 나타내는 사람이 읽을 수 있는 문자열입니다.
	 */
	documentation?: string | MarkupContent;

	/**
	 * 이 항목이 더 이상 권장되지 않는지 나타냅니다.
	 */
	deprecated?: boolean;

	/**
	 * 목록을 보여줄 때 이 항목을 기본 선택 대상으로 삼습니다.
	 */
	preselect?: boolean;

	/**
	 * 이 항목을 정렬할 때 사용할 문자열입니다.
	 * 생략하면 `label`이 사용됩니다.
	 */
	sortText?: string;

	/**
	 * 이 항목을 필터링할 때 사용할 문자열입니다.
	 * 생략하면 `label`이 사용됩니다.
	 */
	filterText?: string;

	/**
	 * 선택 시 삽입할 문자열입니다.
	 * 정확한 치환 범위를 제어하려면 `textEdit`가 더 안전합니다.
	 */
	insertText?: string;

	/**
	 * `insertText` 또는 `textEdit.newText`의 형식입니다.
	 */
	insertTextFormat?: InsertTextFormat;

	/**
	 * completion 삽입 시 공백과 들여쓰기 처리 방식입니다.
	 */
	insertTextMode?: InsertTextMode;

	/**
	 * 이 completion 항목을 선택했을 때 문서에 적용할 편집입니다.
	 */
	textEdit?: TextEdit | InsertReplaceEdit;

	/**
	 * 이 completion 항목이 `CompletionList`의 일부이고,
	 * 해당 목록이 텍스트 편집 범위 기본값을 정의한 경우 사용할 편집 텍스트입니다.
	 *
	 * 클라이언트가 `completionList.itemDefaults` capability로
	 * completion 목록 기본값 사용을 지원한다고 밝힌 경우에만 이 속성이 적용됩니다.
	 */
	textEditText?: string;

	/**
	 * 이 completion 항목을 선택할 때 함께 적용할 추가 텍스트 편집 목록입니다.
	 * 이 편집들은 메인 편집과도, 서로 간에도 겹치면 안 됩니다.
	 * 같은 삽입 위치를 공유하는 것도 허용되지 않습니다.
	 *
	 * 추가 텍스트 편집은 현재 커서 위치와 직접 관련 없는 텍스트를
	 * 변경할 때 사용합니다. 예를 들어 completion 항목이 수식어 없는 타입을
	 * 삽입한다면 파일 상단에 import 문을 추가하는 경우가 이에 해당합니다.
	 */
	additionalTextEdits?: TextEdit[];

	/**
	 * 이 completion이 활성 상태일 때 입력하면, 먼저 이 completion을 확정하고
	 * 그 다음 해당 문자를 입력하게 만드는 문자 집합입니다.
	 * 모든 commit 문자는 길이가 1이어야 하며, 불필요한 문자는 무시됩니다.
	 */
	commitCharacters?: string[];

	/**
	 * 이 completion을 삽입한 뒤 실행할 선택적 명령입니다.
	 * 현재 문서에 대한 추가 수정은 `additionalTextEdits` 속성으로
	 * 표현하는 것이 맞습니다.
	 */
	command?: Command;

	/**
	 * completion 요청과 completion resolve 요청 사이에서
	 * 유지되는 임의 데이터 필드입니다.
	 */
	data?: LSPAny;
}

export interface CompletionList {
	/**
	 * 이 목록은 아직 완전하지 않습니다. 사용자가 계속 입력하면
	 * 이 목록을 다시 계산해야 합니다.
	 *
	 * 미완성 completion 세션에서는 다시 계산된 목록이 기존 항목 뒤에
	 * 추가되는 것이 아니라 전체 항목을 교체합니다.
	 */
	isIncomplete: boolean;

	/**
	 * completion 항목들이 공유하는 기본값입니다.
	 * 각 항목이 같은 값을 반복해서 가지는 경우 중복을 줄일 수 있습니다.
	 */
	itemDefaults?: CompletionListItemDefaults;

	/**
	 * completion 항목 목록입니다.
	 */
	items: CompletionItem[];
}
