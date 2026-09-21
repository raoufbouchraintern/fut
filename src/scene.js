import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createCardTexture } from "./cardTexture.js";

const CARD_W = 0.95;
const CARD_H = 1.42;

export async function createScene(canvas, advisors, { onSelect }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070a, 0.035);

  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 9.5, 11.5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.target.set(0, 0.6, 0.4);
  controls.minDistance = 6;
  controls.maxDistance = 22;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xfff2d6, 1.15);
  key.position.set(4, 12, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
  fill.position.set(-6, 4, -4);
  scene.add(fill);

  const loader = new THREE.TextureLoader();
  const pitchTex = await loader.loadAsync("/assets/pitch.png");
  pitchTex.colorSpace = THREE.SRGBColorSpace;

  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 16),
    new THREE.MeshStandardMaterial({
      map: pitchTex,
      roughness: 0.85,
      metalness: 0.05,
    })
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0;
  scene.add(pitch);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(28, 64),
    new THREE.MeshStandardMaterial({
      color: 0x0a0d12,
      roughness: 1,
      metalness: 0,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);

  const cardGroup = new THREE.Group();
  scene.add(cardGroup);

  const meshes = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  for (const advisor of advisors) {
    const canvasTex = await createCardTexture(advisor);
    const texture = new THREE.CanvasTexture(canvasTex);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.45,
      metalness: 0.15,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W, CARD_H),
      material
    );
    mesh.position.set(advisor.formation.x, 0.05, advisor.formation.z);
    mesh.rotation.x = -0.18;
    mesh.userData = { advisor, baseY: 0.72, hover: false };
    mesh.position.y = -2.5;
    mesh.scale.setScalar(0.01);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W * 1.08, CARD_H * 1.08),
      new THREE.MeshBasicMaterial({
        color: advisor.style.glow,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    glow.position.z = -0.02;
    mesh.add(glow);

    cardGroup.add(mesh);
    meshes.push(mesh);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", resize);

  function pick(clientX, clientY) {
    pointer.x = (clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(meshes, false);
    return hits[0]?.object ?? null;
  }

  let selected = null;

  canvas.addEventListener("pointermove", (e) => {
    const hit = pick(e.clientX, e.clientY);
    canvas.style.cursor = hit ? "pointer" : "grab";
    for (const m of meshes) {
      m.userData.hover = m === hit;
    }
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const hit = pick(e.clientX, e.clientY);
    if (hit) {
      selected = hit;
      onSelect?.(hit.userData.advisor);
    }
  });

  let t = 0;
  function tick() {
    requestAnimationFrame(tick);
    t += 0.016;
    controls.update();

    for (const mesh of meshes) {
      const { baseY, hover, advisor } = mesh.userData;
      const targetY = baseY + (hover || selected === mesh ? 0.35 : 0);
      mesh.position.y += (targetY - mesh.position.y) * 0.12;
      const bob = Math.sin(t * 1.4 + advisor.formation.x) * 0.03;
      if (!hover && selected !== mesh) {
        mesh.position.y += bob * 0.15;
      }
      const targetRotY = hover ? 0.12 : 0;
      mesh.rotation.y += (targetRotY - mesh.rotation.y) * 0.1;
    }

    renderer.render(scene, camera);
  }
  tick();

  return { scene, camera, controls, meshes, renderer };
}
