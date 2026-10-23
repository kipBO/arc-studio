import assert from 'node:assert/strict';
import test from 'node:test';
import { getEffectiveCanvasQuality } from '../src/core/canvasQuality.js';

const denseZoomedOutViewport = {
  mode: 'auto',
  performanceReduced: true,
  zoom: 0.5,
  visibleNodeCount: 100,
  visibleWireCount: 120
};
//
test('automatic low performance mode keeps full quality until a dense graph is zoomed out', () => {
  assert.equal(getEffectiveCanvasQuality({ ...denseZoomedOutViewport, visibleNodeCount: 79 }), 'quality');
  assert.equal(getEffectiveCanvasQuality({ ...denseZoomedOutViewport, visibleWireCount: 99 }), 'quality');
  assert.equal(getEffectiveCanvasQuality({ ...denseZoomedOutViewport, zoom: 0.56 }), 'quality');
  assert.equal(getEffectiveCanvasQuality(denseZoomedOutViewport), 'fast');
});

test('manual reduced quality modes are also gated by zoom and visible graph density', () => {
  assert.equal(getEffectiveCanvasQuality({ ...denseZoomedOutViewport, mode: 'fast', zoom: 1 }), 'quality');
  assert.equal(getEffectiveCanvasQuality({ ...denseZoomedOutViewport, mode: 'optimal', zoom: 1 }), 'quality');
  assert.equal(getEffectiveCanvasQuality({ ...denseZoomedOutViewport, mode: 'fast' }), 'fast');
  assert.equal(getEffectiveCanvasQuality({ ...denseZoomedOutViewport, mode: 'optimal' }), 'optimal');
});

test('quality mode and capable devices retain full quality in dense zoomed-out views', () => {
  assert.equal(getEffectiveCanvasQuality({ ...denseZoomedOutViewport, mode: 'quality' }), 'quality');
  assert.equal(getEffectiveCanvasQuality({ ...denseZoomedOutViewport, performanceReduced: false }), 'quality');
});
