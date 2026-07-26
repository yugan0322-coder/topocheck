import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadModelFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['obj', 'glb'].includes(extension)) throw new Error('仅支持 .obj 与 .glb 文件');
  const url = URL.createObjectURL(file);
  try {
    if (extension === 'obj') return await new OBJLoader().loadAsync(url);
    const gltf = await new GLTFLoader().loadAsync(url);
    return gltf.scene;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 把高模对齐到低模的世界包围盒：先按最大轴等比缩放，再将缩放后的中心平移到目标中心。
 * 这样不会拉伸模型，也不会改变 D2 的距离单位。
 */
export function alignMesh(sourceMesh, targetMesh) {
  sourceMesh.updateMatrixWorld(true);
  targetMesh.updateMatrixWorld(true);
  const sourceBox = new THREE.Box3().setFromObject(sourceMesh);
  const targetBox = new THREE.Box3().setFromObject(targetMesh);
  if (sourceBox.isEmpty() || targetBox.isEmpty()) return sourceMesh;

  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const targetSize = targetBox.getSize(new THREE.Vector3());
  const sourceExtent = Math.max(sourceSize.x, sourceSize.y, sourceSize.z);
  const targetExtent = Math.max(targetSize.x, targetSize.y, targetSize.z);
  if (sourceExtent > Number.EPSILON && targetExtent > Number.EPSILON) {
    sourceMesh.scale.multiplyScalar(targetExtent / sourceExtent);
  }

  sourceMesh.updateMatrixWorld(true);
  const alignedBox = new THREE.Box3().setFromObject(sourceMesh);
  const alignedCenter = alignedBox.getCenter(new THREE.Vector3());
  const targetCenter = targetBox.getCenter(new THREE.Vector3());
  sourceMesh.position.add(targetCenter).sub(alignedCenter);
  sourceMesh.updateMatrixWorld(true);
  return sourceMesh;
}

/** 高模只用于参考显示：灰色、半透明、双面，仍保留原始几何用于 D2 射线相交。 */
export function applyReferenceMaterial(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    if (!node.userData.topoCheckOriginalMaterial) node.userData.topoCheckOriginalMaterial = node.material;
    const makeMaterial = () => new THREE.MeshStandardMaterial({
      color: 0x9ca3a8,
      roughness: 0.85,
      metalness: 0,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    if (Array.isArray(node.material)) node.material = node.material.map(makeMaterial);
    else node.material = makeMaterial();
    node.userData.topoCheckReference = true;
  });
  return root;
}

export function restoreReferenceMaterial(root) {
  root.traverse((node) => {
    if (!node.isMesh || !node.userData.topoCheckOriginalMaterial) return;
    node.material = node.userData.topoCheckOriginalMaterial;
    delete node.userData.topoCheckOriginalMaterial;
    delete node.userData.topoCheckReference;
  });
  return root;
}
