# jsfl-lsp

JSFL용 LSP 프로젝트 스캐폴드입니다. 실제 서버 구현은 아직 없고, TypeScript 기반 프로젝트 설정과 `typescript-language-server` 의존성만 준비된 상태입니다.

## 포함된 것

- `package.json`
- `tsconfig.json`
- `src/server.ts` placeholder 엔트리
- `typescript-language-server`, `typescript` 의존성

## 실행

```bash
npm install
npm run build
npm run start
```

`typescript-language-server` 자체를 직접 띄우려면:

```bash
npm run tsls
```

## 다음 단계

- `src/server.ts`에 실제 LSP 엔트리 구현
- JSFL 파일 처리 전략 결정
- 필요하면 `typescript-language-server`를 프록시 또는 사이드카로 연결
