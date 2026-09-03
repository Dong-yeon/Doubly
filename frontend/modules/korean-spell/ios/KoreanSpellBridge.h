/**
 * Swift ↔ C++ 다리. Swift 는 C++ 를 직접 부르지 못하므로 Objective-C 인터페이스로
 * 한 겹 감싼다 — 이 헤더에는 C++ 가 한 글자도 없어야 Swift 가 읽을 수 있다.
 */
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface KoreanSpellBridge : NSObject

+ (BOOL)loadWithAff:(NSString *)affPath dic:(NSString *)dicPath;
+ (BOOL)isLoaded;
/** 어절마다 사전에 있는지 — @(YES)/@(NO) 가 입력 순서대로 담긴다 */
+ (NSArray<NSNumber *> *)spellMany:(NSArray<NSString *> *)words;
+ (NSArray<NSString *> *)suggest:(NSString *)word;
+ (void)unload;
+ (NSString *)lastError;

@end

NS_ASSUME_NONNULL_END
