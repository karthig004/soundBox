// iOS counterpart of TranslatorModule.kt — on-device translation via Google ML Kit.
// Requires `pod 'GoogleMLKit/Translate'` (see Podfile) and adding this file to the SmartSoundbox target.

#import <React/RCTBridgeModule.h>
@import MLKitTranslate;
@import MLKitCommon;

@interface TranslatorNative : NSObject <RCTBridgeModule>
@property (nonatomic, strong) NSMutableDictionary<NSString *, MLKTranslator *> *translators;
@property (nonatomic, strong) NSMutableDictionary<NSString *, RCTPromiseResolveBlock> *downloads;
@end

@implementation TranslatorNative

RCT_EXPORT_MODULE(TranslatorNative)

+ (BOOL)requiresMainQueueSetup { return NO; }

- (instancetype)init {
  if ((self = [super init])) {
    _translators = [NSMutableDictionary new];
    _downloads = [NSMutableDictionary new];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(downloadDone:) name:MLKModelDownloadDidSucceedNotification object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(downloadDone:) name:MLKModelDownloadDidFailNotification object:nil];
  }
  return self;
}

static MLKTranslateLanguage LangCode(NSString *tag) {
  return MLKTranslateLanguageForLanguageTag(tag);
}

- (NSSet<NSString *> *)downloaded {
  NSMutableSet *s = [NSMutableSet setWithObject:MLKTranslateLanguageEnglish];
  for (MLKTranslateRemoteModel *m in [MLKModelManager modelManager].downloadedTranslateModels) [s addObject:m.language];
  return s;
}

RCT_EXPORT_METHOD(downloadedLanguages:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  resolve([[self downloaded] allObjects]);
}

RCT_EXPORT_METHOD(downloadLanguage:(NSString *)lang wifiOnly:(BOOL)wifiOnly resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  MLKTranslateLanguage code = LangCode(lang);
  if (!code) { reject(@"translate_error", @"Unsupported language", nil); return; }
  if ([[self downloaded] containsObject:code]) { resolve(@YES); return; }
  MLKTranslateRemoteModel *model = [MLKTranslateRemoteModel translateRemoteModelWithLanguage:code];
  MLKModelDownloadConditions *cond = [[MLKModelDownloadConditions alloc] initWithAllowsCellularAccess:!wifiOnly allowsBackgroundDownloading:YES];
  @synchronized (self) { self.downloads[code] = resolve; }
  [[MLKModelManager modelManager] downloadModel:model conditions:cond];
}

- (void)downloadDone:(NSNotification *)n {
  MLKTranslateRemoteModel *m = n.userInfo[MLKModelDownloadUserInfoKeyRemoteModel];
  if (![m isKindOfClass:[MLKTranslateRemoteModel class]]) return;
  RCTPromiseResolveBlock r;
  @synchronized (self) { r = self.downloads[m.language]; [self.downloads removeObjectForKey:m.language]; }
  if (r) r(@([n.name isEqualToString:MLKModelDownloadDidSucceedNotification]));
}

RCT_EXPORT_METHOD(deleteLanguage:(NSString *)lang resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  MLKTranslateRemoteModel *model = [MLKTranslateRemoteModel translateRemoteModelWithLanguage:LangCode(lang)];
  [[MLKModelManager modelManager] deleteDownloadedModel:model completion:^(NSError *e) {
    if (e) reject(@"translate_error", e.localizedDescription, e); else resolve(@YES);
  }];
}

RCT_EXPORT_METHOD(translate:(NSString *)text from:(NSString *)from to:(NSString *)to resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  if ([from isEqualToString:to]) { resolve(text); return; }
  MLKTranslateLanguage f = LangCode(from), t = LangCode(to);
  if (!f || !t) { reject(@"translate_error", @"Unsupported language", nil); return; }
  NSSet *have = [self downloaded];
  NSMutableArray *missing = [NSMutableArray new];
  if (![have containsObject:f]) [missing addObject:f];
  if (![have containsObject:t]) [missing addObject:t];
  if (missing.count) { reject(@"model_missing", [missing componentsJoinedByString:@","], nil); return; }
  NSString *key = [NSString stringWithFormat:@"%@>%@", f, t];
  MLKTranslator *tr;
  @synchronized (self) {
    tr = self.translators[key];
    if (!tr) {
      tr = [MLKTranslator translatorWithOptions:[[MLKTranslatorOptions alloc] initWithSourceLanguage:f targetLanguage:t]];
      self.translators[key] = tr;
    }
  }
  [tr translateText:text completion:^(NSString *out, NSError *e) {
    if (e) reject(@"translate_error", e.localizedDescription, e); else resolve(out ?: @"");
  }];
}

@end
