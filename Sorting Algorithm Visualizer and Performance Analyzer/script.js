/* ═══════════════════════════════════════════════════════════════
   Sorting Algorithm Visualizer — Main Script
   Pure ES6 · async/await animations · No dependencies
   ═══════════════════════════════════════════════════════════════ */

// ── DOM References ──
const DOM = {
  barsContainer:    document.getElementById('bars-container'),
  algorithmSelect:  document.getElementById('algorithm-select'),
  customArrayInput: document.getElementById('custom-array-input'),
  btnUseArray:      document.getElementById('btn-use-array'),
  speedSlider:      document.getElementById('speed-slider'),
  speedValue:       document.getElementById('speed-value'),
  btnGenerate:      document.getElementById('btn-generate'),
  btnStart:         document.getElementById('btn-start'),
  btnPause:         document.getElementById('btn-pause'),
  btnStep:          document.getElementById('btn-step'),
  btnReset:         document.getElementById('btn-reset'),
  soundToggle:      document.getElementById('sound-toggle'),
  soundIcon:        document.getElementById('sound-icon'),
  infoAlgoName:     document.getElementById('info-algo-name'),
  infoTimeComp:     document.getElementById('info-time-complexity'),
  infoCompCount:    document.getElementById('info-comp-count'),
  infoSwapCount:    document.getElementById('info-swap-count'),
  infoExecStatus:   document.getElementById('info-exec-status'),
};

// ── Algorithm metadata ──
const ALGO_META = {
  bubble:    { name: 'Bubble Sort',    complexity: 'O(n²)'      },
  selection: { name: 'Selection Sort', complexity: 'O(n²)'      },
  insertion: { name: 'Insertion Sort', complexity: 'O(n²)'      },
  merge:     { name: 'Merge Sort',     complexity: 'O(n log n)' },
  quick:     { name: 'Quick Sort',     complexity: 'O(n log n)' },
  heap:      { name: 'Heap Sort',      complexity: 'O(n log n)' },
};

// ── Application state ──
const state = {
  array: [],              // Current array of numbers
  sorting: false,         // Is a sort currently running?
  paused: false,          // Is sorting paused?
  stopped: false,         // Has the user requested a stop (reset)?
  advanceOneStep: false,  // When paused, advance exactly one step on next sleep()
  comparisons: 0,
  swaps: 0,
  soundEnabled: false,
  audioCtx: null,         // Lazily created AudioContext
};

// ═════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═════════════════════════════════════════════════════════

/** Return the current delay (ms) based on speed slider.
 *  Speed 1 → 2000ms (very slow), Speed 100 → 1ms (instant).
 *  Uses exponential curve for a wide, clearly perceptible range. */
function getDelay() {
  const speed = parseInt(DOM.speedSlider.value, 10);
  // speed=1 → 2000ms, speed=100 → 1ms  (base = 2000 * 0.927^speed)
  return Math.max(1, Math.round(2000 * Math.pow(0.927, speed)));
}

/** Async sleep that respects pause, step, and stop states. */
async function sleep(ms) {
  if (state.stopped) throw new Error('STOP');

  // While paused: poll every 50ms, but if advanceOneStep is set,
  // let exactly one step through then immediately re-pause.
  while (state.paused) {
    if (state.advanceOneStep) {
      state.advanceOneStep = false;
      return; // allow one step, then the next sleep() will re-pause
    }
    await new Promise(r => setTimeout(r, 50));
    if (state.stopped) throw new Error('STOP');
  }

  return new Promise(r => setTimeout(r, ms));
}

/** Play a short tone whose frequency is proportional to the bar value. */
function playTone(value, maxVal) {
  if (!state.soundEnabled) return;
  try {
    if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = state.audioCtx;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    // Map value to frequency 200–1200 Hz
    const freq = 200 + (value / maxVal) * 1000;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.08);
  } catch (_) { /* silently ignore audio errors */ }
}

// ═════════════════════════════════════════════════════════
// RENDERING
// ═════════════════════════════════════════════════════════

/** Create all bars from the current state.array.
 *  Each bar contains a label showing its numeric value. */
