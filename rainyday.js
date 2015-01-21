/* 
 * requestAnimationFrame polyfill by Erik Möller. fixes from Paul Irish and Tino Zijdel
 * See https://gist.github.com/paulirish/1579671
 */
(function() {
	var lastTime = 0;
	var vendors = ['ms', 'moz', 'webkit', 'o'];
	for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
		window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
		window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
	}

	if (!window.requestAnimationFrame) {
		window.requestAnimationFrame = function(callback) {
			var currTime = new Date().getTime();
			var timeToCall = Math.max(0, 16 - (currTime - lastTime));
			var id = window.setTimeout(function() {
					callback(currTime + timeToCall);
				},
				timeToCall);
			lastTime = currTime + timeToCall;
			return id;
		};
	}

	if (!window.cancelAnimationFrame) {
		window.cancelAnimationFrame = function(id) {
			clearTimeout(id);
		};
	}
}());

/**
 * Defines a new instance of the rainyday.js.
 * @param config config element with script parameters
 */
function RainyDay(config) {

	this.TRAIL_NONE = 0;
	this.TRAIL_DROPS = 1;
	this.TRAIL_SMUDGE = 2;

	this.conf = {
		opacity: 1,
		blur: 10,
		resize: true,
		gravity: true,
		intensity: 20,
		collisions: true,
		threshold: 3,
		angle: Math.PI / 2,
		angleVariance: 0,
		scaledownFactor: 5,
		speed: 20,
		reflectionSize: 10
	};
	this.drops = [];

	this.initialized = false;
	this.isBackground = false;
	this.canvasOk = false;
	this.imageOk = false;
	this.paused = true;

	this.pSetup = function(z, parent) {
		this.cBack = document.createElement('canvas');
		this.cBack.style.position = 'absolute';
		this.cBack.style.top = 0;
		this.cBack.style.left = 0;
		this.cBack.style.zIndex = 0;

		this.cGlass = document.createElement('canvas');
		this.cGlass.style.position = 'absolute';
		this.cGlass.style.top = 0;
		this.cGlass.style.left = 0;
		this.cGlass.style.zIndex = 1;

		this.domParent = document.createElement('div');
		this.domParent.style.position = 'relative';
		this.domParent.style.padding = 0;

		this.domParent.style.zIndex = z;
		this.domParent.className = 'rd-div';
		this.domParent.appendChild(this.cBack);
		this.domParent.appendChild(this.cGlass);

		(parent || document.body).appendChild(this.domParent);

		this.canvasOk = true;
	};

	this.rect = function(x, y, w, h, z, parent) {
		if (!this.initialized) {
			this.pSetup(z, parent);
		}

		this.isBackground = false;

		this.cBack.width = w;
		this.cBack.height = h;

		this.cGlass.width = w;
		this.cGlass.height = h;
		this.context = this.cGlass.getContext('2d');

		this.domParent.style.top = x + 'px';
		this.domParent.style.left = y + 'px';
		this.domParent.style.zIndex = z;
		this.domParent.className = 'rd-div';
		this.domParent.width = w;
		this.domParent.height = h;

		this.width = w;
		this.height = h;

		if (this.image) {
			this.img(this.image);
			this.pNewReflections();
		}

		return this;
	};

	this.cover = function() {
		if (this.isBackground) {
			return;
		}
		if (!this.initialized) {
			this.pSetup(-100);
		}

		this.isBackground = true;

		var w = window.innerWidth;
		var h = window.innerHeight;

		this.cBack.width = w;
		this.cBack.height = h;

		this.cGlass.width = w;
		this.cGlass.height = h;
		this.context = this.cGlass.getContext('2d');

		this.domParent.style.top = 0;
		this.domParent.style.left = 0;
		this.domParent.className = 'rd-div';
		this.domParent.width = '100%';
		this.domParent.height = '100%';

		this.width = w;
		this.height = h;

		if (this.image) {
			this.img(this.image);
			this.pNewReflections();
		}

		// handle resize events
		if (this.conf.resize) {
			if (window.attachEvent) {
				window.attachEvent('onresize', function() {
					this.pResized();
				}.bind(this));
				window.attachEvent('onorientationchange', function() {
					this.pResized();
				}.bind(this));
			} else if (window.addEventListener) {
				window.addEventListener('resize', function() {
					this.pResized();
				}.bind(this), true);
				window.addEventListener('orientationchange', function() {
					this.pResized();
				}.bind(this), true);
			} else {
				this.doSizeCheck = true;
			}
		}

		return this;
	};

	// TODO this.img = function(image, x, y, w, h) {
	this.img = function(image) {
		if (image instanceof Image) {
			this.image = image;
		} else {
			this.image = document.getElementById(image);
			if (!this.image) {
				throw 'Invalid <img> element id (' + image + ')';
			}
		}
		this.imageOk = true;

		if (this.initialized) {
			this.pNewReflections();
		}

		return this;
	};

	this.rain = function() { // TODO presets, trail)
		if (!this.canvasOk) {
			throw 'Canvas has not been configured correctly';
		}
		if (!this.imageOk) {
			throw 'Source image has not been configured correctly';
		}
		this.pNewReflections();
		this.initialized = true;
		return this.start();
	};

	/**
	 * Starts or resumes the animation
	 */
	this.start = function() {
		if (!this.paused) {
			return;
		}
		this.paused = false;
		this.pFrame();
		return this;
	};

	/**
	 * Pauses the animation
	 */
	this.pause = function() {
		if (this.paused) {
			return;
		}
		this.paused = true;
		return this;
	};

	/**
	 * Stop the animation and destroy canvas objects
	 */
	this.stop = function() {
		// TODO stop animation and free memory
		this.paused = true;
		this.initialized = false;
		return this;
	};

	this.intensity = function(n) {
		if (n < 0) {
			this.conf.intensity = 100;
		} else if (n > 100) {
			this.conf.intensity = 0;
		} else {
			this.conf.intensity = 100 - n;
		}
	};

	this.gravity = function(g) {
		var oldG = this.conf.gravity;
		if (typeof g === 'undefined') {
			this.conf.gravity = !oldG;
		} else {
			this.conf.gravity = g;
		}
		if (!oldG) {
			this.pFrame();
		}
	};

	this.speed = function(s) {
		if (s < 0) {
			this.conf.speed = 0;
		} else if (s > 100) {
			this.conf.speed = 100;
		} else {
			this.conf.speed = s;
		}
	};
	
	this.reflection = function(s) {
		if (s <= 0) {
			this.conf.reflectionSize = 1;
		} else if (s > 100) {
			this.conf.reflectionSize = 100;
		} else {
			this.conf.reflectionSize = s;
		}
	};

	this.pFrame = function() {
		window.requestAnimationFrame(this.pAnimation.bind(this));
	};

	/**
	 * Render animation frame
	 */
	this.pAnimation = function() {

		if (this.stats) {
			this.stats.begin();
		}

		var fReflection = this.pReflection.bind(this);
		if ((Math.random() * 100) > this.conf.intensity) {
			var drop = new Drop(Math.random(), Math.random(), Math.random() * 5);
			this.pDrop(drop);
			drop.draw(this.context, fReflection);
		}

		if (this.conf.gravity) {
			// var fTrail = this.pTrailSmudge.bind(this);
			for (var i = 0; i < this.drops.length; ++i) {
				var drop = this.drops[i];
				this.pGravity(drop);
				//if (this.pGravity(drop)) {
				// TODO remove drop
				//}
				drop.draw(this.context, fReflection);
			}
		}

		if (!this.paused) {
			this.pFrame();
		}

		if (this.stats) {
			this.stats.end();
		}
	};

	this.pDrop = function(drop) {
		//TODO if (this.conf.gravity && drop.r > this.conf.threshold) {
		this.drops.push(drop);
		//}
	};

	this.pResized = function() {
		if (this.isBackground) {
			this.pause();
			this.isBackground = false;
			this.cover();
			this.start();
		}
	};

	this.pReflection = function(drop) {
		var dtx = drop.x * this.width;
		var dty = drop.y * this.height;
		var dx = drop.x * this.reflected.width;
		var dy = drop.y * this.reflected.height;
		var f = this.conf.reflectionSize / 100;
		var sx = Math.max(dx - this.reflected.width * f, 0);
		var sy = Math.max(dy - this.reflected.height * f, 0);
		var sw = this.pPositiveMin(dx + this.reflected.width * f, this.reflected.width);
		var sh = this.pPositiveMin(dy + this.reflected.height * f, this.reflected.height);
		this.context.drawImage(this.reflected, sx, sy, sw, sh, Math.max(dtx - drop.r, 0), Math.max(dty - drop.r, 0), drop.r * 2, drop.r * 2);
	};

	this.pTrailDrops = function(drop) {
		if (!drop.trailY || drop.y - drop.trailY >= Math.random() * 100 * drop.r) {
			drop.trailY = drop.y;
			this.pDrop(new Drop(this, drop.x + (Math.random() * 2 - 1) * Math.random(), drop.y - drop.r - 5, Math.ceil(drop.r / 5), 0));
		}
	};

	this.pTrailSmudge = function(drop) {
		var y = drop.y - drop.r - 3;
		var x = drop.x - drop.r / 2 + (Math.random() * 2);
		if (y < 0 || x < 0) {
			return;
		}
		this.context.drawImage(this.clearbackground, x, y, drop.r, 2, x, y, drop.r, 2);
	};

	this.pGravity = function(drop) {
		if (drop.clear(this.context, false, this.width, this.height)) {
			return true;
		}

		// TODO implementation
		drop.y += this.conf.speed * 0.00003;

		return false;
	};

	/**
	 * Helper function to return a positive min() of two values
	 */
	this.pPositiveMin = function(val1, val2) {
		var result = 0;
		if (val1 < val2) {
			if (val1 <= 0) {
				result = val2;
			} else {
				result = val1;
			}
		} else {
			if (val2 <= 0) {
				result = val1;
			} else {
				result = val2;
			}
		}
		return result <= 0 ? 1 : result;
	};

	/**
	 * Set up helper canvas objects for
	 */
	this.pNewReflections = function() {
		if (this.background) {
			delete this.background;
			delete this.clearbackground;
			delete this.reflected;
			this.background = null;
			this.clearbackground = null;
			this.reflected = null;
		}

		this.background = document.createElement('canvas');
		this.background.width = this.width;
		this.background.height = this.height;

		this.clearbackground = document.createElement('canvas');
		this.clearbackground.width = this.width;
		this.clearbackground.height = this.height;

		var context = this.background.getContext('2d');
		context.clearRect(0, 0, this.width, this.height);

		context.drawImage(this.image, 0, 0, this.width, this.height);

		context = this.clearbackground.getContext('2d');
		context.clearRect(0, 0, this.width, this.height);
		context.drawImage(this.image, 0, 0, this.width, this.height);

		if (!isNaN(this.conf.blur) && this.conf.blur >= 1) {
			this.pStackBlurCanvasRGB(this.width, this.height, this.conf.blur);
		}

		this.cBack.getContext('2d').drawImage(this.background, 0, 0, this.width, this.height);

		this.reflected = document.createElement('canvas');
		this.reflected.width = this.width / this.conf.scaledownFactor;
		this.reflected.height = this.height / this.conf.scaledownFactor;
		this.reflected.getContext('2d').drawImage(this.image, 0, 0, this.reflected.width, this.reflected.height);
	};

	this.pStackBlurCanvasRGB = function(width, height, radius) {

		function BlurStack() {
			this.r = 0;
			this.g = 0;
			this.b = 0;
			this.next = null;
		}

		var shgTable = [
			[0, 9],
			[1, 11],
			[2, 12],
			[3, 13],
			[5, 14],
			[7, 15],
			[11, 16],
			[15, 17],
			[22, 18],
			[31, 19],
			[45, 20],
			[63, 21],
			[90, 22],
			[127, 23],
			[181, 24]
		];

		var mulTable = [
			512, 512, 456, 512, 328, 456, 335, 512, 405, 328, 271, 456, 388, 335, 292, 512,
			454, 405, 364, 328, 298, 271, 496, 456, 420, 388, 360, 335, 312, 292, 273, 512,
			482, 454, 428, 405, 383, 364, 345, 328, 312, 298, 284, 271, 259, 496, 475, 456,
			437, 420, 404, 388, 374, 360, 347, 335, 323, 312, 302, 292, 282, 273, 265, 512,
			497, 482, 468, 454, 441, 428, 417, 405, 394, 383, 373, 364, 354, 345, 337, 328,
			320, 312, 305, 298, 291, 284, 278, 271, 265, 259, 507, 496, 485, 475, 465, 456,
			446, 437, 428, 420, 412, 404, 396, 388, 381, 374, 367, 360, 354, 347, 341, 335,
			329, 323, 318, 312, 307, 302, 297, 292, 287, 282, 278, 273, 269, 265, 261, 512,
			505, 497, 489, 482, 475, 468, 461, 454, 447, 441, 435, 428, 422, 417, 411, 405,
			399, 394, 389, 383, 378, 373, 368, 364, 359, 354, 350, 345, 341, 337, 332, 328,
			324, 320, 316, 312, 309, 305, 301, 298, 294, 291, 287, 284, 281, 278, 274, 271,
			268, 265, 262, 259, 257, 507, 501, 496, 491, 485, 480, 475, 470, 465, 460, 456,
			451, 446, 442, 437, 433, 428, 424, 420, 416, 412, 408, 404, 400, 396, 392, 388,
			385, 381, 377, 374, 370, 367, 363, 360, 357, 354, 350, 347, 344, 341, 338, 335,
			332, 329, 326, 323, 320, 318, 315, 312, 310, 307, 304, 302, 299, 297, 294, 292,
			289, 287, 285, 282, 280, 278, 275, 273, 271, 269, 267, 265, 263, 261, 259
		];

		// this should work on int values, not floats
		width = Math.floor(width);
		height = Math.floor(height);

		radius |= 0;

		var context = this.background.getContext('2d');
		var imageData = context.getImageData(0, 0, width, height);
		var pixels = imageData.data;
		var x,
			y,
			i,
			p,
			yp,
			yi,
			yw,
			rSum,
			gSum,
			bSum,
			rOutSum,
			gOutSum,
			bOutSum,
			rInSum,
			gInSum,
			bInSum,
			pr,
			pg,
			pb,
			rbs;
		var radiusPlus1 = radius + 1;
		var sumFactor = radiusPlus1 * (radiusPlus1 + 1) / 2;

		var stackStart = new BlurStack();
		var stackEnd = new BlurStack();
		var stack = stackStart;
		for (i = 1; i < 2 * radius + 1; i++) {
			stack = stack.next = new BlurStack();
			if (i === radiusPlus1) {
				stackEnd = stack;
			}
		}
		stack.next = stackStart;
		var stackIn = null;
		var stackOut = null;

		yw = yi = 0;

		var mulSum = mulTable[radius];
		var shgSum;
		for (var ssi = 0; ssi < shgTable.length; ++ssi) {
			if (radius <= shgTable[ssi][0]) {
				shgSum = shgTable[ssi - 1][1];
				break;
			}
		}

		for (y = 0; y < height; y++) {
			rInSum = gInSum = bInSum = rSum = gSum = bSum = 0;

			rOutSum = radiusPlus1 * (pr = pixels[yi]);
			gOutSum = radiusPlus1 * (pg = pixels[yi + 1]);
			bOutSum = radiusPlus1 * (pb = pixels[yi + 2]);

			rSum += sumFactor * pr;
			gSum += sumFactor * pg;
			bSum += sumFactor * pb;

			stack = stackStart;

			for (i = 0; i < radiusPlus1; i++) {
				stack.r = pr;
				stack.g = pg;
				stack.b = pb;
				stack = stack.next;
			}

			for (i = 1; i < radiusPlus1; i++) {
				p = yi + ((width - 1 < i ? width - 1 : i) << 2);
				rSum += (stack.r = (pr = pixels[p])) * (rbs = radiusPlus1 - i);
				gSum += (stack.g = (pg = pixels[p + 1])) * rbs;
				bSum += (stack.b = (pb = pixels[p + 2])) * rbs;

				rInSum += pr;
				gInSum += pg;
				bInSum += pb;

				stack = stack.next;
			}

			stackIn = stackStart;
			stackOut = stackEnd;
			for (x = 0; x < width; x++) {
				pixels[yi] = (rSum * mulSum) >> shgSum;
				pixels[yi + 1] = (gSum * mulSum) >> shgSum;
				pixels[yi + 2] = (bSum * mulSum) >> shgSum;

				rSum -= rOutSum;
				gSum -= gOutSum;
				bSum -= bOutSum;

				rOutSum -= stackIn.r;
				gOutSum -= stackIn.g;
				bOutSum -= stackIn.b;

				p = (yw + ((p = x + radius + 1) < (width - 1) ? p : (width - 1))) << 2;

				rInSum += (stackIn.r = pixels[p]);
				gInSum += (stackIn.g = pixels[p + 1]);
				bInSum += (stackIn.b = pixels[p + 2]);

				rSum += rInSum;
				gSum += gInSum;
				bSum += bInSum;

				stackIn = stackIn.next;

				rOutSum += (pr = stackOut.r);
				gOutSum += (pg = stackOut.g);
				bOutSum += (pb = stackOut.b);

				rInSum -= pr;
				gInSum -= pg;
				bInSum -= pb;

				stackOut = stackOut.next;

				yi += 4;
			}
			yw += width;
		}

		for (x = 0; x < width; x++) {
			gInSum = bInSum = rInSum = gSum = bSum = rSum = 0;

			yi = x << 2;
			rOutSum = radiusPlus1 * (pr = pixels[yi]);
			gOutSum = radiusPlus1 * (pg = pixels[yi + 1]);
			bOutSum = radiusPlus1 * (pb = pixels[yi + 2]);

			rSum += sumFactor * pr;
			gSum += sumFactor * pg;
			bSum += sumFactor * pb;

			stack = stackStart;

			for (i = 0; i < radiusPlus1; i++) {
				stack.r = pr;
				stack.g = pg;
				stack.b = pb;
				stack = stack.next;
			}

			yp = width;

			for (i = 1; i < radiusPlus1; i++) {
				yi = (yp + x) << 2;

				rSum += (stack.r = (pr = pixels[yi])) * (rbs = radiusPlus1 - i);
				gSum += (stack.g = (pg = pixels[yi + 1])) * rbs;
				bSum += (stack.b = (pb = pixels[yi + 2])) * rbs;

				rInSum += pr;
				gInSum += pg;
				bInSum += pb;

				stack = stack.next;

				if (i < (height - 1)) {
					yp += width;
				}
			}

			yi = x;
			stackIn = stackStart;
			stackOut = stackEnd;
			for (y = 0; y < height; y++) {
				p = yi << 2;
				pixels[p] = (rSum * mulSum) >> shgSum;
				pixels[p + 1] = (gSum * mulSum) >> shgSum;
				pixels[p + 2] = (bSum * mulSum) >> shgSum;

				rSum -= rOutSum;
				gSum -= gOutSum;
				bSum -= bOutSum;

				rOutSum -= stackIn.r;
				gOutSum -= stackIn.g;
				bOutSum -= stackIn.b;

				p = (x + (((p = y + radiusPlus1) < (height - 1) ? p : (height - 1)) * width)) << 2;

				rSum += (rInSum += (stackIn.r = pixels[p]));
				gSum += (gInSum += (stackIn.g = pixels[p + 1]));
				bSum += (bInSum += (stackIn.b = pixels[p + 2]));

				stackIn = stackIn.next;

				rOutSum += (pr = stackOut.r);
				gOutSum += (pg = stackOut.g);
				bOutSum += (pb = stackOut.b);

				rInSum -= pr;
				gInSum -= pg;
				bInSum -= pb;

				stackOut = stackOut.next;

				yi += width;
			}
		}

		context.putImageData(imageData, 0, 0);

	};

	/**
	 * To represent a single droplet
	 */
	function Drop(x, y, r) {
		this.x = x;
		this.y = y;
		this.r = r;
		this.terminate = false;

		this.draw = function(context, reflection) {
			context.save();
			context.beginPath();
			context.arc(this.x * context.canvas.width, this.y * context.canvas.height, this.r, 0, Math.PI * 2, true);
			context.closePath();
			context.clip();

			if (reflection) {
				reflection(this);
			}

			context.restore();
		};

		this.clear = function(context, force, width, height) {
			var dx = this.x * width - this.r;
			var dy = this.y * height - this.r;
			context.clearRect(dx - 1, dy - 2, 2 * this.r + 2, 2 * this.r + 2);
			if (force) {
				this.terminate = true;
				return true;
			}
			if ((dy > height) || (dx > width) || (dx < 0)) {
				// over edge so stop this drop
				return true;
			}
			return false;
		};

		this.animate = function(gravity, trail) {
			if (this.terminate) {
				return false;
			}
			var stopped = gravity(this);
			if (!stopped && trail) {
				trail(this);
			}
			return !stopped || this.terminate;
		};
	}

}

RainyDay.prototype.dummy = function() {};