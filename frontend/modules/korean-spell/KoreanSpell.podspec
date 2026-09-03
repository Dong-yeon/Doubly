# podspec 을 모듈 루트에 두는 이유: 안드로이드와 함께 쓰는 C++ 원본이 cpp/ 에 있어서,
# ios/ 안에 두면 소스 경로를 전부 '../cpp' 로 거슬러 올라가야 한다. 루트에 두면 아래로만
# 내려가는 평범한 경로가 된다. 오토링킹이 이 위치를 찾도록 expo-module.config.json 의
# apple.podspecPath 에 적어뒀다(적지 않으면 하위 디렉토리만 훑는다).
Pod::Spec.new do |s|
  s.name           = 'KoreanSpell'
  s.version        = '0.1.0'
  s.summary        = 'Hunspell 기반 한국어 사전 검사'
  s.description    = 'Hunspell C++ 원본을 그대로 넣어 기기 안에서 한국어 맞춤법 사전을 검사한다.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    # 벤더링한 Hunspell 을 앱 안에 정적으로 넣는다 — dllimport/visibility 속성을 끈다
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) HUNSPELL_STATIC=1',
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/cpp"',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    # 벤더 원본이라 우리가 고칠 수 없는 경고가 섞여 있다
    'WARNING_CFLAGS' => '$(inherited) -Wno-deprecated-declarations',
  }

  s.source_files = 'ios/**/*.{h,m,mm,swift}', 'cpp/**/*.{h,hxx,cxx,cpp}'
  # DEFINES_MODULE=YES(위)가 이 타깃을 Clang 모듈로 만들어 Swift 가 @import 로 읽는다 —
  # source_files 의 .h/.hxx 를 전부 공개 헤더로 묶어서 우산(umbrella) 헤더에 넣으려다,
  # cpp/ 밑 hunspell·kiwi 의 순수 C++ 헤더(<string> 등 STL 포함)까지 그 모듈 안에 끌려
  # 들어가 "could not build Objective-C module 'KoreanSpell'" / "'string' file not found"
  # 로 터졌다(EAS 클라우드의 Release 아카이브 빌드에서만 — 로컬 디버그 빌드는 이 모듈
  # 컴파일 검증을 건너뛰어 여태 안 드러났다). KoreanSpellBridge.h 는 파일 맨 위 주석대로
  # "C++ 가 한 글자도 없어야" 하는 다리 헤더 하나뿐이니, 공개 헤더를 그것만으로 좁히고
  # 나머지(C++ 구현 헤더)는 비공개로 돌려 모듈 우산 밖에 둔다.
  s.public_header_files = 'ios/KoreanSpellBridge.h'
  s.private_header_files = 'cpp/**/*.{h,hxx}'

  # 사전은 안드로이드와 달리 꺼낼 필요가 없다 — 번들 안이 이미 실제 파일 경로다.
  s.resources = 'dict/ko.aff', 'dict/ko.dic'
end
