# sched — CPU Scheduling Simulator

An interactive, browser-based simulator for seven classic CPU scheduling algorithms, built as a web successor to a console-based version of the same project.

**[Open `index.html` in any browser — no build step, no dependencies.]**

## Algorithms implemented

| Flag | Algorithm | Type |
|---|---|---|
| `--fcfs` | First Come First Serve | Non-preemptive |
| `--rr` | Round Robin | Preemptive, fixed quantum |
| `--spn` | Shortest Process Next (SJF) | Non-preemptive |
| `--srt` | Shortest Remaining Time | Preemptive |
| `--hrrn` | Highest Response Ratio Next | Non-preemptive |
| `--fb` | Feedback (multilevel queue) | Preemptive, quantum doubles per level |
| `--aging` | Aging | Priority-based, starvation-free |

## How it works

- **`engine.js`** — the simulation core. Every algorithm runs as a discrete, tick-by-tick simulation (1 time unit per tick) and returns a Gantt schedule plus per-process stats (completion, turnaround, waiting, response time) and aggregate metrics (averages, CPU utilization). It has no DOM dependency, so it can be run and tested headlessly with Node (`node test.js`) — the test file checks it against the classic 5-process example from Stallings' *Operating Systems: Internals and Design Principles*.
- **`app.js`** — wires the engine to the page: the editable process table, algorithm switcher, per-algorithm parameters (quantum, base quantum + queue levels, aging interval), the Gantt chart, the scrubbable/playable timeline, the live ready-queue view, and the "compare all seven" mode.
- **`styles.css`** — the visual design (terminal/console-inspired, since that's where this project started).

## Using it

1. Edit the process table (arrival time, burst time, and priority — priority only matters for `--aging`).
2. Pick an algorithm and set its parameter (e.g. quantum for RR).
3. Hit **run**. Scrub or press play to step through the Gantt chart tick by tick and watch the ready queue change.
4. Hit **run --all --compare** to see average waiting time across all seven algorithms for the same process set — useful for the classic "which scheduler wins on this workload" comparison.

## Notes on the algorithm semantics

- **RR / FB**: on the exact tick a process's quantum expires, any process that just arrived is enqueued *before* the preempted process re-enters the ready queue (standard convention).
- **FB**: queue level *L* has quantum `baseQuantum × 2^L`. A process demoted to a lower-priority queue keeps its remaining burst; an arrival always re-enters the top queue and preempts whatever's running at a lower priority.
- **Aging**: priority is a number where *lower = more important*. Effective priority improves by 1 for every `agingInterval` ticks a process spends waiting.
