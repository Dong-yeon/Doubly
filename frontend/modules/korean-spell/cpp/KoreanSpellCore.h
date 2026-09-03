/**
 * Hunspell 코어 얇은 래퍼 — 안드로이드(JNI)와 iOS(Objective-C++)가 함께 쓴다.
 *
 * <p>플랫폼 코드가 Hunspell 클래스를 직접 만지지 않게 막는 게 목적이다. 사전 로딩은
 * 1.5초쯤 걸리고 50MB 넘게 잡아먹으므로(실기기 실측, docs 참고) 인스턴스는 하나만
 * 두고 재사용한다.
 *
 * <p>Hunspell 인스턴스는 스레드 안전하지 않다 — 여기서 뮤텍스로 감싼다. 검사 호출은
 * 단어당 0.005ms 수준이라 잠금 경합이 문제될 일이 없다.
 */
#pragma once

#include <string>
#include <vector>

namespace koreanspell {

/**
 * 사전을 읽어 엔진을 준비한다. 이미 준비됐으면 아무것도 하지 않고 true 를 반환한다.
 *
 * <p>Hunspell 은 파일 경로만 받는다(메모리 버퍼 API 가 없다). 안드로이드는 APK 안의
 * asset 경로를 열 수 없으므로 호출 전에 실제 파일로 꺼내둬야 한다.
 *
 * @return 로딩 성공 여부. 실패 사유는 {@link lastError} 에 담긴다.
 */
bool load(const std::string& affPath, const std::string& dicPath);

/** 엔진이 준비됐는가 */
bool isLoaded();

/** 사전에 있는 말인가. 엔진이 준비되지 않았으면 항상 true(=지적하지 않음) */
bool spell(const std::string& word);

/** 고침 후보. 엔진이 준비되지 않았으면 빈 목록 */
std::vector<std::string> suggest(const std::string& word);

/** 사전을 내리고 메모리를 돌려준다 */
void unload();

/** 마지막 실패 사유(성공했으면 빈 문자열) */
std::string lastError();

}  // namespace koreanspell
