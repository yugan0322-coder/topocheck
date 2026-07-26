import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { analyzeGeometry, computeGeometricDeviation } from '../public/js/analyzer.js';
import { PKManager } from '../public/js/pkManager.js';

test('counts indexed triangles and vertices from actual BufferGeometry data', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const result = analyzeGeometry(geometry, 10);
  assert.equal(result.faceCount, 2);
  assert.equal(result.vertexCount, 4);
  assert.equal(result.badFaceCount, 0);
});

test('flags a needle triangle using longest-edge / shortest-altitude', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 100, 0, 0, 0, 0.01, 0,
  ], 3));
  const result = analyzeGeometry(geometry, 10);
  assert.deepEqual(result.badFaces, [0]);
  assert.deepEqual(result.d3_badFaces, [0]);
  assert.deepEqual(result.d3_degenerateFaces, [0]);
  assert.ok(result.d3_minAngles[0] < 10);
  assert.ok(result.aspectRatios[0] > 10);
});

test('computes a normal triangle angle without a false D3 positive', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 1, 0, 0, 0.5, Math.sqrt(3) / 2, 0,
  ], 3));
  const result = analyzeGeometry(geometry);
  assert.equal(result.d3_badFaceCount, 0);
  assert.ok(Math.abs(result.d3_minAngles[0] - 60) < 0.001);
});

test('detects a five-valence pole from the vertex adjacency graph', () => {
  const geometry = new THREE.BufferGeometry();
  const positions = [0, 0, 0];
  const indices = [];
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    positions.push(Math.cos(angle), Math.sin(angle), 0);
  }
  for (let i = 0; i < 5; i += 1) indices.push(0, i + 1, ((i + 1) % 5) + 1);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const result = analyzeGeometry(geometry);
  assert.equal(result.d4_poleCount, 1);
  assert.equal(result.d4_poles[0].index, 0);
  assert.equal(result.d4_poles[0].valence, 5);
  assert.deepEqual(result.d4_valences.slice(0, 1), [5]);
});

test('flags duplicate indices as a degenerate bad face', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
  ], 3));
  geometry.setIndex([0, 0, 2]);
  const result = analyzeGeometry(geometry);
  assert.deepEqual(result.duplicateIndexFaces, [0]);
  assert.deepEqual(result.badFaces, [0]);
});

test('computes D2 deviation from low vertices to the nearest high surface', async () => {
  const lowGeometry = new THREE.BufferGeometry();
  lowGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.4, -0.2, 0.08, 0.4, -0.2, 0.08, 0, 0.4, 0.08,
  ], 3));
  lowGeometry.computeVertexNormals();
  const low = new THREE.Mesh(lowGeometry, new THREE.MeshBasicMaterial());

  const highGeometry = new THREE.PlaneGeometry(4, 4);
  const high = new THREE.Mesh(highGeometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  low.updateMatrixWorld(true);
  high.updateMatrixWorld(true);

  const result = await computeGeometricDeviation(low, high, { batchSize: 1 });
  assert.equal(result.d2_unmappedCount, 0);
  assert.equal(result.d2_sampledCount, 3);
  assert.ok(Math.abs(result.d2_averageDeviation - 0.08) < 0.0001);
  assert.ok(Math.abs(result.d2_maxDeviation - 0.08) < 0.0001);
  assert.equal(result.d2_score, 60);
});

test('activates PK only when both slots exist and clears cleanly', () => {
  const states = [];
  const manager = new PKManager({ onStateChange: (state) => states.push(state.active) });
  manager.setSlot('A', { model: {}, fileName: 'a.obj' });
  assert.equal(manager.pkActive, false);
  manager.setSlot('B', { model: {}, fileName: 'b.obj' });
  assert.equal(manager.pkActive, true);
  assert.equal(manager.swapSlots(), true);
  assert.equal(manager.getSlot('A').fileName, 'b.obj');
  manager.clearSlot('B');
  assert.equal(manager.pkActive, false);
  assert.deepEqual(states, [false, true, true, false]);
});
