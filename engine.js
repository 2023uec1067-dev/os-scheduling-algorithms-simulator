/* ============================================================
   OS SCHEDULER ENGINE
   Tick-based (1 time-unit) discrete simulation supporting:
   FCFS, RR, SPN, SRT, HRRN, FB (multilevel feedback), Aging
   Each algorithm returns:
     { gantt: [{pid, start, end}], stats: [{id, arrival, burst,
       completion, turnaround, waiting, responseTime}], avg: {...} }
   ============================================================ */

function cloneProcesses(list) {
  return list.map(p => ({
    id: p.id,
    arrival: p.arrival,
    burst: p.burst,
    priority: p.priority === undefined ? 0 : p.priority,
    remaining: p.burst,
    completion: null,
    firstStart: null,
  }));
}

function buildGanttFromTicks(ticks) {
  // ticks: array of pid-or-null, one per time unit, index = start time of that unit
  const gantt = [];
  for (let t = 0; t < ticks.length; t++) {
    const pid = ticks[t];
    if (gantt.length && gantt[gantt.length - 1].pid === pid) {
      gantt[gantt.length - 1].end = t + 1;
    } else {
      gantt.push({ pid, start: t, end: t + 1 });
    }
  }
  return gantt;
}

function finalize(procs, ticks, extra) {
  const gantt = buildGanttFromTicks(ticks);
  const stats = procs.map(p => ({
    id: p.id,
    arrival: p.arrival,
    burst: p.burst,
    completion: p.completion,
    turnaround: p.completion - p.arrival,
    waiting: (p.completion - p.arrival) - p.burst,
    responseTime: (p.firstStart === null ? null : p.firstStart - p.arrival),
  }));
  const n = stats.length;
  const avg = {
    waiting: stats.reduce((s, x) => s + x.waiting, 0) / n,
    turnaround: stats.reduce((s, x) => s + x.turnaround, 0) / n,
    response: stats.reduce((s, x) => s + (x.responseTime || 0), 0) / n,
  };
  const totalTime = Math.max(...stats.map(s => s.completion));
  const idleTicks = ticks.filter(t => t === null).length;
  const cpuUtil = ((totalTime - idleTicks) / totalTime) * 100;
  return { gantt, stats, avg, cpuUtil, totalTime, extra: extra || null };
}

function allDone(procs) {
  return procs.every(p => p.remaining <= 0 && p.completion !== null);
}

