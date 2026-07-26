import * as THREE from 'three';

const NORMAL = new THREE.Color(0xc8cccf);
const D1_BAD = new THREE.Color(0xff0000);
const D3_BAD = new THREE.Color(0xffff00);
const POLE_RED = new THREE.Color(0xff2020);
const D2_BLUE = new THREE.Color(0x0000ff);
const D2_GREEN = new THREE.Color(0x00ff00);
const D2_RED = new THREE.Color(0xff0000);
const D2_UNMAPPED = new THREE.Color(0xff00ff);

function diagnosticGeometry(source, d1BadFaces, d3BadFaces) {
  // 索引顶点可能属于多个面，先展开成每面独立顶点，避免颜色污染相邻面。
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const d1Set = new Set(d1BadFaces);
  const d3Set = new Set(d3BadFaces);

  for (let face = 0; face < Math.floor(position.count / 3); face += 1) {
    // D3 黄色优先；其它 D1 长宽比或重复索引问题用红色表示。
    const color = d3Set.has(face) ? D3_BAD : (d1Set.has(face) ? D1_BAD : NORMAL);
    for (let corner = 0; corner < 3; corner += 1) {
      const offset = (face * 3 + corner) * 3;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function deviationToColor(deviation, maxDeviation) {
  if (deviation < 0) return D2_UNMAPPED;
  const t = maxDeviation > Number.EPSILON ? THREE.MathUtils.clamp(deviation / maxDeviation, 0, 1) : 0;
  const color = new THREE.Color();
  if (t < 0.5) color.lerpColors(D2_BLUE, D2_GREEN, t * 2);
  else color.lerpColors(D2_GREEN, D2_RED, (t - 0.5) * 2);
  return color;
}

function d2Geometry(source, deviationMap, maxDeviation) {
  const geometry = source.clone();
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const color = deviationToColor(deviationMap[vertex] ?? -1, maxDeviation);
    const offset = vertex * 3;
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function createPoleMarkers(mesh, poles) {
  if (!poles.length) return { group: new THREE.Group(), geometry: null, material: null };
  mesh.geometry.computeBoundingSphere();
  const radius = Math.max(mesh.geometry.boundingSphere?.radius ?? 1, 0.01) * 0.018;
  const geometry = new THREE.SphereGeometry(radius, 12, 8);
  const material = new THREE.MeshStandardMaterial({
    color: POLE_RED,
    emissive: POLE_RED,
    emissiveIntensity: 3.2,
    roughness: 0.25,
    metalness: 0,
  });
  const group = new THREE.Group();
  group.name = 'd4-pole-markers';
  group.visible = false;
  for (const pole of poles) {
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(pole.position);
    marker.userData.valence = pole.valence;
    marker.userData.vertexIndex = pole.index;
    group.add(marker);
  }
  mesh.add(group);
  return { group, geometry, material };
}

export class DiagnosticVisualizer {
  constructor(analysis) {
    this.mode = 'off';
    this.records = analysis.meshes.map(({ mesh, result }) => {
      const markers = createPoleMarkers(mesh, result.d4_poles);
      return {
        mesh,
        originalGeometry: mesh.geometry,
        originalMaterial: mesh.material,
        diagnosticGeometry: diagnosticGeometry(mesh.geometry, result.badFaces, result.d3_badFaces),
        diagnosticMaterial: new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.72,
          metalness: 0.03,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: 1,
        }),
        d2Geometry: null,
        d2Material: null,
        poleGroup: markers.group,
        poleGeometry: markers.geometry,
        poleMaterial: markers.material,
      };
    });
  }

  setD2Result(result) {
    for (const record of this.records) {
      const meshResult = result?.d2_meshResults?.find((item) => item.mesh === record.mesh);
      record.d2Geometry?.dispose();
      record.d2Material?.dispose();
      record.d2Geometry = null;
      record.d2Material = null;
      if (meshResult) {
        record.d2Geometry = d2Geometry(record.originalGeometry, meshResult.deviationMap, result.d2_maxDeviation);
        record.d2Material = new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.62,
          metalness: 0.02,
          side: THREE.DoubleSide,
        });
      }
    }
  }

  setMode(mode) {
    if (mode === 'd2' && !this.records.some((record) => record.d2Geometry)) return this.mode;
    this.mode = mode;
    for (const record of this.records) {
      if (mode === 'diagnostic') {
        record.mesh.geometry = record.diagnosticGeometry;
        record.mesh.material = record.diagnosticMaterial;
      } else if (mode === 'd2' && record.d2Geometry) {
        record.mesh.geometry = record.d2Geometry;
        record.mesh.material = record.d2Material;
      } else {
        record.mesh.geometry = record.originalGeometry;
        record.mesh.material = record.originalMaterial;
      }
      record.poleGroup.visible = mode === 'diagnostic';
    }
    return this.mode;
  }

  setEnabled(enabled) {
    return this.setMode(enabled ? 'diagnostic' : 'off');
  }

  toggle() {
    return this.setMode(this.mode === 'diagnostic' ? 'off' : 'diagnostic') === 'diagnostic';
  }

  dispose() {
    for (const record of this.records) {
      record.mesh.geometry = record.originalGeometry;
      record.mesh.material = record.originalMaterial;
      record.mesh.remove(record.poleGroup);
      record.diagnosticGeometry.dispose();
      record.diagnosticMaterial.dispose();
      record.d2Geometry?.dispose();
      record.d2Material?.dispose();
      record.poleGeometry?.dispose();
      record.poleMaterial?.dispose();
    }
  }
}

export { deviationToColor };
