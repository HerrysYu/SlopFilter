// Damped-spring physics for the UI.
// Springs are described the way Apple describes them: `response` (seconds,
// roughly how long the move takes) and `damping` (1 = no overshoot).
// They always continue from their current value and velocity, so any
// animation can be retargeted mid-flight without a jump.
const SlopSpring = (() => {
  'use strict';

  const TAU = Math.PI * 2;
  const STEP = 1 / 240;

  class Spring {
    constructor(value = 0, { response = 0.45, damping = 0.9, precision = 0.01 } = {}) {
      this.value = value;
      this.target = value;
      this.velocity = 0;
      this.precision = precision;
      this.configure({ response, damping });
    }

    configure({ response = this.response, damping = this.damping } = {}) {
      this.response = response;
      this.damping = damping;
      const omega = TAU / response;
      this.stiffness = omega * omega; // unit mass
      this.friction = 2 * damping * omega;
      return this;
    }

    to(target, params) {
      if (params) this.configure(params);
      this.target = target;
      return this;
    }

    snap(value = this.target) {
      this.value = this.target = value;
      this.velocity = 0;
      return this;
    }

    get resting() {
      return this.value === this.target && this.velocity === 0;
    }

    // Advances the simulation; returns true while still moving.
    step(dt) {
      if (this.resting) return false;
      // Semi-implicit Euler in small fixed sub-steps: stable for any frame rate.
      for (let left = Math.min(dt, 0.064); left > 1e-9; left -= STEP) {
        const h = Math.min(STEP, left);
        const accel = -this.stiffness * (this.value - this.target) - this.friction * this.velocity;
        this.velocity += accel * h;
        this.value += this.velocity * h;
      }
      if (Math.abs(this.value - this.target) < this.precision && Math.abs(this.velocity) < this.precision * 10) {
        this.snap();
        return false;
      }
      return true;
    }
  }

  // A requestAnimationFrame loop that sleeps while nothing moves.
  function loop(tick) {
    let raf = 0;
    let last = 0;
    const frame = (now) => {
      const dt = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      if (tick(dt)) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = 0;
        last = 0;
      }
    };
    return {
      kick() {
        if (!raf) raf = requestAnimationFrame(frame);
      },
    };
  }

  // CSS `linear()` easing sampled from a spring, for small fire-and-forget
  // transitions (segmented thumb, switch knob, rolling digits).
  function easing({ response = 0.4, damping = 1 } = {}) {
    const s = new Spring(0, { response, damping, precision: 0.0005 }).to(1);
    const points = ['0'];
    let t = 0;
    while (s.step(1 / 60) && t < 2) {
      t += 1 / 60;
      points.push(s.value.toFixed(4));
    }
    t += 1 / 60;
    points.push('1');
    return { easing: `linear(${points.join(', ')})`, duration: Math.round(t * 1000) };
  }

  return { Spring, loop, easing };
})();