/* ---------------- FCFS ---------------- */
function runFCFS(list) {
  const procs = cloneProcesses(list);
  const order = [...procs].sort((a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  const ticks = [];
  let time = 0;
  for (const p of order) {
    const start = Math.max(time, p.arrival);
    while (ticks.length < start) ticks.push(null);
    p.firstStart = start;
    for (let t = start; t < start + p.burst; t++) ticks.push(p.id);
    p.completion = start + p.burst;
    p.remaining = 0;
    time = p.completion;
  }
  return finalize(procs, ticks);
}

/* ---------------- Round Robin ---------------- */
function runRR(list, quantum) {
  const procs = cloneProcesses(list);
  const byArrival = [...procs].sort((a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  const arrivalPtr = { i: 0 };
  const queue = [];
  const ticks = [];
  let current = null;
  let quantumUsed = 0;
  let time = 0;
  const maxTicks = 100000;

  function enqueueArrivals(t) {
    while (arrivalPtr.i < byArrival.length && byArrival[arrivalPtr.i].arrival === t) {
      queue.push(byArrival[arrivalPtr.i]);
      arrivalPtr.i++;
    }
  }

  enqueueArrivals(0);
  while (!allDone(procs) && time < maxTicks) {
    if (!current) {
      if (queue.length === 0) { ticks.push(null); time++; enqueueArrivals(time); continue; }
      current = queue.shift();
      quantumUsed = 0;
      if (current.firstStart === null) current.firstStart = time;
    }
    ticks.push(current.id);
    current.remaining--;
    quantumUsed++;
    time++;
    enqueueArrivals(time); // arrivals at new time enqueue BEFORE preempted process
    if (current.remaining === 0) {
      current.completion = time;
      current = null;
    } else if (quantumUsed === quantum) {
      queue.push(current);
      current = null;
    }
  }
  return finalize(procs, ticks);
}

/* ---------------- SPN (Shortest Process Next, non-preemptive) ---------------- */
function runSPN(list) {
  const procs = cloneProcesses(list);
  const ticks = [];
  let time = 0;
  while (!allDone(procs)) {
    const ready = procs.filter(p => p.completion === null && p.arrival <= time);
    if (ready.length === 0) {
      const nextArrival = Math.min(...procs.filter(p => p.completion === null).map(p => p.arrival));
      while (time < nextArrival) { ticks.push(null); time++; }
      continue;
    }
    ready.sort((a, b) => a.burst - b.burst || a.arrival - b.arrival || a.id.localeCompare(b.id));
    const p = ready[0];
    p.firstStart = time;
    for (let t = time; t < time + p.burst; t++) ticks.push(p.id);
    time += p.burst;
    p.completion = time;
    p.remaining = 0;
  }
  return finalize(procs, ticks);
}

/* ---------------- SRT (Shortest Remaining Time, preemptive) ---------------- */
function runSRT(list) {
  const procs = cloneProcesses(list);
  const ticks = [];
  let time = 0;
  const maxTicks = 100000;
  while (!allDone(procs) && time < maxTicks) {
    const ready = procs.filter(p => p.completion === null && p.arrival <= time && p.remaining > 0);
    if (ready.length === 0) { ticks.push(null); time++; continue; }
    ready.sort((a, b) => a.remaining - b.remaining || a.arrival - b.arrival || a.id.localeCompare(b.id));
    const p = ready[0];
    if (p.firstStart === null) p.firstStart = time;
    ticks.push(p.id);
    p.remaining--;
    time++;
    if (p.remaining === 0) p.completion = time;
  }
  return finalize(procs, ticks);
}

/* ---------------- HRRN (Highest Response Ratio Next, non-preemptive) ---------------- */
function runHRRN(list) {
  const procs = cloneProcesses(list);
  const ticks = [];
  let time = 0;
  while (!allDone(procs)) {
    const ready = procs.filter(p => p.completion === null && p.arrival <= time);
    if (ready.length === 0) {
      const nextArrival = Math.min(...procs.filter(p => p.completion === null).map(p => p.arrival));
      while (time < nextArrival) { ticks.push(null); time++; }
      continue;
    }
    ready.forEach(p => { p._rr = ((time - p.arrival) + p.burst) / p.burst; });
    ready.sort((a, b) => b._rr - a._rr || a.arrival - b.arrival || a.id.localeCompare(b.id));
    const p = ready[0];
    p.firstStart = time;
    for (let t = time; t < time + p.burst; t++) ticks.push(p.id);
    time += p.burst;
    p.completion = time;
    p.remaining = 0;
  }
  return finalize(procs, ticks);
}

/* ---------------- FB (Multilevel Feedback Queue) ----------------
   Level L quantum = baseQuantum * 2^L. New arrivals enter level 0.
   Higher-priority (lower level) arrivals preempt a running lower-priority process.
   On preemption or quantum expiry, process is demoted (if quantum expired) and
   sent to the back of the appropriate level queue; quantum counter resets. */
function runFB(list, baseQuantum, maxLevels) {
  const procs = cloneProcesses(list);
  procs.forEach(p => { p.level = 0; p.quantumUsed = 0; });
  const byArrival = [...procs].sort((a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  const arrivalPtr = { i: 0 };
  const levels = Array.from({ length: maxLevels }, () => []);
  const ticks = [];
  let current = null;
  let time = 0;
  const maxTicks = 100000;

  function quantumFor(level) { return baseQuantum * Math.pow(2, level); }
  function enqueueArrivals(t) {
    while (arrivalPtr.i < byArrival.length && byArrival[arrivalPtr.i].arrival === t) {
      const p = byArrival[arrivalPtr.i];
      p.level = 0; p.quantumUsed = 0;
      levels[0].push(p);
      arrivalPtr.i++;
    }
  }
  function highestNonEmptyLevel() {
    for (let l = 0; l < levels.length; l++) if (levels[l].length) return l;
    return -1;
  }

  enqueueArrivals(0);
  while (!allDone(procs) && time < maxTicks) {
    // Preempt current if a strictly higher-priority (lower level) process is waiting
    if (current) {
      const hl = highestNonEmptyLevel();
      if (hl !== -1 && hl < current.level) {
        levels[current.level].push(current); // requeue at back of its own level, quantum resets
        current.quantumUsed = 0;
        current = null;
      }
    }
    if (!current) {
      const hl = highestNonEmptyLevel();
      if (hl === -1) { ticks.push(null); time++; enqueueArrivals(time); continue; }
      current = levels[hl].shift();
      current.quantumUsed = 0;
      if (current.firstStart === null) current.firstStart = time;
    }
    ticks.push(current.id);
    current.remaining--;
    current.quantumUsed++;
    time++;
    enqueueArrivals(time);
    if (current.remaining === 0) {
      current.completion = time;
      current = null;
    } else if (current.quantumUsed === quantumFor(current.level)) {
      current.level = Math.min(current.level + 1, levels.length - 1);
      current.quantumUsed = 0;
      levels[current.level].push(current);
      current = null;
    }
  }
  return finalize(procs, ticks);
}

/* ---------------- Aging (priority, non-preemptive, with starvation prevention) ----------------
   Lower priority number = more important. Effective priority improves
   (decreases) by 1 point for every `agingInterval` ticks a process has waited. */
function runAging(list, agingInterval) {
  const procs = cloneProcesses(list);
  const ticks = [];
  let time = 0;
  while (!allDone(procs)) {
    const ready = procs.filter(p => p.completion === null && p.arrival <= time);
    if (ready.length === 0) {
      const nextArrival = Math.min(...procs.filter(p => p.completion === null).map(p => p.arrival));
      while (time < nextArrival) { ticks.push(null); time++; }
      continue;
    }
    ready.forEach(p => {
      const waited = time - p.arrival;
      p._eff = p.priority - Math.floor(waited / agingInterval);
    });
    ready.sort((a, b) => a._eff - b._eff || a.arrival - b.arrival || a.id.localeCompare(b.id));
    const p = ready[0];
    p.firstStart = time;
    for (let t = time; t < time + p.burst; t++) ticks.push(p.id);
    time += p.burst;
    p.completion = time;
    p.remaining = 0;
  }
  return finalize(procs, ticks);
}

const ALGORITHMS = {
  FCFS: { name: 'First Come First Serve', run: (procs) => runFCFS(procs) },
  RR: { name: 'Round Robin', run: (procs, params) => runRR(procs, params.quantum || 2) },
  SPN: { name: 'Shortest Process Next', run: (procs) => runSPN(procs) },
  SRT: { name: 'Shortest Remaining Time', run: (procs) => runSRT(procs) },
  HRRN: { name: 'Highest Response Ratio Next', run: (procs) => runHRRN(procs) },
  FB: { name: 'Feedback (Multilevel)', run: (procs, params) => runFB(procs, params.baseQuantum || 1, params.maxLevels || 5) },
  AGING: { name: 'Aging', run: (procs, params) => runAging(procs, params.agingInterval || 5) },
};

if (typeof module !== 'undefined') {
  module.exports = { ALGORITHMS, runFCFS, runRR, runSPN, runSRT, runHRRN, runFB, runAging };
}
