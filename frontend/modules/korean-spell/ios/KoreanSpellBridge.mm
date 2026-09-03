#import "KoreanSpellBridge.h"

#include <string>
#include <vector>

#include "KoreanSpellCore.h"

@implementation KoreanSpellBridge

+ (BOOL)loadWithAff:(NSString *)affPath dic:(NSString *)dicPath {
  return koreanspell::load(affPath.UTF8String, dicPath.UTF8String) ? YES : NO;
}

+ (BOOL)isLoaded {
  return koreanspell::isLoaded() ? YES : NO;
}

+ (NSArray<NSNumber *> *)spellMany:(NSArray<NSString *> *)words {
  NSMutableArray<NSNumber *> *result = [NSMutableArray arrayWithCapacity:words.count];
  for (NSString *word in words) {
    [result addObject:@(koreanspell::spell(word.UTF8String))];
  }
  return result;
}

+ (NSArray<NSString *> *)suggest:(NSString *)word {
  const std::vector<std::string> suggestions = koreanspell::suggest(word.UTF8String);
  NSMutableArray<NSString *> *result = [NSMutableArray arrayWithCapacity:suggestions.size()];
  for (const std::string &suggestion : suggestions) {
    [result addObject:[NSString stringWithUTF8String:suggestion.c_str()]];
  }
  return result;
}

+ (void)unload {
  koreanspell::unload();
}

+ (NSString *)lastError {
  return [NSString stringWithUTF8String:koreanspell::lastError().c_str()];
}

@end
