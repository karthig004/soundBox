// iOS counterpart of the Android SoundboxNative module.
// iOS cannot read other apps' notifications, so only speech/voices are implemented here;
// everything else resolves to a safe default (see src/native/Soundbox.ts).
// Add this file to the SmartSoundbox target in Xcode (File > Add Files…) before building.

#import <React/RCTBridgeModule.h>
#import <AVFoundation/AVFoundation.h>

@interface SoundboxNative : NSObject <RCTBridgeModule, AVSpeechSynthesizerDelegate>
@property (nonatomic, strong) AVSpeechSynthesizer *synth;
@property (nonatomic, strong) NSMutableDictionary<NSValue *, RCTPromiseResolveBlock> *pending;
@property (nonatomic, strong) AVAudioEngine *clipEngine;
@property (nonatomic, copy) RCTPromiseResolveBlock clipResolve;
@end

@implementation SoundboxNative

RCT_EXPORT_MODULE(SoundboxNative)

+ (BOOL)requiresMainQueueSetup { return NO; }

- (instancetype)init {
  if ((self = [super init])) {
    _synth = [AVSpeechSynthesizer new];
    _synth.delegate = self;
    _pending = [NSMutableDictionary new];
  }
  return self;
}

RCT_EXPORT_METHOD(getStatus:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@{@"notificationAccess": @NO, @"listenerConnected": @NO, @"ignoringBatteryOptimizations": @YES,
            @"lastEventAt": @0, @"lastEventPkg": @"", @"buffered": @0, @"sdk": @0,
            @"manufacturer": @"Apple", @"model": [[UIDevice currentDevice] model], @"ttsReady": @YES});
}

RCT_EXPORT_METHOD(ttsInit:(NSString *)engine resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@YES);
}

RCT_EXPORT_METHOD(getVoices:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  NSMutableArray *out = [NSMutableArray new];
  for (AVSpeechSynthesisVoice *v in [AVSpeechSynthesisVoice speechVoices]) {
    [out addObject:@{@"id": v.identifier, @"language": v.language, @"languageName": v.name,
                     @"quality": v.quality == AVSpeechSynthesisVoiceQualityEnhanced ? @500 : @300,
                     @"latency": @0, @"network": @NO, @"notInstalled": @NO, @"gender": @""}];
  }
  resolve(out);
}

RCT_EXPORT_METHOD(getEngines:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) { resolve(@[]); }

RCT_EXPORT_METHOD(getLanguageStatus:(NSString *)tag resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  resolve([AVSpeechSynthesisVoice voiceWithLanguage:tag] ? @"available" : @"not-supported");
}

RCT_EXPORT_METHOD(speak:(NSString *)text options:(NSDictionary *)o resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [[AVAudioSession sharedInstance] setCategory:AVAudioSessionCategoryPlayback withOptions:AVAudioSessionCategoryOptionDuckOthers error:nil];
  AVSpeechUtterance *u = [AVSpeechUtterance speechUtteranceWithString:text];
  NSString *voiceId = o[@"voice"];
  AVSpeechSynthesisVoice *voice = [voiceId isKindOfClass:[NSString class]] ? [AVSpeechSynthesisVoice voiceWithIdentifier:voiceId] : nil;
  u.voice = voice ?: [AVSpeechSynthesisVoice voiceWithLanguage:o[@"language"] ?: @"en-IN"];
  if (!u.voice) { reject(@"tts_error", @"missing-voice", nil); return; }
  u.pitchMultiplier = MAX(0.5, MIN(2.0, [o[@"pitch"] floatValue] ?: 1.0));
  u.rate = AVSpeechUtteranceDefaultSpeechRate * MAX(0.3, MIN(2.0, [o[@"rate"] floatValue] ?: 1.0));
  u.volume = o[@"volume"] ? [o[@"volume"] floatValue] : 1.0;
  self.pending[[NSValue valueWithNonretainedObject:u]] = resolve;
  [self.synth speakUtterance:u];
}

