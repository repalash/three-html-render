// Import extra THREE plugins
import * as THREE1 from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
// import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { LuminosityHighPassShader } from 'three/examples/jsm/shaders/LuminosityHighPassShader';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader';
import { GUI } from 'dat.gui';

const THREE = {
    ...THREE1,
    OrbitControls,
    RoundedBoxGeometry,
    GLTFLoader,
    RGBELoader,
    EffectComposer,
    RenderPass,
    ShaderPass,
    // UnrealBloomPass,
    LuminosityHighPassShader,
    CopyShader,
    GUI,
}

window.common = {
    THREE,

}

const sketch = ({ canvas, width, height }) => {
    const gui = new GUI({
        closeOnTop: true,
        closed: true,
    });

    const options = {
        enableSwoopingCamera: false,
        enableRotation: true,
        color: 0xffffff,
        metalness: 0,
        roughness: 0.2,
        transmission: 1,
        ior: 1.5,
        reflectivity: 0.5,
        thickness: 2.5,
        envMapIntensity: 1.5,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        normalScale: 0.3,
        clearcoatNormalScale: 0.2,
        normalRepeat: 3,
        // attenuationTint: 0xffffff,
        // attenuationDistance: 0,
        // bloomThreshold: 0.85,
        // bloomStrength: 0.35,
        // bloomRadius: 0.33,
    };

    // Setup
    // -----

    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
    });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x1f1e1c, 1);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    camera.position.set(-2, 1, Math.max(8, 10 * window.innerHeight / window.innerWidth));

    const controls = new THREE.OrbitControls(camera, canvas);
    controls.enabled = !options.enableSwoopingCamera;
    controls.enableDamping = true

    const scene = new THREE.Scene();

    const renderPass = new THREE.RenderPass(scene, camera);
    // const bloomPass = new THREE.UnrealBloomPass(
    //     new THREE.Vector2(width, height),
    //     options.bloomStrength,
    //     options.bloomRadius,
    //     options.bloomThreshold
    // );

    const composer = new THREE.EffectComposer(renderer);
    composer.addPass(renderPass);
    // composer.addPass(bloomPass);

    // Content
    // -------

    const textureLoader = new THREE.TextureLoader();

    const bgTexture = textureLoader.load("texture.jpg");
    const bgGeometry = new THREE.PlaneGeometry(5, 5);
    const bgMaterial = new THREE.MeshBasicMaterial({ map: bgTexture });
    const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
    bgMesh.position.set(0, 0, -1);
    scene.add(bgMesh);

    common.bgMesh = bgMesh;
    common.camera = camera;

    const hdrEquirect = new THREE.RGBELoader().load(
        "https://hdrihaven.r2cache.com/hdr/2k/empty_warehouse_01_2k.hdr",
        () => {
            hdrEquirect.mapping = THREE.EquirectangularReflectionMapping;
        }
    );

    const normalMapTexture = textureLoader.load("normal.jpg");
    normalMapTexture.wrapS = THREE.RepeatWrapping;
    normalMapTexture.wrapT = THREE.RepeatWrapping;
    normalMapTexture.repeat.set(options.normalRepeat, options.normalRepeat);

    const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: options.metalness,
        roughness: options.roughness,
        transmission: options.transmission,
        ior: options.ior,
        reflectivity: options.reflectivity,
        thickness: options.thickness,
        envMap: hdrEquirect,
        envMapIntensity: options.envMapIntensity,
        clearcoat: options.clearcoat,
        clearcoatRoughness: options.clearcoatRoughness,
        normalScale: new THREE.Vector2(options.normalScale),
        normalMap: normalMapTexture,
        clearcoatNormalMap: normalMapTexture,
        clearcoatNormalScale: new THREE.Vector2(options.clearcoatNormalScale),
        // attenuationTint: options.attenuationTint,
        // attenuationDistance: options.attenuationDistance,
    });

    let mesh = null;

    // Load dragon GLTF model
    new THREE.GLTFLoader().load("dragon.glb", (gltf) => {
        const dragon = gltf.scene.children.find((mesh) => mesh.name === "Dragon");

        // Just copy the geometry from the loaded model
        const geometry = dragon.geometry.clone();

        // Adjust geometry to suit our scene
        geometry.rotateX(Math.PI / 2);
        geometry.translate(0, -4, 0);

        // Create a new mesh and place it in the scene
        mesh = new THREE.Mesh(geometry, material);
        mesh.scale.set(0.4, 0.4, 0.4);
        scene.add(mesh);

        // Discard the loaded model
        gltf.scene.children.forEach((child) => {
            child.geometry.dispose();
            child.material.dispose();
        });
    });

    // GUI
    // ---

    // gui.add(options, "enableSwoopingCamera").onChange((val) => {
    //     controls.enabled = !val;
    //     controls.reset();
    // });

    gui.add(options, "enableRotation").onChange(() => {
        if (mesh) mesh.rotation.set(0, 0, 0);
    });

    gui.addColor(options, "color").onChange((val) => {
        material.color.set(val);
    });

    gui.add(options, "roughness", 0, 1, 0.01).onChange((val) => {
        material.roughness = val;
    });

    gui.add(options, "metalness", 0, 1, 0.01).onChange((val) => {
        material.metalness = val;
    });

    gui.add(options, "transmission", 0, 1, 0.01).onChange((val) => {
        material.transmission = val;
    });

    gui.add(options, "ior", 1, 2.33, 0.01).onChange((val) => {
        material.ior = val;
    });

    gui.add(options, "reflectivity", 0, 1, 0.01).onChange((val) => {
        material.reflectivity = val;
    });

    gui.add(options, "thickness", 0, 5, 0.1).onChange((val) => {
        material.thickness = val;
    });

    gui.add(options, "envMapIntensity", 0, 3, 0.1).onChange((val) => {
        material.envMapIntensity = val;
    });

    gui.add(options, "clearcoat", 0, 1, 0.01).onChange((val) => {
        material.clearcoat = val;
    });

    gui.add(options, "clearcoatRoughness", 0, 1, 0.01).onChange((val) => {
        material.clearcoatRoughness = val;
    });

    gui.add(options, "normalScale", 0, 5, 0.01).onChange((val) => {
        material.normalScale.set(val, val);
    });

    gui.add(options, "clearcoatNormalScale", 0, 5, 0.01).onChange((val) => {
        material.clearcoatNormalScale.set(val, val);
    });

    gui.add(options, "normalRepeat", 1, 4, 1).onChange((val) => {
        normalMapTexture.repeat.set(val, val);
    });

    // gui.addColor(options, "attenuationTint").onChange((val) => {
    //   material.attenuationTint.set(val);
    // });

    // gui.add(options, "attenuationDistance", 0, 1, 0.01).onChange((val) => {
    //   material.attenuationDistance = val;
    // });

    // const postprocessing = gui.addFolder("Post Processing");
    //
    // postprocessing.add(options, "bloomThreshold", 0, 1, 0.01).onChange((val) => {
    //     bloomPass.threshold = val;
    // });
    //
    // postprocessing.add(options, "bloomStrength", 0, 5, 0.01).onChange((val) => {
    //     bloomPass.strength = val;
    // });
    //
    // postprocessing.add(options, "bloomRadius", 0, 1, 0.01).onChange((val) => {
    //     bloomPass.radius = val;
    // });

    // Update
    // ------

    const update = (time, deltaTime) => {
        const ROTATE_TIME = 10; // Time in seconds for a full rotation
        const xAxis = new THREE.Vector3(1, 0, 0);
        const yAxis = new THREE.Vector3(0, 1, 0);
        const rotateX = (deltaTime / ROTATE_TIME) * Math.PI * 2;
        const rotateY = (deltaTime / ROTATE_TIME) * Math.PI * 2;

        if (options.enableRotation && mesh) {
            mesh.rotateOnWorldAxis(xAxis, rotateX);
            mesh.rotateOnWorldAxis(yAxis, rotateY);
        }

        if (options.enableSwoopingCamera) {
            camera.position.x = Math.sin((time / 10) * Math.PI * 2) * 2;
            camera.position.y = Math.cos((time / 10) * Math.PI * 2) * 2;
            camera.position.z = 8;
            camera.lookAt(scene.position);
        }
    };

    function resize({ canvas, pixelRatio, viewportWidth, viewportHeight }) {
        const dpr = Math.min(pixelRatio, 2); // Cap DPR scaling to 2x

        canvas.width = viewportWidth * dpr;
        canvas.height = viewportHeight * dpr;
        canvas.style.width = viewportWidth + "px";
        canvas.style.height = viewportHeight + "px";

        // bloomPass.resolution.set(viewportWidth, viewportHeight);

        renderer.setPixelRatio(dpr);
        renderer.setSize(viewportWidth, viewportHeight);

        composer.setPixelRatio(dpr);
        composer.setSize(viewportWidth, viewportHeight);

        camera.aspect = viewportWidth / viewportHeight;
        camera.updateProjectionMatrix();
    }

    const clock = new THREE.Clock();
    clock.start()
    function render() {
        controls.update();
        update(clock.elapsedTime, 1/30);
        // renderer.render(scene, camera);
        composer.render();
        requestAnimationFrame(render);
    }
    function unload() {
        mesh.geometry.dispose();
        material.dispose();
        hdrEquirect.dispose();
        controls.dispose();
        renderer.dispose();
        // bloomPass.dispose();
        gui.destroy();
        document.body.removeChild(stats.dom);
    }
    render();

    window.addEventListener('resize', () => {
        resize({
            canvas,
            pixelRatio: window.devicePixelRatio,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
        });
    });

    resize({
        canvas,
        pixelRatio: window.devicePixelRatio,
        viewportWidth: width,
        viewportHeight: height,
    });

};
sketch({canvas: document.querySelector('canvas'), width: window.innerWidth, height: window.innerHeight})
