import anime from "animejs";

export function animateIntro({ hud, meshes, camera }) {
  anime({
    targets: hud,
    opacity: [0, 1],
    translateY: [-24, 0],
    duration: 900,
    easing: "easeOutCubic",
  });

  anime({
    targets: camera.position,
    y: [14, camera.position.y],
    z: [16, camera.position.z],
    duration: 1800,
    easing: "easeOutExpo",
  });

  meshes.forEach((mesh, i) => {
    const baseY = mesh.userData.baseY;
    anime({
      targets: mesh.scale,
      x: [0.01, 1],
      y: [0.01, 1],
      z: [0.01, 1],
      duration: 900,
      delay: 200 + i * 90,
      easing: "easeOutElastic(1, .7)",
    });
    anime({
      targets: mesh.position,
      y: [ -2.5, baseY ],
      duration: 1100,
      delay: 180 + i * 90,
      easing: "easeOutBack(1.4)",
    });
    anime({
      targets: mesh.rotation,
      x: [-1.2, -0.18],
      duration: 1000,
      delay: 180 + i * 90,
      easing: "easeOutCubic",
    });
  });
}

export function animatePanelIn(panel) {
  panel.hidden = false;
  anime({
    targets: panel,
    opacity: [0, 1],
    translateX: [40, 0],
    duration: 420,
    easing: "easeOutCubic",
  });
}

export function animatePanelOut(panel) {
  return anime({
    targets: panel,
    opacity: [1, 0],
    translateX: [0, 28],
    duration: 280,
    easing: "easeInCubic",
    complete: () => {
      panel.hidden = true;
    },
  }).finished;
}

export function pulseOvr(el) {
  anime({
    targets: el,
    scale: [1, 1.18, 1],
    duration: 520,
    easing: "easeOutElastic(1, .8)",
  });
}
