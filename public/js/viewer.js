import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function addLighting(scene) {
  scene.add(new THREE.HemisphereLight(0xe5efff, 0x20252a, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 3.3);
  key.position.set(4, 7, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6688ff, 1.1);
  rim.position.set(-5, 2, -4);
  scene.add(rim);
}

function addGrid(scene) {
  const grid = new THREE.GridHelper(30, 30, 0x3a4146, 0x252a2e);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);
  return grid;
}

export class Viewer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.referenceScene = new THREE.Scene();
    addLighting(this.scene);
    addLighting(this.referenceScene);
    this.grid = addGrid(this.scene);
    this.referenceGrid = addGrid(this.referenceScene);
    this.referenceGrid.visible = false;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 10000);
    this.camera.position.set(4, 2.8, 5);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.prepend(this.renderer.domElement);

    // 只有一套相机和一套 OrbitControls，两个 scissor 区域天然同步旋转、缩放、平移。
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.splitRatio = 0.5;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate();
  }

  setModel(model) {
    if (this.model) this.scene.remove(this.model);
    this.model = model;
    this.scene.add(model);
    this.frameObject(model);
  }

  clearModel() {
    if (this.model) this.scene.remove(this.model);
    this.model = null;
  }

  setReferenceModel(model) {
    if (this.referenceModel) this.referenceScene.remove(this.referenceModel);
    this.referenceModel = model;
    if (model) {
      this.referenceScene.add(model);
      this.referenceGrid.visible = true;
    }
  }

  clearReferenceModel() {
    if (this.referenceModel) this.referenceScene.remove(this.referenceModel);
    this.referenceModel = null;
    this.referenceGrid.visible = false;
  }

  setSplitRatio(ratio) {
    this.splitRatio = THREE.MathUtils.clamp(ratio, 0.25, 0.75);
  }

  frameObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);
    box.setFromObject(object);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.01);
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov * 0.5));
    this.camera.near = Math.max(distance / 1000, 0.001);
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(distance * 0.8, distance * 0.55, distance);
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = radius * 0.15;
    this.controls.maxDistance = distance * 8;
    this.controls.update();
    this.grid.position.y = box.min.y;
    this.referenceGrid.position.y = box.min.y;
    this.grid.scale.setScalar(Math.max(radius / 7, 0.1));
    this.referenceGrid.scale.copy(this.grid.scale);
  }

  resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render() {
    const width = this.renderer.domElement.width;
    const height = this.renderer.domElement.height;
    if (!width || !height) return;

    if (this.model && this.referenceModel) {
      const splitX = Math.floor(width * this.splitRatio);
      this.renderer.setScissorTest(true);
      this.renderer.setScissor(0, 0, width, height);
      this.renderer.setViewport(0, 0, width, height);
      this.renderer.clear(true, true, true);

      // 分屏后相机纵横比按单侧视口更新，避免模型在半屏中被横向拉伸。
      this.camera.aspect = splitX / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setScissor(0, 0, splitX, height);
      this.renderer.setViewport(0, 0, splitX, height);
      this.renderer.render(this.scene, this.camera);

      this.renderer.setScissor(splitX, 0, width - splitX, height);
      this.renderer.setViewport(splitX, 0, width - splitX, height);
      this.renderer.render(this.referenceScene, this.camera);
      this.renderer.setScissorTest(false);
    } else {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
    }
  }

  animate = () => {
    this.frame = requestAnimationFrame(this.animate);
    this.controls.update();
    this.render();
  };
}
