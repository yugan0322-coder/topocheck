import * as THREE from 'three';

const A = new THREE.Vector3();
const B = new THREE.Vector3();
const C = new THREE.Vector3();
const AB = new THREE.Vector3();
const AC = new THREE.Vector3();
const BA = new THREE.Vector3();
const BC = new THREE.Vector3();
const CA = new THREE.Vector3();
const CB = new THREE.Vector3();
const CROSS = new THREE.Vector3();

const DEG = 180 / Math.PI;
const D3_ANGLE_THRESHOLD = 10;

function angleBetween(first, second) {
  const denominator = first.length() * second.length();
  if (denominator <= Number.EPSILON) return 0;
  // 浮点误差可能使余弦略微越过 [-1, 1]，先夹紧再反余弦。
  const cosine = THREE.MathUtils.clamp(first.dot(second) / denominator, -1, 1);
  return Math.acos(cosine) * DEG;
}

function addEdge(neighbors, first, second) {
  if (first === second || first < 0 || second < 0 || first >= neighbors.length || second >= neighbors.length) return;
  neighbors[first].add(second);
  neighbors[second].add(first);
}

function createLogicalVertices(position, index) {
  if (index) {
    return {
      logicalOf: (rawIndex) => rawIndex,
      positions: Array.from({ length: position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(position, i)),
    };
  }

  // OBJ 等格式经常是非索引几何体：同一个空间位置会被复制到多个三角形。
  // 用确定性的坐标量化把重合顶点焊接起来，才能得到有意义的价数。
  const keyToLogical = new Map();
  const logicalOfRaw = new Int32Array(position.count);
  const positions = [];
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const key = `${Math.round(x * 1e6)}:${Math.round(y * 1e6)}:${Math.round(z * 1e6)}`;
    let logical = keyToLogical.get(key);
    if (logical === undefined) {
      logical = positions.length;
      keyToLogical.set(key, logical);
      positions.push(new THREE.Vector3(x, y, z));
    }
    logicalOfRaw[i] = logical;
  }
  return { logicalOf: (rawIndex) => logicalOfRaw[rawIndex], positions };
}

/**
 * 对单个 BufferGeometry 做纯数学分析。
 * D1/D5 保留原有结果；D3 新增最小内角与长宽比；D4 构造顶点邻接图。
 */
export function analyzeGeometry(geometry, aspectThreshold = 10, angleThreshold = D3_ANGLE_THRESHOLD) {
  const position = geometry.getAttribute('position');
  if (!position || position.itemSize < 3) throw new Error('几何体缺少有效的 position 属性');

  const index = geometry.getIndex();
  const elementCount = index ? index.count : position.count;
  const faceCount = Math.floor(elementCount / 3);
  const badFaces = [];
  const d3BadFaces = [];
  const d3DegenerateFaces = [];
  const duplicateIndexFaces = [];
  const aspectRatios = new Float32Array(faceCount);
  const minAngles = new Float32Array(faceCount);
  const hasTrailingVertices = elementCount % 3 !== 0;
  const vertexIndex = (element) => index ? index.getX(element) : element;

  const logicalVertices = createLogicalVertices(position, index);
  const neighbors = logicalVertices.positions.map(() => new Set());

  for (let face = 0; face < faceCount; face += 1) {
    const ia = vertexIndex(face * 3);
    const ib = vertexIndex(face * 3 + 1);
    const ic = vertexIndex(face * 3 + 2);
    const hasDuplicateIndex = ia === ib || ib === ic || ic === ia;
    if (hasDuplicateIndex) duplicateIndexFaces.push(face);

    const la = logicalVertices.logicalOf(ia);
    const lb = logicalVertices.logicalOf(ib);
    const lc = logicalVertices.logicalOf(ic);
    addEdge(neighbors, la, lb);
    addEdge(neighbors, lb, lc);
    addEdge(neighbors, lc, la);

    A.fromBufferAttribute(position, ia);
    B.fromBufferAttribute(position, ib);
    C.fromBufferAttribute(position, ic);

    const edgeAB = A.distanceTo(B);
    const edgeBC = B.distanceTo(C);
    const edgeCA = C.distanceTo(A);
    const longestEdge = Math.max(edgeAB, edgeBC, edgeCA);

    // 三角形面积的两倍是 |(B-A) × (C-A)|。
    // 以最长边为底，最短高 = 2 * Area / longestEdge，
    // 因而长宽比 = longestEdge / shortestAltitude = longestEdge² / (2 * Area)。
    AB.subVectors(B, A);
    AC.subVectors(C, A);
    const doubleArea = CROSS.crossVectors(AB, AC).length();
    const shortestAltitude = longestEdge > 0 ? doubleArea / longestEdge : 0;
    const aspectRatio = shortestAltitude > Number.EPSILON
      ? longestEdge / shortestAltitude
      : Number.POSITIVE_INFINITY;

    BA.subVectors(A, B);
    BC.subVectors(C, B);
    CA.subVectors(A, C);
    CB.subVectors(B, C);
    // 每个内角由两条相邻边的点积求得，取三角形的最小内角。
    const minAngle = Math.min(angleBetween(BA, BC), angleBetween(AB, AC), angleBetween(CA, CB));
    const isD3AspectBad = aspectRatio > aspectThreshold || !Number.isFinite(aspectRatio);
    const isD3AngleBad = minAngle < angleThreshold || !Number.isFinite(minAngle);

    aspectRatios[face] = aspectRatio;
    minAngles[face] = minAngle;
    if (hasDuplicateIndex || !Number.isFinite(aspectRatio) || aspectRatio > aspectThreshold) badFaces.push(face);
    if (isD3AspectBad || isD3AngleBad || hasDuplicateIndex) d3BadFaces.push(face);
    if (isD3AngleBad || hasDuplicateIndex) d3DegenerateFaces.push(face);
  }

  const d4Poles = [];
  for (let logicalIndex = 0; logicalIndex < neighbors.length; logicalIndex += 1) {
    const valence = neighbors[logicalIndex].size;
    // 四边面流中重点关注 5 价和 7 价极点。
    if (valence === 5 || valence === 7) {
      d4Poles.push({
        index: logicalIndex,
        valence,
        position: logicalVertices.positions[logicalIndex].clone(),
      });
    }
  }

  const d3BadFaceRatio = faceCount ? (d3BadFaces.length / faceCount) * 100 : 0;
  const d3Score = Math.max(0, 100 - d3BadFaceRatio);
  const d4Score = neighbors.length ? Math.max(0, 100 - (d4Poles.length / neighbors.length) * 100) : 100;
  return {
    faceCount,
    vertexCount: position.count,
    badFaceCount: badFaces.length,
    badFaceRatio: faceCount ? (badFaces.length / faceCount) * 100 : 0,
    badFaces,
    duplicateIndexFaces,
    aspectRatios,
    aspectThreshold,
    indexed: Boolean(index),
    hasTrailingVertices,
    d3_badFaceCount: d3BadFaces.length,
    d3_badFaces: d3BadFaces,
    d3_degenerateFaces: d3DegenerateFaces,
    d3_badFaceRatio: d3BadFaceRatio,
    d3_minAngles: minAngles,
    d3_angleThreshold: angleThreshold,
    d3_score: d3Score,
    d4_poles: d4Poles,
    d4_poleCount: d4Poles.length,
    d4_valences: neighbors.map((set) => set.size),
    d4_score: d4Score,
  };
}