function renderBars() {
  const container = DOM.barsContainer;
  container.innerHTML = '';
  const maxVal = Math.max(...state.array);
  state.array.forEach(val => {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = `${(val / maxVal) * 100}%`;
    // Label showing the value — hidden when bars are too narrow
    const label = document.createElement('span');
    label.className = 'bar-label';
    label.textContent = val;
    bar.appendChild(label);
    container.appendChild(bar);
  });
}

/** Get all bar DOM elements. */
function getBars() {
  return DOM.barsContainer.querySelectorAll('.bar');
}

/** Update a bar's height, label, and optionally its class. */
function updateBar(index, value, className) {
  const bars = getBars();
  const maxVal = Math.max(...state.array);
  if (bars[index]) {
    bars[index].style.height = `${(value / maxVal) * 100}%`;
    if (className !== undefined) bars[index].className = `bar ${className}`;
    // Update the numeric label
    const label = bars[index].querySelector('.bar-label');
    if (label) label.textContent = value;
  }
}

/** Set class on specific bar indices, clearing others. */
function highlightBars(indices, className) {
  const bars = getBars();
  bars.forEach((b, i) => {
    if (!b.classList.contains('sorted')) {
      b.className = indices.includes(i) ? `bar ${className}` : 'bar';
    }
  });
}

/** Mark bar as sorted. */
function markSorted(index) {
  const bars = getBars();
  if (bars[index]) bars[index].className = 'bar sorted';
}

/** Clear all highlights (except sorted). */
function clearHighlights() {
  getBars().forEach(b => { if (!b.classList.contains('sorted')) b.className = 'bar'; });
}

// ═════════════════════════════════════════════════════════
// INFO PANEL UPDATES
// ═════════════════════════════════════════════════════════

function setStatus(text, dotClass) {
  DOM.infoExecStatus.innerHTML = `<span class="status-dot ${dotClass}"></span> ${text}`;
}

function updateStats() {
  DOM.infoCompCount.textContent = state.comparisons.toLocaleString();
  DOM.infoSwapCount.textContent = state.swaps.toLocaleString();
}

function resetStats() {
  state.comparisons = 0;
  state.swaps = 0;
  updateStats();
}

// ═════════════════════════════════════════════════════════
// ARRAY GENERATION
// ═════════════════════════════════════════════════════════

function generateArray() {
  // Default to 20 random bars when no custom array is entered
  const size = 20;
  state.array = Array.from({ length: size }, () => Math.floor(Math.random() * 95) + 5);
  renderBars();
  resetStats();
  setStatus('Idle', 'idle');
}

/** Parse user-entered comma-separated array and visualize it. */
function useCustomArray() {
  const raw = DOM.customArrayInput.value.trim();
  if (!raw) {
    // Flash the input as an error hint
    DOM.customArrayInput.classList.add('input-error');
    setTimeout(() => DOM.customArrayInput.classList.remove('input-error'), 400);
    return;
  }

  // Parse: accept commas, spaces, or both as delimiters
  const nums = raw
    .split(/[\s,]+/)
    .map(s => Number(s))
    .filter(n => !isNaN(n) && n > 0);

  if (nums.length < 2) {
    // Not enough valid numbers
    DOM.customArrayInput.classList.add('input-error');
    setTimeout(() => DOM.customArrayInput.classList.remove('input-error'), 400);
    return;
  }

  state.array = nums;
  renderBars();
  resetStats();
  setStatus('Idle', 'idle');
}

// ═════════════════════════════════════════════════════════
// SORTING ALGORITHMS
// ═════════════════════════════════════════════════════════

/**
 * Each algorithm is an async generator-style function that:
 *   1. Reads / mutates `state.array`
 *   2. Calls `await sleep(getDelay())` between visual steps
 *   3. Updates bar colours via highlightBars / updateBar
 *   4. Increments state.comparisons / state.swaps
 * If `state.stopped` becomes true, sleep() will throw and the sort
 * is aborted cleanly in the caller's try/catch.
 */

// ── Bubble Sort ──
async function bubbleSort() {
  const arr = state.array;
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      highlightBars([j, j + 1], 'comparing');
      state.comparisons++;
      updateStats();
      playTone(arr[j], Math.max(...arr));
      await sleep(getDelay());

      if (arr[j] > arr[j + 1]) {
        // Swap
        highlightBars([j, j + 1], 'swapping');
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        updateBar(j, arr[j]);
        updateBar(j + 1, arr[j + 1]);
        state.swaps++;
        updateStats();
        await sleep(getDelay());
      }
      clearHighlights();
    }
    markSorted(n - i - 1);
  }
  markSorted(0);
}

