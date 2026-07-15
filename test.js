const { ALGORITHMS } = require('./engine.js');

// Classic Stallings example: A(0,3) B(2,6) C(4,4) D(6,5) E(8,2)
const procs = [
  { id: 'A', arrival: 0, burst: 3, priority: 3 },
  { id: 'B', arrival: 2, burst: 6, priority: 5 },
  { id: 'C', arrival: 4, burst: 4, priority: 2 },
  { id: 'D', arrival: 6, burst: 5, priority: 1 },
  { id: 'E', arrival: 8, burst: 2, priority: 4 },
];

function show(name, result) {
  console.log(`\n=== ${name} ===`);
  console.log('Gantt:', result.gantt.map(g => `${g.pid ?? 'IDLE'}[${g.start}-${g.end}]`).join(' '));
  console.log('Completion:', Object.fromEntries(result.stats.map(s => [s.id, s.completion])));
  console.log('Avg waiting:', result.avg.waiting.toFixed(2), 'Avg turnaround:', result.avg.turnaround.toFixed(2));
}

show('FCFS', ALGORITHMS.FCFS.run(procs, {}));
show('RR q=1', ALGORITHMS.RR.run(procs, { quantum: 1 }));
show('SPN', ALGORITHMS.SPN.run(procs, {}));
show('SRT', ALGORITHMS.SRT.run(procs, {}));
show('HRRN', ALGORITHMS.HRRN.run(procs, {}));
show('FB', ALGORITHMS.FB.run(procs, { baseQuantum: 1, maxLevels: 5 }));
show('AGING', ALGORITHMS.AGING.run(procs, { agingInterval: 5 }));

// Sanity checks
function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(`FAIL: ${label} -> expected ${expected}, got ${actual}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${label}`);
  }
}

const fcfs = ALGORITHMS.FCFS.run(procs, {});
const compMap = Object.fromEntries(fcfs.stats.map(s => [s.id, s.completion]));
// Known FCFS completion times for this exact example: A=3,B=9,C=13,D=18,E=20
assertEqual(compMap.A, 3, 'FCFS A completion');
assertEqual(compMap.B, 9, 'FCFS B completion');
assertEqual(compMap.C, 13, 'FCFS C completion');
assertEqual(compMap.D, 18, 'FCFS D completion');
assertEqual(compMap.E, 20, 'FCFS E completion');

// Every algorithm should conserve total burst = 3+6+4+5+2 = 20 units of non-idle work
['FCFS','RR','SPN','SRT','HRRN','FB','AGING'].forEach(key => {
  const params = key === 'RR' ? { quantum: 1 } : key === 'FB' ? { baseQuantum: 1, maxLevels: 5 } : key === 'AGING' ? { agingInterval: 5 } : {};
  const r = ALGORITHMS[key].run(procs, params);
  const busy = r.gantt.filter(g => g.pid !== null).reduce((s, g) => s + (g.end - g.start), 0);
  assertEqual(busy, 20, `${key} total busy ticks == sum of bursts`);
  // no process should have negative waiting time
  const negWait = r.stats.some(s => s.waiting < 0);
  assertEqual(negWait, false, `${key} no negative waiting times`);
});