- (void)speechSynthesizer:(AVSpeechSynthesizer *)s didFinishSpeechUtterance:(AVSpeechUtterance *)u { [self finish:u]; }
- (void)speechSynthesizer:(AVSpeechSynthesizer *)s didCancelSpeechUtterance:(AVSpeechUtterance *)u { [self finish:u]; }

- (void)finish:(AVSpeechUtterance *)u {
  NSValue *k = [NSValue valueWithNonretainedObject:u];
  RCTPromiseResolveBlock r = self.pending[k];
  [self.pending removeObjectForKey:k];
  if (r) r(@"done");
}

// ---------- Bundled voice clips (Tamil/Hindi/English work on every iPhone, no system voice needed) ----------

static NSURL *ClipURL(NSString *file) {
  NSString *name = [file stringByDeletingPathExtension];
  NSURL *u = [[NSBundle mainBundle] URLForResource:name withExtension:@"mp3" subdirectory:@"voice"];
  return u ?: [[NSBundle mainBundle] URLForResource:name withExtension:@"mp3"];
}

/** Decodes a clip to mono float PCM at the clip's own rate, with leading/trailing silence trimmed. Cached. */
- (AVAudioPCMBuffer *)clipBuffer:(NSString *)file format:(AVAudioFormat **)fmtOut {
  static NSCache *cache;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ cache = [NSCache new]; });
  AVAudioPCMBuffer *hit = [cache objectForKey:file];
  if (hit) { *fmtOut = hit.format; return hit; }
  NSURL *url = ClipURL(file);
  if (!url) return nil;
  AVAudioFile *f = [[AVAudioFile alloc] initForReading:url commonFormat:AVAudioPCMFormatFloat32 interleaved:NO error:nil];
  if (!f) return nil;
  AVAudioFormat *mono = [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatFloat32 sampleRate:f.processingFormat.sampleRate channels:1 interleaved:NO];
  AVAudioPCMBuffer *raw = [[AVAudioPCMBuffer alloc] initWithPCMFormat:f.processingFormat frameCapacity:(AVAudioFrameCount)f.length];
  if (![f readIntoBuffer:raw error:nil]) return nil;
  float *s = raw.floatChannelData[0];
  AVAudioFrameCount n = raw.frameLength, a = 0, b = n ? n - 1 : 0;
  const float th = 350.0f / 32768.0f;
  while (a < b && fabsf(s[a]) < th) a++;
  while (b > a && fabsf(s[b]) < th) b--;
  AVAudioFrameCount pad = (AVAudioFrameCount)(mono.sampleRate * 0.025);
  a = a > pad ? a - pad : 0;
  b = MIN(b + pad, n ? n - 1 : 0);
  AVAudioFrameCount len = n ? b - a + 1 : 0;
  AVAudioPCMBuffer *out = [[AVAudioPCMBuffer alloc] initWithPCMFormat:mono frameCapacity:MAX(len, 1)];
  memcpy(out.floatChannelData[0], s + a, len * sizeof(float));
  out.frameLength = len;
  [cache setObject:out forKey:file];
  *fmtOut = mono;
  return out;
}

