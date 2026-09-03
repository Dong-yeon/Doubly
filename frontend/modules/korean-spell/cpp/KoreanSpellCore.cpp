#include "KoreanSpellCore.h"

#include <mutex>
#include <sys/stat.h>

#include "hunspell/hunspell.hxx"

namespace koreanspell {
namespace {

std::mutex gMutex;
Hunspell* gHunspell = nullptr;
std::string gError;

bool fileExists(const std::string& path) {
  struct stat st;
  return stat(path.c_str(), &st) == 0 && st.st_size > 0;
}

}  // namespace

bool load(const std::string& affPath, const std::string& dicPath) {
  std::lock_guard<std::mutex> lock(gMutex);
  if (gHunspell != nullptr) return true;

  // Hunspell 은 파일을 못 열어도 예외를 던지지 않고 빈 사전으로 조용히 성공한다 —
  // 그러면 모든 단어가 "틀림"으로 나와 오탐이 쏟아진다. 먼저 직접 확인한다.
  if (!fileExists(affPath) || !fileExists(dicPath)) {
    gError = "사전 파일을 찾을 수 없습니다: " + affPath + " / " + dicPath;
    return false;
  }

  gHunspell = new Hunspell(affPath.c_str(), dicPath.c_str());

  // 사전이 제대로 읽혔는지 확인한다. 아주 흔한 말 하나가 사전에 없다면 파싱이
  // 실패한 것으로 본다 — 빈 사전을 붙들고 서비스하는 것보다 실패가 낫다.
  if (!gHunspell->spell("사랑")) {
    delete gHunspell;
    gHunspell = nullptr;
    gError = "사전을 읽었지만 내용이 비어 있습니다";
    return false;
  }

  gError.clear();
  return true;
}

bool isLoaded() {
  std::lock_guard<std::mutex> lock(gMutex);
  return gHunspell != nullptr;
}

bool spell(const std::string& word) {
  std::lock_guard<std::mutex> lock(gMutex);
  // 준비 전에는 아무것도 지적하지 않는다 — 로딩 중이라는 이유로 멀쩡한 말에
  // 빨간 줄이 그어지면 안 된다.
  if (gHunspell == nullptr) return true;
  return gHunspell->spell(word);
}

std::vector<std::string> suggest(const std::string& word) {
  std::lock_guard<std::mutex> lock(gMutex);
  if (gHunspell == nullptr) return {};
  return gHunspell->suggest(word);
}

void unload() {
  std::lock_guard<std::mutex> lock(gMutex);
  delete gHunspell;
  gHunspell = nullptr;
}

std::string lastError() {
  std::lock_guard<std::mutex> lock(gMutex);
  return gError;
}

}  // namespace koreanspell
