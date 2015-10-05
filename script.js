(function (canvasContainerId, vsId, fsId) {
	var scene = new THREE.Scene();
	var anim = null;
	var camera = null;
	var cameraPivot = null;
	var renderer = null;
	var clock = new THREE.Clock(true);
	var commands = null;
	var animStarted = false;
	var cameraOrbit = false;
	var orbitSensitivity = 0.01;
	var orbitSpeed = 10;
	var cameraOrbitTargetAngle = 0;
	var lastMouseX = 0, lastMouseY;

	function RotatingAnimator(first, second) {
		this.first = first;
		this.second = second;
		this.angle = 0;
		this.done = false;

		var pivot = new THREE.Object3D();
		scene.add(pivot);
		pivot.position.set(first.position.x + (second.position.x - first.position.x) / 2, 0, 0);
		pivot.updateMatrixWorld();

		THREE.SceneUtils.attach(first, scene, pivot);
		THREE.SceneUtils.attach(second, scene, pivot);

		this.pivot = pivot;

		this.animate = function (dt) {
			if (this.done)
				return;

			var angle = dt * 10;
			
			if (this.angle + angle >= Math.PI) {
				angle = Math.PI - this.angle;
				this.done = true;
			}

			this.pivot.rotateY(angle);
			this.angle += angle;
			pivot.updateMatrixWorld();

			if (this.done) {
				THREE.SceneUtils.detach(anim.first, anim.pivot, scene);
				THREE.SceneUtils.detach(anim.second, anim.pivot, scene);
				scene.remove(anim.pivot);
			}
		}
	}

	function bubbleSort(seq) {
		var result = [];
		for (var i = 0; i < seq.length - 1; ++i) {
			for (var j = i + 1; j < seq.length; ++j) {
				if (seq[j].value < seq[i].value) {
					result.push({
						first: seq[i],
						second: seq[j]
					});
					var tmp = seq[i];
					seq[i] = seq[j];
					seq[j] = tmp;
				}
			}
		}
		return result;
	}

	function generateRandomIntegers(count) {
		var used = {};
		var values = [];
		function tryAdjust(v) {
			for (var j = 0; ; j += 1) {
				var right = v + j;
				var left = v - j;
				if (right <= count && typeof used[right] == "undefined")
					return right;
				else if (left >= 1 && typeof used[left] == "undefined")
					return left;
				else if (left <= 1 && right >= count)
					return null;
			}
		}
		while (values.length < count) {
			var val = tryAdjust(Math.floor(Math.random() * count) + 1);
			if (!val)
				break;
			used[val] = true;
			values.push(val);
		}
		return values;
	}

	function createObjects(options) {
		var ints = generateRandomIntegers(options.count);
		var boxSize = options.boxSize;
		var geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
		var x = -Math.floor(ints.length / 2) * (options.offset + boxSize);

		var result = [];
		var firstBox = null;
		for (var i = 0; i < ints.length; ++i) {
			var value = ints[i];
			var material = options.materialFactory(1);
			for (var j = 0; j < value; ++j) {
				var box = new THREE.Mesh(geometry, material);
				box.position.y = j * boxSize;
				if (firstBox)
					firstBox.add(box);
				else {
					firstBox = box;
					firstBox.position.x = x;
				}
			}
			scene.add(firstBox);
			x += options.offset + boxSize;
			result.push({ obj: firstBox, value: value });
			firstBox = null;
		}

		return result;
	}

	function createObjectMaterial(objYScale) {
		var material = new THREE.ShaderMaterial({
			uniforms: {
				lineWidth: { type: "f", value: 0.08 },
				primaryColor: { type: "c", value: new THREE.Color(1, 1, 1) },
				lineColor: { type: "c", value: new THREE.Color(0, 0.5, 0.5) },
				frequency: { type: "f", value: 0.5 },
				scaleU: { type: "f", value: 0.5 },
				scaleV: { type: "f", value: objYScale / 2 },
				falloff: { type: "f", value: 0.03 },
				offsetU: { type: "f", value: 0 },
				offsetV: { type: "f", value: 0 }
			},
			vertexShader: document.getElementById(vsId).textContent,
			fragmentShader: document.getElementById(fsId).textContent
		});
		return material;
	}

	function updateCameraProjection() {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
	}

	function init() {
		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setClearColor(0xffffff);
		var canvas = renderer.domElement;
		document.getElementById(canvasContainerId).appendChild(canvas);

		camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
		camera.position.y = 5;
		camera.position.z = 7;
		camera.lookAt(new THREE.Vector3(0, 0, 0));
		updateCameraProjection();

		cameraPivot = new THREE.Object3D();
		cameraPivot.position.x = -0.5;
		cameraPivot.position.y = 1;
		cameraPivot.add(camera);
		scene.add(cameraPivot);

		var options = {
			count: 10,
			offset: 0.5,
			boxSize: 0.5,
			materialFactory: createObjectMaterial
		};
		var seq = createObjects(options);
		commands = bubbleSort(seq);

		canvas.addEventListener("mousemove", function (evt) {
			if (!cameraOrbit)
				return;
			cameraOrbitTargetAngle += orbitSensitivity * (lastMouseX - evt.x);
			lastMouseX = evt.x;
			lastMouseY = evt.y;
		});

		canvas.addEventListener("mousedown", function (evt) {
			cameraOrbit = true;
			lastMouseX = evt.x;
			lastMouseY = evt.y;
		});

		canvas.addEventListener("mouseup", function (evt) {
			cameraOrbit = false;
		});

		canvas.addEventListener("blur", function(evt) {
			cameraOrbit = false;
		});
	}

	function processCommand(cmd) {
		var first = cmd.first.obj;
		var second = cmd.second.obj;
		anim = new RotatingAnimator(first, second);
	}

	function update() {
		requestAnimationFrame(update);

		var dt = clock.getDelta();

		if (anim)
			anim.animate(dt);

		cameraPivot.rotation.y += orbitSpeed * dt * (cameraOrbitTargetAngle - cameraPivot.rotation.y);

		renderer.render(scene, camera);

		if (anim && anim.done)
			anim = null;

		if (animStarted && !anim && commands.length > 0) {
			var cmd = commands.splice(0, 1)[0];
			processCommand(cmd);
		}
	}

	document.body.onkeydown = function (e) {
		if (String.fromCharCode(e.keyCode) === "E")
			animStarted = true;
	};

	window.addEventListener("resize", function () {
		renderer.setSize(window.innerWidth, window.innerHeight);
		updateCameraProjection();
	});

	init();
	update();
})("main-canvas-container", "vs-basic", "fs-box");