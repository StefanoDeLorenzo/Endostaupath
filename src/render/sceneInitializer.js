// src/render/sceneInitializer.js
export class SceneInitializer {
  constructor(scene, engine, canvas) {
    this.scene = scene;
    this.engine = engine;
    this.canvas = canvas;
    this.shadowGenerator = null;
  }

  initializeScene() {
    this.scene.ambientColor = new BABYLON.Color3(0.4, 0.4, 0.4);
    this._createCamera();
    this._createAmbientLight();
    this.shadowGenerator = this._createSunLight();
    this.scene.collisionsEnabled = true;
  }

  _createCamera() {
    const camera = new BABYLON.FreeCamera("camera1", new BABYLON.Vector3(0, 60, 0), this.scene);
    camera.setTarget(new BABYLON.Vector3(60, 0, 60));
    camera.inertia = 0.5;
    camera.angularSensibility = 1500;
    camera.speed = 8;
    camera.minZ = 0.05;
    camera.attachControl(this.canvas, true);

    // WASD
    camera.keysUp.push(87);
    camera.keysDown.push(83);
    camera.keysLeft.push(65);
    camera.keysRight.push(68);

    // Collisioni
    camera.checkCollisions = true;
    camera.ellipsoid = new BABYLON.Vector3(0.6, 0.875, 0.6);
    camera.ellipsoid.y = 2.9375;
    return camera;
  }

  _createAmbientLight() {
    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);
    light.intensity = 0.3;
    light.diffuse = new BABYLON.Color3(0.8, 0.8, 0.8);
    light.groundColor = new BABYLON.Color3(0.5, 0.5, 0.5);
  }

  _createSunLight() {
    const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.5, -1, 0.25), this.scene);
    sun.intensity = 0.7;
    sun.position = new BABYLON.Vector3(0, 150, 0);
    sun.shadowMinZ = 70;
    sun.shadowMaxZ = 200;

    const sg = new BABYLON.ShadowGenerator(2048, sun);
    sg.usePercentageCloserFiltering = true;
    sg.usePoissonSampling = true;
    sg.bias = 0.005;
    sg.normalBias = 0.005;
    sg.blurKernel = 128;
    return sg;
  }
}
