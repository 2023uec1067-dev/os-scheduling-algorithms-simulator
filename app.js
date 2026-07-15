(function () {
  'use strict';

  const COLORS = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)', 'var(--p7)'];

  const ALGO_DESC = {
    FCFS: 'Processes run strictly in arrival order, each to completion. No preemption, no cleverness — simple and starvation-free, but slow jobs block everyone behind them.',
    RR: 'Every ready process gets a fixed time slice (quantum) in turn. Fair and responsive, but a lot of context switching if the quantum is too small.',
    SPN: 'Shortest Process Next: whenever the CPU frees up, the waiting process with the smallest total burst runs next, to completion. Optimal average waiting time — if you know burst times in advance.',
    SRT: 'Shortest Remaining Time: the preemptive version of SPN. A new arrival with a shorter remaining time bumps whatever is currently running.',
    HRRN: 'Highest Response Ratio Next: response ratio = (waiting time + burst) / burst. Long-waiting processes age into priority, so nothing starves the way it can under SPN.',
    FB: 'Multilevel Feedback Queue: new processes start in the top queue with a small quantum. Anyone who doesn\u2019t finish in time gets demoted to a lower-priority queue with a longer quantum — CPU-bound jobs sink, short jobs stay fast.',
    AGING: 'Priority scheduling where every tick spent waiting slowly improves a process\u2019s effective priority, guaranteeing even the lowest-priority process eventually runs.',
  };

  let processes = [];
  let idCounter = 0;
  let currentAlgo = 'FCFS';
  let lastResult = null;
  let playhead = 0;
  let playing = false;
  let playTimer = null;

  function defaultProcesses() {
    return [
      { id: 'A', arrival: 0, burst: 3, priority: 3 },
      { id: 'B', arrival: 2, burst: 6, priority: 5 },
      { id: 'C', arrival: 4, burst: 4, priority: 2 },
      { id: 'D', arrival: 6, burst: 5, priority: 1 },
      { id: 'E', arrival: 8, burst: 2, priority: 4 },
    ];
  }

  function nextAutoId() {
    // A, B, C ... Z, A2, B2 ...
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const round = Math.floor(idCounter / 26) + 1;
    const letter = letters[idCounter % 26];
    idCounter++;
    return round === 1 ? letter : letter + round;
  }

  function colorFor(pid) {
    const idx = processes.findIndex(p => p.id === pid);
    return COLORS[idx % COLORS.length];
  }

  /* ---------------- process table rendering ---------------- */
  function renderProcessTable() {
    const tbody = document.getElementById('processBody');
    tbody.innerHTML = '';
    processes.forEach((p, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="pid-chip"><span class="pid-dot" style="background:${COLORS[i % COLORS.length]}"></span>${p.id}</span></td>
        <td><input type="number" min="0" value="${p.arrival}" data-field="arrival" data-idx="${i}"></td>
        <td><input type="number" min="1" value="${p.burst}" data-field="burst" data-idx="${i}"></td>
        <td><input type="number" value="${p.priority}" data-field="priority" data-idx="${i}"></td>
        <td><button class="icon-btn" data-remove="${i}" title="remove">✕</button></td>
      `;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const idx = +e.target.dataset.idx;
        const field = e.target.dataset.field;
        let val = parseInt(e.target.value, 10);
        if (isNaN(val)) val = 0;
        if (field === 'burst' && val < 1) val = 1;
        if (field === 'arrival' && val < 0) val = 0;
        processes[idx][field] = val;
        e.target.value = val;
      });
    });
    tbody.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = +e.target.dataset.remove;
        if (processes.length <= 1) return;
        processes.splice(idx, 1);
        renderProcessTable();
      });
    });
  }

  document.getElementById('addRowBtn').addEventListener('click', () => {
    const lastArrival = processes.length ? processes[processes.length - 1].arrival : 0;
    processes.push({ id: nextAutoId(), arrival: lastArrival + 1, burst: 3, priority: 3 });
    renderProcessTable();
  });

  document.getElementById('resetProcsBtn').addEventListener('click', () => {
    processes = defaultProcesses();
    idCounter = processes.length;
    renderProcessTable();
  });

  /* ---------------- algorithm selection ---------------- */
  const paramBlocks = { RR: document.getElementById('paramsRR'), FB: document.getElementById('paramsFB'), AGING: document.getElementById('paramsAging') };

  function selectAlgo(algo) {
    currentAlgo = algo;
    document.querySelectorAll('.flag').forEach(b => b.classList.toggle('active', b.dataset.algo === algo));
    Object.entries(paramBlocks).forEach(([k, el]) => { el.style.display = (k === algo) ? 'flex' : 'none'; });
    document.getElementById('algoDesc').textContent = ALGO_DESC[algo];
  }

  document.getElementById('algoFlags').addEventListener('click', (e) => {
    const btn = e.target.closest('.flag');
    if (!btn) return;
    selectAlgo(btn.dataset.algo);
  });

  function currentParams() {
    return {
      quantum: parseInt(document.getElementById('quantumInput').value, 10) || 1,
      baseQuantum: parseInt(document.getElementById('baseQuantumInput').value, 10) || 1,
      maxLevels: parseInt(document.getElementById('maxLevelsInput').value, 10) || 5,
      agingInterval: parseInt(document.getElementById('agingIntervalInput').value, 10) || 5,
    };
  }

  function validProcesses() {
    if (processes.length === 0) { alert('Add at least one process.'); return null; }
    const ids = processes.map(p => p.id);
    if (new Set(ids).size !== ids.length) { alert('Process IDs must be unique.'); return null; }
    return processes;
  }

  /* ---------------- run ---------------- */
  document.getElementById('runBtn').addEventListener('click', () => {
    const procs = validProcesses();
    if (!procs) return;
    const params = currentParams();
    const result = window.ALGORITHMS[currentAlgo].run(procs, params);
    lastResult = result;
    document.getElementById('compareSection').style.display = 'none';
    renderGantt(result);
    renderMetrics(result);
    setPlayhead(result.totalTime); // reveal fully by default
  });

  /* ---------------- gantt rendering ---------------- */
  function renderGantt(result) {
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('ganttWrap').style.display = 'block';
    document.getElementById('ganttAlgoName').textContent = '/ ' + window.ALGORITHMS[currentAlgo].name.toLowerCase();

    const track = document.getElementById('ganttTrack');
    const ruler = document.getElementById('ruler');
    track.innerHTML = '';
    ruler.innerHTML = '';

    const total = result.totalTime;
    result.gantt.forEach(block => {
      const width = ((block.end - block.start) / total) * 100;
      const div = document.createElement('div');
      div.className = 'gantt-block' + (block.pid === null ? ' idle' : '');
      div.style.width = width + '%';
      if (block.pid !== null) div.style.background = colorFor(block.pid);
      div.textContent = block.pid === null ? '·' : block.pid;
      div.dataset.start = block.start;
      div.dataset.end = block.end;
      div.title = `${block.pid ?? 'idle'}  [${block.start} \u2192 ${block.end}]`;
      track.appendChild(div);
    });

    // ruler ticks — cap label count so it doesn't overcrowd on long runs
    const step = Math.max(1, Math.ceil(total / 24));
    for (let t = 0; t <= total; t += step) {
      const span = document.createElement('span');
      span.style.left = (t / total * 100) + '%';
      span.textContent = t;
      ruler.appendChild(span);
    }
    const lastSpan = document.createElement('span');
    lastSpan.style.left = '100%';
    lastSpan.textContent = total;
    ruler.appendChild(lastSpan);

    document.getElementById('scrubber').max = total;
    document.getElementById('scrubber').value = total;
  }

  function setPlayhead(t) {
    if (!lastResult) return;
    playhead = Math.max(0, Math.min(t, lastResult.totalTime));
    document.getElementById('scrubber').value = playhead;
    document.getElementById('tickLabel').textContent = 't = ' + playhead;

    document.querySelectorAll('.gantt-block').forEach(el => {
      const start = +el.dataset.start, end = +el.dataset.end;
      el.classList.toggle('future', start >= playhead);
      el.classList.toggle('playhead', playhead > start && playhead <= end && playhead < lastResult.totalTime);
    });

    renderReadyQueue(playhead);
  }

  function renderReadyQueue(t) {
    const wrap = document.getElementById('readyChips');
    wrap.innerHTML = '';
    if (!lastResult) return;
    const runningBlock = lastResult.gantt.find(b => t >= b.start && t < b.end);
    const runningPid = runningBlock ? runningBlock.pid : null;

    const inSystem = lastResult.stats.filter(s => s.arrival <= t && s.completion > t);
    if (inSystem.length === 0) {
      wrap.innerHTML = '<span class="rq-empty">(empty)</span>';
      return;
    }
    inSystem.forEach(s => {
      const chip = document.createElement('span');
      chip.className = 'rq-chip' + (s.id === runningPid ? ' running' : '');
      chip.style.background = colorFor(s.id);
      chip.textContent = s.id + (s.id === runningPid ? ' •run' : '');
      wrap.appendChild(chip);
    });
  }

  document.getElementById('scrubber').addEventListener('input', (e) => {
    stopPlaying();
    setPlayhead(+e.target.value);
  });
  document.getElementById('stepFwdBtn').addEventListener('click', () => { stopPlaying(); setPlayhead(playhead + 1); });
  document.getElementById('stepBackBtn').addEventListener('click', () => { stopPlaying(); setPlayhead(playhead - 1); });

  function stopPlaying() {
    playing = false;
    clearInterval(playTimer);
    document.getElementById('playBtn').textContent = '▶';
  }

  document.getElementById('playBtn').addEventListener('click', () => {
    if (!lastResult) return;
    if (playing) { stopPlaying(); return; }
    if (playhead >= lastResult.totalTime) playhead = 0;
    playing = true;
    document.getElementById('playBtn').textContent = '⏸';
    playTimer = setInterval(() => {
      if (playhead >= lastResult.totalTime) { stopPlaying(); return; }
      setPlayhead(playhead + 1);
    }, 380);
  });

  /* ---------------- metrics ---------------- */
  function renderMetrics(result) {
    document.getElementById('metricsSection').style.display = 'block';
    const cards = document.getElementById('statCards');
    cards.innerHTML = `
      <div class="stat-card"><div class="val">${result.avg.waiting.toFixed(2)}</div><div class="lbl">avg waiting time</div></div>
      <div class="stat-card"><div class="val">${result.avg.turnaround.toFixed(2)}</div><div class="lbl">avg turnaround time</div></div>
      <div class="stat-card"><div class="val">${result.avg.response.toFixed(2)}</div><div class="lbl">avg response time</div></div>
      <div class="stat-card"><div class="val">${result.cpuUtil.toFixed(1)}%</div><div class="lbl">CPU utilization</div></div>
      <div class="stat-card"><div class="val">${result.totalTime}</div><div class="lbl">total time</div></div>
    `;
    const body = document.getElementById('metricsBody');
    body.innerHTML = '';
    result.stats.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="pid-chip"><span class="pid-dot" style="background:${colorFor(s.id)}"></span>${s.id}</span></td>
        <td>${s.arrival}</td><td>${s.burst}</td><td>${s.completion}</td>
        <td>${s.turnaround}</td><td>${s.waiting}</td><td>${s.responseTime}</td>
      `;
      body.appendChild(tr);
    });
  }

  /* ---------------- compare all ---------------- */
  document.getElementById('compareBtn').addEventListener('click', () => {
    const procs = validProcesses();
    if (!procs) return;
    const params = currentParams();
    const keys = ['FCFS', 'RR', 'SPN', 'SRT', 'HRRN', 'FB', 'AGING'];
    const results = keys.map(k => ({ key: k, r: window.ALGORITHMS[k].run(procs, params) }));
    const maxWait = Math.max(...results.map(x => x.r.avg.waiting), 0.01);
    const bestKey = results.reduce((best, x) => x.r.avg.waiting < best.r.avg.waiting ? x : best, results[0]).key;

    const chart = document.getElementById('compareChart');
    chart.innerHTML = '';
    results.forEach(({ key, r }) => {
      const row = document.createElement('div');
      row.className = 'compare-row' + (key === bestKey ? ' best' : '');
      row.innerHTML = `
        <span class="algo-name">--${key.toLowerCase()}</span>
        <div class="compare-bar-track"><div class="compare-bar" style="width:${(r.avg.waiting / maxWait * 100).toFixed(1)}%"></div></div>
        <span class="val">${r.avg.waiting.toFixed(2)}</span>
      `;
      chart.appendChild(row);
    });
    document.getElementById('compareSection').style.display = 'block';
    document.getElementById('compareSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  /* ---------------- boot ---------------- */
  window.ALGORITHMS = window.ALGORITHMS || (typeof ALGORITHMS !== 'undefined' ? ALGORITHMS : null);
  processes = defaultProcesses();
  idCounter = processes.length;
  renderProcessTable();
  selectAlgo('FCFS');
})();
