// Timer countdown + breathe state machine. We drive the REAL startTimer/stopTimer
// and the REAL breathe functions, using fake timers where helpful so we assert
// formatting + state transitions deterministically rather than on the wall clock.
import { test, expect } from '@playwright/test';
import { boot } from './helper.js';

test.beforeEach(async ({ page }) => {
  await boot(page);
});

test('startTimer renders the initial m:ss immediately, zero-padded', async ({ page }) => {
  const text = await page.evaluate(() => {
    startTimer(5);
    const t = document.getElementById('timer-display').textContent;
    stopTimer(); // clean up the interval
    return t;
  });
  expect(text).toBe('5:00');
});

test('startTimer opens the timer modal and stopTimer closes it', async ({ page }) => {
  const open = await page.evaluate(() => {
    startTimer(1);
    return document.getElementById('timer-modal').classList.contains('active');
  });
  expect(open).toBe(true);
  const closed = await page.evaluate(() => {
    stopTimer();
    return document.getElementById('timer-modal').classList.contains('active');
  });
  expect(closed).toBe(false);
});

test('the countdown decrements and zero-pads seconds over real ticks', async ({ page }) => {
  // Use fake timers so we can advance 1s ticks without waiting wall-clock.
  const frames = await page.evaluate(async () => {
    const seen = [];
    // Monkeypatch setInterval to capture the tick fn and step it manually.
    const realSI = window.setInterval;
    let captured = null;
    window.setInterval = (fn) => { captured = fn; return 999; };
    startTimer(1); // 60s; tick() runs once synchronously => "1:00"
    seen.push(document.getElementById('timer-display').textContent);
    // Manually fire the captured tick a few times.
    for (let i = 0; i < 3; i++) { captured(); seen.push(document.getElementById('timer-display').textContent); }
    window.setInterval = realSI;
    stopTimer();
    return seen;
  });
  // initial render 1:00, then 0:59, 0:58, 0:57 — proving decrement + zero-pad.
  expect(frames).toEqual(['1:00', '0:59', '0:58', '0:57']);
});

test('countdown reaching zero shows "0:00" + "All done" (zero-minute edge case)', async ({ page }) => {
  // NOTE on real-code behaviour: startTimer runs tick() synchronously BEFORE
  // assigning timerInterval = setInterval(...). So for startTimer(0), the very
  // first tick() hits the `secs <= 0` branch and calls clearInterval(timerInterval)
  // while timerInterval is still null — i.e. it clears nothing meaningful, and a
  // 1-second interval is then still installed afterward (it just no-ops the
  // display since secs has gone negative). This is a benign quirk, documented in
  // TESTING-PLAN.md. We assert the user-visible end state and clean up the stray
  // interval ourselves via stopTimer().
  const out = await page.evaluate(async () => {
    startTimer(0);
    const display = document.getElementById('timer-display').textContent;
    const sub = document.getElementById('timer-sub').textContent;
    stopTimer(); // clears the interval startTimer installed after the first tick
    return { display, sub };
  });
  expect(out.display).toBe('0:00');
  expect(out.sub).toBe('All done');
});

test('starting a new timer clears any prior interval (no leak)', async ({ page }) => {
  const clearedFirst = await page.evaluate(() => {
    const realCI = window.clearInterval;
    const cleared = new Set();
    window.clearInterval = (id) => { cleared.add(id); return realCI(id); };
    startTimer(5); // installs interval #1
    startTimer(3); // startTimer's `if (timerInterval) clearInterval(...)` must fire
    const res = cleared.size > 0;
    window.clearInterval = realCI;
    stopTimer();
    return res;
  });
  expect(clearedFirst).toBe(true);
});

test('playChime does not throw (Web Audio may be unavailable headless)', async ({ page }) => {
  const threw = await page.evaluate(() => {
    try { playChime(); return false; } catch { return true; }
  });
  expect(threw).toBe(false);
});

// ── Breathe state machine ──────────────────────────────────────────────

test('breathe phase data is the documented 4-4-4-4 box pattern', async ({ page }) => {
  const out = await page.evaluate(() => ({
    phases: BREATHE_PHASES,
    durations: BREATHE_DURATIONS,
  }));
  expect(out.phases).toEqual(['Inhale', 'Hold', 'Exhale', 'Hold']);
  expect(out.durations).toEqual([4, 4, 4, 4]);
});

test('toggleBreathe starts then stops, flipping the toggle label and running flag', async ({ page }) => {
  await page.evaluate(() => navTo('breathe', true));
  const started = await page.evaluate(() => {
    // Neutralise the interval so it doesn't tick during assertion.
    const realSI = window.setInterval;
    window.setInterval = () => 0;
    toggleBreathe();
    window.setInterval = realSI;
    return {
      running: breatheRunning,
      label: document.getElementById('breathe-toggle').textContent,
      instruction: document.getElementById('breathe-instruction').textContent,
    };
  });
  expect(started.running).toBe(true);
  expect(started.label).toBe('Pause');
  // first phase is Inhale
  expect(started.instruction).toBe('Inhale');

  const stopped = await page.evaluate(() => {
    toggleBreathe(); // now running => stop
    return {
      running: breatheRunning,
      label: document.getElementById('breathe-toggle').textContent,
      instruction: document.getElementById('breathe-instruction').textContent,
    };
  });
  expect(stopped.running).toBe(false);
  expect(stopped.label).toBe('Start');
  expect(stopped.instruction).toBe('Tap to begin');
});

test('breathe phase advances Inhale -> Hold -> Exhale via the captured interval tick', async ({ page }) => {
  await page.evaluate(() => navTo('breathe', true));
  const phases = await page.evaluate(() => {
    const seen = [];
    let captured = null;
    const realSI = window.setInterval;
    const realCI = window.clearInterval;
    window.setInterval = (fn) => { captured = fn; return 1; };
    window.clearInterval = () => {};
    startBreathe(); // phase 0 = Inhale
    seen.push(document.getElementById('breathe-instruction').textContent);
    // Each phase counts down `duration` (4) ticks before advancing.
    const step = (n) => { for (let i = 0; i < n; i++) captured(); };
    step(4); seen.push(document.getElementById('breathe-instruction').textContent); // -> Hold
    step(4); seen.push(document.getElementById('breathe-instruction').textContent); // -> Exhale
    window.setInterval = realSI;
    window.clearInterval = realCI;
    stopBreathe();
    return seen;
  });
  expect(phases).toEqual(['Inhale', 'Hold', 'Exhale']);
});
