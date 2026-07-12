import { describe, expect, test } from 'bun:test';
import {
  parseCaptureVisibleTabRequest,
  parseCaptureVisibleTabResult,
} from './element-capture';

describe('element capture runtime boundary', () => {
  test('accepts only the exact visible-tab capture request', () => {
    expect(parseCaptureVisibleTabRequest({ type: 'app-notes:capture-visible-tab' })).toEqual({
      type: 'app-notes:capture-visible-tab',
    });
    expect(parseCaptureVisibleTabRequest({
      type: 'app-notes:capture-visible-tab',
      unexpected: true,
    })).toBeNull();
    expect(parseCaptureVisibleTabRequest({ type: 'capture-visible-tab' })).toBeNull();
  });

  test('parses captured PNGs and typed failures', () => {
    expect(parseCaptureVisibleTabResult({
      _tag: 'captured-tab',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    })).toEqual({
      _tag: 'captured-tab',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(parseCaptureVisibleTabResult({
      _tag: 'capture-failed',
      message: 'Capture unavailable.',
    })).toEqual({ _tag: 'capture-failed', message: 'Capture unavailable.' });
    expect(parseCaptureVisibleTabResult({
      _tag: 'captured-tab',
      dataUrl: 'data:image/jpeg;base64,AAAA',
    })).toBeNull();
  });
});
