import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';
import {chunkText, LRU, parseGoogleResponse, segmentText} from '../src/engine/translateText';

const rebuild = (s: string) => segmentText(s).map(p => p.text).join('');
const sentences = (s: string) => segmentText(s).filter(p => p.translate).map(p => p.text);

describe('segmentText', () => {
  test('splits sentences and keeps spacing/newlines losslessly', () => {
    const src = 'Good morning.\nHow are you today? I am fine, thank you.\n\n  Please pay 250.50 rupees.  ';
    expect(rebuild(src)).toBe(src);
    expect(sentences(src)).toEqual(['Good morning.', 'How are you today?', 'I am fine, thank you.', 'Please pay 250.50 rupees.']);
  });

  test('does not split decimals, initials or titles', () => {
    expect(sentences('Pay 3.5 lakh to K. Ramesh today.')).toEqual(['Pay 3.5 lakh to K. Ramesh today.']);
    expect(sentences('Ask Dr. Rao about it. Then call me.')).toEqual(['Ask Dr. Rao about it.', 'Then call me.']);
    expect(sentences('Meet at 5 p.m. sharp. Do not be late.')).toEqual(['Meet at 5 p.m. sharp.', 'Do not be late.']);
  });

  test('splits Tamil and Hindi text (danda, ?, !)', () => {
    expect(sentences('नमस्ते। आप कैसे हैं? बहुत अच्छा!')).toEqual(['नमस्ते।', 'आप कैसे हैं?', 'बहुत अच्छा!']);
    expect(sentences('வணக்கம். நீங்கள் எப்படி இருக்கிறீர்கள்?')).toEqual(['வணக்கம்.', 'நீங்கள் எப்படி இருக்கிறீர்கள்?']);
  });

  test('digits, punctuation and blank lines are copied through, not translated', () => {
    const pieces = segmentText('12345\n\n...\nHello');
    expect(pieces.filter(p => p.translate).map(p => p.text)).toEqual(['Hello']);
    expect(rebuild('12345\n\n...\nHello')).toBe('12345\n\n...\nHello');
  });

  test('handles Windows newlines and empty input', () => {
    expect(rebuild('a.\r\nb.\r\n')).toBe('a.\r\nb.\r\n');
    expect(segmentText('')).toEqual([]);
  });

  test('wraps one huge run so no piece is longer than the on-device limit', () => {
    const run = Array.from({length: 300}, (_, i) => `word${i}`).join(' ');
    const pieces = segmentText(run);
    expect(pieces.map(p => p.text).join('')).toBe(run);
    expect(Math.max(...pieces.map(p => p.text.length))).toBeLessThanOrEqual(400);
  });

  test('round-trips arbitrary text (fuzz)', () => {
    const alphabet = ['a', 'B', ' ', ' ', '.', '!', '?', '।', '\n', '\r\n', '3', 'த', 'क', '"', ')', 'Mr', 'e.g', '…'];
    let seed = 42;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let n = 0; n < 300; n++) {
      let s = '';
      for (let i = 0, len = Math.floor(rnd() * 80); i < len; i++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      expect(rebuild(s)).toBe(s);
    }
  });
});

describe('chunkText', () => {
  test('short text is a single chunk; long text is cut only between sentences', () => {
    expect(chunkText('Hello.')).toEqual(['Hello.']);
    const long = Array.from({length: 200}, (_, i) => `Sentence number ${i}.`).join(' ');
    const chunks = chunkText(long, 500);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(long);
    chunks.forEach(c => expect(c.length).toBeLessThanOrEqual(520));
  });
});

describe('parseGoogleResponse', () => {
  test('joins the translated segments', () => {
    expect(parseGoogleResponse([[['காலை வணக்கம்.\n', 'Good morning.\n', null], ['எப்படி இருக்கிறீர்கள்?', 'How are you?', null]], null, 'en'])).toBe('காலை வணக்கம்.\nஎப்படி இருக்கிறீர்கள்?');
  });
  test('rejects an unexpected reply', () => {
    expect(() => parseGoogleResponse({error: 'x'})).toThrow();
    expect(() => parseGoogleResponse(null)).toThrow();
  });
});

describe('LRU', () => {
  test('evicts the least recently used entry', () => {
    const c = new LRU<number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a');
    c.set('c', 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
  });
});

describe('Translator (online → offline fallback)', () => {
  const native = {
    translate: jest.fn<(t: string, f: string, to: string) => Promise<string>>(),
    downloadedLanguages: jest.fn<() => Promise<string[]>>(),
  };
  const fetchMock = jest.fn<(...a: any[]) => Promise<any>>();
  const realFetch = (global as any).fetch;

  const load = () => {
    jest.resetModules();
    jest.doMock('react-native', () => ({NativeModules: {TranslatorNative: native}}));
    return require('../src/native/Translator') as typeof import('../src/native/Translator');
  };
  const gOk = (text: string) => ({ok: true, status: 200, json: async () => [[[text, 'src', null]], null, 'en']});

  beforeEach(() => {
    native.translate.mockReset();
    native.translate.mockImplementation(async (t: string) => `«${t}»`);
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });
  afterEach(() => {
    (global as any).fetch = realFetch;
  });

  test('uses Google when online (and the on-device engine is not touched)', async () => {
    fetchMock.mockResolvedValue(gOk('வணக்கம்'));
    const {Translator} = load();
    expect(await Translator.translate('Hello', 'en', 'ta')).toEqual({text: 'வணக்கம்', engine: 'google'});
    expect(native.translate).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('sl=en&tl=ta');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('q=Hello');
  });

  test('caches repeat translations', async () => {
    fetchMock.mockResolvedValue(gOk('வணக்கம்'));
    const {Translator} = load();
    await Translator.translate('Hello', 'en', 'ta');
    await Translator.translate('Hello', 'en', 'ta');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('falls back to on-device, sentence by sentence, when the network fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const {Translator} = load();
    const r = await Translator.translate('Good morning.\nHow are you? Fine.', 'en', 'ta');
    expect(r.engine).toBe('device');
    expect(r.text).toBe('«Good morning.»\n«How are you?» «Fine.»');
    expect(native.translate).toHaveBeenCalledTimes(3);
  });

  test('after a network failure it skips the online attempt for a while', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const {Translator} = load();
    await Translator.translate('One.', 'en', 'ta');
    await Translator.translate('Two.', 'en', 'ta');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(native.translate).toHaveBeenCalledTimes(2);
  });

  test('HTTP errors (rate limit) also fall back', async () => {
    fetchMock.mockResolvedValue({ok: false, status: 429, json: async () => ({})});
    const {Translator} = load();
    expect((await Translator.translate('Hi.', 'en', 'hi')).engine).toBe('device');
  });

  test('online switched off → never touches the network', async () => {
    const {Translator} = load();
    const r = await Translator.translate('Hi.', 'en', 'hi', {online: false});
    expect(r.engine).toBe('device');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('offline with a missing pack → ModelMissingError naming the pack', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    native.translate.mockRejectedValue(Object.assign(new Error('ta'), {code: 'model_missing'}));
    const {Translator, ModelMissingError} = load();
    await expect(Translator.translate('Hi.', 'en', 'ta')).rejects.toMatchObject({langs: ['ta']});
    await expect(Translator.translate('Hi there.', 'en', 'ta')).rejects.toBeInstanceOf(ModelMissingError);
  });

  test('same language is returned untouched', async () => {
    const {Translator} = load();
    expect(await Translator.translate('Hi', 'en', 'en')).toEqual({text: 'Hi', engine: 'device'});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
