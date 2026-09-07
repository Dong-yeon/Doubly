/**
 * 오픈소스 고지 — 앱이 재배포하는 서드파티 저작물의 저작권·라이선스 안내.
 *
 * <p><b>왜 필요한가</b>: 이 앱은 맞춤법·띄어쓰기 기능 때문에 <b>카피레프트 네이티브
 * 바이너리를 직접 번들</b>한다. Hunspell·Kiwi 는 LGPL, 한국어 사전은 GPL-3.0 이고
 * 셋 다 고지 의무가 있다. JS 의존성은 대부분 MIT 라 관행상 묶어서 밝히지만, 이쪽은
 * 개별 고지가 필요하다.
 *
 * <p><b>LGPL 재링크 요건</b>은 동적 링킹으로 충족한다 — Kiwi 는 별도 `libkiwi.so`,
 * Hunspell 은 `libkoreanspell.so` 안에 있고 둘 다 소스를 공개된 원본에서 그대로
 * 가져왔다(패치 내역은 docs/SPELLCHECK_KIWI_SPACING_ANALYSIS_2026-09-03.md).
 *
 * <p>새 서드파티 에셋·라이브러리를 번들하면 <b>여기에 반드시 한 항목을 추가</b>할 것.
 * 특히 CC BY 계열 이모티콘 에셋은 저작자 표시가 라이선스 조건 자체다.
 */

export interface OssEntry {
  name: string;
  copyright: string;
  license: string;
  url: string;
  /** 왜 쓰는지 — 사용자가 "이게 왜 내 앱에 있나"를 알 수 있게 */
  usedFor: string;
}

export const OSS_ENTRIES: OssEntry[] = [
  {
    name: 'Hunspell',
    copyright: 'Copyright (C) 2002-2022 Németh László, Kevin Hendricks 외',
    license: 'MPL 1.1 / GPL 2.0 / LGPL 2.1 (3중 라이선스 — 본 앱은 LGPL 2.1 을 따릅니다)',
    url: 'https://github.com/hunspell/hunspell',
    usedFor: '맞춤법 검사 엔진',
  },
  {
    name: 'hunspell-dict-ko (한국어 맞춤법 사전)',
    copyright: 'Copyright (C) 스펠체크 프로젝트 기여자',
    license: 'GPL-3.0 — 사전 데이터와 이를 사용하는 프로그램은 별개 저작물임이 원 저장소에 명시돼 있습니다.',
    url: 'https://github.com/spellcheck-ko/hunspell-dict-ko',
    usedFor: '맞춤법 검사 사전 (ko.aff / ko.dic)',
  },
  {
    name: 'Kiwi (Korean Intelligent Word Identifier)',
    copyright: 'Copyright (c) 2017 Minchul Lee',
    license: 'LGPL 2.1 또는 그 이후 버전',
    url: 'https://github.com/bab2min/Kiwi',
    usedFor: '띄어쓰기 교정 (형태소 분석)',
  },
  {
    name: 'React Native · Expo',
    copyright: 'Copyright (c) Meta Platforms, Inc. / 650 Industries, Inc.',
    license: 'MIT',
    url: 'https://github.com/facebook/react-native',
    usedFor: '앱 실행 기반',
  },
  {
    name: 'Material Design Icons',
    copyright: 'Copyright (c) Austin Andrews 외',
    license: 'Apache License 2.0',
    url: 'https://github.com/Templarian/MaterialDesign',
    usedFor: '앱 전반의 아이콘',
  },
];

/** 화면에 그대로 뿌릴 본문 — LegalDocumentScreen 이 단일 Text 로 렌더한다 */
export const OPEN_SOURCE_NOTICE = `Dubly는 아래 오픈소스 소프트웨어를 사용합니다.
각 저작물의 권리는 원 저작자에게 있으며, 해당 라이선스 전문은 아래 주소에서 확인하실 수 있습니다.

${OSS_ENTRIES.map(
  (e) => `■ ${e.name}
   용도: ${e.usedFor}
   ${e.copyright}
   라이선스: ${e.license}
   ${e.url}`,
).join('\n\n')}

■ 그 밖의 라이브러리
   위에 적지 않은 JavaScript 의존성은 MIT, Apache License 2.0, BSD 등
   허용적(permissive) 라이선스를 따르며, 각 패키지의 저작권 표시는 배포물에
   포함된 라이선스 파일에 담겨 있습니다.

LGPL 라이선스 저작물(Hunspell, Kiwi)에 대해서는 해당 라이브러리의 수정본으로
교체할 수 있도록 동적 링킹된 형태로 배포하고 있습니다. 소스 코드 요청 등 문의는
설정 > 문의하기로 연락해 주세요.`;