// ── Selection Sort ──
async function selectionSort() {
  const arr = state.array;
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    let minIdx = i;
    highlightBars([i], 'comparing');
    for (let j = i + 1; j < n; j++) {
      highlightBars([minIdx, j], 'comparing');
      state.comparisons++;
      updateStats();
      playTone(arr[j], Math.max(...arr));
      await sleep(getDelay());

      if (arr[j] < arr[minIdx]) {
        minIdx = j;
      }
    }
    if (minIdx !== i) {
      highlightBars([i, minIdx], 'swapping');
      [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
      updateBar(i, arr[i]);
      updateBar(minIdx, arr[minIdx]);
      state.swaps++;
      updateStats();
      await sleep(getDelay());
    }
    markSorted(i);
    clearHighlights();
  }
  markSorted(n - 1);
}

// ── Insertion Sort ──
async function insertionSort() {
  const arr = state.array;
  const n = arr.length;
  markSorted(0);
  for (let i = 1; i < n; i++) {
    const key = arr[i];
    let j = i - 1;
    highlightBars([i], 'comparing');
    await sleep(getDelay());

    while (j >= 0 && arr[j] > key) {
      state.comparisons++;
      highlightBars([j, j + 1], 'swapping');
      arr[j + 1] = arr[j];
      updateBar(j + 1, arr[j + 1]);
      state.swaps++;
      updateStats();
      playTone(arr[j], Math.max(...arr));
      await sleep(getDelay());
      j--;
    }
    if (j >= 0) { state.comparisons++; updateStats(); }
    arr[j + 1] = key;
    updateBar(j + 1, arr[j + 1]);
    // Mark all up to i as sorted
    for (let k = 0; k <= i; k++) markSorted(k);
    clearHighlights();
  }
}

// ── Merge Sort ──
async function mergeSort() {
  await mergeSortHelper(0, state.array.length - 1);
  // Mark all sorted
  for (let i = 0; i < state.array.length; i++) markSorted(i);
}

async function mergeSortHelper(left, right) {
  if (left >= right) return;
  const mid = Math.floor((left + right) / 2);
  await mergeSortHelper(left, mid);
  await mergeSortHelper(mid + 1, right);
  await merge(left, mid, right);
}

async function merge(left, mid, right) {
  const arr = state.array;
  const leftArr  = arr.slice(left, mid + 1);
  const rightArr = arr.slice(mid + 1, right + 1);
  let i = 0, j = 0, k = left;

  while (i < leftArr.length && j < rightArr.length) {
    highlightBars([k], 'comparing');
    state.comparisons++;
    updateStats();
    playTone(arr[k] || 0, Math.max(...arr));
    await sleep(getDelay());

    if (leftArr[i] <= rightArr[j]) {
      arr[k] = leftArr[i++];
    } else {
      arr[k] = rightArr[j++];
      state.swaps++;
    }
    updateBar(k, arr[k], 'swapping');
    updateStats();
    await sleep(getDelay());
    // clear this bar back
    const bars = getBars();
    if (bars[k]) bars[k].className = 'bar';
    k++;
  }
  while (i < leftArr.length) {
    arr[k] = leftArr[i++];
    updateBar(k, arr[k], 'swapping');
    await sleep(getDelay());
    const bars = getBars();
    if (bars[k]) bars[k].className = 'bar';
    k++;
  }
  while (j < rightArr.length) {
    arr[k] = rightArr[j++];
    updateBar(k, arr[k], 'swapping');
    await sleep(getDelay());
    const bars = getBars();
    if (bars[k]) bars[k].className = 'bar';
    k++;
  }
}

// ── Quick Sort ──
async function quickSort() {
  await quickSortHelper(0, state.array.length - 1);
  for (let i = 0; i < state.array.length; i++) markSorted(i);
}

async function quickSortHelper(low, high) {
  if (low >= high) {
    if (low === high) markSorted(low);
    return;
  }
  const pivotIdx = await partition(low, high);
  markSorted(pivotIdx);
  await quickSortHelper(low, pivotIdx - 1);
  await quickSortHelper(pivotIdx + 1, high);
}