export function analyzeObject(root, aspectThreshold = 10, angleThreshold = D3_ANGLE_THRESHOLD) {
  const meshes = [];
  const totals = {
    faceCount: 0,
    vertexCount: 0,
    badFaceCount: 0,
    d3_badFaceCount: 0,
    d4_poleCount: 0,
    d4_vertexCount: 0,
  };
  root.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    const result = analyzeGeometry(node.geometry, aspectThreshold, angleThreshold);
    meshes.push({ mesh: node, result });
    totals.faceCount += result.faceCount;
    totals.vertexCount += result.vertexCount;
    totals.badFaceCount += result.badFaceCount;
    totals.d3_badFaceCount += result.d3_badFaceCount;
    totals.d4_poleCount += result.d4_poleCount;
    totals.d4_vertexCount += result.d4_valences.length;
  });
  totals.badFaceRatio = totals.faceCount ? (totals.badFaceCount / totals.faceCount) * 100 : 0;
  totals.d3_badFaceRatio = totals.faceCount ? (totals.d3_badFaceCount / totals.faceCount) * 100 : 0;
  totals.d3_score = Math.max(0, 100 - totals.d3_badFaceRatio);
  totals.d4_score = totals.d4_vertexCount ? Math.max(0, 100 - (totals.d4_poleCount / totals.d4_vertexCount) * 100) : 100;
  return { meshes, totals, aspectThreshold, angleThreshold };
}

const d2Cache = new WeakMap();

function collectMeshes(root) {
  const meshes = [];
  root.traverse((node) => {
    if (node.isMesh && node.geometry?.getAttribute('position')) meshes.push(node);
  });
  return meshes;
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(resolve, { timeout: 16 });
    else setTimeout(resolve, 0);
  });
}

function nearestRayHit(raycaster, origin, direction, highPolyRoot) {
  raycaster.set(origin, direction);
  const hits = raycaster.intersectObject(highPolyRoot, true);
  return hits.length ? hits[0].distance : Number.POSITIVE_INFINITY;
}

function scoreFromDeviation(averageDeviation, unmappedRatio) {
  let score;
  if (!Number.isFinite(averageDeviation)) score = 40;
  else if (averageDeviation < 0.01) score = 100;
  else if (averageDeviation < 0.05) score = 80;
  else if (averageDeviation < 0.1) score = 60;
  else score = 40;
  if (unmappedRatio > 0.2) score -= 20;
  return Math.max(0, score);
}

