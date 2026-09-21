import * as THREE from "three";

/**
 * Aperçu 3D d'une carte (canvas latéral ou modal).
 * Charge directement le PNG final pour une qualité nette.
 */
export function createCardPreview(canvas, options = {}) {
  const {
    fov = 35,
    cameraZ = 3.15,
    autoRotate = true,
    enableDrag = true,
  } = options;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 40);
  camera.position.set(0, 0, cameraZ);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xfff2dc, 1.15);
  key.position.set(2.2, 3.2, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xa8c8ff, 0.35);
  fill.position.set(-2.5, -1, 2);
  scene.add(fill);

  /** Hauteur de la carte dans la scène, et air laissé autour au cadrage. */
  const CARD_HEIGHT = 2.05;
  const FIT_MARGIN = 1.14;

  const loader = new THREE.TextureLoader();
  let cardW = CARD_HEIGHT * (2 / 3);
  let cardH = CARD_HEIGHT;
  let mesh = null;
  let loadToken = 0;
  let t = 0;
  let dragging = false;
  let lastX = 0;
  let rotY = 0;
  let rotX = 0.08;
  let targetRotY = 0;
  let targetRotX = 0.08;

  function disposeMesh() {
    if (!mesh) return;
    mesh.geometry.dispose();
    const map = mesh.material.map;
    mesh.material.dispose();
    map?.dispose();
    scene.remove(mesh);
    mesh = null;
  }

  /** Recule la caméra jusqu'à ce que la carte entière tienne dans le canvas. */
  function fitCamera() {
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const distV = (cardH * FIT_MARGIN) / (2 * Math.tan(vFov / 2));
    const distH = (cardW * FIT_MARGIN) / (2 * Math.tan(hFov / 2));
    camera.position.z = Math.max(distV, distH);
    camera.updateProjectionMatrix();
  }

  function resize() {
    const w = Math.max(1, canvas.clientWidth || canvas.width || 280);
    const h = Math.max(1, canvas.clientHeight || canvas.height || 360);
    camera.aspect = w / h;
    renderer.setSize(w, h, false);
    fitCamera();
  }

  async function show(advisor) {
    if (!advisor) return;
    const src = advisor.cardAsset || advisor.portrait;
    if (!src) return;

    const token = ++loadToken;
    resize();

    const texture = await new Promise((resolve, reject) => {
      loader.load(
        src,
        (tex) => resolve(tex),
        undefined,
        (err) => reject(err)
      );
    });

    if (token !== loadToken) {
      texture.dispose();
      return;
    }

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    // netteté max sur écran retina
    texture.needsUpdate = true;

    const img = texture.image;
    const aspect =
      img && img.width && img.height ? img.width / img.height : 2 / 3;
    cardH = CARD_HEIGHT;
    cardW = CARD_HEIGHT * aspect;
    fitCamera();

    disposeMesh();
    mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(cardW, cardH),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.32,
        metalness: 0.08,
        transparent: true,
        alphaTest: 0.02,
        side: THREE.DoubleSide,
      })
    );
    mesh.rotation.set(rotX, rotY, 0);
    scene.add(mesh);

    // petite entrée
    mesh.scale.set(0.86, 0.86, 0.86);
  }

  function clear() {
    loadToken++;
    disposeMesh();
  }

  if (enableDrag) {
    const onDown = (e) => {
      dragging = true;
      lastX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!dragging || !mesh) return;
      const x = e.clientX ?? e.touches?.[0]?.clientX ?? lastX;
      const dx = x - lastX;
      lastX = x;
      targetRotY += dx * 0.01;
      rotY = targetRotY;
    };
    const onUp = () => {
      dragging = false;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", () => {
      canvas.style.cursor = "grabbing";
    });
    window.addEventListener("pointerup", () => {
      canvas.style.cursor = "grab";
    });
  }

  function tick() {
    requestAnimationFrame(tick);
    t += 0.016;
    if (mesh) {
      if (autoRotate && !dragging) {
        targetRotY = Math.sin(t * 0.65) * 0.42;
        targetRotX = 0.06 + Math.sin(t * 0.45) * 0.05;
      }
      rotY += (targetRotY - rotY) * 0.12;
      rotX += (targetRotX - rotX) * 0.12;
      mesh.rotation.y = rotY;
      mesh.rotation.x = rotX;
      const s = mesh.scale.x + (1 - mesh.scale.x) * 0.12;
      mesh.scale.setScalar(s);
    }
    renderer.render(scene, camera);
  }

  window.addEventListener("resize", resize);
  resize();
  tick();

  return { show, clear, resize };
}
