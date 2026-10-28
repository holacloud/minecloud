// Ultra graphics mode, layered on top of RTX mode.
//
// - Physically based atmospheric sky (THREE.Sky) that also lights PBR materials through a
//   periodically refreshed environment map.
// - HDR pipeline: the scene renders to a half-float target, UnrealBloomPass adds bloom, and
//   a final pass draws screen-space god rays from the depth buffer, applies ACES tone
//   mapping, colour grading, vignette and film grain.
// - Crisp 4096px shadows on a tight frustum that follows the player.
// - World extras (see WorldRenderer.setUltraMode): 256px textures with roughness maps,
//   stronger normals, wind on foliage and drifting water.
// The extra libraries are only downloaded the first time the mode is enabled.

const ULTRA_LIBRARIES = [
    'shaders/CopyShader.js',
    'shaders/LuminosityHighPassShader.js',
    'postprocessing/EffectComposer.js',
    'postprocessing/UnrealBloomPass.js',
    'objects/Sky.js'
].map((path) => `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/${path}`);

const ULTRA_FINAL_SHADER = {
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform vec2 sunUv;
        uniform float sunIntensity;
        uniform vec3 sunColor;
        uniform float exposure;
        uniform float time;
        uniform vec2 resolution;
        varying vec2 vUv;

        const int RAY_SAMPLES = 48;

        vec3 aces(vec3 x) {
            return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
        }

        // Sky pixels (nothing drawn there) are where light comes from.
        float skyMask(vec2 uv) {
            return step(0.99999, texture2D(tDepth, uv).r);
        }

        void main() {
            vec3 color = texture2D(tColor, vUv).rgb;

            if (sunIntensity > 0.0) {
                // March from the pixel towards the sun, accumulating unoccluded sky.
                vec2 stepUv = (sunUv - vUv) / float(RAY_SAMPLES) * 0.85;
                vec2 uv = vUv;
                float decay = 1.0;
                float light = 0.0;
                for (int i = 0; i < RAY_SAMPLES; i++) {
                    uv += stepUv;
                    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
                    light += skyMask(uv) * decay;
                    decay *= 0.96;
                }
                light /= float(RAY_SAMPLES);
                float aspect = resolution.x / resolution.y;
                float falloff = 1.0 - smoothstep(0.0, 1.1, length((vUv - sunUv) * vec2(aspect, 1.0)));
                color += sunColor * light * falloff * sunIntensity;
            }

            color = aces(color * exposure);

            // Grading: a touch more saturation and contrast, slightly warm highlights.
            float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(vec3(luma), color, 1.12);
            color = mix(color, color * color * (3.0 - 2.0 * color), 0.18);
            color *= mix(vec3(1.0), vec3(1.03, 1.0, 0.96), smoothstep(0.5, 1.0, luma));

            vec2 centred = vUv - 0.5;
            color *= 1.0 - dot(centred, centred) * 0.55;

            float grain = fract(sin(dot(vUv * resolution + time, vec2(12.9898, 78.233))) * 43758.5453);
            color += (grain - 0.5) * 0.012;

            gl_FragColor = vec4(pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
        }
    `
};

Object.assign(Game.prototype, {
    loadUltraLibraries() {
        if (!this.ultraLibrariesPromise) {
            this.ultraLibrariesPromise = ULTRA_LIBRARIES.reduce((chain, url) => chain.then(() => new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = url;
                script.onload = resolve;
                script.onerror = () => reject(new Error(`Could not load ${url}`));
                document.head.appendChild(script);
            })), Promise.resolve());
        }
        return this.ultraLibrariesPromise;
    },

    async toggleUltraMode() {
        await this.applyUltraMode(!this.ultraModeEnabled);
    },

    async applyUltraMode(enabled) {
        if (enabled === this.ultraModeEnabled) return;
        if (enabled) {
            try {
                await this.loadUltraLibraries();
            } catch (error) {
                console.error(error);
                this.receiveSystemMessage({ text: 'Ultra mode needs to download extra graphics code and could not load it' });
                return;
            }
            this.stopMining();
            this.resetMiningBlockVisual(true);
            if (!this.rtxModeEnabled) this.applyRTXMode(true);
            this.ultraModeEnabled = true;
            this.initUltraPipeline();
        } else {
            this.ultraModeEnabled = false;
            this.disposeUltraPipeline();
        }

        // Tone mapping moves into the final pass in ultra mode.
        this.renderer.toneMapping = enabled ? THREE.NoToneMapping : (this.rtxModeEnabled ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping);
        this.renderer.setPixelRatio(this.getPixelRatioLimit());
        this.resizeUltraPipeline();
        this.configureShadows();
        this.world.setUltraMode(enabled);
        this.scene.environment = this.rtxModeEnabled ? (enabled ? this.ultraEnvironment : this.getSkyEnvironment()) : null;
        this.refreshOtherPlayerAvatarMaterials();
        this.rebuildPickupMeshes();
        this.refreshHeldItemMesh(true);
        // Programs depend on the tone mapping mode; make every material recompile.
        this.scene.traverse((node) => {
            const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
            materials.forEach((material) => { material.needsUpdate = true; });
        });

        this.ultraPreferred = enabled;
        this.saveSettings();
        this.updateSettingsUI();
        this.updateRTXStatus();
        this.updateDayNightCycle(0);
    },

    configureShadows() {
        const shadow = this.sunLight.shadow;
        const ultra = this.ultraModeEnabled;
        const extent = ultra ? 48 : 70;
        shadow.camera.left = -extent;
        shadow.camera.right = extent;
        shadow.camera.top = extent;
        shadow.camera.bottom = -extent;
        shadow.camera.updateProjectionMatrix();
        shadow.bias = ultra ? -0.0003 : -0.0008;
        shadow.normalBias = ultra ? 0.035 : 0.02;
        shadow.radius = ultra ? 2.5 : 1;
        const size = ultra ? 4096 : 1536;
        if (shadow.mapSize.x !== size) {
            shadow.mapSize.set(size, size);
            if (shadow.map) {
                shadow.map.dispose();
                shadow.map = null;
            }
        }
    },

    initUltraPipeline() {
        const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
        const depthTexture = new THREE.DepthTexture(size.x, size.y);
        depthTexture.type = THREE.UnsignedIntType;
        this.ultraTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
            depthBuffer: true,
            depthTexture
        });
        // Threshold above 1: only genuinely bright HDR areas (sun, sky glare, torches) bloom.
        this.ultraBloom = new THREE.UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.55, 1.0);
        this.ultraFinalMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tColor: { value: this.ultraTarget.texture },
                tDepth: { value: depthTexture },
                sunUv: { value: new THREE.Vector2(0.5, 0.5) },
                sunIntensity: { value: 0 },
                sunColor: { value: new THREE.Color(1, 0.86, 0.66) },
                exposure: { value: 1 },
                time: { value: 0 },
                resolution: { value: new THREE.Vector2(size.x, size.y) }
            },
            vertexShader: ULTRA_FINAL_SHADER.vertexShader,
            fragmentShader: ULTRA_FINAL_SHADER.fragmentShader,
            depthTest: false,
            depthWrite: false
        });
        this.ultraFinalQuad = new THREE.FullScreenQuad(this.ultraFinalMaterial);

        this.ultraSky = new THREE.Sky();
        this.ultraSky.scale.setScalar(900);
        const skyUniforms = this.ultraSky.material.uniforms;
        skyUniforms.turbidity.value = 5;
        skyUniforms.rayleigh.value = 1.6;
        skyUniforms.mieCoefficient.value = 0.004;
        skyUniforms.mieDirectionalG.value = 0.82;
        this.scene.add(this.ultraSky);

        this.ultraPmrem = new THREE.PMREMGenerator(this.renderer);
        this.ultraEnvScene = new THREE.Scene();
        this.ultraEnvSky = new THREE.Sky();
        this.ultraEnvSky.material = this.ultraSky.material;
        this.ultraEnvSky.scale.setScalar(10);
        this.ultraEnvScene.add(this.ultraEnvSky);
        this.ultraEnvironment = null;
        this.ultraEnvRefreshAt = 0;
        this.ultraTime = 0;
        this.refreshUltraEnvironment();
    },

    disposeUltraPipeline() {
        if (!this.ultraTarget) return;
        this.scene.remove(this.ultraSky);
        this.ultraTarget.depthTexture.dispose();
        this.ultraTarget.dispose();
        this.ultraBloom.dispose();
        this.ultraFinalMaterial.dispose();
        this.ultraFinalQuad.dispose();
        this.ultraSky.geometry.dispose();
        this.ultraSky.material.dispose();
        if (this.ultraEnvironment) this.ultraEnvironment.dispose();
        this.ultraPmrem.dispose();
        this.ultraTarget = null;
        this.ultraEnvironment = null;
    },

    // Re-bakes reflections from the current sky (cheap enough every few seconds).
    refreshUltraEnvironment() {
        const previous = this.ultraEnvironment;
        this.ultraEnvironment = this.ultraPmrem.fromScene(this.ultraEnvScene, 0.03).texture;
        this.scene.environment = this.ultraEnvironment;
        if (previous) previous.dispose();
    },

    resizeUltraPipeline() {
        if (!this.ultraTarget) return;
        const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
        this.ultraTarget.setSize(size.x, size.y);
        this.ultraBloom.setSize(size.x, size.y);
        this.ultraFinalMaterial.uniforms.resolution.value.set(size.x, size.y);
    },

    updateUltra(delta) {
        this.ultraTime += delta;
        const sunDirection = this.sunDirection || new THREE.Vector3(0.4, 0.8, 0.3);
        const daylight = this.daylight ?? 1;

        this.ultraSky.position.copy(this.camera.position);
        this.ultraSky.material.uniforms.sunPosition.value.copy(sunDirection);
        // Rain and dusk flatten the sky; clear noon is crisp.
        const raining = this.weatherState === 'rain';
        this.ultraSky.material.uniforms.turbidity.value = raining ? 12 : 4 + (1 - daylight) * 4;

        if (this.ultraTime >= this.ultraEnvRefreshAt) {
            this.ultraEnvRefreshAt = this.ultraTime + 4;
            this.refreshUltraEnvironment();
        }

        // God rays: project the sun to the screen; fade out behind the camera and at night.
        const uniforms = this.ultraFinalMaterial.uniforms;
        const sunPoint = this.camera.position.clone().addScaledVector(sunDirection, 500).project(this.camera);
        const inFront = sunPoint.z < 1;
        uniforms.sunUv.value.set(sunPoint.x * 0.5 + 0.5, sunPoint.y * 0.5 + 0.5);
        const elevation = THREE.MathUtils.clamp(sunDirection.y * 3, 0, 1);
        const target = inFront ? elevation * daylight * (raining ? 0.25 : 1) * 0.9 : 0;
        uniforms.sunIntensity.value = THREE.MathUtils.lerp(uniforms.sunIntensity.value, target, Math.min(1, delta * 6));
        uniforms.sunColor.value.copy(this.sunLight.color);
        uniforms.exposure.value = this.renderer.toneMappingExposure;
        uniforms.time.value = this.ultraTime;
    },

    renderFrame(delta) {
        this.world.animateMaterials(this.clock.elapsedTime);
        if (!this.ultraModeEnabled || !this.ultraTarget) {
            this.renderer.render(this.scene, this.camera);
            return;
        }
        this.updateUltra(delta);
        this.renderer.setRenderTarget(this.ultraTarget);
        this.renderer.render(this.scene, this.camera);
        // Adds bloom onto the HDR target in place.
        this.ultraBloom.render(this.renderer, null, this.ultraTarget, delta, false);
        this.renderer.setRenderTarget(null);
        this.ultraFinalQuad.render(this.renderer);
    }
});
