(function (canvasId, vsId, fsId) {
	var scene = new THREE.Scene();
	var anim = null;
	var camera = null;
	var renderer = null;
	var clock = new THREE.Clock(true);
	var commands = null;
	var animStarted = false;

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

	function getRandomIntegers(count) {
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

	function getObjectSequence(options) {
		var ints = getRandomIntegers(options.count);
		var boxSize = options.boxSize;
		var geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
		var x = -Math.floor(ints.length / 2) * (options.offset + boxSize);

		var result = [];
		for (var i = 0; i < ints.length; ++i) {
			var value = ints[i];
//			var extraHeight = 5 * (value - 1) / (options.count - 1);
			var scaleY = value;
			var material = options.materialFactory(scaleY);
			var box = new THREE.Mesh(geometry, material);
			box.position.x = x;
			box.position.y = scaleY / 4;
			box.scale.y = scaleY;
			scene.add(box);
			x += options.offset + boxSize;
			result.push({
				obj: box,
				value: value
			});
		}

		return result;
	}

	function getObjectMaterial(objYScale) {
		var material = new THREE.ShaderMaterial({
			uniforms: {
				lineWidth: { type: "f", value: 0.1 },
				frequency: { type: "f", value: 0.5 },
				scaleU: { type: "f", value: 1 },
				scaleV: { type: "f", value: objYScale },
				falloff: { type: "f", value: 0.1 },
				offsetU: { type: "f", value: 0 },
				offsetV: { type: "f", value: 0 }
			},
			vertexShader: document.getElementById(vsId).textContent,
			fragmentShader: document.getElementById(fsId).textContent
		});
		material.transparent = true;
		return material;
	}

	function init() {
		var canvas = document.getElementById(canvasId);
		renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
		renderer.setSize(canvas.width, canvas.height);
		renderer.setClearColor(0xffffff);

		camera = new THREE.PerspectiveCamera(75, canvas.width / canvas.height, 0.1, 1000);
		camera.position.y = 2;
		camera.position.z = 5;
		camera.lookAt(new THREE.Vector3(0, 1, 0));

		var options = {
			count: 10,
			offset: 0.8,
			boxSize: 0.5,
			materialFactory: getObjectMaterial
		};
		var seq = getObjectSequence(options);
		commands = bubbleSort(seq);
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

	init();
	update();
})("main-canvas", "vs-basic", "fs-box");