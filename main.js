(function (options) {
	var objectCount = 10;
	var columnOffset = 0.5;
	var objectSize = 0.5;
	var orbitSensitivity = 0.01;
	var orbitSpeed = 10;

	var canvasContainer = document.getElementById(options.canvasContainerId);
	var animatorSelect = document.getElementById(options.animatorSelectId);
	var resetButton = document.getElementById(options.resetButtonId);
	var sortButton = document.getElementById(options.sortButtonId);
	
	var scene = null;
	var animator = null;
	var camera = null;
	var cameraPivot = null;
	var renderer = null;
	var clock = new THREE.Clock(true);
	var commands = null;
	var animationStarted = false;
	var cameraOrbit = false;
	var cameraOrbitTargetAngle = 0;
	var lastMouseX = 0;
	var lastMouseY = 0;
	var animatorConstructor = null;

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
		var distance = 0;
		var animatedObj = null;
		var firstPhase = false;

		this.animate = function (dt) {
			if (this.done)
				return;
			if (!animatedObj) {
				animatedObj = source.others.splice(-1, 1)[0];
				firstPhase = true;
			}
			var delta = speed * dt;
			if (firstPhase) {
				if (distance + delta > maxDistance)
					delta = maxDistance - distance;
				animatedObj.position.y += delta;
				animatedObj.material.uniforms.alpha.value = (1 - distance / maxDistance);
				distance += delta;
				if (distance >= maxDistance) {
					source.remove(animatedObj);
					target.others.push(animatedObj);
					target.add(animatedObj);
					animatedObj.position.y = target.others.length * objectSize + maxDistance;
					firstPhase = false;
					distance = maxDistance;
				}
			} else {
				if (distance - delta <= 0)
					delta = distance;
				animatedObj.position.y -= delta;
				animatedObj.material.uniforms.a.value = (1 - distance / maxDistance);
				distance -= delta;
				if (distance <= 0) {
					animatedObj.material.uniforms.a.value = 1;
					if (--diff <= 0) {
						this.done = true;
						var tmp = first.obj;
						first.obj = second.obj;
						second.obj = tmp;
					} else
						animatedObj = null;
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

	function createObjectSequence(materialFactory) {
		var ints = generateRandomIntegers(objectCount);
		var geometry = new THREE.BoxGeometry(objectSize, objectSize, objectSize);
		var x = -Math.floor(ints.length / 2) * (columnOffset + objectSize);

		var result = [];
		var firstBox = null;
		for (var i = 0; i < ints.length; ++i) {
			var value = ints[i];
			for (var j = 0; j < value; ++j) {
				var material = materialFactory();
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
			x += columnOffset + objectSize;
			result.push({ obj: firstBox, value: value });
			firstBox = null;
		}

		return result;
	}

	function createObjectMaterial() {
		var material = new THREE.ShaderMaterial({
			uniforms: {
				alpha: { type: "f", value: 1 },
				lineWidth: { type: "f", value: 0.08 },
				primaryColor: { type: "c", value: new THREE.Color(1, 1, 1) },
				lineColor: { type: "c", value: new THREE.Color(0, 0.5, 0.5) },
				falloff: { type: "f", value: 0.03 }
			},
			vertexShader: document.getElementById(options.vsContainerId).textContent,
			fragmentShader: document.getElementById(options.fsContainerId).textContent
		});
		material.transparent = true;
		return material;
	}

	function updateCameraProjection() {
		camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
		camera.updateProjectionMatrix();
	}

	function reset() {
		scene = new THREE.Scene();
		scene.add(cameraPivot);
		animationStarted = false;
		animator = null;
		var seq = createObjectSequence(createObjectMaterial);
		commands = bubbleSort(seq);
	}

	function init() {
		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
		renderer.setClearColor(0xffffff);
		var canvas = renderer.domElement;
		canvasContainer.appendChild(canvas);

		camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
		camera.position.y = 5;
		camera.position.z = 7.5;
		camera.lookAt(new THREE.Vector3(0, 0, 0));
		updateCameraProjection();

		cameraPivot = new THREE.Object3D();
		cameraPivot.position.x = -0.5;
		cameraPivot.position.y = 1;
		cameraPivot.add(camera);

		animatorConstructor = RotatingAnimator;

		reset();

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

		resetButton.addEventListener("click", function() {
			reset();
		});

		sortButton.addEventListener("click", function () {
			animationStarted = true;
		});

		animatorSelect.addEventListener("change", function () {
			var val = this.options[this.selectedIndex].value;
			if (val === "Rotate")
				animatorConstructor = RotatingAnimator;
			else if (val === "Rebuild")
				animatorConstructor = RebuildingAnimator;
			reset();
		});

		window.addEventListener("resize", function () {
			renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
			updateCameraProjection();
		});
	}

	function update() {
		requestAnimationFrame(update);

		var dt = clock.getDelta();

		if (animator)
			animator.animate(dt);

		cameraPivot.rotation.y += orbitSpeed * dt * (cameraOrbitTargetAngle - cameraPivot.rotation.y);

		renderer.render(scene, camera);

		if (animator && animator.done)
			animator = null;

		if (animationStarted && !animator && commands.length > 0) {
			var cmd = commands.splice(0, 1)[0];
			animator = new animatorConstructor(cmd.first, cmd.second);
		}
	}

	init();
	update();

})({
	canvasContainerId: "main-canvas-container",
	vsContainerId: "vs-basic",
	fsContainerId: "fs-box",
	animatorSelectId: "animator-select",
	resetButtonId: "reset-button",
	sortButtonId: "sort-button"
});