(function (canvasContainerId, vsId, fsId) {
	var objectCount = 10;
	var objectOffset = 0.5;
	var objectSize = 0.5;
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
		this.done = false;

		var rotationSpeed = 10;
		var firstObj = first.obj;
		var secondObj = second.obj;
		var totalAngle = 0;
		var pivot = new THREE.Object3D();
		pivot.position.x = firstObj.position.x + (secondObj.position.x - firstObj.position.x) / 2;
		pivot.updateMatrixWorld();
		scene.add(pivot);

		THREE.SceneUtils.attach(firstObj, scene, pivot);
		THREE.SceneUtils.attach(secondObj, scene, pivot);

		this.animate = function (dt) {
			if (this.done)
				return;

			var angle = dt * rotationSpeed;
			
			if (totalAngle + angle >= Math.PI) {
				angle = Math.PI - totalAngle;
				this.done = true;
			}

			pivot.rotateY(angle);
			totalAngle += angle;
			pivot.updateMatrixWorld();

			if (this.done) {
				THREE.SceneUtils.detach(firstObj, pivot, scene);
				THREE.SceneUtils.detach(secondObj, pivot, scene);
				scene.remove(pivot);
			}
		}
	}

	function RebuildingAnimator(first, second) {
		this.done = false;

		var duration = 0.2;
		var maxDistance = 0.5;
		var speed = maxDistance / duration;
		var source = first.value >= second.value ? first.obj : second.obj;
		var target = source === first.obj ? second.obj : first.obj;
		var diff = Math.abs(first.value - second.value);
		var time = 0;
		var distance = 0;
		var animatedBox = null;
		var firstPhase = false;

		this.animate = function (dt) {
			if (this.done)
				return;
			if (!animatedBox) {
				animatedBox = source.others.splice(-1, 1)[0];
				time = 0;
				firstPhase = true;
			}
			var delta = speed * dt;
			if (firstPhase) {
				if (distance + delta > maxDistance)
					delta = maxDistance - distance;
				animatedBox.position.y += delta;
				animatedBox.material.uniforms.a.value = (1 - distance / maxDistance);
				distance += delta;
				if (distance >= maxDistance) {
					source.remove(animatedBox);
					target.others.push(animatedBox);
					target.add(animatedBox);
					animatedBox.position.y = target.others.length * objectSize + maxDistance;
					firstPhase = false;
					distance = maxDistance;
					time = 0;
				}
			} else {
				if (distance - delta <= 0)
					delta = distance;
				animatedBox.position.y -= delta;
				animatedBox.material.uniforms.a.value = (1 - distance / maxDistance);
				distance -= delta;
				if (distance <= 0) {
					animatedBox.material.uniforms.a.value = 1;
					if (--diff <= 0) {
						this.done = true;
						var tmp = first.obj;
						first.obj = second.obj;
						second.obj = tmp;
					} else
						animatedBox = null;
				}
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

	function createObjects(materialFactory) {
		var ints = generateRandomIntegers(objectCount);
		var geometry = new THREE.BoxGeometry(objectSize, objectSize, objectSize);
		var x = -Math.floor(ints.length / 2) * (objectOffset + objectSize);

		var result = [];
		var firstBox = null;
		for (var i = 0; i < ints.length; ++i) {
			var value = ints[i];
			for (var j = 0; j < value; ++j) {
				var material = materialFactory(1);
				var box = new THREE.Mesh(geometry, material);
				box.position.y = j * objectSize;
				if (firstBox) {
					firstBox.add(box);
					firstBox.others.push(box);
				}
				else {
					firstBox = box;
					firstBox.position.x = x;
					firstBox.others = [];
				}
			}
			scene.add(firstBox);
			x += objectOffset + objectSize;
			result.push({ obj: firstBox, value: value });
			firstBox = null;
		}

		return result;
	}

	function createObjectMaterial(objYScale) {
		var material = new THREE.ShaderMaterial({
			uniforms: {
				a: { type: "f", value: 1 },
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
		material.transparent = true;
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

		var seq = createObjects(createObjectMaterial);
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
			anim = new RebuildingAnimator(cmd.first, cmd.second); //new RotatingAnimator(cmd.first, cmd.second);
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