/**
 * D2 几何精度：从低模每个采样顶点沿世界空间法线正反方向发射射线，
 * 取高模表面最近交点作为偏差。采样是均匀确定性的，避免随机评分和随机结果。
 */
export async function computeGeometricDeviation(lowPolyRoot, highPolyRoot, options = {}) {
  const cachedByHigh = d2Cache.get(lowPolyRoot);
  if (cachedByHigh?.has(highPolyRoot)) return cachedByHigh.get(highPolyRoot);

  const batchSize = Math.max(1, options.batchSize ?? 100);
  const maxSamples = Math.max(1, options.maxSamples ?? 5000);
  const lowMeshes = collectMeshes(lowPolyRoot);
  const highMeshes = collectMeshes(highPolyRoot);
  if (!lowMeshes.length) throw new Error('低模中没有可计算 D2 的 Mesh');
  if (!highMeshes.length) throw new Error('高模中没有可作为 D2 参考的 Mesh');

  lowPolyRoot.updateMatrixWorld(true);
  highPolyRoot.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.near = 0;
  const meshResults = [];
  let totalVertices = 0;
  let sampledVertices = 0;
  let unmappedCount = 0;
  let mappedSum = 0;
  let maxDeviation = 0;

  for (const lowMesh of lowMeshes) {
    const geometry = lowMesh.geometry;
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const vertexCount = position.count;
    const sampleCount = Math.min(vertexCount, maxSamples);
    const deviationMap = new Float32Array(vertexCount);
    deviationMap.fill(-1); // -1 表示未采样；无对应区域另由 unmappedCount 统计。
    const sampledIndices = new Uint32Array(sampleCount);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(lowMesh.matrixWorld);
    const worldPosition = new THREE.Vector3();
    const worldNormal = new THREE.Vector3();
    const reverseNormal = new THREE.Vector3();

    for (let sample = 0; sample < sampleCount; sample += 1) {
      // 均匀覆盖首尾顶点，保证 >5000 顶点时仍能看到整张模型的偏差分布。
      const vertexIndex = sampleCount === vertexCount
        ? sample
        : Math.min(vertexCount - 1, Math.floor((sample * vertexCount) / sampleCount));
      sampledIndices[sample] = vertexIndex;
      worldPosition.fromBufferAttribute(position, vertexIndex).applyMatrix4(lowMesh.matrixWorld);
      worldNormal.fromBufferAttribute(normal, vertexIndex).applyMatrix3(normalMatrix).normalize();
      reverseNormal.copy(worldNormal).multiplyScalar(-1);

      const forwardDistance = nearestRayHit(raycaster, worldPosition, worldNormal, highPolyRoot);
      const backwardDistance = nearestRayHit(raycaster, worldPosition, reverseNormal, highPolyRoot);
      const deviation = Math.min(forwardDistance, backwardDistance);
      if (Number.isFinite(deviation)) {
        deviationMap[vertexIndex] = deviation;
        mappedSum += deviation;
        maxDeviation = Math.max(maxDeviation, deviation);
      } else {
        unmappedCount += 1;
      }

      if ((sample + 1) % batchSize === 0) {
        options.onProgress?.({ processed: sampledVertices + sample + 1, total: sampledVertices + sampleCount });
        await yieldToBrowser();
      }
    }

    meshResults.push({ mesh: lowMesh, deviationMap, sampledIndices, sampleCount });
    totalVertices += vertexCount;
    sampledVertices += sampleCount;
    options.onProgress?.({ processed: sampledVertices, total: sampledVertices });
    await yieldToBrowser();
  }

  const mappedCount = sampledVertices - unmappedCount;
  const averageDeviation = mappedCount ? mappedSum / mappedCount : 0;
  const unmappedRatio = sampledVertices ? unmappedCount / sampledVertices : 1;
  const globalDeviationMap = new Float32Array(totalVertices);
  globalDeviationMap.fill(-1);
  let globalOffset = 0;
  for (const result of meshResults) {
    globalDeviationMap.set(result.deviationMap, globalOffset);
    globalOffset += result.deviationMap.length;
  }
  const result = {
    d2_averageDeviation: averageDeviation,
    d2_maxDeviation: maxDeviation,
    d2_deviationMap: globalDeviationMap,
    d2_score: scoreFromDeviation(mappedCount ? averageDeviation : Number.POSITIVE_INFINITY, unmappedRatio),
    d2_unmappedCount: unmappedCount,
    d2_sampledCount: sampledVertices,
    d2_totalVertexCount: totalVertices,
    d2_meshResults: meshResults,
  };

  let cacheForLow = d2Cache.get(lowPolyRoot);
  if (!cacheForLow) {
    cacheForLow = new WeakMap();
    d2Cache.set(lowPolyRoot, cacheForLow);
  }
  cacheForLow.set(highPolyRoot, result);
  return result;
}