RCT_EXPORT_METHOD(playClips:(NSArray<NSString *> *)files options:(NSDictionary *)o resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self stopClips];
  AVAudioFormat *fmt = nil;
  NSMutableArray<AVAudioPCMBuffer *> *parts = [NSMutableArray new];
  for (NSString *file in files) {
    AVAudioFormat *f = nil;
    AVAudioPCMBuffer *b = [self clipBuffer:file format:&f];
    if (!b) { reject(@"clip_missing", [NSString stringWithFormat:@"Voice clip %@ is not bundled", file], nil); return; }
    if (!fmt) fmt = f;
    [parts addObject:b];
  }
  if (!fmt) { reject(@"clip_missing", @"No clips", nil); return; }
  double gapMs = o[@"gapMs"] ? [o[@"gapMs"] doubleValue] : 40;
  AVAudioFrameCount gap = (AVAudioFrameCount)(fmt.sampleRate * gapMs / 1000.0), total = 0;
  for (AVAudioPCMBuffer *b in parts) total += b.frameLength + gap;
  AVAudioPCMBuffer *all = [[AVAudioPCMBuffer alloc] initWithPCMFormat:fmt frameCapacity:total];
  memset(all.floatChannelData[0], 0, total * sizeof(float));
  AVAudioFrameCount pos = 0;
  for (AVAudioPCMBuffer *b in parts) {
    memcpy(all.floatChannelData[0] + pos, b.floatChannelData[0], b.frameLength * sizeof(float));
    pos += b.frameLength + gap;
  }
  all.frameLength = total;

  [[AVAudioSession sharedInstance] setCategory:AVAudioSessionCategoryPlayback withOptions:AVAudioSessionCategoryOptionDuckOthers error:nil];
  [[AVAudioSession sharedInstance] setActive:YES error:nil];
  AVAudioEngine *engine = [AVAudioEngine new];
  AVAudioPlayerNode *node = [AVAudioPlayerNode new];
  AVAudioUnitTimePitch *tp = [AVAudioUnitTimePitch new];
  float rate = o[@"rate"] ? [o[@"rate"] floatValue] : 1.0f;
  float pitch = o[@"pitch"] ? [o[@"pitch"] floatValue] : 1.0f;
  tp.rate = MAX(0.5f, MIN(2.0f, rate));
  tp.pitch = 1200.0f * log2f(MAX(0.5f, MIN(2.0f, pitch)));
  [engine attachNode:node];
  [engine attachNode:tp];
  [engine connect:node to:tp format:fmt];
  [engine connect:tp to:engine.mainMixerNode format:fmt];
  node.volume = o[@"volume"] ? [o[@"volume"] floatValue] : 1.0f;
  NSError *err = nil;
  if (![engine startAndReturnError:&err]) { reject(@"clip_error", err.localizedDescription, err); return; }
  self.clipEngine = engine;
  self.clipResolve = resolve;
  __weak typeof(self) weak = self;
  [node scheduleBuffer:all atTime:nil options:0 completionCallbackType:AVAudioPlayerNodeCompletionDataPlayedBack
     completionHandler:^(AVAudioPlayerNodeCompletionCallbackType t) {
    dispatch_async(dispatch_get_main_queue(), ^{ if (weak.clipEngine == engine) [weak stopClips]; });
  }];
  [node play];
}

- (void)stopClips {
  AVAudioEngine *e = self.clipEngine;
  RCTPromiseResolveBlock r = self.clipResolve;
  self.clipEngine = nil;
  self.clipResolve = nil;
  [e stop];
  if (r) r(@"done");
}

RCT_EXPORT_METHOD(stopSpeaking:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self.synth stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
  dispatch_async(dispatch_get_main_queue(), ^{ [self stopClips]; resolve(nil); });
}

RCT_EXPORT_METHOD(playChime:(NSString *)idv volume:(double)volume resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(nil); // chimes are synthesised on Android only
}

RCT_EXPORT_METHOD(setConfig:(BOOL)enabled watched:(NSArray *)w capture:(BOOL)c watchSms:(BOOL)s smsVerify:(BOOL)v resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) { resolve(nil); }
RCT_EXPORT_METHOD(getDefaultSmsPackage:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) { resolve(nil); }
RCT_EXPORT_METHOD(getDropLog:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) { resolve(@"[]"); }
RCT_EXPORT_METHOD(clearDropLog:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) { resolve(nil); }
RCT_EXPORT_METHOD(drainEvents:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) { resolve(@"[]"); }
RCT_EXPORT_METHOD(requestRebind:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) { resolve(nil); }
RCT_EXPORT_METHOD(installedPackages:(NSArray *)p resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) { resolve(@{}); }
RCT_EXPORT_METHOD(canAuthenticate:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) { resolve(@NO); }
RCT_EXPORT_METHOD(vibrate:(double)ms) {}

@end