async function partition(low, high) {
  const arr = state.array;
  const pivot = arr[high];
  // Highlight pivot
  const bars = getBars();
  if (bars[high]) bars[high].className = 'bar pivot';
  let i = low - 1;

  for (let j = low; j < high; j++) {
    highlightBars([j], 'comparing');
    // Keep pivot highlighted
    if (bars[high]) bars[high].className = 'bar pivot';
    state.comparisons++;
    updateStats();
    playTone(arr[j], Math.max(...arr));
    await sleep(getDelay());

    if (arr[j] < pivot) {
      i++;
      if (i !== j) {
        highlightBars([i, j], 'swapping');
        if (bars[high]) bars[high].className = 'bar pivot';
        [arr[i], arr[j]] = [arr[j], arr[i]];
        updateBar(i, arr[i]);
        updateBar(j, arr[j]);
        state.swaps++;
        updateStats();
        await sleep(getDelay());
      }
    }
    clearHighlights();
    if (bars[high]) bars[high].className = 'bar pivot';
  }

  // Place pivot
  i++;
  if (i !== high) {
    highlightBars([i, high], 'swapping');
    [arr[i], arr[high]] = [arr[high], arr[i]];
    updateBar(i, arr[i]);
    updateBar(high, arr[high]);
    state.swaps++;
    updateStats();
    await sleep(getDelay());
  }
  clearHighlights();
  return i;
}

// ── Heap Sort ──
async function heapSort() {
  const arr = state.array;
  const n = arr.length;

  // Build max heap
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    await heapify(n, i);
  }

  // Extract elements from heap
  for (let i = n - 1; i > 0; i--) {
    highlightBars([0, i], 'swapping');
    [arr[0], arr[i]] = [arr[i], arr[0]];
    updateBar(0, arr[0]);
    updateBar(i, arr[i]);
    state.swaps++;
    updateStats();
    await sleep(getDelay());
    markSorted(i);
    await heapify(i, 0);
  }
  markSorted(0);
}

async function heapify(n, i) {
  const arr = state.array;
  let largest = i;
  const left  = 2 * i + 1;
  const right = 2 * i + 2;

  if (left < n) {
    highlightBars([largest, left], 'comparing');
    state.comparisons++;
    updateStats();
    playTone(arr[left], Math.max(...arr));
    await sleep(getDelay());
    if (arr[left] > arr[largest]) largest = left;
  }
  if (right < n) {
    highlightBars([largest, right], 'comparing');
    state.comparisons++;
    updateStats();
    playTone(arr[right], Math.max(...arr));
    await sleep(getDelay());
    if (arr[right] > arr[largest]) largest = right;
  }
  if (largest !== i) {
    highlightBars([i, largest], 'swapping');
    [arr[i], arr[largest]] = [arr[largest], arr[i]];
    updateBar(i, arr[i]);
    updateBar(largest, arr[largest]);
    state.swaps++;
    updateStats();
    await sleep(getDelay());
    clearHighlights();
    await heapify(n, largest);
  }
  clearHighlights();
}

// ═════════════════════════════════════════════════════════
// SORT DISPATCHER
// ═════════════════════════════════════════════════════════

const SORT_FN = {
  bubble:    bubbleSort,
  selection: selectionSort,
  insertion: insertionSort,
  merge:     mergeSort,
  quick:     quickSort,
  heap:      heapSort,
};

// ═════════════════════════════════════════════════════════
// CONTROL LOGIC
// ═════════════════════════════════════════════════════════

/** Lock / unlock controls based on sorting state. */
function setControlsLocked(locked) {
  DOM.algorithmSelect.disabled  = locked;
  DOM.customArrayInput.disabled = locked;
  DOM.btnUseArray.disabled      = locked;
  DOM.btnGenerate.disabled      = locked;
  DOM.btnStart.disabled         = locked;
  // Step (Next) is only useful when paused — managed by togglePause
  DOM.btnStep.disabled          = true;
  DOM.btnPause.disabled         = !locked;
}

