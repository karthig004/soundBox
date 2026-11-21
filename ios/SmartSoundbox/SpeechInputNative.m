// iOS counterpart of SpeechInputModule.kt — voice → text with Apple's Speech framework.
// Add this file to the SmartSoundbox target in Xcode. Uses on-device recognition when the
// language supports it, otherwise Apple's servers.

#import <React/RCTEventEmitter.h>
#import <AVFoundation/AVFoundation.h>
#import <Speech/Speech.h>

@interface SpeechInputNative : RCTEventEmitter
@property (nonatomic, strong) AVAudioEngine *engine;
@property (nonatomic, strong) SFSpeechAudioBufferRecognitionRequest *request;
@property (nonatomic, strong) SFSpeechRecognitionTask *task;
@property (nonatomic, copy) RCTPromiseResolveBlock resolve;
@property (nonatomic, copy) NSString *latest;
@end

@implementation SpeechInputNative

RCT_EXPORT_MODULE(SpeechInputNative)

+ (BOOL)requiresMainQueueSetup { return NO; }
- (NSArray<NSString *> *)supportedEvents { return @[@"SpeechInput"]; }

RCT_EXPORT_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  resolve(@([SFSpeechRecognizer new] != nil));
}

RCT_EXPORT_METHOD(start:(NSString *)lang resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (status != SFSpeechRecognizerAuthorizationStatusAuthorized) {
        reject(@"permission", @"Speech recognition permission denied", nil); return;
      }
      SFSpeechRecognizer *rec = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:lang]];
      if (!rec || !rec.isAvailable) {
        reject(@"language", @"This language isn't available for voice input on this iPhone", nil); return;
      }
      [self finishWith:@""];
      NSError *err = nil;
      AVAudioSession *session = [AVAudioSession sharedInstance];
      [session setCategory:AVAudioSessionCategoryPlayAndRecord mode:AVAudioSessionModeMeasurement options:AVAudioSessionCategoryOptionDefaultToSpeaker | AVAudioSessionCategoryOptionDuckOthers error:&err];
      [session setActive:YES withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:&err];

      self.request = [SFSpeechAudioBufferRecognitionRequest new];
      self.request.shouldReportPartialResults = YES;
      if (@available(iOS 13, *)) {
        if (rec.supportsOnDeviceRecognition) self.request.requiresOnDeviceRecognition = YES;
      }
      self.engine = [AVAudioEngine new];
      AVAudioInputNode *input = self.engine.inputNode;
      __weak typeof(self) weak = self;
      [input installTapOnBus:0 bufferSize:1024 format:[input outputFormatForBus:0] block:^(AVAudioPCMBuffer *buf, AVAudioTime *when) {
        [weak.request appendAudioPCMBuffer:buf];
        float *d = buf.floatChannelData[0];
        float sum = 0;
        for (AVAudioFrameCount i = 0; i < buf.frameLength; i++) sum += d[i] * d[i];
        float rms = buf.frameLength ? sqrtf(sum / buf.frameLength) : 0;
        [weak sendEventWithName:@"SpeechInput" body:@{@"type": @"level", @"level": @(MIN(1.0, rms * 12))}];
      }];
      [self.engine prepare];
      if (![self.engine startAndReturnError:&err]) { reject(@"error", err.localizedDescription, err); return; }
      self.resolve = resolve;
      self.latest = @"";
      [self sendEventWithName:@"SpeechInput" body:@{@"type": @"ready"}];
      self.task = [rec recognitionTaskWithRequest:self.request resultHandler:^(SFSpeechRecognitionResult *r, NSError *e) {
        dispatch_async(dispatch_get_main_queue(), ^{
          if (r) {
            weak.latest = r.bestTranscription.formattedString;
            [weak sendEventWithName:@"SpeechInput" body:@{@"type": @"partial", @"text": weak.latest}];
          }
          if (e || r.isFinal) [weak finishWith:weak.latest ?: @""];
        });
      }];
    });
  }];
}

- (void)finishWith:(NSString *)text {
  [self.engine stop];
  [self.engine.inputNode removeTapOnBus:0];
  [self.request endAudio];
  [self.task cancel];
  self.engine = nil;
  self.request = nil;
  self.task = nil;
  RCTPromiseResolveBlock r = self.resolve;
  self.resolve = nil;
  if (r) {
    [self sendEventWithName:@"SpeechInput" body:@{@"type": @"end"}];
    r(text);
  }
}

RCT_EXPORT_METHOD(stop:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [self.request endAudio];
    [self.engine stop];
    // Final result arrives through the task handler; finish shortly if it doesn't.
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.2 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{ [self finishWith:self.latest ?: @""]; });
    resolve(nil);
  });
}

RCT_EXPORT_METHOD(cancel:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_main_queue(), ^{ [self finishWith:@""]; resolve(nil); });
}

@end
