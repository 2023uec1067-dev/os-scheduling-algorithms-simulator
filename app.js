(function () {
  'use strict';

  const COLORS = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)', 'var(--p7)'];

  const ALGO_DESC = {
    FCFS: 'Processes run strictly in arrival order, each to completion. No preemption, no cleverness — simple and starvation-free, but slow jobs block everyone behind them.',
    RR: 'Every ready process gets a fixed time slice (quantum) in turn. Fair and responsive, but a lot of context switching if the quantum is too small.',
    SPN: 'Shortest Process Next: whenever the CPU frees up, the waiting process with the smallest total burst runs next, to completion. Optimal average waiting time — if you know burst times in advance.',
    SRT: 'Shortest Remaining Time: the preemptive version of SPN. A new arrival with a shorter remaining time bumps whatever is currently running.',
    HRRN: 'Highest Response Ratio Next: response ratio = (waiting time + burst) / burst. Long-waiting processes age into priority, so nothing starves the way it can under SPN.',
    FB: 'Multilevel Feedback Queue: new processes start in the top queue with a small quantum. Anyone who doesn’t finish in time gets demoted to a lower-priority queue with a longer quantum — CPU-bound jobs sink, short jobs stay fast.',
    AGING: 'Priority scheduling where every tick spent waiting slowly improves a process’s effective priority, guaranteeing even the lowest-priority process eventually runs.',
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
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const round = Math.floor(idCounter / 26) + 1;
    const letter = letters[idCounter % 26];
    idCounter++;
    return round === 1 ? letter : letter + round;
  }

  function colorFor(pid) {
    const idx = processes.findIndex(p => p.id === pid);
    if (idx === -1) return 'var(--text-dim)';
    return COLORS[idx % COLORS.length];
  }

  /* ---------------- process table rendering ---------------- */
  function renderProcessTable() {
    const tbody = document.getElementById('processBody');
    tbody.innerHTML = '';
    processes.forEach((p, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="pid-chip"><span class="pid-dot" style="background:${COLORS[i % COLORS.length]}; color:${COLORS[i % COLORS.length]}"></span>${p.id}</span></td>
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

  function randomizeProcesses() {
    const count = Math.floor(Math.random() * 4) + 3; // 3 to 6
    processes = [];
    idCounter = 0;
    for (let i = 0; i < count; i++) {
      const id = nextAutoId();
      const arrival = Math.floor(Math.random() * 10); // 0 to 9
      const burst = Math.floor(Math.random() * 8) + 1; // 1 to 8
      const priority = Math.floor(Math.random() * 8) + 1; // 1 to 8
      processes.push({ id, arrival, burst, priority });
    }
    processes.sort((a, b) => a.arrival - b.arrival);
    renderProcessTable();
  }

  document.getElementById('randomProcsBtn').addEventListener('click', randomizeProcesses);

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

    // Smooth scroll to Gantt visualizer
    document.getElementById('ganttSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
      if (block.pid !== null) {
        const pColor = colorFor(block.pid);
        div.style.background = pColor;
        div.style.setProperty('--proc-color', pColor);
      }
      div.textContent = block.pid === null ? '·' : block.pid;
      div.dataset.start = block.start;
      div.dataset.end = block.end;
      div.title = `${block.pid ?? 'idle'}  [${block.start} \u2192 ${block.end}]`;
      track.appendChild(div);
    });

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

  function updateCpuVisualizer(t) {
    const procIdEl = document.getElementById('cpuProcessId');
    const percentEl = document.getElementById('cpuPercent');
    const badgeEl = document.getElementById('cpuStatusBadge');
    const remainingEl = document.getElementById('cpuRemainingVal');
    const sliceEl = document.getElementById('cpuSliceVal');
    const progressCircle = document.getElementById('cpuProgressCircle');
    const cpuCard = document.getElementById('cpuCard');

    if (!lastResult) {
      procIdEl.textContent = 'IDLE';
      procIdEl.style.color = 'var(--text-dim)';
      percentEl.textContent = '0%';
      badgeEl.textContent = 'idle';
      badgeEl.className = 'cpu-status-badge idle';
      remainingEl.textContent = '--';
      sliceEl.textContent = '--';
      progressCircle.style.strokeDashoffset = '264';
      cpuCard.style.removeProperty('--proc-color');
      return;
    }

    const runningBlock = lastResult.gantt.find(b => t >= b.start && t < b.end);
    const activePid = runningBlock ? runningBlock.pid : null;

    if (activePid === null || t >= lastResult.totalTime) {
      procIdEl.textContent = 'IDLE';
      procIdEl.style.color = 'var(--text-dim)';
      percentEl.textContent = '0%';
      badgeEl.textContent = t >= lastResult.totalTime ? 'done' : 'idle';
      badgeEl.className = 'cpu-status-badge idle';
      remainingEl.textContent = '--';
      sliceEl.textContent = '--';
      progressCircle.style.strokeDashoffset = '264';
      cpuCard.style.removeProperty('--proc-color');
    } else {
      const pColor = colorFor(activePid);
      cpuCard.style.setProperty('--proc-color', pColor);
      
      procIdEl.textContent = activePid;
      procIdEl.style.color = pColor;
      
      badgeEl.textContent = 'running';
      badgeEl.className = 'cpu-status-badge running';

      const procInfo = processes.find(p => p.id === activePid);
      if (procInfo) {
        let executedProcTicks = 0;
        lastResult.gantt.forEach(b => {
          if (b.pid === activePid) {
            if (t >= b.end) {
              executedProcTicks += (b.end - b.start);
            } else if (t >= b.start && t < b.end) {
              executedProcTicks += (t - b.start);
            }
          }
        });
        
        const currentRemaining = procInfo.burst - executedProcTicks;
        const progressPercent = Math.min(100, Math.round((executedProcTicks / procInfo.burst) * 100));
        
        percentEl.textContent = progressPercent + '%';
        remainingEl.textContent = currentRemaining + ' / ' + procInfo.burst;
        
        const offset = 264 - (progressPercent / 100) * 264;
        progressCircle.style.strokeDashoffset = offset;

        if (currentAlgo === 'RR') {
          const quantum = parseInt(document.getElementById('quantumInput').value, 10) || 2;
          const timeInCurrentSlice = t - runningBlock.start;
          sliceEl.textContent = `${timeInCurrentSlice + 1} / ${quantum}`;
        } else if (currentAlgo === 'FB') {
          const timeInCurrentSlice = t - runningBlock.start;
          const qLimit = runningBlock.end - runningBlock.start;
          sliceEl.textContent = `${timeInCurrentSlice + 1} / ${qLimit}`;
        } else {
          sliceEl.textContent = 'non-preempt';
        }
      }
    }
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
    updateCpuVisualizer(playhead);
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
        <td><span class="pid-chip"><span class="pid-dot" style="background:${colorFor(s.id)}; color:${colorFor(s.id)}"></span>${s.id}</span></td>
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
        <div class="compare-bar-track"><div class="compare-bar" data-width="${(r.avg.waiting / maxWait * 100).toFixed(1)}%"></div></div>
        <span class="val">${r.avg.waiting.toFixed(2)}</span>
      `;
      chart.appendChild(row);
    });

    // Trigger transition animation in next frame
    setTimeout(() => {
      chart.querySelectorAll('.compare-bar').forEach(bar => {
        bar.style.width = bar.dataset.width;
      });
    }, 50);

    document.getElementById('compareSection').style.display = 'block';
    document.getElementById('compareSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  /* ---------------- boot ---------------- */
  window.ALGORITHMS = window.ALGORITHMS || (typeof ALGORITHMS !== 'undefined' ? ALGORITHMS : null);
  processes = defaultProcesses();
  idCounter = processes.length;
  renderProcessTable();
  selectAlgo('FCFS');

  // Bootup loader animation
  (function runLoader() {
    const loader = document.getElementById('loader');
    const loaderBar = document.getElementById('loaderBar');
    const loaderStatus = document.getElementById('loaderStatus');
    if (!loader || !loaderBar || !loaderStatus) return;

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 6) + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        loaderBar.style.width = '100%';
        loaderStatus.textContent = '100% SYSTEM BOOTUP COMPLETE';
        loader.classList.add('letters-static');
        setTimeout(() => {
          loader.classList.add('fade-out');
          
          const storyStage = document.getElementById('story-stage');
          const pcScreen = document.querySelector('.pc-screen');
          
          if (storyStage && pcScreen) {
            storyStage.classList.add('active');
            
            setTimeout(() => {
              pcScreen.classList.add('show');
              
              setTimeout(() => {
                storyStage.classList.add('fade-out');
                document.body.classList.add('loaded');
                
                setTimeout(() => {
                  storyStage.style.display = 'none';
                }, 1000);
              }, 2400);
            }, 100);
          } else {
            document.body.classList.add('loaded');
          }
        }, 500);
      } else {
        loaderBar.style.width = progress + '%';
        loaderStatus.textContent = progress + '% SYSTEM READY';
      }
    }, 80);
  })();

  // Background Matrix/Terminal Digital Rain Animation
  (function initBgAnimation() {
    const canvas = document.getElementById('bgCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    
    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });
    
    const fontSize = 14;
    const columns = Math.floor(width / fontSize) + 1;
    const yPositions = Array(columns).fill(0).map(() => Math.random() * -height);
    
    // Phosphorus matrix drop characters & CPU instructions
    const words = ["010101", "FCFS", "SPN", "SRT", "HRRN", "RR", "FB", "CPU", "LOAD", "TICK", "EXEC", "IO", "MEM", "PID"];
    const chars = "0101010101ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    function draw() {
      ctx.fillStyle = 'rgba(5, 4, 15, 0.06)';
      ctx.fillRect(0, 0, width, height);
      
      ctx.fillStyle = 'rgba(0, 242, 254, 0.08)'; 
      ctx.font = fontSize + 'px "JetBrains Mono", monospace';
      
      for (let i = 0; i < yPositions.length; i++) {
        let text = "";
        if (Math.random() > 0.96) {
          text = words[Math.floor(Math.random() * words.length)];
        } else {
          text = chars[Math.floor(Math.random() * chars.length)];
        }
        
        const x = i * fontSize;
        const y = yPositions[i];
        
        ctx.fillText(text, x, y);
        
        if (y > height && Math.random() > 0.985) {
          yPositions[i] = 0;
        } else {
          yPositions[i] = y + fontSize * (text.length > 1 ? 0.35 : 0.6);
        }
      }
    }
    
    setInterval(draw, 45);
  })();

  // Light/Dark Theme Background Toggler
  (function initThemeToggler() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;
    const themeIcon = themeToggle.querySelector('.theme-icon');
    const themeLabel = themeToggle.querySelector('.theme-label');
    
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
    
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      setTheme(newTheme);
    });
    
    function setTheme(theme) {
      if (theme === 'light') {
        document.body.classList.add('light-theme');
        themeIcon.textContent = '🌙';
        themeLabel.textContent = 'Dark Theme';
        localStorage.setItem('theme', 'light');
      } else {
        document.body.classList.remove('light-theme');
        themeIcon.textContent = '☀️';
        themeLabel.textContent = 'Light Theme';
        localStorage.setItem('theme', 'dark');
      }
    }
  })();
})();