/** Start sorting with the selected algorithm. */
async function startSort() {
  const algoKey = DOM.algorithmSelect.value;
  if (!algoKey) {
    // Flash the select briefly to alert user
    DOM.algorithmSelect.style.borderColor = 'var(--danger)';
    DOM.algorithmSelect.style.boxShadow = '0 0 0 3px rgba(248,113,113,.35)';
    setTimeout(() => {
      DOM.algorithmSelect.style.borderColor = '';
      DOM.algorithmSelect.style.boxShadow = '';
    }, 800);
    return;
  }

  const meta = ALGO_META[algoKey];
  DOM.infoAlgoName.textContent = meta.name;
  DOM.infoTimeComp.textContent = meta.complexity;
  resetStats();

  state.sorting = true;
  state.paused  = false;
  state.stopped = false;
  setControlsLocked(true);
  setStatus('Running', 'running');

  try {
    await SORT_FN[algoKey]();
    // Completed successfully
    setStatus('Completed ✓', 'completed');
    // Quick celebration sweep
    await celebrationSweep();
  } catch (e) {
    if (e.message === 'STOP') {
      setStatus('Stopped', 'idle');
    } else {
      console.error(e);
      setStatus('Error', 'idle');
    }
  } finally {
    state.sorting   = false;
    state.paused    = false;
    state.stepMode  = false;
    setControlsLocked(false);
  }
}

/** Celebration sweep: re-color bars from left to right with a small delay. */
async function celebrationSweep() {
  const bars = getBars();
  for (let i = 0; i < bars.length; i++) {
    bars[i].className = 'bar sorted';
    playTone(state.array[i], Math.max(...state.array));
    await new Promise(r => setTimeout(r, 8));
  }
}

/** Pause / Resume toggle. */
function togglePause() {
  if (!state.sorting) return;
  state.paused = !state.paused;
  const label = document.getElementById('pause-label');
  if (state.paused) {
    if (label) label.textContent = 'Resume';
    DOM.btnStep.disabled = false;
    setStatus('Paused', 'paused');
  } else {
    if (label) label.textContent = 'Pause';
    DOM.btnStep.disabled = true;
    setStatus('Running', 'running');
  }
}

/** Reset everything. */
function resetAll() {
  state.stopped = true;
  state.paused  = false;
  state.advanceOneStep = false;

  setTimeout(() => {
    state.sorting = false;
    setControlsLocked(false);
    DOM.btnStep.disabled = true;
    const label = document.getElementById('pause-label');
    if (label) label.textContent = 'Pause';
    DOM.algorithmSelect.value = '';
    DOM.infoAlgoName.textContent = '—';
    DOM.infoTimeComp.textContent = '—';
    generateArray();
  }, 100);
}

/** Next Step: only works when sorting is paused. Advances one step. */
function stepNext() {
  if (state.sorting && state.paused) {
    state.advanceOneStep = true;
  }
}

// ═════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═════════════════════════════════════════════════════════

DOM.btnGenerate.addEventListener('click', generateArray);
DOM.btnUseArray.addEventListener('click', useCustomArray);

// Also allow pressing Enter inside the custom array input to apply it
DOM.customArrayInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); useCustomArray(); }
});
DOM.btnStart.addEventListener('click', startSort);
DOM.btnPause.addEventListener('click', togglePause);
DOM.btnStep.addEventListener('click', stepNext);
DOM.btnReset.addEventListener('click', resetAll);

DOM.speedSlider.addEventListener('input', () => {
  DOM.speedValue.textContent = DOM.speedSlider.value;
});

DOM.soundToggle.addEventListener('change', () => {
  state.soundEnabled = DOM.soundToggle.checked;
  DOM.soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && state.sorting) {
    e.preventDefault();
    togglePause();
  }
  if (e.key === 'Enter' && !state.sorting) {
    startSort();
  }
  // Right arrow or N key advances one step when paused
  if ((e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') && state.sorting && state.paused) {
    state.advanceOneStep = true;
  }
});

// Update info panel when algorithm is changed
DOM.algorithmSelect.addEventListener('change', () => {
  const key = DOM.algorithmSelect.value;
  if (key && ALGO_META[key]) {
    DOM.infoAlgoName.textContent = ALGO_META[key].name;
    DOM.infoTimeComp.textContent = ALGO_META[key].complexity;
  }
});

// ═════════════════════════════════════════════════════════
// INITIALISATION
// ═════════════════════════════════════════════════════════

generateArray();
